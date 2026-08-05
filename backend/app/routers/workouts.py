from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import get_current_user
from ..db import get_session
from ..exercise_repo import find_exercise, get_or_create_exercise
from ..models import Day, Exercise, SetEntry, Workout
from ..muscles import group_for, secondaries_for
from ..schemas import SetIn, SetOut, WorkoutIn, WorkoutOut, WorkoutPatch

router = APIRouter(prefix="/workouts", tags=["workouts"])


def _set_out(entry: SetEntry, exercise: Exercise) -> SetOut:
    # Same fallback as `_to_exercise_out`: a stored group wins, otherwise guess
    # from the name, so a row that predates auto-tagging still gets a colour
    # instead of rendering grey.
    primary = exercise.muscle_group or group_for(exercise.name, exercise.kind)
    return SetOut(
        id=entry.id,
        exercise_id=entry.exercise_id,
        exercise_name=exercise.name,
        kind=exercise.kind,
        muscle_group=primary,
        # Read off the effective primary, so a lift the user re-tagged by hand
        # gets the secondaries of the movement they say it is.
        secondary_groups=secondaries_for(exercise.name, exercise.kind, primary),
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
        # Weight is optional: dominadas, fondos and abs carry none at all, and
        # logging those as 0 kg made a number out of the absence of one — it
        # charted, it could take a record, and the row read "0×12". Reps are
        # what makes it a strength set, so those stay required.
        if payload.reps is None:
            raise HTTPException(status_code=422, detail="strength set needs reps")
        if payload.duration_seconds is not None or payload.distance is not None:
            raise HTTPException(
                status_code=422, detail="strength set has no duration or distance"
            )


# How stale a client's own timestamp may be and still be believed. The outbox
# drains on the next network the phone sees, so a set can legitimately arrive
# hours late — a week covers the phone left in a drawer. Past that, the value is
# not a late set, it's a wrong clock, and a wrong clock backdating sets rewrites
# a day that was already closed.
_MOMENT_MAX_AGE = timedelta(days=7)
# Clock skew the other way. Phones run a little fast; "tomorrow" is not skew.
_MOMENT_MAX_SKEW = timedelta(minutes=2)


def _moment_of(performed_at: datetime | None) -> datetime:
    """When the set was done: the client's own time when it's plausible, else now.

    Never raises. A set already performed must not be refused over the clock
    that timed it — falling back to arrival time loses precision, refusing
    loses the set.

    Spec: tests/features/set_moment.feature
    """
    now = datetime.now(UTC)
    if performed_at is None:
        return now
    # A client that sends no offset means UTC; it has no other clock to mean.
    moment = performed_at if performed_at.tzinfo else performed_at.replace(tzinfo=UTC)
    if moment > now + _MOMENT_MAX_SKEW or moment < now - _MOMENT_MAX_AGE:
        return now
    return moment


def _to_workout_out(workout: Workout, day_date: date) -> WorkoutOut:
    """Build the API shape from a Workout whose sets+exercises are already loaded."""
    return WorkoutOut(
        id=workout.id,
        date=day_date,
        name=workout.name,
        sets=[_set_out(s, s.exercise) for s in workout.sets],
    )


async def get_or_create_day(session: AsyncSession, user_id: int, day: date) -> Day:
    existing = await session.scalar(
        select(Day).where(Day.user_id == user_id, Day.date == day)
    )
    if existing is not None:
        return existing
    created = Day(user_id=user_id, date=day)
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


async def _get_owned_workout(session: AsyncSession, workout_id: int, user_id: int) -> Workout:
    """Load a workout with its day, 404ing if it doesn't exist or belongs to
    someone else — never 403, so a guessed id can't be used to confirm it
    exists."""
    result = await session.execute(
        select(Workout).where(Workout.id == workout_id).options(selectinload(Workout.day))
    )
    workout = result.scalar_one_or_none()
    if workout is None or workout.day.user_id != user_id:
        raise HTTPException(status_code=404, detail="workout not found")
    return workout


async def _get_owned_set(session: AsyncSession, set_id: int, user_id: int) -> SetEntry:
    result = await session.execute(
        select(SetEntry)
        .where(SetEntry.id == set_id)
        .options(selectinload(SetEntry.workout).selectinload(Workout.day))
    )
    set_entry = result.scalar_one_or_none()
    if set_entry is None or set_entry.workout.day.user_id != user_id:
        raise HTTPException(status_code=404, detail="set not found")
    return set_entry


@router.get("", response_model=list[WorkoutOut])
async def list_workouts(
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[WorkoutOut]:
    """This user's past workouts, newest first, with their sets — powers the history view."""
    result = await session.execute(
        select(Workout)
        .join(Workout.day)
        .where(Day.user_id == user_id)
        .options(
            selectinload(Workout.day),
            selectinload(Workout.sets).selectinload(SetEntry.exercise),
        )
        .order_by(Day.date.desc(), Workout.id.desc())
    )
    return [_to_workout_out(w, w.day.date) for w in result.scalars().all()]


@router.post("", response_model=WorkoutOut, status_code=status.HTTP_201_CREATED)
async def create_workout(
    payload: WorkoutIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> WorkoutOut:
    day = await get_or_create_day(session, user_id, payload.date or date.today())
    workout = Workout(name=payload.name, day_id=day.id)
    session.add(workout)
    await session.commit()
    loaded = await load_workout(session, workout.id)
    assert loaded is not None
    return loaded


@router.get("/{workout_id}", response_model=WorkoutOut)
async def get_workout(
    workout_id: int,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> WorkoutOut:
    await _get_owned_workout(session, workout_id, user_id)
    workout = await load_workout(session, workout_id)
    assert workout is not None
    return workout


@router.patch("/{workout_id}", response_model=WorkoutOut)
async def rename_workout(
    workout_id: int,
    payload: WorkoutPatch,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> WorkoutOut:
    workout = await _get_owned_workout(session, workout_id, user_id)
    workout.name = payload.name
    await session.commit()
    loaded = await load_workout(session, workout_id)
    assert loaded is not None
    return loaded


@router.delete("/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workout(
    workout_id: int,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a workout and its sets; drop the day too if it's now empty."""
    workout = await _get_owned_workout(session, workout_id, user_id)
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
    workout_id: int,
    payload: SetIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> WorkoutOut:
    """Append a set to a workout, creating the exercise on first use.

    Spec: tests/features/log_set.feature
    """
    await _get_owned_workout(session, workout_id, user_id)

    # An existing exercise keeps its kind; a new one takes the payload's (default strength).
    existing = await find_exercise(session, user_id, payload.exercise_name)
    kind = existing.kind if existing else (payload.kind or "strength")
    _validate_metrics(payload, kind)
    exercise = existing or await get_or_create_exercise(
        session, user_id, payload.exercise_name, kind=kind
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
            created_at=_moment_of(payload.performed_at),
        )
    )
    await session.commit()

    loaded = await load_workout(session, workout_id)
    assert loaded is not None
    return loaded


@router.patch("/sets/{set_id}", response_model=SetOut)
async def edit_set(
    set_id: int,
    payload: SetIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SetOut:
    """Correct a logged set (full replacement of its values).

    Spec: tests/features/correct_set.feature
    """
    set_entry = await _get_owned_set(session, set_id, user_id)

    existing = await find_exercise(session, user_id, payload.exercise_name)
    kind = existing.kind if existing else (payload.kind or "strength")
    _validate_metrics(payload, kind)
    exercise = existing or await get_or_create_exercise(
        session, user_id, payload.exercise_name, kind=kind
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
async def delete_set(
    set_id: int,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Remove a logged set. Spec: tests/features/correct_set.feature"""
    set_entry = await _get_owned_set(session, set_id, user_id)
    await session.delete(set_entry)
    await session.commit()
