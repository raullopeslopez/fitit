"""The food catalogue: finding a food, and adding one nobody has.

Two kinds of row live in `foods`. The shared catalogue (CIQUAL, later Open Food
Facts) has `user_id = NULL` and is read-only from here — it is measurements, not
belongings. Anything you typed yourself carries your id and is yours to correct.
Search reads both; writes only ever touch yours.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer, selectinload

from ..auth import get_current_user
from ..db import get_session
from ..models import Food, FoodAlias, Portion
from ..naming import fold_exercise_name as fold
from ..schemas import FoodIn, FoodOut, FoodPatch
from ..serialization import to_food_out

router = APIRouter(prefix="/foods", tags=["foods"])

# A search box on a phone is a live filter, not a report. Thirty rows is more
# than fits on the screen twice over, and the cap is what keeps "a" from
# dragging three thousand CIQUAL rows across the wire.
SEARCH_LIMIT = 30

# Cuántas filas se traen para ordenar, antes de quedarse con `SEARCH_LIMIT`.
#
# El orden fino se calcula en Python (`_rank`), así que hace falta el conjunto
# de candidatos... salvo que sea absurdo. Con CIQUAL cargado, buscar `a` casa
# con 3.090 de los 3.185 alimentos: 113 ms de ordenación para pintar treinta
# nombres que, con una sola letra escrita, no responden a ninguna pregunta.
# Medido, 2026-08-31.
#
# El corte va por longitud de nombre ascendente y no arbitrariamente: con una
# consulta corta, los nombres cortos son los que más probablemente se buscan
# (`Pan` antes que `Pan de centeno de la panadería de abajo`). Las búsquedas
# reales no lo tocan — `pollo` casa con 74 filas y `pan` con 111.
CANDIDATE_LIMIT = 400


def _visible(user_id: int):
    """Rows this user may see: the shared catalogue plus their own, unarchived."""
    return (Food.archived.is_(False)) & (or_(Food.user_id.is_(None), Food.user_id == user_id))


def _rank(food: Food, needle: str, alias_hits: set[int]) -> tuple:
    """Best match first: the exact name, then names that start with what was
    typed, then names that merely contain it, and only then alias-only hits.

    Sorted in Python rather than in SQL because the folding it ranks on has no
    portable SQL form (see app/naming.py), and because the candidate set is
    already capped at what one screen can show.
    """
    folded = food.name_folded
    if folded == needle:
        bucket = 0
    elif folded.startswith(needle):
        bucket = 1
    elif f" {needle}" in folded:
        bucket = 2
    elif needle in folded:
        bucket = 3
    else:
        bucket = 4 if food.id in alias_hits else 5
    # Yours ahead of the catalogue's at equal rank: you typed it because the
    # catalogue did not have the thing you meant.
    return (bucket, 0 if food.user_id is not None else 1, len(food.name), food.name_folded)


def search_stmt(user_id: int, needle: str):
    """La consulta de la caja de búsqueda.

    Extraída del endpoint para que se pueda compilar y mirar en un test: lo que
    hay que comprobar de ella es qué columnas **no** pide, y eso no se ve desde
    la respuesta HTTP —`FoodOut` no lleva micronutrientes, así que el JSON sale
    igual de bien con la optimización que sin ella—.
    """
    # `nutrients_json` se queda fuera a propósito. Cada byte que viajara aquí se
    # tiraría, y son muchos: una fila de CIQUAL guarda 1,7 KB de vitaminas y
    # ácidos grasos, de modo que una búsqueda de una sola letra (2.822
    # coincidencias sobre el catálogo entero) arrastraba 4,7 MB desde Postgres
    # para pintar treinta nombres. Medido, 2026-08-31.
    stmt = (
        select(Food)
        .options(selectinload(Food.portions), defer(Food.nutrients_json))
        .where(_visible(user_id))
    )
    if not needle:
        # Nada escrito todavía: tu propia estantería, la más reciente primero.
        # Listar el catálogo entero aquí serían tres mil filas que no contestan
        # a ninguna pregunta. Ordenado por id y no por `created_at`: dos
        # alimentos dados de alta en el mismo segundo comparten marca de tiempo,
        # y el id es lo que el orden de inserción es de verdad (mismo
        # razonamiento que `Day.workouts`).
        return stmt.where(Food.user_id == user_id).order_by(Food.id.desc())
    alias_matches = select(FoodAlias.food_id).where(FoodAlias.alias_folded.contains(needle))
    return (
        stmt.where(or_(Food.name_folded.contains(needle), Food.id.in_(alias_matches)))
        .order_by(func.length(Food.name_folded))
        .limit(CANDIDATE_LIMIT)
    )


@router.get("", response_model=list[FoodOut])
async def search_foods(
    q: str = Query(default="", max_length=80),
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[FoodOut]:
    """Foods matching `q`, best match first. Empty `q` lists your own foods —
    which on a fresh account is the only thing there is to show."""
    needle = fold(q)
    rows = list((await session.execute(search_stmt(user_id, needle))).unique().scalars().all())
    if not needle:
        return [to_food_out(f, user_id) for f in rows[:SEARCH_LIMIT]]

    alias_hits = set(
        (
            await session.execute(
                select(FoodAlias.food_id).where(FoodAlias.alias_folded.contains(needle))
            )
        )
        .scalars()
        .all()
    )
    rows.sort(key=lambda f: _rank(f, needle, alias_hits))
    return [to_food_out(f, user_id) for f in rows[:SEARCH_LIMIT]]


@router.post("", response_model=FoodOut, status_code=status.HTTP_201_CREATED)
async def create_food(
    payload: FoodIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FoodOut:
    """Add a food by hand — the bakery's bread, your mother's piquillos.

    Only ever reached from a form the user filled in. Nothing else in this
    project may write to `foods`: not an import, not the barcode scanner, not
    the parser. A catalogue that grows without anyone deciding it should is a
    catalogue you stop trusting the search results of.
    """
    food = Food(
        user_id=user_id,
        name=payload.name,
        name_folded=fold(payload.name),
        brand=payload.brand,
        source="manual",
        # A number you typed off a Spanish label is the European convention,
        # where fibre is counted apart from carbohydrate.
        carb_convention="available",
        kcal_100g=payload.kcal_100g,
        protein_100g=payload.protein_100g,
        fat_100g=payload.fat_100g,
        carbs_100g=payload.carbs_100g,
        fiber_100g=payload.fiber_100g,
    )
    session.add(food)
    await session.flush()
    for index, portion in enumerate(payload.portions):
        session.add(
            Portion(
                food_id=food.id,
                label=portion.label,
                grams=portion.grams,
                # First one wins if the form marked several; a default that is
                # ambiguous is not a default.
                is_default=portion.is_default and index == 0,
            )
        )
    await session.commit()
    await session.refresh(food, ["portions"])
    return to_food_out(food, user_id)


@router.get("/{food_id}", response_model=FoodOut)
async def get_food(
    food_id: int,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FoodOut:
    food = await _load(session, food_id, user_id)
    return to_food_out(food, user_id)


@router.patch("/{food_id}", response_model=FoodOut)
async def correct_food(
    food_id: int,
    payload: FoodPatch,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FoodOut:
    """Correct a food you created.

    Nothing already in the diary moves. `log_entries` froze its numbers when the
    entry was written, and this endpoint does not go looking for them — a label
    you misread in March must not silently restate what February's totals were.
    """
    food = await _load(session, food_id, user_id)
    if food.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="the shared catalogue is not editable",
        )
    fields = payload.model_dump(exclude_unset=True)
    if "name" in fields:
        food.name = fields.pop("name")
        food.name_folded = fold(food.name)
    if "brand" in fields:
        food.brand = fields.pop("brand") or None
    for field, value in fields.items():
        setattr(food, field, value)
    await session.commit()
    await session.refresh(food, ["portions"])
    return to_food_out(food, user_id)


async def _load(session: AsyncSession, food_id: int, user_id: int) -> Food:
    food = (
        await session.execute(
            select(Food)
            # Sin `defer` aquí, a diferencia de la búsqueda: es una sola fila,
            # 1,7 KB no son nada, y una columna diferida en una sesión async
            # revienta en cuanto alguien la lea — una trampa esperando a que
            # `FoodOut` crezca.
            .options(selectinload(Food.portions))
            .where(Food.id == food_id, _visible(user_id))
        )
    ).scalar_one_or_none()
    if food is None:
        raise HTTPException(status_code=404, detail="food not found")
    return food
