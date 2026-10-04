"""Cuánto de un alimento es hueso, cuando nadie lo ha pesado.

Una tabla corta de productos que se compran con hueso —muslos, alitas,
chuletas, costillas, pescado entero— con su desperdicio típico. Se empareja por
el nombre plegado, igual que la búsqueda (`fold_exercise_name`), y da un
desperdicio de partida a un alimento que no tiene uno medido, sea del catálogo
o tuyo — y al alta, el valor con que proponer «Lleva hueso».

Lo que **no** hace es suponer a qué se refieren las kcal de una etiqueta. Lo
hacía, comparando la cifra con la de la carne de esta tabla, y una suposición
callada sobre un número que se va a sumar todos los días es justo lo que hace
mentir al diario. Ahora lo dice quien da de alta el alimento.

La aritmética no vive aquí; esto es un dato y un emparejado.

**Fuentes.** Los porcentajes son valores típicos, redondeados, del campo
*Refuse* de USDA FoodData Central (SR Legacy) y de la *porción comestible* de
BEDCA / Moreiras (Tablas de composición de alimentos). Son valores medios: un
muslo concreto puede llevar más o menos hueso, y por eso pesar el hueso que sobra en el plato
(`POST /food-log/{id}/bone`) manda sobre esta tabla para un alimento tuyo.
"""

from dataclasses import dataclass

from .naming import fold_exercise_name as fold
from .nutrition import calcular_nutrientes, nutrientes_con_hueso


@dataclass(frozen=True)
class Referencia:
    clave: str
    # Cada grupo es una palabra que tiene que estar, en cualquiera de sus formas.
    palabras: tuple[tuple[str, ...], ...]
    refuse_pct: float
    fuente: str


_POLLO = ("pollo", "pollos")
_CERDO = ("cerdo", "porcino", "iberico")
_CORDERO = ("cordero", "carnero", "lechazo")
_VACUNO = ("vacuno", "ternera", "vaca", "buey", "anojo")
_ENTERO = ("entero", "entera", "enteros", "enteras")
_PESCADO = (
    "pescado", "dorada", "doradas", "lubina", "lubinas", "merluza", "pescadilla",
    "besugo", "trucha", "truchas", "sardina", "sardinas", "caballa", "caballas",
    "jurel", "jureles", "salmonete", "salmonetes", "lenguado", "gallo", "sargo",
    "corvina", "pargo",
)  # fmt: skip

# El orden importa: gana la primera que casa. «Contramuslo» antes que «muslo».
REFERENCIAS: tuple[Referencia, ...] = (
    Referencia(
        "contramuslo de pollo",
        (("contramuslo", "contramuslos"), _POLLO),
        20,
        "USDA SR Legacy, thigh meat and skin, raw (refuse ≈ 21 %)",
    ),
    Referencia(
        "muslo de pollo",
        (("muslo", "muslos", "jamoncito", "jamoncitos", "cuarto", "cuartos"), _POLLO),
        30,
        "USDA SR Legacy, drumstick/leg meat and skin, raw (refuse ≈ 30 %)",
    ),
    Referencia(
        "muslo de pavo",
        (("muslo", "muslos", "contramuslo", "contramuslos"), ("pavo",)),
        30,
        "USDA SR Legacy, turkey drumstick, raw (refuse ≈ 30 %)",
    ),
    Referencia(
        "alitas de pollo",
        (("alita", "alitas", "ala", "alas"), _POLLO),
        45,
        "USDA SR Legacy, wing meat and skin, raw (refuse ≈ 46 %)",
    ),
    Referencia(
        "pollo entero",
        (_POLLO, _ENTERO),
        30,
        "USDA SR Legacy, broiler whole, meat and skin, raw (refuse ≈ 30 %)",
    ),
    Referencia(
        "chuleta de cerdo",
        (("chuleta", "chuletas", "chuletilla", "chuletillas"), _CERDO),
        20,
        "USDA SR Legacy, pork loin chop bone-in (refuse ≈ 20 %)",
    ),
    Referencia(
        "costillas de cerdo",
        (("costilla", "costillas", "costillitas", "travers"), _CERDO),
        45,
        "BEDCA/Moreiras, costilla de cerdo (porción comestible ≈ 0,55)",
    ),
    Referencia(
        "chuleta de cordero",
        (("chuleta", "chuletas", "chuletilla", "chuletillas"), _CORDERO),
        25,
        "USDA SR Legacy, lamb chops (refuse ≈ 25 %)",
    ),
    Referencia(
        "paletilla de cordero",
        (("paletilla", "paletillas", "paleta"), _CORDERO),
        25,
        "USDA SR Legacy, lamb shoulder whole (refuse ≈ 24 %)",
    ),
    Referencia(
        "pierna de cordero",
        (("pierna", "piernas"), _CORDERO),
        20,
        "USDA SR Legacy, lamb leg whole (refuse ≈ 17–20 %)",
    ),
    Referencia(
        "chuletón",
        (("chuleton", "chuletones"),),
        15,
        "USDA SR Legacy, T-bone / rib steak bone-in (refuse ≈ 13–18 %)",
    ),
    Referencia(
        "chuleta de vacuno",
        (("chuleta", "chuletas"), _VACUNO),
        15,
        "USDA SR Legacy, beef rib/loin steak bone-in (refuse ≈ 15 %)",
    ),
    Referencia(
        "conejo",
        (("conejo",),),
        30,
        "BEDCA/Moreiras, conejo (porción comestible ≈ 0,70)",
    ),
    Referencia(
        "pescado entero",
        (_PESCADO, _ENTERO),
        45,
        "USDA SR Legacy / Moreiras, pescado entero (cabeza, espinas y piel ≈ 40–50 %)",
    ),
)

