"""Las reglas que sigues al comer, y si un día las cumple.

Tus preferencias no son números: son reglas. «Proteína de 1,5 a 2 g por kilo»
no cabe en una casilla porque es un **rango**, es **relativo a algo que cambia**
y está en **otra unidad** que la que consume el motor. Y «verdura en la comida»
no habla de macros, habla de qué hay en el plato y en cuál.

Tres cosas describen una regla, y las tres hacen falta:

- **Ámbito** — `day`, `week` o `slot`. La proteína es del día; las legumbres,
  de la semana; la verdura, de un hueco concreto.
- **Condición** — `training`, `rest`, o ninguna. «Más hidratos los días que
  entreno» sólo se juzga esos días, y la app sabe cuáles son.
- **Dureza** — `hard` o `soft`. Si todas fueran obligatorias, un día normal
  incumpliría siempre y el número dejaría de mirarse. Una dura rota estropea el
  día; una blanda rota lo empeora.

**El catálogo es cerrado** (decisión 20). Seis tipos, cada uno con su validador
y su evaluador. Un tipo que no esté aquí se rechaza en vez de guardarse a medias:
una regla que la app no sabe juzgar es una regla que miente en la pantalla.

Y la regla del `NULL`, que aquí es donde más daño haría: **un alimento sin
clasificar no es «no es verdura»**. Una regla de grupo que no pueda decidir
contesta `unknown` y cuenta cuántos no pudo clasificar, en vez de dar por
incumplido lo que no sabe.
"""

from __future__ import annotations

import json

from dataclasses import dataclass, field
from datetime import date

from .food_groups import FAMILIAS
from .nutrition import kcal_de_macro

SCOPES = ("day", "week", "slot")
CONDITIONS = ("training", "rest")
HARDNESS = ("hard", "soft")
MACROS = ("protein", "fat", "carbs", "fiber")


class RuleRefused(Exception):
    """El tipo no está en el catálogo, o sus parámetros no se sostienen.

    Igual que `ColumnRefused` en `label.py` y `ProposalRefused` en
    `repertoire.py`: cuando no se puede leer, se dice — no se rellena.
    """


# --- lo que se evalúa --------------------------------------------------------
@dataclass(frozen=True)
class Comida:
    """Un hueco del día: qué familias hay dentro y cuánto suma.

    `familias` lleva un elemento por entrada, y `None` significa **sin
    clasificar**, nunca «de ninguna familia».
    """

    slot: str | None
    familias: tuple[str | None, ...] = ()
    kcal: float | None = None


@dataclass(frozen=True)
class Dia:
    fecha: date
    entrenado: bool = False
    macros: dict = field(default_factory=dict)
    comidas: tuple[Comida, ...] = ()
    # Los modos de cocinado de los platos registrados ese día.
    metodos: tuple[str, ...] = ()


@dataclass(frozen=True)
class Contexto:
    dia: Dia
    semana: tuple[Dia, ...] = ()
    # La **tendencia** del peso, no la última pesada: lo que se deriva de una
    # cifra que oscila un kilo por agua no se puede mirar (ver `weight.py`).
    kg: float | None = None


@dataclass(frozen=True)
class Veredicto:
    """Qué dice una regla de este día.

    `state`:
      - `met` — se cumple.
      - `broken` — no se cumple, y `short_by` dice por cuánto.
      - `unknown` — **no se puede saber**: falta un dato. No es lo mismo que
        incumplir, y pintarlo igual sería inventarse un juicio.
      - `n_a` — no aplica hoy (condición de día, o retirada).
    """

    rule_id: int | None
    type: str
    hardness: str
    state: str
    short_by: float | None = None
    unclassified: int = 0
    detail: str = ""


# --- el catálogo -------------------------------------------------------------
def _num(params, key, *, required=True):
    value = params.get(key)
    if value is None:
        if required:
            raise RuleRefused(f"falta «{key}»")
        return None
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise RuleRefused(f"«{key}» no es un número")
    return float(value)


def _familia(params):
    familia = params.get("familia")
    if familia not in FAMILIAS:
        raise RuleRefused(f"«{familia}» no es una familia de alimento")
    return familia


def _macro(params):
    macro = params.get("macro")
    if macro not in MACROS:
        raise RuleRefused(f"«{macro}» no es un macro")
    return macro


