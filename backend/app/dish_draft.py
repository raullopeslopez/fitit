"""Una idea abierta como plato: las líneas de su receta, casadas con alimentos.

Las piezas ya existen y aquí sólo se encadenan:

- la página → `recipe_page.read_recipe` (lo que publica, sin interpretar);
- cada línea → `ingredient_line.parse_line` (cantidad, unidad, gramos, nombre);
- cada nombre → `ingredient_match.match_ingredient` (elegido, «¿Cuál?», falta);
- gramos por ración → `nutrition.gramos_por_racion`. La división vive allí.

Lo que se añade es de dónde salen los alimentos contra los que se casa: los
que existen para ti (`visible_foods`: tu despensa y el catálogo compartido),
con una consulta previa barata en vez de las tres mil filas de CIQUAL por
línea. Y una regla: **lo tuyo va delante**. Si das de alta «Acelgas del
huerto», es la que usas, y un empate con CIQUAL no te la debe quitar.

Nada de aquí escribe en `foods` ni en `dishes`: un borrador es para mirarlo.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .ingredient_line import parse_line
from .ingredient_match import MAX_CANDIDATES, IngredientMatch, match_ingredient, prefilter_words
from .models import Food, FoodAlias, visible_foods
from .naming import fold_exercise_name
from .nutrition import gramos_por_racion
from .recipe_page import RecipeData

# El modo que trae la idea es texto libre de la receta («horno», «sartén»,
# «olla»). Sólo se traslada al plato cuando es uno de los del repertorio; el
# resto se queda en «sin especificar» en vez de adivinar.
_METHODS = {
    "horno": "horno",
    "al horno": "horno",
    "sarten": "sarten",
    "en sarten": "sarten",
    "plancha": "plancha",
    "a la plancha": "plancha",
    "air fryer": "air_fryer",
    "airfryer": "air_fryer",
    "freidora de aire": "air_fryer",
    "cocido": "cocido",
    "crudo": "crudo",
}


def dish_method(idea_method: str | None) -> str | None:
    if not idea_method:
        return None
    return _METHODS.get(fold_exercise_name(idea_method))


# --- La receta guardada en la idea ------------------------------------------------


def dump_recipe(recipe: RecipeData | None) -> str:
    """Lo leído de la página, para `dish_ideas.recipe_json`. Una página sin
    receta también se guarda —`found: false`—: leerla otra vez no la cambia."""
    return json.dumps(
        {
            "found": recipe is not None,
            "ingredients": recipe.ingredients if recipe else [],
            "servings": recipe.servings if recipe else None,
            "fetched_at": datetime.now(UTC).isoformat(),
        },
        ensure_ascii=False,
    )


@dataclass(frozen=True)
class StoredRecipe:
    found: bool
    ingredients: list[str]
    servings: float | None


def load_recipe(raw: str) -> StoredRecipe:
    data = json.loads(raw)
    return StoredRecipe(
        found=bool(data.get("found")),
        ingredients=[str(line) for line in data.get("ingredients") or []],
        servings=data.get("servings"),
    )


# --- Los alimentos candidatos -----------------------------------------------------


async def candidate_foods(session: AsyncSession, user_id: int, names: list[str]) -> list[Food]:
    """Los alimentos visibles para ti cuyo nombre o alias contiene alguna
    palabra de las líneas. `prefilter_words` garantiza que no se pierde nada
    que `match_ingredient` fuese a encontrar (hay un test contra CIQUAL)."""
    words = sorted(prefilter_words(names))
    if not words:
        return []
    by_alias = select(FoodAlias.food_id).where(
        or_(*(FoodAlias.alias_folded.contains(w) for w in words))
    )
    query = (
        select(Food)
        .options(selectinload(Food.aliases))
        .where(
            visible_foods(user_id),
            or_(*(Food.name_folded.contains(w) for w in words), Food.id.in_(by_alias)),
        )
    )
    return list((await session.execute(query)).scalars().all())


def match_line(name: str, foods: list[Food], user_id: int) -> IngredientMatch:
    """`match_ingredient`, con lo tuyo delante.

    Primero sólo contra tu despensa: si ahí hay uno claro, es ése. Si no, contra
    todo; y si la respuesta es «¿Cuál?», tus alimentos encabezan los candidatos.
    """
    own = [f for f in foods if f.user_id == user_id]
    mine = match_ingredient(name, own) if own else None
    if mine is not None and mine.status == "chosen":
        return mine
    match = match_ingredient(name, foods)
    if match.status != "ambiguous" or mine is None or not mine.candidates:
        return match
    # Los tuyos que casan, en el orden de `match_ingredient`, aunque entre todos
    # no hubiesen llegado a los tres primeros; luego el resto.
    rest = [i for i in match.candidates if i not in mine.candidates]
    return IngredientMatch("ambiguous", None, (mine.candidates + rest)[:MAX_CANDIDATES])


# --- El borrador ------------------------------------------------------------------


@dataclass(frozen=True)
class DraftLine:
    text: str
    quantity: float | None
    unit: str | None
    recipe_grams: float | None
    grams: float | None
    status: str
    food: Food | None
    candidates: list[Food]


async def build_draft_lines(
    session: AsyncSession, user_id: int, ingredients: list[str], servings: float | None
) -> list[DraftLine]:
    """Las líneas del borrador, con los alimentos traídos de una sola consulta."""
    foods = await candidate_foods(session, user_id, [parse_line(t).name for t in ingredients])
    return draft_lines(ingredients, servings, foods, user_id)


def draft_lines(
    ingredients: list[str], servings: float | None, foods: list[Food], user_id: int
) -> list[DraftLine]:
    by_id = {f.id: f for f in foods}
    lines = []
    for text in ingredients:
        parsed = parse_line(text)
        match = match_line(parsed.name, foods, user_id)
        lines.append(
            DraftLine(
                text=text,
                quantity=parsed.quantity,
                unit=parsed.unit,
                recipe_grams=parsed.grams,
                grams=gramos_por_racion(parsed.grams, servings),
                status=match.status,
                food=by_id.get(match.food_id) if match.food_id is not None else None,
                candidates=[by_id[i] for i in match.candidates if i in by_id],
            )
        )
    return lines
