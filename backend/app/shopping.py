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
from collections import defaultdict
from dataclasses import dataclass

from .food_groups import familia
from .nutrition import gramos_de_compra
from .refuse import hueso_de

# Los pasillos, en el orden en que se recorre un súper. Una familia de CIQUAL va
# a su pasillo; lo que no tiene familia (lo tuyo sin decir, los envasados de
# Open Food Facts) va a «Otros» en vez de adivinarle uno.
PASILLOS = ("Carne", "Pescado", "Lácteos y huevos", "Hidratos", "Fruta y verdura", "Despensa", "Otros")
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
    return _POR_FAMILIA.get(familia(getattr(food, "subgroup_code", None)), "Otros")


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
