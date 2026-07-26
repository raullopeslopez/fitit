from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Exercise
from .muscles import group_for
from .naming import normalize_exercise_name


async def find_exercise(session: AsyncSession, name: str) -> Exercise | None:
    """Find an exercise by name, matched case-insensitively and whitespace-normalized.

    So "Bench Press", "bench press" and " Bench  Press " all resolve to one row.
    """
    target = normalize_exercise_name(name)
    return await session.scalar(
        select(Exercise).where(func.lower(Exercise.name) == target.lower())
    )


async def get_or_create_exercise(
    session: AsyncSession, name: str, kind: str = "strength"
) -> Exercise:
    """Return the matching exercise, creating it (with the normalized name) if new.

    `kind` only applies on creation — an existing exercise keeps its kind.
    """
    exercise = await find_exercise(session, name)
    if exercise is None:
        normalized = normalize_exercise_name(name)
        # Auto-assign a muscle group on first sight; the user can override later.
        exercise = Exercise(name=normalized, muscle_group=group_for(normalized, kind), kind=kind)
        session.add(exercise)
        await session.flush()
    return exercise
