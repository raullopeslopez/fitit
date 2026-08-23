from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Exercise
from .muscles import group_for
from .naming import fold_exercise_name, normalize_exercise_name


async def find_exercise(session: AsyncSession, user_id: int, name: str) -> Exercise | None:
    """Find one of this user's exercises by name, matched case-, accent- and
    whitespace-insensitively.

    So "Bench Press", "bench press" and " Bench  Press " all resolve to one row,
    and so do "Extensión de tríceps" and "Extension de triceps".

    Two passes, and the order matters. The exact pass runs in SQL and answers
    almost every call; the folded pass is a fallback, so a user who somehow
    already holds both spellings keeps landing on the one they typed rather than
    on whichever the fold picked. When the fold does decide, it decides by id —
    the oldest row wins, deterministically, instead of by whatever order the
    database felt like returning.
    """
    target = normalize_exercise_name(name)
    exact = await session.scalar(
        select(Exercise).where(
            Exercise.user_id == user_id, func.lower(Exercise.name) == target.lower()
        )
    )
    if exact is not None:
        return exact
    key = fold_exercise_name(target)
    candidates = await session.scalars(
        select(Exercise).where(Exercise.user_id == user_id).order_by(Exercise.id)
    )
    return next((e for e in candidates if fold_exercise_name(e.name) == key), None)


async def get_or_create_exercise(
    session: AsyncSession, user_id: int, name: str, kind: str = "strength"
) -> Exercise:
    """Return the matching exercise, creating it (with the normalized name) if new.

    `kind` only applies on creation — an existing exercise keeps its kind.
    """
    exercise = await find_exercise(session, user_id, name)
    if exercise is None:
        normalized = normalize_exercise_name(name)
        # Auto-assign a muscle group on first sight; the user can override later.
        exercise = Exercise(
            user_id=user_id,
            name=normalized,
            muscle_group=group_for(normalized, kind),
            kind=kind,
        )
        session.add(exercise)
        await session.flush()
    return exercise
