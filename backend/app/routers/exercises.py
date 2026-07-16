from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Exercise, SetEntry, Workout
from ..schemas import ExerciseIn, ExerciseOut, PreviousMarks, SetOut

router = APIRouter(tags=["exercises"])


@router.post("/exercises", response_model=ExerciseOut, status_code=status.HTTP_201_CREATED)
async def create_exercise(
    payload: ExerciseIn, session: AsyncSession = Depends(get_session)
) -> Exercise:
    existing = await session.scalar(select(Exercise).where(Exercise.name == payload.name))
    if existing is not None:
        return existing
    exercise = Exercise(name=payload.name, muscle_group=payload.muscle_group)
    session.add(exercise)
    await session.commit()
    await session.refresh(exercise)
    return exercise


@router.get("/exercises/previous", response_model=PreviousMarks)
async def previous_marks(
    name: str, session: AsyncSession = Depends(get_session)
) -> PreviousMarks:
    """The sets from the most recent workout that includes this exercise.

    `found` is false (and `sets` empty) when the exercise has never been logged.
    Spec: tests/features/previous_marks.feature
    """
    exercise = await session.scalar(select(Exercise).where(Exercise.name == name))
    if exercise is None:
        return PreviousMarks(exercise_name=name, found=False, sets=[])

    last_workout_id = await session.scalar(
        select(SetEntry.workout_id)
        .join(Workout, Workout.id == SetEntry.workout_id)
        .where(SetEntry.exercise_id == exercise.id)
        .order_by(Workout.date.desc(), Workout.id.desc())
        .limit(1)
    )
    if last_workout_id is None:
        return PreviousMarks(exercise_name=name, found=False, sets=[])

    result = await session.execute(
        select(SetEntry)
        .where(
            SetEntry.workout_id == last_workout_id,
            SetEntry.exercise_id == exercise.id,
        )
        .order_by(SetEntry.set_index)
    )
    return PreviousMarks(
        exercise_name=name,
        found=True,
        sets=[
            SetOut(
                id=s.id,
                exercise_id=s.exercise_id,
                exercise_name=exercise.name,
                set_index=s.set_index,
                reps=s.reps,
                weight=s.weight,
                unit=s.unit,
            )
            for s in result.scalars().all()
        ],
    )
