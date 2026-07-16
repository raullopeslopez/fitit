from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import get_session
from ..models import SetEntry, Workout
from ..schemas import SetIn, SetOut, WorkoutIn, WorkoutOut

router = APIRouter(prefix="/workouts", tags=["workouts"])


async def load_workout(session: AsyncSession, workout_id: int) -> WorkoutOut | None:
    result = await session.execute(
        select(Workout)
        .where(Workout.id == workout_id)
        .options(selectinload(Workout.sets).selectinload(SetEntry.exercise))
    )
    workout = result.scalar_one_or_none()
    if workout is None:
        return None
    return WorkoutOut(
        id=workout.id,
        date=workout.date,
        name=workout.name,
        sets=[
            SetOut(
                id=s.id,
                exercise_id=s.exercise_id,
                exercise_name=s.exercise.name,
                set_index=s.set_index,
                reps=s.reps,
                weight=s.weight,
                unit=s.unit,
            )
            for s in workout.sets
        ],
    )


@router.post("", response_model=WorkoutOut, status_code=status.HTTP_201_CREATED)
async def create_workout(
    payload: WorkoutIn, session: AsyncSession = Depends(get_session)
) -> WorkoutOut:
    workout = Workout(name=payload.name, date=date.today())
    session.add(workout)
    await session.commit()
    loaded = await load_workout(session, workout.id)
    assert loaded is not None
    return loaded


@router.get("/{workout_id}", response_model=WorkoutOut)
async def get_workout(
    workout_id: int, session: AsyncSession = Depends(get_session)
) -> WorkoutOut:
    workout = await load_workout(session, workout_id)
    if workout is None:
        raise HTTPException(status_code=404, detail="workout not found")
    return workout


@router.post(
    "/{workout_id}/sets",
    response_model=WorkoutOut,
    status_code=status.HTTP_201_CREATED,
)
async def log_set(
    workout_id: int, payload: SetIn, session: AsyncSession = Depends(get_session)
) -> WorkoutOut:
    # SLICE 1 — implement with /tdd.
    # Spec: tests/features/log_set.feature
    # Behavior: find-or-create the exercise by name, append a SetEntry to the
    # workout with the next set_index, return the updated workout.
    raise HTTPException(status_code=501, detail="not implemented: log a set (SLICE 1 - /tdd)")


@router.patch("/sets/{set_id}", response_model=SetOut)
async def edit_set(
    set_id: int, payload: SetIn, session: AsyncSession = Depends(get_session)
) -> SetOut:
    # SLICE 3 — implement with /tdd. Spec: tests/features/correct_set.feature
    raise HTTPException(status_code=501, detail="not implemented: edit a set (SLICE 3 - /tdd)")


@router.delete("/sets/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_set(set_id: int, session: AsyncSession = Depends(get_session)) -> None:
    # SLICE 3 — implement with /tdd. Spec: tests/features/correct_set.feature
    raise HTTPException(status_code=501, detail="not implemented: delete a set (SLICE 3 - /tdd)")