def _banda(params, lo="min", hi="max"):
    bajo = _num(params, lo)
    alto = _num(params, hi, required=False)
    if alto is not None and alto < bajo:
        raise RuleRefused("el máximo no puede ser menor que el mínimo")
    return bajo, alto


def _v(regla, state, **extra) -> Veredicto:
    return Veredicto(
        rule_id=regla.get("id"),
        type=regla["type"],
        hardness=regla.get("hardness", "soft"),
        state=state,
        **extra,
    )


def _eval_macro_per_kg(regla, ctx: Contexto) -> Veredicto:
    """Proteína de 1,5 a 2 g por kilo. Relativa a lo que pesas hoy."""
    macro = _macro(regla["params"])
    bajo, alto = _banda(regla["params"])
    comido = ctx.dia.macros.get(macro)
    if ctx.kg is None:
        return _v(regla, "unknown", detail="no hay tendencia de peso")
    if comido is None:
        return _v(regla, "unknown", detail=f"el día no suma {macro}")
    minimo = bajo * ctx.kg
    maximo = alto * ctx.kg if alto is not None else None
    if comido < minimo:
        return _v(regla, "broken", short_by=round(minimo - comido, 1))
    if maximo is not None and comido > maximo:
        return _v(regla, "broken", short_by=round(maximo - comido, 1))
    return _v(regla, "met")


def _eval_macro_share(regla, ctx: Contexto) -> Veredicto:
    """Grasa entre el 25 % y el 35 % de las kcal. Lo que reparte el total."""
    macro = _macro(regla["params"])
    bajo, alto = _banda(regla["params"], "min_pct", "max_pct")
    total = ctx.dia.macros.get("kcal")
    aporta = kcal_de_macro(macro, ctx.dia.macros.get(macro))
    if not total or aporta is None:
        return _v(regla, "unknown", detail="el día no suma kcal")
    pct = 100.0 * aporta / total
    if pct < bajo:
        return _v(regla, "broken", short_by=round(bajo - pct, 1))
    if alto is not None and pct > alto:
        return _v(regla, "broken", short_by=round(alto - pct, 1))
    return _v(regla, "met")


def _eval_group_presence(regla, ctx: Contexto) -> Veredicto:
    """Verdura en la comida. Mira **sólo** el hueco que la regla nombra."""
    familia = _familia(regla["params"])
    huecos = [c for c in ctx.dia.comidas if c.slot == regla.get("slot")]
    familias = [f for c in huecos for f in c.familias]
    if familia in familias:
        return _v(regla, "met")
    sin_clasificar = sum(1 for f in familias if f is None)
    if sin_clasificar:
        # No se sabe, y no se sabe **no es** que no la haya.
        return _v(regla, "unknown", unclassified=sin_clasificar)
    return _v(regla, "broken", short_by=1)


def _dias_con(semana, familia) -> tuple[int, int]:
    dias = 0
    sin_clasificar = 0
    for dia in semana:
        familias = [f for c in dia.comidas for f in c.familias]
        if familia in familias:
            dias += 1
        sin_clasificar += sum(1 for f in familias if f is None)
    return dias, sin_clasificar


def _eval_group_frequency(regla, ctx: Contexto) -> Veredicto:
    """Legumbres al menos tres veces por semana. Cuenta **días**, no raciones."""
    familia = _familia(regla["params"])
    minimo = _num(regla["params"], "min")
    dias, sin_clasificar = _dias_con(ctx.semana, familia)
    if dias >= minimo:
        return _v(regla, "met")
    if sin_clasificar:
        return _v(regla, "unknown", unclassified=sin_clasificar)
    return _v(regla, "broken", short_by=minimo - dias)


def _eval_cap(regla, ctx: Contexto) -> Veredicto:
    """La cena no pasa del 25 % de las kcal del día."""
    tope = _num(regla["params"], "max_pct")
    total = ctx.dia.macros.get("kcal")
    huecos = [c.kcal for c in ctx.dia.comidas if c.slot == regla.get("slot")]
    if not total or any(k is None for k in huecos) or not huecos:
        return _v(regla, "unknown", detail="el día no suma kcal")
    pct = 100.0 * sum(huecos) / total
    if pct > tope:
        return _v(regla, "broken", short_by=round(tope - pct, 1))
    return _v(regla, "met")


