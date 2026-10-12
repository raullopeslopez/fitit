"""Qué hay en casa (registro sin huecos, fase 6).

Lo comprado según los tickets revisados, en una sola regla que leen la despensa,
tus platos y el generador. Aparte de los routers para que ninguno tenga que
importar a otro.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import PantryItem
from .nutrition import food_log_date

# Lo que se cuenta como «en casa»: lo comprado en las dos últimas semanas. Sin
# apuntar lo que se gasta, más atrás ya no se sabe si queda.
EN_CASA = timedelta(days=14)


def desde_cuando():
    """El primer día de compra que todavía cuenta como «en casa»."""
    return food_log_date(datetime.now(UTC)) - EN_CASA


async def alimentos_en_casa(session: AsyncSession, user_id: int) -> set[int]:
    """Los alimentos que hay en casa."""
    return set(
        (
            await session.execute(
                select(PantryItem.food_id).where(
                    PantryItem.user_id == user_id, PantryItem.bought_on >= desde_cuando()
                )
            )
        )
        .scalars()
        .all()
    )
