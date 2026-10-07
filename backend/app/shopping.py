"""La lista de la compra: la semana planificada, sumada como se compra.

Puro: recibe las filas del plan, los platos y los alimentos, y devuelve la
lista. Ni base ni red, como `planner.py`. La aritmética de pesos —el hueso— es de
`nutrition.py`; aquí sólo se suma, se agrupa por pasillo y se cuenta en envases.

Se cuenta **todo lo planificado**, también lo ya comido o saltado: la lista es
para comprar antes de que empiece la semana, cuando nada de eso ha pasado.
"""

from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from dataclasses import dataclass

from .food_groups import familia
from .naming import fold_exercise_name as fold
from .nutrition import gramos_de_compra
from .refuse import hueso_de

# Los pasillos, en el orden en que se recorre un súper. Una familia de CIQUAL va
# a su pasillo; lo que no tiene familia (lo tuyo sin decir, los envasados de
# Open Food Facts) se clasifica por el nombre, y sólo lo que no casa con nada
# va a «Otros».
PASILLOS = (
    "Carne", "Charcutería", "Pescado", "Lácteos y huevos", "Hidratos", "Fruta y verdura",
    "Despensa", "Otros",
)
# Derivados cárnicos de CIQUAL: jamón cocido, fiambres. En el súper están en la
# charcutería, no junto a la carne fresca.
_CHARCUTERIA_CIQUAL = "0404"

# Por el nombre, en este orden: lo más concreto primero. «Tomate frito» es una
# conserva antes que un tomate; «filetes de merluza» es pescado antes que
# «filete»; «pechuga de pavo cocida» es charcutería antes que carne. Palabras
# enteras, sobre el nombre plegado: «pan» no es «panceta».
_POR_NOMBRE = (
    ("Despensa", ("tomate frito", "crema de cacahuete", "aceite", "vinagre", "salsa", "especias",
                  "caldo", "miel", "azucar", "cafe", "frutos secos", "almendras?", "nueces",
                  "cacahuetes?", "sal", "nuez", "pistachos?", "pipas?", "anacardos?", "avellanas?",
                  "turron", "mazapan", "galletas?", "chocolate", "cacao", "mermelada",
                  "levadura")),
    ("Charcutería", ("lonchas", "loncheado", "jamon", "chorizo", "salchichon", "fuet",
                     "mortadela", "embuchado", "cecina", "bacon", "salami", "fiambre", "cocida",
                     "braseada", "longaniza", "chistorra", "pate", "salchichas?", "sobrasada")),
    ("Pescado", ("merluza", "salmon", "atun", "bacalao", "dorada", "lubina", "sepia", "calamar",
                 "gambas?", "gambon", "langostinos?", "mejillon(es)?", "sardinas?", "boquerones?",
                 "pulpo", "rape", "emperador", "surimi", "bonito", "caballa", "trucha", "lenguado",
                 "pota", "pescadilla", "marisco", "berberechos", "almejas?", "anchoas?",
                 "sardinillas", "navajas?", "chipirones", "tiburon", "mariscos?")),
    ("Carne", ("carne", "pollo", "pechugas?", "pavo", "ternera", "vacuno", "cerdo", "lomos?", "solomillos?",
               "hamburguesas?", "burger", "picada", "conejo", "cordero", "muslos?",
               "contramuslos?", "alitas", "costillas?", "filetes?")),
    ("Lácteos y huevos", ("leche", "yogur(es)?", "queso", "kefir", "skyr", "natillas", "cuajada",
                          "requeson", "nata", "mantequilla", "batido", "flan", "postre lacteo",
                          "bifidus", "huevos?", "claras", "curado", "camembert", "emmental",
                          "mozzarella", "parmesano", "gouda", "cheddar", "roquefort", "burgos",
                          "grana padano", "manchego")),
    ("Hidratos", ("arroz", "pasta", "macarrones?", "espaguetis?", "spaghetti", "tallarines",
                  "fideos?", "pan", "avena", "copos", "cereales", "patatas?", "tortillas?",
                  "tortitas", "quinoa", "cuscus", "harina", "lentejas?", "garbanzos?",
                  "alubias?", "picos", "reganas?", "panecillos?", "biscotes?", "tostadas")),
    ("Fruta y verdura", ("platanos?", "manzanas?", "fresas?", "naranjas?", "kiwis?", "peras?",
                         "uvas?", "frutos rojos", "tomates?", "lechuga", "brocoli", "calabacin",
                         "pimientos?", "cebollas?", "espinacas?", "zanahorias?", "judias? verdes?",
                         "champinones?", "verduras?", "ensalada", "aguacates?", "berenjenas?",
                         "pepinos?", "ajos?")),
)
_PATRONES = tuple(
    (nombre, re.compile(r"\b(" + "|".join(palabras) + r")\b")) for nombre, palabras in _POR_NOMBRE
)
_POR_FAMILIA = {
    "carne": "Carne",
    "pescado": "Pescado",
    "huevo": "Lácteos y huevos",
    "lacteo": "Lácteos y huevos",
    "cereal": "Hidratos",
    "legumbre": "Hidratos",
    "tuberculo": "Hidratos",
    "verdura": "Fruta y verdura",
    "fruta": "Fruta y verdura",
    "frutos_secos": "Despensa",
}


