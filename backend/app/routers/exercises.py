from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..exercise_repo import find_exercise
from ..models import Day, Exercise, SetEntry, Workout
from ..muscles import MUSCLE_GROUPS, classify
from ..naming import normalize_exercise_name
from ..schemas import (
    BestMark,
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
    """Best estimated 1RM (Epley) per training day for an exercise, oldest first.

    In kilos always — a curve that switched units mid-way would show a jump
    where there was no progress.
    """
    exercise = await find_exercise(session, name)
    if exercise is None:
        return []
    rows = (
        await session.execute(
            select(Day.date, SetEntry.weight_kg, SetEntry.reps)
            .join(Workout, Workout.id == SetEntry.workout_id)
            .join(Day, Day.id == Workout.day_id)
            .where(SetEntry.exercise_id == exercise.id)
        )
    ).all()
    best: dict = {}
    for day, weight_kg, reps in rows:
        if weight_kg is None or reps is None:  # cardio sets have no 1RM
            continue
        best[day] = max(best.get(day, 0.0), weight_kg * (1 + reps / 30))
    return [HistoryPoint(date=day, one_rm=round(best[day], 1)) for day in sorted(best)]


@router.get("/exercises/records", response_model=list[BestMark])
async def best_marks(
    limit: int = 10, session: AsyncSession = Depends(get_session)
) -> list[BestMark]:
    """The best set per exercise, strongest first, with the gap to the record it beat.

    Ranked by estimated 1RM (Epley) rather than raw weight, so a heavy single
    doesn't unseat a genuinely better set for more reps. Cardio has no 1RM and
    is left out entirely.

    `delta_one_rm` compares the record to the best set logged BEFORE it, using
    each set's own timestamp — an all-time best that has stood for months
    reports None, the same as a first-ever mark, because in both cases there is
    nothing it just improved on.

    Spec: tests/features/best_marks.feature
    """
    rows = (
        await session.execute(
            select(SetEntry, Exercise)
            .join(Exercise, Exercise.id == SetEntry.exercise_id)
            .where(SetEntry.weight_kg.is_not(None), SetEntry.reps.is_not(None))
            .order_by(SetEntry.created_at, SetEntry.id)
        )
    ).all()

    # Walk each exercise's sets oldest-first, tracking the running record. The
    # delta is whatever the final record beat when it was set, which is why
    # this needs the ordered walk rather than a max() over the whole column.
    best: dict[int, BestMark] = {}
    for entry, exercise in rows:
        one_rm = round(entry.weight_kg * (1 + entry.reps / 30), 1)
        standing = best.get(exercise.id)
        if standing is not None and one_rm <= standing.one_rm:
            continue
        best[exercise.id] = BestMark(
            exercise_id=exercise.id,
            exercise_name=exercise.name,
            muscle_group=exercise.muscle_group or classify(exercise.name),
            reps=entry.reps,
            weight_kg=entry.weight_kg,
            one_rm=one_rm,
            delta_one_rm=(
                round(one_rm - standing.one_rm, 1) if standing is not None else None
            ),
        )

    return sorted(best.values(), key=lambda m: m.one_rm, reverse=True)[:limit]


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

    # Best estimated 1RM (Epley: weight * (1 + reps/30)) across every strength
    # set, in kilos. Cardio sets have no weight/reps, so they're skipped.
    all_sets = (
        await session.scalars(select(SetEntry).where(SetEntry.exercise_id == exercise.id))
    ).all()
    strength_sets = [s for s in all_sets if s.weight_kg is not None and s.reps is not None]
    best_one_rm = (
        round(max(s.weight_kg * (1 + s.reps / 30) for s in strength_sets), 1)
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
