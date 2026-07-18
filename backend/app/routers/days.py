from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import get_session
from ..models import Day, SetEntry, Workout
from ..schemas import DayOut
from .workouts import _to_workout_out

router = APIRouter(prefix="/days", tags=["days"])


@router.get("", response_model=list[DayOut])
async def list_days(session: AsyncSession = Depends(get_session)) -> list[DayOut]:
    """Training days, newest first, each with its workouts and their sets."""
    result = await session.execute(
        select(Day)
        .options(
            selectinload(Day.workouts)
            .selectinload(Workout.sets)
            .selectinload(SetEntry.exercise)
        )
        .order_by(Day.date.desc())
    )
    return [
        DayOut(
            id=day.id,
            date=day.date,
            workouts=[_to_workout_out(w, day.date) for w in day.workouts],
        )
        for day in result.scalars().all()
    ]


@router.delete("/{day_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_day(day_id: int, session: AsyncSession = Depends(get_session)) -> None:
    """Delete a whole day, cascading to its workouts and their sets."""
    day = await session.get(Day, day_id)
    if day is None:
        raise HTTPException(status_code=404, detail="day not found")
    await session.delete(day)
    await session.commit()
