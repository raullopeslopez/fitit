from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete as sql_delete
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..db import get_session
from ..exercise_repo import find_exercise
from ..models import Day, Exercise, SetEntry, Workout
from ..muscles import MUSCLE_GROUPS, group_for
from ..naming import fold_exercise_name, normalize_exercise_name
from ..schemas import (
    BestMark,
    ExerciseIn,
    ExerciseMerge,
    ExerciseOut,
    ExercisePatch,
    HistoryPoint,
    NameClash,
    NameTaken,
    NameTakenError,
    PreviousMarks,
    RecentMuscle,
    RepMark,
    SetOut,
)

router = APIRouter(tags=["exercises"])


def _to_exercise_out(exercise: Exercise, set_count: int) -> ExerciseOut:
    """Fall back to the classifier when a row predates auto-tagging, so older
    exercises still carry a group for the per-muscle views without a migration.
    A stored value (including a manual override) always wins.

    `set_count` is passed in rather than read off a relationship: the listing
    gets every count in one grouped query, and lazy-loading one per row would
    turn that into an N+1 on the screen that opens first."""
    return ExerciseOut(
        id=exercise.id,
        name=exercise.name,
        muscle_group=exercise.muscle_group or group_for(exercise.name, exercise.kind),
        kind=exercise.kind,
        note=exercise.note,
        set_count=set_count,
    )


async def _count_sets(session: AsyncSession, exercise_id: int) -> int:
    """The sets logged against one exercise — what a re-tag would move."""
    return (
        await session.scalar(
            select(func.count()).select_from(SetEntry).where(SetEntry.exercise_id == exercise_id)
        )
        or 0
    )


async def _find_name_clash(
    session: AsyncSession, user_id: int, new_name: str, exercise_id: int
) -> Exercise | None:
    """The other exercise of this user's already holding `new_name`, if any.

    "Already holding" is judged by `fold_exercise_name`, the one rule the whole
    backend uses for whether two spellings are the same exercise — the same one
    `find_exercise` uses when a set is logged by name. If the rename check and
    the lookup disagreed, a rename could be refused for clashing with a row that
    the next logged set would then fail to find.

    Scoped by `user_id` in both passes, and the caller builds the 409 out of
    what comes back: a name only somebody else holds is not a collision, and
    nothing of theirs can ride out in the refusal.

    `exercise_id` is excluded, so fixing your own capitalisation or adding the
    accent you left off is not a collision with yourself.
    """
    key = fold_exercise_name(new_name)
    candidates = await session.scalars(
        select(Exercise).where(Exercise.user_id == user_id, Exercise.id != exercise_id)
    )
    return next((e for e in candidates if fold_exercise_name(e.name) == key), None)


def _reject_unknown_group(group: str | None) -> None:
    """Every door that writes `muscle_group` goes through here.

    `None` is legal and means "no override, use the classifier"; anything else
    has to be one of the canonical nine. This lived inline in `PATCH` only,
    which left `POST` taking any string the column would fit — and the frontend
    documents its `Sin grupo` sentinel as safe precisely because the backend
    refuses it.
    """
    if group is not None and group not in MUSCLE_GROUPS:
        raise HTTPException(status_code=422, detail="unknown muscle group")


@router.get("/muscle-groups", response_model=list[str])
async def list_muscle_groups() -> list[str]:
    """The canonical muscle groups, in display order — powers the group picker."""
    return MUSCLE_GROUPS


@router.get("/exercises", response_model=list[ExerciseOut])
async def list_exercises(
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ExerciseOut]:
    """Every exercise of this user's, alphabetically — powers the add-exercise autocomplete.

    The set counts come along in the same query (LEFT JOIN onto a grouped
    count), so an exercise you created but never logged still appears, with 0.
    """
    counted = (
        select(SetEntry.exercise_id.label("exercise_id"), func.count().label("n"))
        .group_by(SetEntry.exercise_id)
        .subquery()
    )
    rows = await session.execute(
        select(Exercise, func.coalesce(counted.c.n, 0))
        .outerjoin(counted, counted.c.exercise_id == Exercise.id)
        .where(Exercise.user_id == user_id)
        .order_by(func.lower(Exercise.name))
    )
    return [_to_exercise_out(e, n) for e, n in rows.all()]