@dataclass(frozen=True)
class Articulo:
    food_id: int
    name: str
    brand: str | None
    grams: float
    packs: int | None
    package_grams: float | None


def pasillo(food) -> str:
    """El pasillo de un alimento: el de su familia si la tiene, y si no, el que
    diga su nombre. Lo que no casa con nada va a «Otros» en vez de adivinarlo."""
    subgrupo = getattr(food, "subgroup_code", None)
    if subgrupo == _CHARCUTERIA_CIQUAL:
        return "Charcutería"
    por_familia = _POR_FAMILIA.get(familia(subgrupo))
    if por_familia:
        return por_familia
    nombre = fold(getattr(food, "name", "") or "")
    for pasillo_, patron in _PATRONES:
        if patron.search(nombre):
            return pasillo_
    return "Otros"


def lista(entradas, platos: dict, foods: dict) -> dict[str, list[Articulo]]:
    """`entradas`: filas del plan (`dish_id`, `grams_json`). `platos`: id → plato
    con sus ingredientes en orden. `foods`: id → alimento. Devuelve pasillo →
    artículos, en el orden de `PASILLOS` y por nombre dentro de cada uno."""
    comidos: dict[int, float] = defaultdict(float)
    for entrada in entradas:
        plato = platos.get(entrada.dish_id)
        if plato is None:
            continue
        gramos = json.loads(entrada.grams_json) if entrada.grams_json else []
        for i, ingrediente in enumerate(plato.ingredients):
            g = gramos[i] if i < len(gramos) else ingrediente.grams / (plato.servings or 1)
            comidos[ingrediente.food_id] += g

    por_pasillo: dict[str, list[Articulo]] = defaultdict(list)
    for food_id, g in comidos.items():
        food = foods[food_id]
        hueso = hueso_de(food)
        # Lo que pesa una comida es la parte que se come; el hueso se compra.
        # Sólo cuando las cifras son de la parte comestible: si el alimento ya
        # se apuntó «tal cual se vende», el hueso va dentro del peso.
        if hueso is not None and hueso.basis == "edible":
            g = gramos_de_compra(g, hueso.refuse_pct)
        envase = getattr(food, "package_grams", None)
        packs = math.ceil(g / envase) if envase else None
        por_pasillo[pasillo(food)].append(
            Articulo(food.id, food.name, food.brand, round(g), packs, envase)
        )
    return {
        p: sorted(por_pasillo[p], key=lambda a: a.name.lower()) for p in PASILLOS if por_pasillo.get(p)
    }
