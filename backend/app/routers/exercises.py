from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..exercise_repo import find_exercise
from ..models import Day, Exercise, SetEntry, Workout
from ..muscles import MUSCLE_GROUPS, classify
from ..naming import normalize_exercise_name
from ..schemas import (
    ExerciseIn,
    ExerciseOut,
    ExercisePatch,
    HistoryPoint,
    PreviousMarks,
    SetOut,
)

router = APIRouter(tags=["exercises"])


def _to_exercise_out(exercise: Exercise) -> ExerciseOut:
    """Fall back to the classifier when a row predates auto-tagging, so older
    exercises still carry a group for the per-muscle views without a migration.
    A stored value (including a manual override) always wins."""
    return ExerciseOut(
        id=exercise.id,
        name=exercise.name,
        muscle_group=exercise.muscle_group or classify(exercise.name),
        kind=exercise.kind,
    )


@router.get("/muscle-groups", response_model=list[str])
async def list_muscle_groups() -> list[str]:
    """The canonical muscle groups, in display order — powers the group picker."""
    return MUSCLE_GROUPS


@router.get("/exercises", response_model=list[ExerciseOut])
async def list_exercises(session: AsyncSession = Depends(get_session)) -> list[ExerciseOut]:
    """Every known exercise, alphabetically — powers the add-exercise autocomplete."""
    result = await session.scalars(select(Exercise).order_by(func.lower(Exercise.name)))
    return [_to_exercise_out(e) for e in result.all()]


@router.post("/exercises", response_model=ExerciseOut, status_code=status.HTTP_201_CREATED)
async def create_exercise(
    payload: ExerciseIn, session: AsyncSession = Depends(get_session)
) -> ExerciseOut:
    existing = await session.scalar(select(Exercise).where(Exercise.name == payload.name))
    if existing is not None:
        return _to_exercise_out(existing)
    exercise = Exercise(
        name=payload.name,
        muscle_group=payload.muscle_group or classify(payload.name),
        kind=payload.kind,
    )
    session.add(exercise)
    await session.commit()
    await session.refresh(exercise)
    return _to_exercise_out(exercise)


@router.patch("/exercises/{exercise_id}", response_model=ExerciseOut)
async def set_muscle_group(
    exercise_id: int, payload: ExercisePatch, session: AsyncSession = Depends(get_session)
) -> ExerciseOut:
    """Override an exercise's muscle group (or clear it back to auto with null)."""
    if payload.muscle_group is not None and payload.muscle_group not in MUSCLE_GROUPS:
        raise HTTPException(status_code=422, detail="unknown muscle group")
    exercise = await session.get(Exercise, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="exercise not found")
    exercise.muscle_group = payload.muscle_group
    await session.commit()
    await session.refresh(exercise)
    return _to_exercise_out(exercise)


@router.get("/exercises/history", response_model=list[HistoryPoint])
async def exercise_history(
    name: str, session: AsyncSession = Depends(get_session)
) -> list[HistoryPoint]:
    """Best estimated 1RM (Epley) per training day for an exercise, oldest first."""
    exercise = await find_exercise(session, name)
    if exercise is None:
        return []
    rows = (
        await session.execute(
            select(Day.date, SetEntry.weight, SetEntry.reps)
            .join(Workout, Workout.id == SetEntry.workout_id)
            .join(Day, Day.id == Workout.day_id)
            .where(SetEntry.exercise_id == exercise.id)
        )
    ).all()
    best: dict = {}
    for day, weight, reps in rows:
        if weight is None or reps is None:  # cardio sets have no 1RM
            continue
        best[day] = max(best.get(day, 0.0), weight * (1 + reps / 30))
    return [HistoryPoint(date=day, one_rm=round(best[day], 1)) for day in sorted(best)]


@router.get("/exercises/previous", response_model=PreviousMarks)
async def previous_marks(
    name: str, session: AsyncSession = Depends(get_session)
) -> PreviousMarks:
    """The sets from the most recent workout that includes this exercise.

    `found` is false (and `sets` empty) when the exercise has never been logged.
    Spec: tests/features/previous_marks.feature
    """
    exercise = await find_exercise(session, name)
    if exercise is None:
        return PreviousMarks(
            exercise_name=normalize_exercise_name(name), found=False, sets=[], kind=None
        )

    # Best estimated 1RM (Epley: weight * (1 + reps/30)) across every strength set.
    # Cardio sets have no weight/reps, so they're skipped.
    all_sets = (
        await session.scalars(select(SetEntry).where(SetEntry.exercise_id == exercise.id))
    ).all()
    strength_sets = [s for s in all_sets if s.weight is not None and s.reps is not None]
    best_one_rm = (
        round(max(s.weight * (1 + s.reps / 30) for s in strength_sets), 1)
        if strength_sets
        else None
    )

    last_workout_id = await session.scalar(
        select(SetEntry.workout_id)
        .join(Workout, Workout.id == SetEntry.workout_id)
        .join(Day, Day.id == Workout.day_id)
        .where(SetEntry.exercise_id == exercise.id)
        .order_by(Day.date.desc(), Workout.id.desc())
        .limit(1)
    )
    if last_workout_id is None:
        return PreviousMarks(
            exercise_name=exercise.name, found=False, sets=[], kind=exercise.kind
        )

    result = await session.execute(
        select(SetEntry)
        .where(
            SetEntry.workout_id == last_workout_id,
            SetEntry.exercise_id == exercise.id,
        )
        .order_by(SetEntry.set_index)
    )
    return PreviousMarks(
        exercise_name=exercise.name,
        found=True,
        best_one_rm=best_one_rm,
        kind=exercise.kind,
        sets=[
            SetOut(
                id=s.id,
                exercise_id=s.exercise_id,
                exercise_name=exercise.name,
                kind=exercise.kind,
                set_index=s.set_index,
                reps=s.reps,
                weight=s.weight,
                unit=s.unit,
                rpe=s.rpe,
                note=s.note,
                duration_seconds=s.duration_seconds,
                distance=s.distance,
                distance_unit=s.distance_unit,
            )
            for s in result.scalars().all()
        ],
    )
