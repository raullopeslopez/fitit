"""The diary: what was eaten, on which food day, and what it adds up to.

Every number written here is frozen at the moment of writing. Correcting a food
afterwards changes the catalogue, never the history — which is the whole reason
the macro columns are copies rather than a join.
"""

from datetime import UTC, date, datetime
from typing import get_args

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import get_current_user
from ..db import get_session
from ..models import Food, LogEntry, User, visible_foods
from ..schemas import MealSlot
from ..nutrition import (
    calcular_nutrientes,
    dump_nutrients,
    escalar_nutrientes,
    food_log_date,
    restante,
    sumar_nutrientes,
)
from ..schemas import FoodDayOut, LogEntryIn, LogEntryOut, LogEntryPatch, SlotTotalsOut
from ..serialization import to_entry_out

router = APIRouter(prefix="/food-log", tags=["food-log"])


@router.post("", response_model=LogEntryOut, status_code=status.HTTP_201_CREATED)
async def log_food(
    payload: LogEntryIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> LogEntryOut:
    food = (
        await session.execute(
            select(Food)
            .options(selectinload(Food.portions))
            # `visible_foods` y no un `or_` a mano: la regla de qué alimentos
            # existen para ti es una sola, y esta copia se había quedado sin la
            # mitad que descarta lo archivado — se podía registrar un alimento
            # que la búsqueda ya no enseñaba.
            .where(Food.id == payload.food_id, visible_foods(user_id))
        )
    ).scalar_one_or_none()
    if food is None:
        raise HTTPException(status_code=404, detail="food not found")

    grams = _resolve_grams(payload, food)
    # The moment carries the phone's offset, and the offset is what decides
    # which food day a supper lands on. Absent means now.
    moment = payload.logged_at or datetime.now(UTC)
    computed = calcular_nutrientes(food, grams)

    entry = LogEntry(
        user_id=user_id,
        # Stored UTC; the food day was already read off the local clock above.
        logged_at=moment.astimezone(UTC) if moment.tzinfo else moment.replace(tzinfo=UTC),
        log_date=food_log_date(moment),
        meal_slot=payload.meal_slot,
        food_id=food.id,
        # A copy of the name, so the row still reads if the food is deleted.
        food_name_snapshot=food.name,
        grams=grams,
        nutrients_json=dump_nutrients(computed.pop("nutrients")),
        entry_source=payload.entry_source,
        **computed,
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return to_entry_out(entry)


def _resolve_grams(payload: LogEntryIn, food: Food) -> float:
    """Grams, from whichever of the two ways the client asked.

    "Dos rebanadas" is the point of the portions table: it is the amount you
    actually know, and converting it here means the diary never asks you to
    weigh bread.
    """
    if payload.portion_id is not None:
        portion = next((p for p in food.portions if p.id == payload.portion_id), None)
        if portion is None:
            raise HTTPException(status_code=404, detail="portion not found for this food")
        return round(portion.grams * payload.quantity, 2)
    if payload.grams is None:
        raise HTTPException(status_code=422, detail="grams or portion_id is required")
    return payload.grams


@router.get("", response_model=FoodDayOut)
async def get_food_day(
    date_: date | None = Query(default=None, alias="date"),
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FoodDayOut:
    """One food day, with its totals. Defaults to the day you are in now."""
    log_date = date_ or food_log_date(datetime.now(UTC))
    entries = list(
        (
            await session.execute(
                select(LogEntry)
                .where(LogEntry.user_id == user_id, LogEntry.log_date == log_date)
                .order_by(LogEntry.logged_at, LogEntry.id)
            )
        )
        .scalars()
        .all()
    )
    totals, unknown = sumar_nutrientes(entries)
    user = await session.get(User, user_id)
    return FoodDayOut(
        date=log_date,
        entries=[to_entry_out(e) for e in entries],
        totals=totals,
        unknown=unknown,
        by_slot=_by_slot(entries),
        target_kcal=user.objetivo_kcal,
        target_protein=user.objetivo_proteina,
        remaining_kcal=restante(user.objetivo_kcal, totals["kcal"]),
    )


# Las cinco comidas, en el orden en que se comen y con el montón sin asignar al
# final. Es el mismo orden que la pantalla dibuja, y sale de `MealSlot` para que
# añadir una comida sea un sitio y no tres.
SLOT_ORDER: tuple[str | None, ...] = (*get_args(MealSlot), None)


def _by_slot(entries) -> list[SlotTotalsOut]:
    """Un subtotal por comida, **incluidas las vacías**.

    Salen todas para que la pantalla pueda dibujar un raíl que todavía no tiene
    nada sin sumar por su cuenta: una comida vacía suma `null`, no 0, y esa
    regla vive en `sumar_nutrientes` y en ningún otro sitio.
    """
    out = []
    for slot in SLOT_ORDER:
        totals, unknown = sumar_nutrientes([e for e in entries if (e.meal_slot or None) == slot])
        out.append(SlotTotalsOut(slot=slot, totals=totals, unknown=unknown))
    return out


@router.patch("/{entry_id}", response_model=LogEntryOut)
async def correct_entry(
    entry_id: int,
    payload: LogEntryPatch,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> LogEntryOut:
    """Re-weigh, re-slot or re-date an entry.

    Changing the grams rescales what was frozen; it does not read the food
    again. Going back to `foods` would quietly adopt any correction made to it
    since, turning "I put 200 g, not 150" into a silent rewrite of the numbers
    you were looking at when you typed it. Moving it in time changes nothing but
    when it happened, for the same reason.
    """
    entry = await _load_entry(session, entry_id, user_id)
    fields = payload.model_dump(exclude_unset=True)
    if "meal_slot" in fields:
        entry.meal_slot = fields["meal_slot"]
    moment = fields.get("logged_at")
    if moment is not None:
        # El día se deriva del sello con `food_log_date`, la misma regla y el
        # mismo sitio que al escribirla: si el re-fechado tuviera la suya, una
        # entrada movida caería en un día distinto del que caería recién
        # creada a esa misma hora.
        entry.logged_at = moment.astimezone(UTC) if moment.tzinfo else moment.replace(tzinfo=UTC)
        entry.log_date = food_log_date(moment)
    new_grams = fields.get("grams")
    if new_grams is not None and new_grams != entry.grams:
        rescaled = escalar_nutrientes(entry, old_grams=entry.grams, new_grams=new_grams)
        entry.nutrients_json = dump_nutrients(rescaled.pop("nutrients"))
        for field, value in rescaled.items():
            setattr(entry, field, value)
        entry.grams = new_grams
    await session.commit()
    await session.refresh(entry)
    return to_entry_out(entry)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(
    entry_id: int,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    entry = await _load_entry(session, entry_id, user_id)
    await session.delete(entry)
    await session.commit()


async def _load_entry(session: AsyncSession, entry_id: int, user_id: int) -> LogEntry:
    entry = await session.get(LogEntry, entry_id)
    if entry is None or entry.user_id != user_id:
        raise HTTPException(status_code=404, detail="entry not found")
    return entry
