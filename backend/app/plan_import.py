"""Lo que el modelo leyó de un PDF de plan, puesto en limpio.

El modelo transcribe; aquí se decide qué de eso se cree. Puro: sin base y sin
red, como `label.py`.

- Un plato sin nombre no existe y se descarta.
- Los platos se identifican por su nombre **plegado** (`fold_exercise_name`),
  igual que `dishes.name_folded`: «Tortilla de patatas» y «tortilla de
  patatas» son el mismo plato, en el documento y contra tu repertorio.
- Un plato nombrado en la semana y nunca descrito **sigue apareciendo**, sin
  ingredientes: tirarlo dejaría un hueco en la semana sin decir por qué.
- Las tomas entre comidas («merienda», «media mañana») van al snack, aunque el
  prompt ya lo pida: lo que dice el prompt es un deseo, y lo que hace esto es
  la garantía.
- Un día o una comida que no se reconoce descarta esa casilla, no el plan.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .naming import fold_exercise_name

# Lunes es 0, como `date.weekday()`.
DIAS = {
    "lunes": 0,
    "martes": 1,
    "miercoles": 2,
    "jueves": 3,
    "viernes": 4,
    "sabado": 5,
    "domingo": 6,
}

HUECOS = {
    "desayuno": "desayuno",
    "comida": "comida",
    "almuerzo": "comida",
    "cena": "cena",
    "snack": "snack",
    "merienda": "snack",
    "media manana": "snack",
    "media-manana": "snack",
    "tentempie": "snack",
    "recena": "snack",
    "picoteo": "snack",
}


@dataclass
class ReadDish:
    name: str
    slots: list[str] = field(default_factory=list)
    ingredients: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ReadSlot:
    day: int
    slot: str
    # Posición del plato en `PlanRead.dishes`.
    dish: int


@dataclass
class PlanRead:
    dishes: list[ReadDish] = field(default_factory=list)
    week: list[ReadSlot] = field(default_factory=list)


def slot_of(value) -> str | None:
    if not isinstance(value, str):
        return None
    return HUECOS.get(fold_exercise_name(value))


def day_of(value) -> int | None:
    if not isinstance(value, str):
        return None
    return DIAS.get(fold_exercise_name(value))


def _text(value) -> str | None:
    if not isinstance(value, str):
        return None
    value = " ".join(value.split())
    return value or None


class _Lectura:
    """El plan a medio leer, con los platos indexados por nombre plegado."""

    def __init__(self) -> None:
        self.read = PlanRead()
        self._por_nombre: dict[str, int] = {}

    def plato(self, name: str) -> int:
        key = fold_exercise_name(name)
        if key not in self._por_nombre:
            self._por_nombre[key] = len(self.read.dishes)
            self.read.dishes.append(ReadDish(name=name))
        return self._por_nombre[key]

    def anota_hueco(self, indice: int, slot: str) -> None:
        dish = self.read.dishes[indice]
        if slot not in dish.slots:
            dish.slots.append(slot)

    def platos(self, crudos) -> None:
        for raw in crudos or []:
            name = _text(raw.get("name")) if isinstance(raw, dict) else None
            if name is None:
                continue
            indice = self.plato(name)
            for slot in filter(None, map(slot_of, raw.get("slots") or [])):
                self.anota_hueco(indice, slot)
            dish = self.read.dishes[indice]
            # Repetido en el documento: se queda con la primera descripción que
            # traiga ingredientes, no mezcla dos.
            if not dish.ingredients:
                dish.ingredients = [t for t in map(_text, raw.get("ingredients") or []) if t]

    def semana(self, crudas) -> None:
        vistas: set[tuple[int, str]] = set()
        for raw in crudas or []:
            if not isinstance(raw, dict):
                continue
            day, slot = day_of(raw.get("day")), slot_of(raw.get("slot"))
            name = _text(raw.get("dish"))
            # Dos platos en la misma casilla (merienda y media mañana, las dos
            # snack): se queda el primero. El plan tiene un plato por comida.
            if day is None or slot is None or name is None or (day, slot) in vistas:
                continue
            vistas.add((day, slot))
            indice = self.plato(name)
            self.anota_hueco(indice, slot)
            self.read.week.append(ReadSlot(day=day, slot=slot, dish=indice))
        self.read.week.sort(key=lambda c: (c.day, ORDEN.index(c.slot)))


ORDEN = ["desayuno", "comida", "cena", "snack"]


def read_plan_payload(payload) -> PlanRead:
    """Lo que el modelo contestó, como platos y semana. Nunca lanza: una
    respuesta con otra forma es un plan vacío, no un 500."""
    payload = payload if isinstance(payload, dict) else {}
    lectura = _Lectura()
    lectura.platos(payload.get("dishes"))
    lectura.semana(payload.get("week"))
    return lectura.read
