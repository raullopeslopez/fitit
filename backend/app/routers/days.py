from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import get_current_user
from ..db import get_session
from ..models import Day, SetEntry, Workout
from ..schemas import DayOut
from .workouts import _to_workout_out

router = APIRouter(prefix="/days", tags=["days"])


@router.get("", response_model=list[DayOut])
async def list_days(
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[DayOut]:
    """This user's training days, newest first, each with its workouts and their sets."""
    result = await session.execute(
        select(Day)
        .where(Day.user_id == user_id)
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
async def delete_day(
    day_id: int,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a whole day, cascading to its workouts and their sets."""
    day = await session.get(Day, day_id)
    if day is None or day.user_id != user_id:
        raise HTTPException(status_code=404, detail="day not found")
    await session.delete(day)
    await session.commit()
