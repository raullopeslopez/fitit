"""El límite diario de llamadas al modelo, por cuenta.

Cada endpoint que llama a Gemini o a Groq lleva `Depends(spend_llm_call)` en su
decorador. La dependencia cuenta la llamada **antes** de que el handler llegue
al modelo y, pasado `settings.llm_daily_limit`, contesta 429 sin llamarlo.

El cuerpo del 429 tiene la misma forma que la cuota del día de Gemini
(`refusal: 'quota'`, `quota_scope: 'day'`), y el cliente lo trata igual: cada
pantalla ya sabe decir «hasta mañana» a su manera.

El día es UTC y no el alimentario de las 04:00: el corte no lo decide un
offset que manda el cliente.
"""

from datetime import UTC, date, datetime

from fastapi import Depends, HTTPException, status
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import get_current_user
from .config import settings
from .db import get_session
from .models import LlmUsage

LIMIT_MESSAGE = "Has llegado al límite de consultas de hoy. Vuelve mañana."


def quota_day() -> date:
    return datetime.now(UTC).date()


async def _bump(session: AsyncSession, user_id: int, day: date) -> int:
    """Suma una llamada y devuelve el total del día, sin perder ninguna si dos
    llegan a la vez: el UPDATE es atómico y el INSERT lo protege la clave."""
    stmt = (
        update(LlmUsage)
        .where(LlmUsage.user_id == user_id, LlmUsage.day == day)
        .values(calls=LlmUsage.calls + 1)
        .returning(LlmUsage.calls)
    )
    calls = await session.scalar(stmt)
    if calls is None:
        session.add(LlmUsage(user_id=user_id, day=day, calls=1))
        try:
            await session.commit()
            return 1
        except IntegrityError:
            await session.rollback()
            calls = await session.scalar(stmt)
    await session.commit()
    return calls


async def spend_llm_call(
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    # Contar primero y mirar después: comprobar y luego sumar deja pasar a dos
    # llamadas simultáneas con la última plaza. Las rechazadas también suman,
    # y da igual: pasado el límite el número exacto ya no decide nada.
    calls = await _bump(session, user_id, quota_day())
    if calls > settings.llm_daily_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"refusal": "quota", "quota_scope": "day", "message": LIMIT_MESSAGE},
        )
