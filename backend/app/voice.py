"""Lo dictado, casado con tus alimentos y con una cantidad (docs/registro-por-voz.md).

El modelo oye y parte en líneas (`gemini.read_voice`); aquí se decide, para cada
una, **qué alimento** y **cuánto**. Nada se guarda: lo que sale va al modal de
«Revisa lo que has dicho», y apuntar es otra petición.

Qué alimento, sólo para la voz (el emparejador de recetas y tickets no cambia):

1. Si alguno de los que casan es **costumbre** —apuntado en la ventana de
   `/frequent`—, el más repetido. Lo dices porque lo comes.
2. Si no, uno **tuyo** que `match_ingredient` elija claro.
3. Si no, «¿Cuál?» con tres: tuyos, luego Hacendado/Eroski, luego el resto.
4. Ninguno: «missing». No se da de alta nada.

«Casar» es por palabras: todas las de lo dicho (plegadas, sin vacías, en
singular, como en `ingredient_match`) tienen que estar en el nombre o en un
alias. «pasta» no encuentra «Macarrón»: eso es un alias que falta, no algo que
adivinar.

Cuánto, por prioridad: los gramos dichos; una medida casera; una unidad con tu
ración («2 huevos» × la tuya); una unidad sin ración → se pregunta, con el peso
que propone el modelo; sin cantidad y costumbre → tu cantidad de siempre; sin
cantidad y nuevo → la ración del modelo, **estimada**. Tu cantidad de costumbre
nunca se multiplica por lo dicho: 120 g de huevo no dicen si eran uno o dos.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.ingredient_line import GRAMS_PER_UNIT
from app.ingredient_match import food_words, match_ingredient
from app.models import Food, visible_portions
from app.nutrition import MEDIDAS, gramos_de_medida

MAX_CANDIDATES = 3
# Las marcas del catálogo de tu súper (scripts/import_off.py).
SUPERMERCADO = ("hacendado", "eroski")
UNIDAD = "unidad"


@dataclass(frozen=True)
class Heard:
    """Una línea tal como la devolvió el modelo, ya limpia."""

    text: str
    name: str
    quantity: float | None = None
    unit: str | None = None
    unit_grams: float | None = None
    portion_grams: float | None = None


@dataclass(frozen=True)
class Habit:
    """Lo que repites de un alimento: cuántas veces y la cantidad más repetida."""

    times: int
    grams: float
    measure: str | None = None
    measure_count: float | None = None


@dataclass(frozen=True)
class VoiceLine:
    text: str
    status: str  # "chosen" | "ambiguous" | "missing"
    food: Food | None
    candidates: list[Food]
    grams: float | None = None
    measure: str | None = None
    measure_count: float | None = None
    estimated: bool = False
    # «¿Cuánto pesa 1 huevo?»: {"name", "label", "count", "suggested_grams"}.
    unit_question: dict | None = None


def parse_heard(payload: dict | None) -> tuple[str, list[Heard]]:
    """Lo que contestó el modelo, sin fiarse de su forma: una línea sin nombre no
    es una línea, y un número que no lo es se queda en `None` (desconocido)."""
    payload = payload if isinstance(payload, dict) else {}
    transcript = payload.get("transcript") if isinstance(payload.get("transcript"), str) else ""
    lines = []
    for raw in payload.get("lines") or []:
        if not isinstance(raw, dict):
            continue
        name = _text(raw.get("name"))
        if not name:
            continue
        lines.append(
            Heard(
                text=_text(raw.get("text")) or name,
                name=name,
                quantity=_positive(raw.get("quantity")),
                unit=_text(raw.get("unit")),
                unit_grams=_positive(raw.get("unit_grams")),
                portion_grams=_positive(raw.get("portion_grams")),
            )
        )
    return transcript.strip(), lines


def voice_lines(
    heard: list[Heard], foods: list[Food], user_id: int, habits: dict[int, Habit]
) -> list[VoiceLine]:
    return [_line(h, foods, user_id, habits) for h in heard]


def _line(heard: Heard, foods: list[Food], user_id: int, habits: dict[int, Habit]) -> VoiceLine:
    status, food, candidates = choose_food(heard.name, foods, user_id, habits)
    amount = _amount(heard, food, user_id, habits.get(food.id) if food else None)
    return VoiceLine(text=heard.text, status=status, food=food, candidates=candidates, **amount)


def choose_food(
    name: str, foods: list[Food], user_id: int, habits: dict[int, Habit]
) -> tuple[str, Food | None, list[Food]]:
    wanted = set(food_words(name))
    if not wanted:
        return "missing", None, []
    hits = [f for f in foods if wanted <= _words_of(f)]
    if not hits:
        return "missing", None, []

    usual = [f for f in hits if f.id in habits]
    if usual:
        # El más repetido; a igualdad, el más reciente (los hábitos vienen así).
        best = max(usual, key=lambda f: habits[f.id].times)
        return "chosen", best, [best]

    own = [f for f in hits if f.user_id == user_id]
    if own:
        match = match_ingredient(name, own)
        if match.status == "chosen":
            best = next(f for f in own if f.id == match.food_id)
            return "chosen", best, [best]

    def rank(food: Food) -> tuple:
        if food.user_id == user_id:
            group = 0
        elif (food.brand_folded or "") in SUPERMERCADO:
            group = 1
        else:
            group = 2
        return (group, len(food.name), food.name_folded)

    return "ambiguous", None, sorted(hits, key=rank)[:MAX_CANDIDATES]


def _amount(heard: Heard, food: Food | None, user_id: int, habit: Habit | None) -> dict:
    unit = (heard.unit or "").lower() or None
    quantity = heard.quantity

    if quantity is not None:
        if unit in MEDIDAS:
            return {
                "grams": gramos_de_medida(unit, quantity),
                "measure": unit,
                "measure_count": quantity,
            }
        if unit in GRAMS_PER_UNIT:
            return {"grams": round(quantity * GRAMS_PER_UNIT[unit], 2)}
        # Con cantidad y sin unidad de peso, son piezas: «dos huevos», «un plátano».
        portion = _unit_portion(food, user_id) if food else None
        if portion is not None:
            return {"grams": round(portion.grams * quantity, 2)}
        return {
            "unit_question": {
                # Lo dicho, para preguntar «¿Cuánto pesa 1 huevo?».
                "name": heard.name,
                "label": UNIDAD,
                "count": quantity,
                "suggested_grams": heard.unit_grams,
            }
        }

    if habit is not None:
        return {
            "grams": habit.grams,
            "measure": habit.measure,
            "measure_count": habit.measure_count,
        }
    if heard.portion_grams is not None:
        return {"grams": heard.portion_grams, "estimated": True}
    return {}


def _unit_portion(food: Food, user_id: int):
    """La ración «unidad» que vale para ti: la tuya antes que la del alimento."""
    units = [p for p in visible_portions(food, user_id) if p.label.strip().lower() == UNIDAD]
    units.sort(key=lambda p: p.user_id is None)
    return units[0] if units else None


def _words_of(food: Food) -> set[str]:
    words = set(food_words(food.name))
    for alias in food.aliases or ():
        words |= set(food_words(getattr(alias, "alias", alias)))
    return words


def _text(value) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _positive(value) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value) if value > 0 else None
