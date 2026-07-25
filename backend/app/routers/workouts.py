from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import get_session
from ..exercise_repo import find_exercise, get_or_create_exercise
from ..models import Day, Exercise, SetEntry, Workout
from ..schemas import SetIn, SetOut, WorkoutIn, WorkoutOut, WorkoutPatch

router = APIRouter(prefix="/workouts", tags=["workouts"])


def _set_out(entry: SetEntry, exercise: Exercise) -> SetOut:
    return SetOut(
        id=entry.id,
        exercise_id=entry.exercise_id,
        exercise_name=exercise.name,
        kind=exercise.kind,
        set_index=entry.set_index,
        reps=entry.reps,
        weight=entry.weight,
        rpe=entry.rpe,
        note=entry.note,
        duration_seconds=entry.duration_seconds,
        distance=entry.distance,
        created_at=entry.created_at,
    )


def _validate_metrics(payload: SetIn, kind: str) -> None:
    """A set's metric fields must match its exercise's kind (422 otherwise)."""
    if kind == "cardio":
        if payload.duration_seconds is None:
            raise HTTPException(status_code=422, detail="cardio set needs a duration")
        if payload.reps is not None or payload.weight is not None:
            raise HTTPException(status_code=422, detail="cardio set has no reps or weight")
    else:  # strength
        if payload.reps is None or payload.weight is None:
            raise HTTPException(status_code=422, detail="strength set needs reps and weight")
        if payload.duration_seconds is not None or payload.distance is not None:
            raise HTTPException(
                status_code=422, detail="strength set has no duration or distance"
            )


def _to_workout_out(workout: Workout, day_date: date) -> WorkoutOut:
    """Build the API shape from a Workout whose sets+exercises are already loaded."""
    return WorkoutOut(
        id=workout.id,
        date=day_date,
        name=workout.name,
        sets=[_set_out(s, s.exercise) for s in workout.sets],
    )


async def get_or_create_day(session: AsyncSession, day: date) -> Day:
    existing = await session.scalar(select(Day).where(Day.date == day))
    if existing is not None:
        return existing
    created = Day(date=day)
    session.add(created)
    await session.flush()
    return created


async def load_workout(session: AsyncSession, workout_id: int) -> WorkoutOut | None:
    result = await session.execute(
        select(Workout)
        .where(Workout.id == workout_id)
        .options(
            selectinload(Workout.day),
            selectinload(Workout.sets).selectinload(SetEntry.exercise),
        )
    )
    workout = result.scalar_one_or_none()
    if workout is None:
        return None
    return _to_workout_out(workout, workout.day.date)


@router.get("", response_model=list[WorkoutOut])
async def list_workouts(session: AsyncSession = Depends(get_session)) -> list[WorkoutOut]:
    """Past workouts, newest first, with their sets — powers the history view."""
    result = await session.execute(
        select(Workout)
        .join(Workout.day)
        .options(
            selectinload(Workout.day),
            selectinload(Workout.sets).selectinload(SetEntry.exercise),
        )
        .order_by(Day.date.desc(), Workout.id.desc())
    )
    return [_to_workout_out(w, w.day.date) for w in result.scalars().all()]


@router.post("", response_model=WorkoutOut, status_code=status.HTTP_201_CREATED)
async def create_workout(
    payload: WorkoutIn, session: AsyncSession = Depends(get_session)
) -> WorkoutOut:
    day = await get_or_create_day(session, payload.date or date.today())
    workout = Workout(name=payload.name, day_id=day.id)
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


@router.patch("/{workout_id}", response_model=WorkoutOut)
async def rename_workout(
    workout_id: int, payload: WorkoutPatch, session: AsyncSession = Depends(get_session)
) -> WorkoutOut:
    workout = await session.get(Workout, workout_id)
    if workout is None:
        raise HTTPException(status_code=404, detail="workout not found")
    workout.name = payload.name
    await session.commit()
    loaded = await load_workout(session, workout_id)
    assert loaded is not None
    return loaded


@router.delete("/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workout(
    workout_id: int, session: AsyncSession = Depends(get_session)
) -> None:
    """Delete a workout and its sets; drop the day too if it's now empty."""
    workout = await session.get(Workout, workout_id)
    if workout is None:
        raise HTTPException(status_code=404, detail="workout not found")
    day_id = workout.day_id
    await session.delete(workout)
    await session.flush()

    remaining = await session.scalar(
        select(func.count()).select_from(Workout).where(Workout.day_id == day_id)
    )
    if remaining == 0:
        day = await session.get(Day, day_id)
        if day is not None:
            await session.delete(day)
    await session.commit()


@router.post(
    "/{workout_id}/sets",
    response_model=WorkoutOut,
    status_code=status.HTTP_201_CREATED,
)
async def log_set(
    workout_id: int, payload: SetIn, session: AsyncSession = Depends(get_session)
) -> WorkoutOut:
    """Append a set to a workout, creating the exercise on first use.

    Spec: tests/features/log_set.feature
    """
    workout = await session.get(Workout, workout_id)
    if workout is None:
        raise HTTPException(status_code=404, detail="workout not found")

    # An existing exercise keeps its kind; a new one takes the payload's (default strength).
    existing = await find_exercise(session, payload.exercise_name)
    kind = existing.kind if existing else (payload.kind or "strength")
    _validate_metrics(payload, kind)
    exercise = existing or await get_or_create_exercise(
        session, payload.exercise_name, kind=kind
    )

    next_index = await session.scalar(
        select(func.count()).select_from(SetEntry).where(SetEntry.workout_id == workout_id)
    )
    session.add(
        SetEntry(
            workout_id=workout_id,
            exercise_id=exercise.id,
            set_index=next_index,
            reps=payload.reps,
            weight=payload.weight,
            rpe=payload.rpe,
            note=payload.note or None,
            duration_seconds=payload.duration_seconds,
            distance=payload.distance,
        )
    )
    await session.commit()

    loaded = await load_workout(session, workout_id)
    assert loaded is not None
    return loaded


@router.patch("/sets/{set_id}", response_model=SetOut)
async def edit_set(
    set_id: int, payload: SetIn, session: AsyncSession = Depends(get_session)
) -> SetOut:
    """Correct a logged set (full replacement of its values).

    Spec: tests/features/correct_set.feature
    """
    set_entry = await session.get(SetEntry, set_id)
    if set_entry is None:
        raise HTTPException(status_code=404, detail="set not found")

    existing = await find_exercise(session, payload.exercise_name)
    kind = existing.kind if existing else (payload.kind or "strength")
    _validate_metrics(payload, kind)
    exercise = existing or await get_or_create_exercise(
        session, payload.exercise_name, kind=kind
    )

    set_entry.exercise_id = exercise.id
    set_entry.reps = payload.reps
    set_entry.weight = payload.weight
    set_entry.rpe = payload.rpe
    set_entry.note = payload.note or None
    set_entry.duration_seconds = payload.duration_seconds
    set_entry.distance = payload.distance
    await session.commit()

    return _set_out(set_entry, exercise)


@router.delete("/sets/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_set(set_id: int, session: AsyncSession = Depends(get_session)) -> None:
    """Remove a logged set. Spec: tests/features/correct_set.feature"""
    set_entry = await session.get(SetEntry, set_id)
    if set_entry is None:
        raise HTTPException(status_code=404, detail="set not found")
    await session.delete(set_entry)
    await session.commit()