@router.post("/exercises", response_model=ExerciseOut, status_code=status.HTTP_201_CREATED)
async def create_exercise(
    payload: ExerciseIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ExerciseOut:
    """Create an exercise, or hand back the one you already have by that name.

    "Already have" is judged the same way every other lookup judges it —
    case-insensitively and whitespace-normalized, via `find_exercise`. Matching
    exactly here would be the one door a second row fits through: "press banca"
    beside "Press banca", each holding half the sets and half the records, and
    the name-based lookups everywhere else picking between them arbitrarily.
    """
    _reject_unknown_group(payload.muscle_group)
    existing = await find_exercise(session, user_id, payload.name)
    if existing is not None:
        return _to_exercise_out(existing, await _count_sets(session, existing.id))
    name = normalize_exercise_name(payload.name)
    exercise = Exercise(
        user_id=user_id,
        name=name,
        muscle_group=payload.muscle_group or group_for(name, payload.kind),
        kind=payload.kind,
    )
    session.add(exercise)
    await session.commit()
    await session.refresh(exercise)
    return _to_exercise_out(exercise, 0)


@router.patch(
    "/exercises/{exercise_id}",
    response_model=ExerciseOut,
    responses={409: {"model": NameTakenError, "description": "The name is already yours"}},
)
async def update_exercise(
    exercise_id: int,
    payload: ExercisePatch,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ExerciseOut:
    """Rename an exercise, override its muscle group, and/or set its standing note.

    Only the fields present in the request are touched, so a name-only edit
    leaves the muscle group alone (and vice versa). Renaming is in place: every
    past set, history point and record follows automatically, since they
    reference the exercise by id. A muscle_group of null clears the override,
    reverting to the auto-classifier.
    """
    fields = payload.model_fields_set
    if "muscle_group" in fields:
        _reject_unknown_group(payload.muscle_group)
    exercise = await session.get(Exercise, exercise_id)
    if exercise is None or exercise.user_id != user_id:
        raise HTTPException(status_code=404, detail="exercise not found")
    if "name" in fields:
        new_name = normalize_exercise_name(payload.name)
        # Renaming onto another exercise would fold two distinct lifts into one
        # name; reject it rather than silently merge.
        clash = await _find_name_clash(session, user_id, new_name, exercise_id)
        if clash is not None:
            # The refusal carries the collision, because refusing is not the end
            # of the story: the name is taken precisely because that exercise is
            # already yours, and folding this one into it is usually what the
            # user meant. The client cannot offer that without the target's id,
            # cannot name it without the stored spelling, and cannot say what it
            # would cost without the count of sets that would move.
            raise HTTPException(
                status_code=409,
                detail=NameTaken(
                    message="an exercise with that name already exists",
                    exercise=NameClash(
                        id=clash.id,
                        name=clash.name,
                        kind=clash.kind,
                        set_count=await _count_sets(session, clash.id),
                    ),
                ).model_dump(),
            )
        exercise.name = new_name
    if "muscle_group" in fields:
        exercise.muscle_group = payload.muscle_group
    if "note" in fields:
        # A cleared input arrives as "" and means the same as null: no note. One
        # of the two reaching storage would leave an empty string the client
        # renders as a blank line under the exercise name.
        exercise.note = payload.note or None
    await session.commit()
    await session.refresh(exercise)
    return _to_exercise_out(exercise, await _count_sets(session, exercise.id))


async def _get_owned_exercise(session: AsyncSession, exercise_id: int, user_id: int) -> Exercise:
    """404 for both "no such exercise" and "someone else's" — never 403, so a
    guessed id can't be used to confirm one exists."""
    exercise = await session.get(Exercise, exercise_id)
    if exercise is None or exercise.user_id != user_id:
        raise HTTPException(status_code=404, detail="exercise not found")
    return exercise


async def _workout_ids_with(session: AsyncSession, exercise_id: int) -> set[int]:
    rows = await session.scalars(
        select(SetEntry.workout_id).where(SetEntry.exercise_id == exercise_id).distinct()
    )
    return set(rows.all())


async def _reindex(session: AsyncSession, workout_ids: set[int]) -> None:
    """Close the holes in set_index left by moved or deleted sets.

    A new set takes its index from the count of sets in the workout, so a hole
    means the next one collides with a set already sitting there — and a
    collision makes the order of two rows in the same session a coin flip.
    """
    for workout_id in workout_ids:
        rows = await session.scalars(
            select(SetEntry)
            .where(SetEntry.workout_id == workout_id)
            .order_by(SetEntry.set_index, SetEntry.created_at, SetEntry.id)
        )
        for index, entry in enumerate(rows.all()):
            entry.set_index = index


@router.delete("/exercises/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exercise(
    exercise_id: int,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete an exercise and every set ever logged against it.

    There is no soft version of this: the sets reference the exercise by id, so
    leaving them would leave rows pointing at nothing. The confirmation — and
    the count of what's about to go — belongs to the client, which is where the
    thumb is. Spec: tests/features/manage_exercises.feature
    """
    exercise = await _get_owned_exercise(session, exercise_id, user_id)
    touched = await _workout_ids_with(session, exercise_id)
    await session.execute(sql_delete(SetEntry).where(SetEntry.exercise_id == exercise_id))
    await session.delete(exercise)
    await session.flush()
    await _reindex(session, touched)
    await session.commit()


@router.post("/exercises/{exercise_id}/merge", response_model=ExerciseOut)
async def merge_exercise(
    exercise_id: int,
    payload: ExerciseMerge,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ExerciseOut:
    """Fold a duplicate into the real exercise: its sets move, then it's gone.

    What renaming can't do — the target name is taken, which is exactly why you
    are here. History, records and the mark to beat all read through the target
    afterwards, because they read through the exercise id the sets now carry.
    """
    source = await _get_owned_exercise(session, exercise_id, user_id)
    target = await _get_owned_exercise(session, payload.into_id, user_id)
    if source.id == target.id:
        raise HTTPException(status_code=422, detail="an exercise cannot merge into itself")
    if source.kind != target.kind:
        # Their sets carry different metrics (reps/weight vs duration/distance);
        # merged, half the rows would no longer match their exercise's kind.
        raise HTTPException(status_code=409, detail="cannot merge a cardio and a strength exercise")

    touched = await _workout_ids_with(session, source.id)
    await session.execute(
        update(SetEntry).where(SetEntry.exercise_id == source.id).values(exercise_id=target.id)
    )
    await session.delete(source)
    await session.flush()
    await _reindex(session, touched)
    await session.commit()
    await session.refresh(target)
    return _to_exercise_out(target, await _count_sets(session, target.id))


@router.get("/exercises/history", response_model=list[HistoryPoint])
async def exercise_history(
    name: str,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[HistoryPoint]:
    """Best estimated 1RM (Epley) per training day for an exercise, oldest first.

    In kilos always — a curve that switched units mid-way would show a jump
    where there was no progress.
    """
    exercise = await find_exercise(session, user_id, name)
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


@router.get("/exercises/records", response_model=list[BestMark])
async def best_marks(
    limit: int = 10,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
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
            .where(
                Exercise.user_id == user_id,
                SetEntry.weight.is_not(None),
                SetEntry.reps.is_not(None),
            )
            .order_by(SetEntry.created_at, SetEntry.id)
        )
    ).all()

    # Walk each exercise's sets oldest-first, tracking the running record. The
    # delta is whatever the final record beat when it was set, which is why
    # this needs the ordered walk rather than a max() over the whole column.
    best: dict[int, BestMark] = {}
    for entry, exercise in rows:
        one_rm = round(entry.weight * (1 + entry.reps / 30), 1)
        standing = best.get(exercise.id)
        if standing is not None and one_rm <= standing.one_rm:
            continue
        best[exercise.id] = BestMark(
            exercise_id=exercise.id,
            exercise_name=exercise.name,
            muscle_group=exercise.muscle_group or group_for(exercise.name, exercise.kind),
            reps=entry.reps,
            weight=entry.weight,
            one_rm=one_rm,
            delta_one_rm=(round(one_rm - standing.one_rm, 1) if standing is not None else None),
        )

    return sorted(best.values(), key=lambda m: m.one_rm, reverse=True)[:limit]


@router.get("/exercises/recently-trained", response_model=list[RecentMuscle])
async def recently_trained(
    exclude_workout_id: int | None = None,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[RecentMuscle]:
    """Muscle groups trained today or yesterday, most recent first.

    The evidence puts muscle recovery at roughly 48 hours, and "today or
    yesterday" is that window in the unit the log actually keeps. It could be
    computed to the hour from the sets' `created_at`, but that field says when
    the row was written: a session entered after the fact would report the day
    I typed it rather than the day I trained. Against real data the two disagree
    on 4 sets in 277 — small, but the failure is silent and the extra precision
    is false anyway, since the 48 hours is itself an approximation.

    `exclude_workout_id` keeps the session you are standing in out of its own
    answer. Without it, opening a workout tells you that you trained chest
    today, which is the app reading its own notes back to you.
    """
    today = date.today()
    conditions = [
        Day.user_id == user_id,
        Day.date >= today - timedelta(days=1),
        Day.date <= today,
    ]
    if exclude_workout_id is not None:
        conditions.append(Workout.id != exclude_workout_id)
    rows = (
        await session.execute(
            select(Day.date, Exercise.muscle_group, Exercise.name, Exercise.kind)
            .join(Workout, Workout.day_id == Day.id)
            .join(SetEntry, SetEntry.workout_id == Workout.id)
            .join(Exercise, Exercise.id == SetEntry.exercise_id)
            .where(*conditions)
            .distinct()
        )
    ).all()

    # The primary group only. A bench press trains triceps, but indirect work is
    # not a reason to call them unrecovered — the same rule the calendar follows.
    latest: dict[str, date] = {}
    for day, group, name, kind in rows:
        # Same fallback as the exercise list: a row from before auto-tagging
        # still has a group to answer with.
        resolved = group or group_for(name, kind)
        if resolved is None:  # cardio, and anything the classifier can't place
            continue
        if resolved not in latest or day > latest[resolved]:
            latest[resolved] = day

    def order(item: tuple[str, date]) -> tuple[date, int]:
        group, day = item
        # Most recent first; ties fall back to canonical order so the line does
        # not reshuffle between renders.
        index = MUSCLE_GROUPS.index(group) if group in MUSCLE_GROUPS else len(MUSCLE_GROUPS)
        return (-day.toordinal(), index)

    return [RecentMuscle(group=g, last_date=d) for g, d in sorted(latest.items(), key=order)]


@router.get("/exercises/previous", response_model=PreviousMarks)
async def previous_marks(
    name: str,
    exclude_workout_id: int | None = None,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PreviousMarks:
    """The sets from the most recent workout that includes this exercise.

    `found` is false (and `sets` empty) when the exercise has never been logged.

    `exclude_workout_id` drops one workout from both the search and the best
    1RM. The client passes the session it is standing in: reopening the app
    mid-workout rebuilds its cards from the log and each one asks again what
    the mark to beat is, and without this it is answered with its own sets from
    ten minutes ago — a target nothing today can beat, and a PR that never fires.
    Spec: tests/features/previous_marks.feature
    """
    exercise = await find_exercise(session, user_id, name)
    if exercise is None:
        return PreviousMarks(
            exercise_name=normalize_exercise_name(name), found=False, sets=[], kind=None
        )

    scope = [SetEntry.exercise_id == exercise.id]
    if exclude_workout_id is not None:
        scope.append(SetEntry.workout_id != exclude_workout_id)

    # Best estimated 1RM (Epley: weight * (1 + reps/30)) across every strength
    # set, in kilos. Cardio sets have no weight/reps, so they're skipped.
    all_sets = (await session.scalars(select(SetEntry).where(*scope))).all()
    strength_sets = [s for s in all_sets if s.weight is not None and s.reps is not None]
    best_one_rm = (
        round(max(s.weight * (1 + s.reps / 30) for s in strength_sets), 1)
        if strength_sets
        else None
    )

    # The heaviest ever moved at each rep count — everything the client needs to
    # decide whether a set is a record, without shipping a lift's whole history
    # down the wire. `scope` already drops the session being logged, so the bar
    # is what you walked in with.
    bars: dict[int, float] = {}
    for s in strength_sets:
        if s.weight > bars.get(s.reps, float("-inf")):
            bars[s.reps] = s.weight
    best_by_reps = [RepMark(reps=r, weight=w) for r, w in sorted(bars.items())]

    # The training day comes back with the workout id: the card dates the marks
    # off this, and `created_at` on the sets answers a different question (when
    # the row was written), which drifts the moment a session is logged on
    # another date.
    last = (
        await session.execute(
            select(SetEntry.workout_id, Day.date)
            .join(Workout, Workout.id == SetEntry.workout_id)
            .join(Day, Day.id == Workout.day_id)
            .where(*scope)
            .order_by(Day.date.desc(), Workout.id.desc())
            .limit(1)
        )
    ).first()
    last_workout_id, last_date = last if last is not None else (None, None)
    if last_workout_id is None:
        return PreviousMarks(exercise_name=exercise.name, found=False, sets=[], kind=exercise.kind)

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
        best_by_reps=best_by_reps,
        last_date=last_date,
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
                rpe=s.rpe,
                note=s.note,
                duration_seconds=s.duration_seconds,
                distance=s.distance,
            )
            for s in result.scalars().all()
        ],
    )
