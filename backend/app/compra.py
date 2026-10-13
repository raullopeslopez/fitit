"""La compra de una semana: abrirla al mandar la lista, cerrarla con el ticket.

Una fila por semana en `shopping_runs`. Mandar la lista a Taski la abre (o la
reabre: otra ida a la tienda tendrá su propio ticket) y el ticket guardado la
cierra. Si no se mandó nada, el ticket no abre ninguna: «¿ya compraste?» sólo
tiene sentido después de mandar la lista.
"""

from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .models import ShoppingRun
from .schemas import ShoppingOut


async def _de(session: AsyncSession, user_id: int, week_start: date) -> ShoppingRun | None:
    return (
        await session.execute(
            select(ShoppingRun).where(ShoppingRun.user_id == user_id, ShoppingRun.week_start == week_start)
        )
    ).scalar_one_or_none()


async def abrir(session: AsyncSession, user_id: int, week_start: date) -> None:
    """La lista de esa semana acaba de llegar a Taski."""
    ahora = datetime.now(UTC)
    fila = await _de(session, user_id, week_start)
    if fila is None:
        session.add(ShoppingRun(user_id=user_id, week_start=week_start, sent_at=ahora))
        try:
            await session.commit()
            return
        except IntegrityError:
            # Dos envíos a la vez: el otro ya creó la fila; se reabre esa.
            await session.rollback()
            fila = await _de(session, user_id, week_start)
    fila.sent_at = ahora
    fila.ticket_at = None
    await session.commit()


async def cerrar(session: AsyncSession, user_id: int, week_start: date) -> None:
    """Se ha guardado el ticket de esa semana. Sin envío previo no hay nada que cerrar."""
    fila = await _de(session, user_id, week_start)
    if fila is None:
        return
    fila.ticket_at = datetime.now(UTC)
    await session.commit()


async def de_la_semana(session: AsyncSession, user_id: int, week_start: date) -> ShoppingOut | None:
    fila = await _de(session, user_id, week_start)
    if fila is None:
        return None
    return ShoppingOut(sent_at=fila.sent_at, ticket_at=fila.ticket_at)