def _eval_method_preference(regla, ctx: Contexto) -> Veredicto:
    """La air fryer, al menos cuatro veces por semana."""
    metodo = regla["params"].get("method")
    minimo = _num(regla["params"], "min")
    dias = sum(1 for dia in ctx.semana if metodo in dia.metodos)
    if dias >= minimo:
        return _v(regla, "met")
    return _v(regla, "broken", short_by=minimo - dias)


# type → (ámbitos válidos, evaluador). Añadir un tipo es tocar esta tabla y
# escribir su evaluador; no hay forma de meter uno por la puerta de atrás.
TIPOS = {
    "macro_per_kg": (("day",), _eval_macro_per_kg),
    "macro_share": (("day",), _eval_macro_share),
    "group_presence": (("slot",), _eval_group_presence),
    "group_frequency": (("week",), _eval_group_frequency),
    "cap": (("slot",), _eval_cap),
    "method_preference": (("week",), _eval_method_preference),
}


def validar(regla: dict) -> dict:
    """Comprueba que la regla existe y se sostiene. Devuelve sus params.

    Se llama al guardarla, no al evaluarla: una regla que la app no sabe juzgar
    no debe llegar nunca a la base de datos.
    """
    tipo = regla.get("type")
    if tipo not in TIPOS:
        raise RuleRefused(f"«{tipo}» no es un tipo de regla")
    ambitos, _ = TIPOS[tipo]
    if regla.get("scope") not in ambitos:
        raise RuleRefused(f"«{tipo}» es de ámbito {' o '.join(ambitos)}")
    if regla.get("scope") == "slot" and not regla.get("slot"):
        raise RuleRefused("una regla de hueco tiene que decir cuál")
    if regla.get("hardness") not in HARDNESS:
        raise RuleRefused("una regla es dura o blanda")
    if regla.get("day_condition") not in (None, *CONDITIONS):
        raise RuleRefused("la condición es «training», «rest» o ninguna")

    params = regla.get("params") or {}
    if not isinstance(params, dict):
        raise RuleRefused("los parámetros no son un objeto")
    # Cada evaluador valida los suyos al leerlos, así que se le pasa un
    # contexto vacío sólo para que los mire. Lo que devuelva da igual.
    _, evaluar_uno = TIPOS[tipo]
    try:
        evaluar_uno({**regla, "params": params}, Contexto(dia=Dia(fecha=date.today())))
    except RuleRefused:
        raise
    return params


def desde_fila(row) -> dict:
    """Una fila de `rules` como la ve este módulo.

    Está aquí y no en un router porque hay dos sitios que la necesitan —el
    veredicto del día y el generador de la semana— y dos traducciones de la
    misma fila acabarían diciendo cosas distintas.
    """
    return {
        "id": row.id,
        "type": row.type,
        "scope": row.scope,
        "slot": row.slot,
        "day_condition": row.day_condition,
        "hardness": row.hardness,
        "params": json.loads(row.params_json),
        "active_from": row.active_from,
        "active_to": row.active_to,
    }


def aplica(regla: dict, dia: Dia, *, hoy: date | None = None) -> bool:
    """Si esta regla se juzga hoy.

    Una retirada no se juzga hacia atrás ni hacia delante, y una condicionada
    al tipo de día se calla el resto de días — que no es lo mismo que cumplirse.
    """
    hoy = hoy or dia.fecha
    if regla.get("active_from") and hoy < regla["active_from"]:
        return False
    if regla.get("active_to") and hoy > regla["active_to"]:
        return False
    condicion = regla.get("day_condition")
    if condicion == "training" and not dia.entrenado:
        return False
    if condicion == "rest" and dia.entrenado:
        return False
    return True


def evaluar(reglas, ctx: Contexto) -> list[Veredicto]:
    """El veredicto de cada regla sobre este día."""
    veredictos = []
    for regla in reglas:
        if not aplica(regla, ctx.dia):
            veredictos.append(_v(regla, "n_a"))
            continue
        _, evaluar_uno = TIPOS[regla["type"]]
        veredictos.append(evaluar_uno(regla, ctx))
    return veredictos


def aceptable(veredictos) -> bool:
    """Si el día vale. Lo estropea una **dura** rota, no una blanda.

    Un `unknown` no lo estropea: no saber no es incumplir.
    """
    return not any(v.hardness == "hard" and v.state == "broken" for v in veredictos)
