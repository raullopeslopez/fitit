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


def macros_por_racion(totales: dict, servings: float) -> dict:
    """Los totales del plato entre sus raciones, que es la cifra que se come.

    Lo desconocido sigue desconocido: dividir `None` entre cuatro no lo
    convierte en un número.
    """
    if not servings or servings <= 0:
        raise ValueError("servings must be greater than zero")
    return {field: _scale(totales.get(field), 1.0 / servings, _MACRO_PLACES) for field in NUTRIENTS}


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
