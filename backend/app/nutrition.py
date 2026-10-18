"""The only place in the project where nutritional arithmetic happens.

Two rules govern everything here, and they are the same rule read twice:

1. **`None` is unknown, never zero.** A food nobody has measured the fibre of
   does not contain zero grams of fibre; it contains an amount we do not know.
   Multiplying it by a portion keeps it unknown, and adding it into a day's
   total makes that total unknown too — silently substituting 0 would turn "we
   don't know" into a number the screen prints as fact.
2. **A logged entry is frozen.** `log_entries` stores what the food said at the
   moment it was recorded. Correcting the food afterwards is a correction to
   the food, not to your history, so nothing here ever recomputes an entry from
   `foods`. `escalar_nutrientes` exists for exactly this reason: editing the
   grams of an entry rescales what was frozen, it does not go back and ask.
"""

import json
import math
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

# The nutrients that get their own column, on `foods` (as `<name>_100g`) and on
# `log_entries` (as `<name>`). Everything else lives in `nutrients_json`.
NUTRIENTS = ("kcal", "protein", "fat", "carbs", "fiber")

# Macros are stored to the hundredth: 0.01 g is already below the resolution of
# any scale in a kitchen, and rounding here is what keeps 0.30000000000000004
# out of the database. Micronutrients are measured in mg and µg, where the
# hundredth is meaningful, so they get more room.
_MACRO_PLACES = 2
_MICRO_PLACES = 6

# The food day runs 04:00 → 04:00 **local**. A supper at 00:30 belongs to the
# day you have been awake for, not to the one the calendar just rolled into.
# Chosen 2026-08-31; changing it would re-date history, so it is derived once at
# write time into `log_entries.log_date` and never recomputed.
DAY_STARTS_AT = timedelta(hours=4)


def _round(value: float | None, places: int) -> float | None:
    return None if value is None else round(value, places)


def _scale(value: float | None, factor: float, places: int) -> float | None:
    """`None` survives multiplication. That is the whole point of this function."""
    return None if value is None else round(value * factor, places)