# Lo que dice que **no** hay hueso a la vista, o que el producto ya no es la
# pieza: un filete, una hamburguesa, una conserva, una víscera. Por prefijo.
_SIN_HUESO = (
    "deshuesad", "filete", "hamburgues", "salchich", "nugget", "albondig",
    "conserva", "higado", "rinon", "corazon", "lengua", "seso", "molleja",
    "caldo", "pechug", "magret", "picad", "envasad", "grasa",
)  # fmt: skip


def _palabras(name: str) -> list[str]:
    folded = fold(name or "")
    return "".join(c if c.isalnum() else " " for c in folded).split()


def referencia(name: str | None) -> Referencia | None:
    """La referencia que casa con ese nombre, o `None` si no lleva hueso."""
    palabras = _palabras(name or "")
    if not palabras:
        return None
    if "sin hueso" in " ".join(palabras):
        return None
    if any(p.startswith(prefijo) for p in palabras for prefijo in _SIN_HUESO):
        return None
    presentes = set(palabras)
    for ref in REFERENCIAS:
        if all(presentes.intersection(grupo) for grupo in ref.palabras):
            return ref
    return None


@dataclass(frozen=True)
class Hueso:
    """Lo que vale para un alimento: su hueso y a qué se refieren sus kcal."""

    refuse_pct: float
    # 'tuyo' (medido o escrito por ti) | 'referencia' (la tabla de arriba)
    origen: str
    # 'edible' | 'as_sold' | 'unknown'
    basis: str


def hueso_de(food) -> Hueso | None:
    """El hueso de un alimento, o `None` si no tiene.

    Lo tuyo manda sobre la tabla, y un 0 % tuyo es «no lleva hueso»: la salida
    para cuando el nombre casó con algo que no era. Las kcal de CIQUAL son
    siempre de la parte comestible (así se publica la tabla). Las de un
    alimento tuyo son lo que dijiste, y si no dijiste nada, `unknown`.
    """
    ref = referencia(getattr(food, "name", None))
    stored = getattr(food, "refuse_pct", None)
    if stored is not None:
        refuse, origen = stored, "tuyo"
    elif ref is not None:
        refuse, origen = ref.refuse_pct, "referencia"
    else:
        return None
    if not refuse:
        return None

    declared = getattr(food, "kcal_basis", None)
    if declared is not None:
        return Hueso(refuse, origen, declared)
    if getattr(food, "source", None) == "ciqual":
        return Hueso(refuse, origen, "edible")
    return Hueso(refuse, origen, "unknown")


def nutrientes_de_lo_pesado(food, grams: float, with_bone: bool) -> tuple[dict, float | None]:
    """Lo que aportan `grams` de `food`, pesados con hueso o sin él.

    Devuelve `(nutrientes, gramos_comestibles)`, con los comestibles a `None`
    cuando no se han usado. Sin hueso —o si el alimento no lleva— es
    `calcular_nutrientes` de siempre. Salta con `ValueError` cuando se pesó con
    hueso y nadie sabe si las kcal lo cuentan: ahí no hay número honesto.

    Aquí y no en `nutrition.py` porque decide **qué** hueso vale, que es cosa
    de la tabla; la cuenta sigue siendo la de allí.
    """
    hueso = hueso_de(food) if with_bone else None
    if hueso is None:
        return calcular_nutrientes(food, grams), None
    return nutrientes_con_hueso(food, grams, refuse_pct=hueso.refuse_pct, basis=hueso.basis)
