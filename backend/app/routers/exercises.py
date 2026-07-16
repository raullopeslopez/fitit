from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Exercise
from ..schemas import ExerciseIn, ExerciseOut, PreviousMarks

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


@router.get("/exercises/{exercise_id}/last", response_model=PreviousMarks)
async def previous_marks(
    exercise_id: int, session: AsyncSession = Depends(get_session)
) -> PreviousMarks:
    # SLICE 2 — implement with /tdd. Spec: tests/features/previous_marks.feature
    # Behavior: return the sets from the most recent PRIOR workout containing this
    # exercise (found=false + empty when the exercise was never logged).
    raise HTTPException(
        status_code=501, detail="not implemented: previous marks (SLICE 2 - /tdd)"
    )