def _load_json(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        loaded = json.loads(raw)
    except (TypeError, ValueError):
        return {}
    return loaded if isinstance(loaded, dict) else {}


def calcular_nutrientes(food, grams: float) -> dict:
    """What `grams` of `food` contributes, from its per-100 g values.

    `food` is anything carrying `kcal_100g`, `protein_100g`, … and an optional
    `nutrients_json` — the ORM row, or the preview of a barcode scan that is not
    a row yet. Returns the five macro keys plus `nutrients`, a dict of whatever
    micronutrients the source carried, scaled the same way.
    """
    if grams is None or grams <= 0:
        raise ValueError("grams must be greater than zero")
    factor = grams / 100.0
    result = {
        field: _scale(getattr(food, f"{field}_100g", None), factor, _MACRO_PLACES)
        for field in NUTRIENTS
    }
    result["nutrients"] = {
        key: _scale(value, factor, _MICRO_PLACES) if isinstance(value, int | float) else None
        for key, value in _load_json(getattr(food, "nutrients_json", None)).items()
    }
    return result


def escalar_nutrientes(entry, *, old_grams: float, new_grams: float) -> dict:
    """Re-weigh an already-frozen entry without going back to `foods`.

    Correcting "200 g" to "150 g" is a correction to the portion, not to what
    the food was when you ate it. Reading the food again would quietly adopt any
    edit made to it since, which is the one thing `log_entries` exists to
    prevent — so the ratio is applied to the numbers already stored.
    """
    if new_grams is None or new_grams <= 0:
        raise ValueError("grams must be greater than zero")
    if not old_grams:
        raise ValueError("cannot rescale an entry with no weight behind it")
    factor = new_grams / old_grams
    getter = entry.get if isinstance(entry, dict) else lambda k: getattr(entry, k, None)
    result = {field: _scale(getter(field), factor, _MACRO_PLACES) for field in NUTRIENTS}
    result["nutrients"] = {
        key: _scale(value, factor, _MICRO_PLACES) if isinstance(value, int | float) else None
        for key, value in _load_json(getter("nutrients_json")).items()
    }
    return result


def sumar_nutrientes(entries) -> tuple[dict, dict]:
    """A day's totals, and how many entries could not contribute to each one.

    Returns `(totals, unknown)`. A nutrient is `None` in `totals` whenever any
    entry lacks it — a partial sum printed as a total is a lie the size of
    whatever was missing — and `unknown[nutrient]` counts how many entries were
    missing it, so the screen can say *why* there is no number instead of
    showing a blank.

    An empty day totals `None`, not 0: you have not eaten zero calories, you
    have not written anything down yet, and those are different screens.
    """
    rows = list(entries)
    totals: dict[str, float | None] = {}
    unknown: dict[str, int] = {}
    for field in NUTRIENTS:
        values = [
            (row.get(field) if isinstance(row, dict) else getattr(row, field, None)) for row in rows
        ]
        missing = sum(1 for value in values if value is None)
        unknown[field] = missing
        known = [value for value in values if value is not None]
        totals[field] = None if (missing or not known) else _round(sum(known), _MACRO_PLACES)
    return totals, unknown


def macros_de_plato(ingredientes) -> tuple[dict, dict]:
    """Lo que suma un plato entero, y qué nutrientes no ha podido sumar.

    `ingredientes` son pares `(alimento, gramos)`. Devuelve `(totales, unknown)`
    con la misma regla que un día del diario: si a un ingrediente le falta la
    fibra, la fibra del plato es **desconocida**, no la suma de los demás. Un
    plato que declarase 12 g de fibra contando como cero lo que nadie midió
    mentiría exactamente en lo que no se midió.
    """
    return sumar_nutrientes([calcular_nutrientes(food, grams) for food, grams in ingredientes])


# Qué parte de tu proteína diaria tiene que aportar una comida o una cena para
# entrar en el repertorio cuando la propone el modelo. Con cuatro tomas, las dos
# principales cargan con más que un desayuno o una merienda: el 20 % de 202 g son
# 40 g, que es una pechuga y no una pizza. Desayuno y merienda no se juzgan: una
# tostada no es un fallo, es un desayuno.
FRACCION_COMIDA_PRINCIPAL = 0.20
COMIDAS_PRINCIPALES = ("comida", "cena")


def proteina_minima(objetivo_proteina: float | None, slots) -> float | None:
    """Los gramos de proteína por ración que tiene que dar un plato propuesto
    para las comidas en las que va, o `None` si no hay mínimo que cumplir.

    Sin objetivo de proteína no hay mínimo: no hay de qué sacar el 20 %. Un
    plato sin comidas dichas puede acabar en cualquiera —también en una comida
    o una cena—, así que se juzga como si fuera una.
    """
    if not objetivo_proteina:
        return None
    if slots and not any(s in COMIDAS_PRINCIPALES for s in slots):
        return None
    return round(objetivo_proteina * FRACCION_COMIDA_PRINCIPAL, 1)


def macros_por_racion(totales: dict, servings: float) -> dict:
    """Los totales del plato entre sus raciones, que es la cifra que se come.

    Lo desconocido sigue desconocido: dividir `None` entre cuatro no lo
    convierte en un número.
    """
    if not servings or servings <= 0:
        raise ValueError("servings must be greater than zero")
    return {field: _scale(totales.get(field), 1.0 / servings, _MACRO_PLACES) for field in NUTRIENTS}


def gramos_de_fraccion(gramos: list[float], fraccion: float) -> list[float]:
    """Los gramos de cada ingrediente cuando te comes `fraccion` de la olla
    (fase 5): la receta entera escalada. ¼ de una olla con 400 g de lentejas
    son 100 g de lentejas, pese lo que pese la olla cocinada."""
    return [g * fraccion for g in gramos]


def gramos_por_racion(grams: float | None, servings: float | None) -> float | None:
    """Los gramos de un ingrediente de receta que caen en una ración.

    Una receta publica «500 gr de acelgas» para 2; el plato guarda lo que se
    come, 250 g. Dos desconocidos que siguen siéndolo:

    - `grams` `None` («2 huevos»): no hay nada que dividir.
    - `servings` `None` (la página no publica `recipeYield`): dividir entre 1
      sería decir que la receta entera es una ración, y eso nadie lo ha dicho.
    """
    if servings is not None and servings <= 0:
        raise ValueError("servings must be greater than zero")
    if grams is None or servings is None:
        return None
    return _scale(grams, 1.0 / servings, _MACRO_PLACES)


def restante(target: float | None, eaten: float | None) -> float | None:
    """Lo que queda de un objetivo diario: `target - eaten`.

    `None` en `target` significa «no has fijado un objetivo» y se propaga:
    sin objetivo no hay resta que hacer, y la pantalla cae a enseñar sólo lo
    comido, como antes de que existiera esta función.

    `None` en `eaten` es la excepción deliberada a la regla de `sumar_nutrientes`:
    ahí un total sale `None` tanto si el día está vacío como si a alguna
    entrada le falta el dato, porque "no escribiste nada" y "hay un dato que
    falta" son cosas distintas que el total por sí solo no distingue. Aquí no
    hace falta distinguirlas: lo que la cifra grande responde es "cuánto me
    queda por gastar", y en los dos casos la única respuesta que tiene sentido
    es el objetivo entero (o lo que quede de él) — así que un total `None`
    cuenta como cero comido a este único efecto, nunca como un resto
    desconocido.
    """
    if target is None:
        return None
    return _round(target - (eaten or 0), _MACRO_PLACES)


def food_log_date(moment: datetime) -> date:
    """The food day a moment falls in, read off the client's own clock.

    The offset the client sent is not decoration: 01:30 in Madrid and 01:30 in
    UTC are different instants but the same supper, and it is the local wall
    clock that decides which day it belongs to. So the shift is applied before
    the date is taken, on the moment as it arrived — converting to UTC first
    would date a late supper by a clock the user was not eating on.

    A moment with no offset means UTC; it has no other clock to mean (same rule
    as `workouts.py`).
    """
    aware = moment if moment.tzinfo else moment.replace(tzinfo=UTC)
    return (aware - DAY_STARTS_AT).date()


def dump_nutrients(nutrients: dict | None) -> str | None:
    """Serialise the micronutrient bag for storage, or None when it is empty.

    None rather than "{}" so an entry that carried no micronutrients reads as
    having none recorded, which is what it is.
    """
    return json.dumps(nutrients, sort_keys=True) if nutrients else None


# ---------------------------------------------------------------------------
# ¿Cuadra la etiqueta consigo misma?
#
# Una etiqueta no declara cinco cifras independientes: declara las kilocalorías
# **y** los macros que las producen, y las dos afirmaciones tienen que dar lo
# mismo. Eso convierte a cada cifra en testigo de las otras cuatro, que es la
# única defensa que hay contra un dígito mal leído.
#
# Existe por la lectura desde una foto. Lo demás que la protege comprueba
# coherencia —que ninguna cifra venga sin una fila que la respalde, que la
# columna sea la buena, que ningún macro sea absurdo— y nada de eso caza
# `Proteínas 3,8 g` leído como `8,8 g`: la fila está, el número es plausible, la
# columna es la correcta. Pasa todo y se congela en el diario.
#
# Sirve igual para lo tecleado a mano, donde el dedo se equivoca de tecla.

# Reglamento (UE) 1169/2011, anexo XIV. La fibra a 2 y no a 4: contarla a 4
# inflaría la estimación de un pan integral hasta hacerla saltar sola.
_KCAL_PER_GRAM = {"protein": 4.0, "fat": 9.0, "carbs": 4.0, "fiber": 2.0}

# Cuánto puede separarse lo calculado de lo declarado sin que sea un error de
# lectura. Dos márgenes porque los dos fallan solos: el relativo se dispara en
# cifras pequeñas —4 kcal contra 6 es un 50% y no es nada— y el absoluto se
# queda corto en un aceite de 900. Manda el mayor de los dos.
_TOLERANCE_KCAL = 8.0
_TOLERANCE_SHARE = 0.15


def kcal_de_macro(macro: str, grams: float | None) -> float | None:
    """Las kcal que aportan `grams` de un macro. `None` sigue siendo `None`.

    Aquí y no en quien lo use: convertir gramos en energía es aritmética
    nutricional, y toda vive en este módulo. Los factores son los mismos que
    usa `atwater_kcal()` — una segunda tabla de factores sería una segunda
    verdad sobre cuánto engorda un gramo de grasa.
    """
    factor = _KCAL_PER_GRAM.get(macro)
    if grams is None or factor is None:
        return None
    return _round(grams * factor, _MACRO_PLACES)


def atwater_kcal(
    protein: float | None = None,
    fat: float | None = None,
    carbs: float | None = None,
    fiber: float | None = None,
) -> float:
    """Las kilocalorías que dan esos macros, por los factores de la UE.

    Lo desconocido cuenta como 0 **sólo aquí dentro**, y es deliberado: esto no
    es un nutriente que se guarde, es una estimación para compararla con otra
    cifra. La regla de que `None` no es cero protege lo que se escribe en la
    base de datos, y esto no escribe nada.
    """
    grams = {"protein": protein, "fat": fat, "carbs": carbs, "fiber": fiber}
    return sum(_KCAL_PER_GRAM[k] * (v or 0) for k, v in grams.items())


def kcal_disagreement(
    kcal: float | None,
    protein: float | None = None,
    fat: float | None = None,
    carbs: float | None = None,
    fiber: float | None = None,
) -> tuple[float, float] | None:
    """`(declaradas, calculadas)` cuando no cuadran; `None` cuando sí, o cuando
    no hay con qué comparar.

    Callar sin los tres macros principales es la única respuesta honesta: un
    aviso ahí saltaría en todos los alimentos dados de alta a medias, que son
    la mayoría, y un aviso que salta siempre deja de leerse.
    """
    if kcal is None or protein is None or fat is None or carbs is None:
        return None
    computed = atwater_kcal(protein=protein, fat=fat, carbs=carbs, fiber=fiber)
    allowed = max(_TOLERANCE_KCAL, _TOLERANCE_SHARE * max(kcal, computed))
    if abs(computed - kcal) <= allowed:
        return None
    return (kcal, round(computed, 1))


# --- El ajuste de gramos ------------------------------------------------------
#
# Paso 3 del generador (§39 del brainstorming): **el ajuste vive en el día, no
# en cada plato**. Un guiso es lo que es —450 kcal y punto— y el día cierra sus
# números moviendo los *otros* huecos. Esto es lo que permite que las lentejas
# de tu madre entren en un plan sin desmontarlas.
#
# Está aquí y no en el planificador porque es aritmética de nutrientes, y de esa
# sólo puede haber una en la app.

# Pasadas de descenso por coordenadas. Cada ingrediente se coloca en su óptimo
# dado el resto, y se repite: con tres o cuatro ya no se mueve nada, seis deja
# margen sin que cueste nada medible.
_AJUSTE_PASOS = 6

# Cuánto más pesa fallar en kcal que fallar en un macro, a igual error relativo.
#
# Con el mismo peso, un día que no puede dar la proteína (arroz y aceite) se
# pasaba de kcal para acercarse a una cifra imposible, y el día no cuadraba en
# lo único que siempre se puede cuadrar subiendo o bajando cantidades. Con
# cien, las kcal se clavan en cuanto las bandas lo permiten y los macros
# quedan lo más cerca que dejan los platos: es lo que se le pide a la app
# (2026-10-11). Cien y no infinito: entre dos repartos con las mismas kcal,
# sigue eligiendo el que más se acerca a los macros.
_PESO_KCAL = 100.0


@dataclass(frozen=True)
class Ajustable:
    """Un ingrediente que el día puede mover, con su banda.

    `minimo` y `maximo` no son un detalle de implementación: son lo que separa
    un plan de la solución de una ecuación. Sin ellos el ajuste contestaría
    «900 g de arroz» con toda la razón matemática del mundo.
    """

    por_100g: dict
    gramos: float
    minimo: float
    maximo: float


def _fijo_del_dia(fijo: dict) -> dict:
    """Lo que el día ya trae puesto, con la distinción que importa.

    Una clave **ausente** es que no hay nada fijo aportando ese nutriente, y eso
    sí es cero. Un `None` **escrito** es que algo lo aporta y nadie lo midió, y
    eso no puede convertirse en cero ni aquí ni en ningún sitio.
    """
    return {field: fijo.get(field, 0.0) for field in NUTRIENTS}


def _dirigen(fijo: dict, objetivo: dict) -> tuple[str, ...]:
    """Los macros que de verdad tiran del ajuste.

    Un macro sin objetivo no dirige: `None` es «no lo he dicho», y perseguirlo
    como si fuera 0 recortaría el aceite al mínimo sin que nadie lo haya pedido.
    Un macro cuyo total fijo es desconocido tampoco: perseguir 70 g de grasa
    contando como 0 la del guiso que no la midió pondría de más exactamente lo
    que falta saber.
    """
    return tuple(
        field
        for field in NUTRIENTS
        if field != "fiber" and objetivo.get(field) is not None and fijo.get(field) is not None
    )


def ajustar_gramos(
    fijo: dict,
    ajustables,
    objetivo: dict,
    *,
    pasos: int = _AJUSTE_PASOS,
    escala: dict | None = None,
) -> tuple[tuple[float, ...], dict]:
    """Los gramos que dejan el día lo más cerca posible de su objetivo.

    `fijo` son los macros que el día ya trae puestos (platos bloque, y todo
    ingrediente sin banda). `ajustables` son los que se dejan mover, cada uno
    con la suya. Devuelve `(gramos, totales)`.

    `escala` es contra qué se mide un error, si no es el propio objetivo. Al
    ajustar una comida se le pasa **el día**: lo que le queda por perseguir a la
    cena puede ser 3 g de proteína, y medido contra 3 g cualquier gramo de más
    pesaría como un desastre y tumbaría las kcal para evitarlo.

    Determinista: los mismos argumentos dan los mismos gramos, que es lo que
    hace que el plan sea el mismo el martes que el jueves (§22).

    Los gramos salen **enteros**: un plan se lee con una báscula de cocina, y
    «163,47 g» no es más preciso, es sólo menos legible.
    """
    piezas = list(ajustables)
    base = _fijo_del_dia(fijo)
    dirigen = _dirigen(base, objetivo)

    for pieza in piezas:
        for field in dirigen:
            if pieza.por_100g.get(field) is None:
                raise ValueError(
                    f"no se puede ajustar sobre {field}: nadie lo midió en un ingrediente"
                )

    gramos = [float(pieza.gramos) for pieza in piezas]

    def aporta(indice: int, field: str) -> float:
        return gramos[indice] * (piezas[indice].por_100g.get(field) or 0.0) / 100.0

    for _ in range(pasos):
        for i, pieza in enumerate(piezas):
            numerador = 0.0
            denominador = 0.0
            for field in dirigen:
                meta = objetivo[field]
                # Normalizado por el propio objetivo, o 2.400 kcal pesarían
                # doscientas veces más que 165 g de proteína sin que nadie lo
                # haya decidido.
                medida = (escala or {}).get(field, meta)
                peso = 1.0 / (abs(medida) or 1.0) ** 2
                if field == "kcal":
                    peso *= _PESO_KCAL
                por_gramo = (pieza.por_100g.get(field) or 0.0) / 100.0
                resto = base[field] + sum(aporta(j, field) for j in range(len(piezas)) if j != i)
                numerador += peso * por_gramo * (meta - resto)
                denominador += peso * por_gramo * por_gramo
            if denominador <= 0:
                # Este ingrediente no lleva nada de lo que se persigue. Se queda
                # donde estaba en vez de irse al mínimo por no estorbar.
                continue
            gramos[i] = min(max(float(round(numerador / denominador)), pieza.minimo), pieza.maximo)

    filas = [base] + [
        {
            field: _scale(pieza.por_100g.get(field), gramos[i] / 100.0, _MACRO_PLACES)
            for field in NUTRIENTS
        }
        for i, pieza in enumerate(piezas)
    ]
    totales, _ = sumar_nutrientes(filas)
    return tuple(gramos), totales


# --- El reparto por toma ---------------------------------------------------------
#
# La parte del día que le toca a cada comida, por nutriente (2026-10-18). Sale de
# la estructura acordada: la proteína en las cuatro, el hidrato más en las
# principales y poco en la merienda, el AOVE medido en comida y cena. Sobre un
# día de 2.569 kcal / 202 P / 280 H / 71 G da 615 / 800 / 415 / 740 kcal.
#
# Proporciones y no gramos: si el objetivo cambia, el reparto le sigue.
REPARTO_POR_HUECO = {
    "desayuno": {"kcal": 0.24, "protein": 0.22, "carbs": 0.27, "fat": 0.21},
    "comida": {"kcal": 0.31, "protein": 0.30, "carbs": 0.32, "fat": 0.31},
    "snack": {"kcal": 0.16, "protein": 0.18, "carbs": 0.14, "fat": 0.17},
    "cena": {"kcal": 0.29, "protein": 0.30, "carbs": 0.27, "fat": 0.31},
}


def repartir_por_hueco(objetivo: dict, huecos) -> dict[str, dict]:
    """El objetivo del día, partido entre `huecos` según `REPARTO_POR_HUECO`.

    Las partes se renormalizan sobre los huecos que hay: un día de tres comidas
    se queda con el día entero, no con el 84 %. Un nutriente que el objetivo no
    trae no aparece en ninguna parte — `None` es «no lo he dicho», y repartirlo
    como cero recortaría a todas las comidas algo que nadie pidió.
    """
    huecos = [h for h in huecos if h in REPARTO_POR_HUECO]
    partes: dict[str, dict] = {h: {} for h in huecos}
    for campo, total in objetivo.items():
        if total is None:
            continue
        pesos = {h: REPARTO_POR_HUECO[h].get(campo) for h in huecos}
        if any(p is None for p in pesos.values()):
            continue
        suma = sum(pesos.values())
        for h in huecos:
            partes[h][campo] = total * pesos[h] / suma
    return partes


# --- El hueso -------------------------------------------------------------------
#
# Una bandeja de muslos pesa un kilo y un tercio es hueso. Las tablas —CIQUAL,
# BEDCA, USDA— dan los nutrientes por 100 g de **porción comestible**, y el
# desperdicio (`refuse`) aparte, como porcentaje del peso en crudo tal cual se
# compra. La etiqueta del súper, en cambio, no dice a qué se refiere: el
# Reglamento (UE) 1169/2011, art. 31.3, pide el alimento «tal como se vende»,
# pero muchas etiquetas de carne copian la cifra de la parte comestible.
#
# De ahí las tres bases de unas kcal: `edible` (de la carne: al peso de la
# bandeja hay que quitarle el hueso), `as_sold` (de la bandeja: el hueso ya va
# diluido en la cifra y restarlo sería contarlo dos veces) y `unknown`.
#
# El rendimiento de cocción (lo que pierde un muslo al asarse) es otra cosa y no
# está aquí: pesar en crudo y elegir el alimento crudo sigue siendo lo correcto.

BASES_KCAL = ("as_sold", "edible", "unknown")

def gramos_comestibles(grams: float, refuse_pct: float) -> float:
    """Lo que queda de `grams` al quitarle el `refuse_pct` % de hueso."""
    if not 0 <= refuse_pct < 100:
        raise ValueError("refuse_pct must be in [0, 100)")
    return _round(grams * (100 - refuse_pct) / 100, _MACRO_PLACES)


def gramos_de_compra(grams: float, refuse_pct: float) -> float:
    """Lo que hay que comprar para comerse `grams`, si el `refuse_pct` % de lo que
    se compra es hueso. El inverso de `gramos_comestibles`: 4200 g de muslo
    comidos con un 25 % de hueso son 5600 g de bandeja."""
    if not 0 <= refuse_pct < 100:
        raise ValueError("refuse_pct must be in [0, 100)")
    return _round(grams * 100 / (100 - refuse_pct), _MACRO_PLACES)


def escalar_gramos(grams: float | None, *, old_grams: float, new_grams: float) -> float | None:
    """Unos gramos congelados, repesados en la misma proporción que la entrada.

    Repesar 300 g con hueso a 600 g dobla también los comestibles: la pieza es
    la misma, sólo hay más.
    """
    if grams is None:
        return None
    return _scale(grams, new_grams / old_grams, _MACRO_PLACES)


def desperdicio_de_sobras(grams: float, bone_grams: float) -> float:
    """El % de hueso de verdad, a partir del que sobró en el plato.

    Una décima basta: la báscula de cocina no da para más, y es lo que se enseña.
    """
    if bone_grams is None or bone_grams <= 0 or not grams or bone_grams >= grams:
        raise ValueError("bone must weigh more than 0 and less than what was weighed")
    return round(bone_grams / grams * 100, 1)


def nutrientes_con_hueso(
    food, grams: float, *, refuse_pct: float, basis: str
) -> tuple[dict, float | None]:
    """Los nutrientes de `grams` pesados **con** hueso, y los gramos comestibles.

    Devuelve `(nutrientes, gramos_comestibles)`. Los comestibles sólo salen
    cuando se han usado para calcular — con kcal `as_sold` el hueso ya está
    dentro de la cifra y la entrada es la de siempre, así que salen `None`.

    Con `unknown` no hay número honesto: la diferencia entre las dos lecturas
    es justo el hueso, y elegir una en silencio es equivocarse un 30 % sin
    decirlo.
    """
    if basis == "edible":
        edible = gramos_comestibles(grams, refuse_pct)
        return calcular_nutrientes(food, edible), edible
    if basis == "as_sold":
        return calcular_nutrientes(food, grams), None
    raise ValueError("no se sabe si las kcal de este alimento cuentan el hueso")


# Cómo se reparten unas kcal en macros cuando nadie ha dicho otra cosa. La
# proteína va por kilo de peso —es lo que la sostiene—, la grasa es una parte
# fija de las kcal, y los hidratos son lo que queda.
PROTEINA_G_POR_KG = 2.0
GRASA_PARTE_KCAL = 0.25


def reparto_macros(*, kcal: float | None, kg: float | None) -> dict[str, int] | None:
    """Gramos de proteína, grasa e hidratos que suman esas kcal.

    `None` sin kcal o sin peso: sin peso no hay proteína por kilo, y repartir
    sin ella sería inventarla. Gramos enteros, que es lo que se teclea y se lee.
    Los hidratos se quedan en 0 si la proteína y la grasa ya se comen las kcal:
    un objetivo negativo no significa nada.
    """
    if kcal is None or kg is None:
        return None
    protein = round(PROTEINA_G_POR_KG * kg)
    fat = round(kcal * GRASA_PARTE_KCAL / 9)
    carbs = max(0, round((kcal - 4 * protein - 9 * fat) / 4))
    return {"protein": protein, "fat": fat, "carbs": carbs}


# --- Medidas caseras (docs/medidas-caseras.md) ---------------------------------
#
# Gramos de cada medida, **iguales para todo alimento**. Una cucharada es
# volumen y lo que pesa depende de la densidad (aceite 13,5 g, harina 8 g), así
# que esto es aproximado a sabiendas: se eligió sencillo, y el diario guarda la
# medida junto a los gramos para que se vea que no salió de una báscula.
# Ésta es la única copia: el parser de recetas y la API leen de aquí.
MEDIDAS = {"cdta": 5.0, "cda": 15.0, "taza": 240.0, "vaso": 200.0}

# En una receta, por encima de esto la cuchara deja de ayudar: nadie echa
# trece cucharadas de pechuga.
MEDIDA_RECETA_MAX_G = 60.0
# Por debajo, cucharaditas; desde aquí, cucharadas.
MEDIDA_CDTA_HASTA_G = 10.0


def gramos_de_medida(measure: str, count: float) -> float:
    return round(MEDIDAS[measure] * count, 2)


@dataclass(frozen=True)
class MedidaCasera:
    measure: str
    count: float


def medida_casera(grams: float | None) -> MedidaCasera | None:
    """La medida con la que leer `grams` en una receta, o `None` si no ayuda.

    Cucharaditas por debajo de 10 g, cucharadas hasta 60 g, redondeado a la
    media más cercana. Sin medida si son más de 60 g, si no se sabe cuántos
    gramos son (`None` no es 0) o si redondeando sale cero: «0 cdtas de sal»
    diría que no lleva.
    """
    if grams is None or grams <= 0 or grams > MEDIDA_RECETA_MAX_G:
        return None
    measure = "cdta" if grams < MEDIDA_CDTA_HASTA_G else "cda"
    # Media arriba a la par, no el redondeo del banquero de `round`: 7,5 g son
    # 1,5 cdtas, y 1,25 g no deben ser 0 en un caso y ½ en otro.
    count = math.floor(grams / MEDIDAS[measure] * 2 + 0.5) / 2
    if count == 0:
        return None
    return MedidaCasera(measure, int(count) if count.is_integer() else count)
