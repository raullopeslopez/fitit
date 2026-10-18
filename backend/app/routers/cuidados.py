"""Los días cuidados: la cifra norte de la app (épica de cuatro comidas, fase 7).

Un día cuenta si dijiste algo de lo que comiste —una entrada del diario, o una
comida del plan contestada, también «me lo salté»— o entrenaste —un entreno con
al menos una serie—. Aquí sólo se dice **qué días** cuentan; contarlos sobre una
ventana es de la pantalla que la enseña. Nunca una racha: un día malo no borra
nada, y por eso no hay aquí «días seguidos».
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..db import get_session
from ..models import Day, LogEntry, Plan, PlanEntry, SetEntry, Workout

router = APIRouter(prefix="/cared-days", tags=["cared-days"])

# Lo más largo que se pide: cinco meses de barras caben de sobra.
MAX_DIAS = 400


class CaredDaysOut(BaseModel):
    days: list[date]


@router.get("", response_model=CaredDaysOut)
async def cared_days(
    desde: date = Query(alias="from"),
    hasta: date = Query(alias="to"),
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CaredDaysOut:
    if hasta < desde or hasta - desde > timedelta(days=MAX_DIAS):
        raise HTTPException(status_code=422, detail="ventana no válida")

    comidos = select(LogEntry.log_date).where(
        LogEntry.user_id == user_id, LogEntry.log_date >= desde, LogEntry.log_date <= hasta
    )
    dichos = (
        select(PlanEntry.log_date)
        .join(Plan, Plan.id == PlanEntry.plan_id)
        .where(
            Plan.user_id == user_id,
            PlanEntry.status.is_not(None),
            PlanEntry.log_date >= desde,
            PlanEntry.log_date <= hasta,
        )
    )
    entrenados = (
        select(Day.date)
        .join(Workout, Workout.day_id == Day.id)
        .join(SetEntry, SetEntry.workout_id == Workout.id)
        .where(Day.user_id == user_id, Day.date >= desde, Day.date <= hasta)
    )
    dias: set[date] = set()
    for consulta in (comidos, dichos, entrenados):
        dias.update((await session.execute(consulta)).scalars().all())
    return CaredDaysOut(days=sorted(dias))
