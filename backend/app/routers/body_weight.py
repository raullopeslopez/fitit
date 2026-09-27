"""Lo que pesas, y la tendencia que se deriva de ello.

La aritmética no vive aquí: `app/weight.py` decide qué es una tendencia y
cuándo no hay ninguna. Este router lee, escribe y traduce.
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..db import get_session
from ..models import BodyWeight
from ..schemas import BodyWeightIn, BodyWeightOut, WeightTrendOut
from ..weight import tendencia

router = APIRouter(prefix="/body-weight", tags=["body-weight"])


async def _pesadas(session: AsyncSession, user_id: int) -> list[BodyWeight]:
    result = await session.execute(
        select(BodyWeight)
        .where(BodyWeight.user_id == user_id)
        .order_by(BodyWeight.measured_on.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=BodyWeightOut, status_code=status.HTTP_201_CREATED)
async def weigh_in(
    body: BodyWeightIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BodyWeightOut:
    """Registra la pesada del día. Si ya había una, la reescribe.

    No es un `INSERT` a secas a propósito: las dos pesadas de un mismo día son
    medidas del mismo hecho, y dos filas convertirían en media lo que es una
    corrección.
    """
    existente = await session.execute(
        select(BodyWeight).where(
            BodyWeight.user_id == user_id,
            BodyWeight.measured_on == body.measured_on,
        )
    )
    pesada = existente.scalar_one_or_none()
    if pesada is None:
        pesada = BodyWeight(user_id=user_id, measured_on=body.measured_on, kg=body.kg)
        session.add(pesada)
    else:
        pesada.kg = body.kg
    await session.commit()
    await session.refresh(pesada)
    return BodyWeightOut.model_validate(pesada)


@router.get("/trend", response_model=WeightTrendOut)
async def trend(
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> WeightTrendOut:
    """La media reciente, o nada si todavía no hay con qué."""
    pesadas = await _pesadas(session, user_id)
    resultado = tendencia([(p.measured_on, p.kg) for p in pesadas])
    return WeightTrendOut(
        kg=resultado.kg,
        weigh_ins=resultado.pesadas,
        up_to=resultado.hasta,
        # `_pesadas` viene de la más reciente a la más antigua.
        last_kg=pesadas[0].kg if pesadas else None,
    )


@router.get("", response_model=list[BodyWeightOut])
async def history(
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[BodyWeightOut]:
    """Las pesadas, de la más reciente a la más antigua."""
    return [BodyWeightOut.model_validate(p) for p in await _pesadas(session, user_id)]
