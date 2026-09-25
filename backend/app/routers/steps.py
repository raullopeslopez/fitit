"""Los pasos de cada día: los sube la app de Android, los lee la pantalla de Días.

El móvil cuenta y el servidor guarda: aquí no se suma ni se promedia nada. Un
día sin fila es desconocido y no aparece en la respuesta — nunca como un cero.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..db import get_session
from ..models import DailySteps
from ..schemas import MAX_STEPS_RANGE_DAYS, StepsDay, StepsSavedOut, StepsUploadIn

router = APIRouter(prefix="/steps", tags=["steps"])


@router.put("", response_model=StepsSavedOut)
async def upload(
    body: StepsUploadIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> StepsSavedOut:
    """Guarda cada día, o escribe encima del que ya estaba.

    Escribir encima y no quedarse con el mayor: la lectura posterior es la más
    completa, y si Health Connect corrige a la baja (pasos duplicados de dos
    fuentes), la corrección es la cifra buena. Subir lo mismo dos veces deja lo
    mismo.
    """
    fechas = [d.date for d in body.days]
    existentes = await session.execute(
        select(DailySteps).where(DailySteps.user_id == user_id, DailySteps.date.in_(fechas))
    )
    por_fecha = {fila.date: fila for fila in existentes.scalars()}
    for dia in body.days:
        fila = por_fecha.get(dia.date)
        if fila is None:
            session.add(DailySteps(user_id=user_id, date=dia.date, steps=dia.steps))
        else:
            fila.steps = dia.steps
    await session.commit()
    return StepsSavedOut(saved=len(body.days))


@router.get("", response_model=list[StepsDay])
async def read(
    desde: date = Query(alias="from"),
    hasta: date = Query(alias="to"),
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[StepsDay]:
    """Los días con pasos entre `from` y `to`, los dos incluidos, por fecha."""
    if desde > hasta:
        raise HTTPException(
            status_code=422,
            detail="`from` no puede ser posterior a `to`",
        )
    if (hasta - desde).days + 1 > MAX_STEPS_RANGE_DAYS:
        raise HTTPException(
            status_code=422,
            detail=f"el rango no puede pasar de {MAX_STEPS_RANGE_DAYS} días",
        )
    result = await session.execute(
        select(DailySteps)
        .where(
            DailySteps.user_id == user_id,
            DailySteps.date >= desde,
            DailySteps.date <= hasta,
        )
        .order_by(DailySteps.date)
    )
    return [StepsDay(date=f.date, steps=f.steps) for f in result.scalars()]
