"""Platos: lo que de verdad se cocina, y registrarlos en el diario.

Dos reglas de la casa gobiernan este fichero:

- **La aritmética no vive aquí.** `macros_de_plato()` y `macros_por_racion()`
  están en `nutrition.py`, con el resto. Este router lee, escribe y traduce.
- **Registrar un plato congela una entrada por ingrediente, no una suma.** Una
  sola fila con el total sería más corta de leer y perdería tres cosas que ya
  funcionan: repesar una entrada (`escalar_nutrientes`), corregir un
  ingrediente suelto, y el subtotal por comida, que cuenta filas de alimento.
  El diario sigue siendo filas de alimento; el plato es de dónde salieron.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import get_current_user
from ..db import get_session
from ..models import Dish, DishIngredient, Food, LogEntry, visible_foods
from ..naming import fold_exercise_name as fold
from ..nutrition import calcular_nutrientes, dump_nutrients, food_log_date, macros_de_plato
from ..nutrition import macros_por_racion
from ..schemas import DishIn, DishLogIn, DishOut, DishPatch, LogEntryOut
from ..serialization import to_entry_out

router = APIRouter(prefix="/dishes", tags=["dishes"])


async def _load(session: AsyncSession, dish_id: int, user_id: int) -> Dish:
    """El plato, o un 404. Nunca el de otro: un id ajeno no confirma nada."""
    dish = (
        await session.execute(
            select(Dish)
            .options(selectinload(Dish.ingredients))
            .where(Dish.id == dish_id, Dish.user_id == user_id)
        )
    ).scalar_one_or_none()
    if dish is None:
        raise HTTPException(status_code=404, detail="dish not found")
    return dish


async def _foods(session: AsyncSession, user_id: int, ids: list[int]) -> dict[int, Food]:
    """Los alimentos que el plato nombra, comprobando que existen **para ti**.

    `visible_foods` y no un `or_` a mano: la regla de qué alimentos existen para
    alguien es una sola y vive en `models.py`.
    """
    rows = (
        await session.execute(select(Food).where(Food.id.in_(ids), visible_foods(user_id)))
    ).scalars().all()
    found = {food.id: food for food in rows}
    missing = [i for i in ids if i not in found]
    if missing:
        raise HTTPException(status_code=404, detail=f"food not found: {missing[0]}")
    return found


def _to_out(dish: Dish, foods: dict[int, Food]) -> DishOut:
    pares = [(foods[i.food_id], i.grams) for i in dish.ingredients]
    totales, unknown = macros_de_plato(pares)
    return DishOut(
        id=dish.id,
        name=dish.name,
        servings=dish.servings,
        basis=dish.basis,
        method=dish.method,
        ingredients=[
            {
                "id": i.id,
                "food_id": i.food_id,
                "food_name": foods[i.food_id].name,
                "grams": i.grams,
            }
            for i in dish.ingredients
        ],
        per_serving=macros_por_racion(totales, dish.servings),
        unknown=unknown,
    )


async def _out(session: AsyncSession, dish: Dish, user_id: int) -> DishOut:
    foods = await _foods(session, user_id, [i.food_id for i in dish.ingredients])
    return _to_out(dish, foods)


@router.post("", response_model=DishOut, status_code=status.HTTP_201_CREATED)
async def create_dish(
    payload: DishIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DishOut:
    """Da de alta un plato. **No escribe en `foods`**: un plato no es un alimento."""
    await _foods(session, user_id, [i.food_id for i in payload.ingredients])
    folded = fold(payload.name)
    clash = (
        await session.execute(
            select(Dish).where(Dish.user_id == user_id, Dish.name_folded == folded)
        )
    ).scalar_one_or_none()
    if clash is not None:
        raise HTTPException(status_code=409, detail=f"ya tienes «{clash.name}»")

    dish = Dish(
        user_id=user_id,
        name=payload.name,
        name_folded=folded,
        basis=payload.basis,
        method=payload.method,
        servings=payload.servings,
        ingredients=[
            DishIngredient(food_id=i.food_id, grams=i.grams) for i in payload.ingredients
        ],
    )
    session.add(dish)
    await session.commit()
    await session.refresh(dish, ["ingredients"])
    return await _out(session, dish, user_id)


@router.get("", response_model=list[DishOut])
async def list_dishes(
    q: str = "",
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[DishOut]:
    """Tus platos. `q` pliega igual que la búsqueda de alimentos."""
    query = select(Dish).options(selectinload(Dish.ingredients)).where(Dish.user_id == user_id)
    if q:
        query = query.where(Dish.name_folded.contains(fold(q)))
    dishes = (await session.execute(query.order_by(Dish.name))).scalars().all()
    ids = {i.food_id for d in dishes for i in d.ingredients}
    foods = await _foods(session, user_id, sorted(ids)) if ids else {}
    return [_to_out(dish, foods) for dish in dishes]


@router.get("/{dish_id}", response_model=DishOut)
async def get_dish(
    dish_id: int,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DishOut:
    return await _out(session, await _load(session, dish_id, user_id), user_id)


@router.patch("/{dish_id}", response_model=DishOut)
async def correct_dish(
    dish_id: int,
    payload: DishPatch,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DishOut:
    """Corrige el plato. **No toca lo ya registrado**: las entradas del diario
    llevan sus macros congelados y esto no las mira siquiera."""
    dish = await _load(session, dish_id, user_id)
    fields = payload.model_dump(exclude_unset=True)

    if "name" in fields:
        dish.name = fields["name"]
        dish.name_folded = fold(fields["name"])
    for key in ("servings", "basis", "method"):
        if key in fields:
            setattr(dish, key, fields[key])
    if payload.ingredients is not None:
        await _foods(session, user_id, [i.food_id for i in payload.ingredients])
        dish.ingredients = [
            DishIngredient(food_id=i.food_id, grams=i.grams) for i in payload.ingredients
        ]

    await session.commit()
    await session.refresh(dish, ["ingredients"])
    return await _out(session, dish, user_id)


@router.post("/{dish_id}/log", response_model=list[LogEntryOut], status_code=status.HTTP_201_CREATED)
async def log_dish(
    dish_id: int,
    payload: DishLogIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[LogEntryOut]:
    """Registra N raciones: una entrada congelada por ingrediente.

    Los gramos de cada fila son los del plato escalados por las raciones que te
    comes — la misma cuenta que hace `macros_por_racion`, pero sobre el peso.
    """
    dish = await _load(session, dish_id, user_id)
    foods = await _foods(session, user_id, [i.food_id for i in dish.ingredients])

    moment = payload.logged_at or datetime.now(UTC)
    factor = payload.servings / dish.servings
    entries = []
    for ingredient in dish.ingredients:
        food = foods[ingredient.food_id]
        grams = round(ingredient.grams * factor, 2)
        computed = calcular_nutrientes(food, grams)
        entry = LogEntry(
            user_id=user_id,
            logged_at=moment.astimezone(UTC) if moment.tzinfo else moment.replace(tzinfo=UTC),
            log_date=food_log_date(moment),
            meal_slot=payload.meal_slot,
            food_id=food.id,
            food_name_snapshot=food.name,
            grams=grams,
            nutrients_json=dump_nutrients(computed.pop("nutrients")),
            entry_source="dish",
            dish_id=dish.id,
            **computed,
        )
        session.add(entry)
        entries.append(entry)

    await session.commit()
    for entry in entries:
        await session.refresh(entry)
    return [to_entry_out(entry) for entry in entries]
