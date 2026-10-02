"""El objetivo diario: de lo que quieres que pase a cuántas kcal tocan.

La aritmética vive en `app/targets.py`. Aquí se leen los datos que necesita
—tu perfil, tus pesadas, lo que has comido— y se traduce.

Decisión 18: la app **propone** y tú aceptas. Un número que cambia solo no se
obedece, se desconfía. Por eso `GET /targets/proposal` no escribe nada.
"""

from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..db import get_session
from ..models import BodyWeight, DailySteps, DailyTarget, Day, LogEntry, SetEntry, User, Workout
from ..nutrition import reparto_macros
from ..schemas import (
    GoalPlanOut,
    TargetAcceptIn,
    TargetProfileIn,
    TargetProfileOut,
    TargetProposalOut,
)
from ..session_length import session_length
from ..targets import gasto_medido, gasto_por_formula, kcal_entreno, plan, proponer
from ..weight import tendencia

router = APIRouter(prefix="/targets", tags=["targets"])

# La ventana sobre la que se mide el gasto real. Cuatro semanas: bastante para
# que el agua se promedie, poco para que siga hablando del cuerpo de ahora.
VENTANA = 28


async def _user(session: AsyncSession, user_id: int) -> User:
    return (await session.execute(select(User).where(User.id == user_id))).scalar_one()


async def _dias_entreno(session: AsyncSession, user_id: int) -> float:
    """Días de entreno por semana, de los últimos 28. Lo sabe la app: no hace
    falta preguntarle a nadie por su «nivel de actividad»."""
    desde = date.today() - timedelta(days=VENTANA)
    total = (
        await session.execute(
            select(func.count(Day.id)).where(Day.user_id == user_id, Day.date >= desde)
        )
    ).scalar_one()
    return (total or 0) / 4.0


async def _pasos(session: AsyncSession, user_id: int) -> list[int]:
    """Los pasos de cada día de la ventana que el móvil subió. Hoy no: todavía
    se está andando. Un día sin fila no es un cero, así que no entra."""
    desde = date.today() - timedelta(days=VENTANA)
    filas = (
        await session.execute(
            select(DailySteps.steps).where(
                DailySteps.user_id == user_id,
                DailySteps.date >= desde,
                DailySteps.date < date.today(),
            )
        )
    ).all()
    return [row[0] for row in filas]


# Una sesión de la que no se puede decir cuánto duró (una sola serie, o series
# fuera de su día) cuenta como esto. Mejor tres cuartos de hora que cero.
SESION_SIN_DURACION_S = 45 * 60


async def _entreno_kcal_dia(session: AsyncSession, user_id: int, kg: float | None) -> float:
    """Lo que cuestan al día, de media en la ventana, tus sesiones de entreno.

    La duración sale de las propias series (`session_length`): nadie tiene que
    arrancar ni parar un reloj.
    """
    if kg is None:
        return 0.0
    desde = date.today() - timedelta(days=VENTANA)
    filas = (
        await session.execute(
            select(Workout.id, Day.date, SetEntry.created_at)
            .join(Day, Workout.day_id == Day.id)
            .join(SetEntry, SetEntry.workout_id == Workout.id)
            .where(Day.user_id == user_id, Day.date >= desde, Day.date < date.today())
        )
    ).all()
    sesiones: dict[int, tuple[date, list]] = {}
    for workout_id, dia, momento in filas:
        sesiones.setdefault(workout_id, (dia, []))[1].append(momento)
    segundos = sum(
        session_length(momentos, dia) or SESION_SIN_DURACION_S
        for dia, momentos in sesiones.values()
    )
    return kcal_entreno(kg=kg, horas=segundos / 3600) / VENTANA


async def _peso(session: AsyncSession, user_id: int) -> float | None:
    """Tu peso: la tendencia de tus pesadas, o la última si sólo hay una.

    Con una sola pesada no hay tendencia — pero para una estimación vale más una
    pesada que ninguna, y lo que la usa ya se declara estimación.
    """
    filas = (
        await session.execute(
            select(BodyWeight.measured_on, BodyWeight.kg).where(BodyWeight.user_id == user_id)
        )
    ).all()
    kg = tendencia([(row[0], row[1]) for row in filas]).kg
    if kg is None:
        kg = (
            await session.execute(
                select(BodyWeight.kg)
                .where(BodyWeight.user_id == user_id)
                .order_by(BodyWeight.measured_on.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
    return kg


async def _medido(session: AsyncSession, user_id: int):
    """El gasto medido en tus datos, o `None` si todavía no hay con qué."""
    desde = date.today() - timedelta(days=VENTANA)
    filas = (
        await session.execute(
            select(LogEntry.log_date, func.sum(LogEntry.kcal))
            # Hoy no: todavía se está comiendo, y un día a medias cuenta en la
            # media como uno entero. `date.today()` es la fecha del servidor, no
            # el día alimentario con su corte de las 04:00 — para excluir el
            # día en curso basta, salvo un par de horas de madrugada.
            .where(
                LogEntry.user_id == user_id,
                LogEntry.log_date >= desde,
                LogEntry.log_date < date.today(),
            )
            .group_by(LogEntry.log_date)
        )
    ).all()
    por_dia = [float(total) for _, total in filas if total is not None]
    if not por_dia:
        return None

    pesadas = (
        await session.execute(
            select(BodyWeight.measured_on, BodyWeight.kg)
            .where(BodyWeight.user_id == user_id, BodyWeight.measured_on >= desde)
            .order_by(BodyWeight.measured_on)
        )
    ).all()
    if len(pesadas) < 2:
        return None

    # La tendencia en cada mitad de la ventana, no la primera y la última
    # pesada: dos cifras sueltas separadas por un mes miden el agua de dos días.
    mitad = len(pesadas) // 2
    primera = tendencia([(d, kg) for d, kg in pesadas[:mitad or 1]])
    ultima = tendencia([(d, kg) for d, kg in pesadas[mitad:]])
    if primera.kg is None or ultima.kg is None:
        # Con una sola pesada por mitad no hay tendencia, y una pesada no es una
        # tendencia. Mejor caer a la fórmula que medir sobre ruido.
        return None

    dias = (pesadas[-1][0] - pesadas[0][0]).days or len(por_dia)
    return gasto_medido(kcal_por_dia=por_dia, dias=dias, delta_kg=ultima.kg - primera.kg)


@router.get("", response_model=TargetProfileOut)
async def read_profile(
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> TargetProfileOut:
    return TargetProfileOut.model_validate(await _user(session, user_id))


@router.patch("", response_model=TargetProfileOut)
async def update_profile(
    payload: TargetProfileIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> TargetProfileOut:
    """Guarda el perfil. **No toca el objetivo**: cambiarlo es un acto aparte."""
    user = await _user(session, user_id)
    cambios = payload.model_dump(exclude_unset=True)
    # Otra meta u otro objetivo es otro plan: dónde arrancó el anterior ya no
    # cuenta. Sólo si **cambia** — un cliente que reenvía el perfil entero al
    # guardar no puede reiniciar el plan con los mismos valores. Altura, ritmo o
    # pasos no lo tocan: ajustar el ritmo a mitad de camino sigue siendo el mismo plan.
    if any(k in cambios and cambios[k] != getattr(user, k) for k in ("goal", "goal_weight_kg")):
        user.plan_started_on = None
        user.plan_start_kg = None
    for key, value in cambios.items():
        setattr(user, key, value)
    await session.commit()
    await session.refresh(user)
    return TargetProfileOut.model_validate(user)


@router.get("/proposal", response_model=TargetProposalOut)
async def proposal(
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> TargetProposalOut:
    """Lo que tocaría comer, y de dónde sale el número. No escribe nada."""
    user = await _user(session, user_id)

    kg = await _peso(session, user_id)
    gasto = await _medido(session, user_id)
    if gasto is None:
        edad = date.today().year - user.birth_year if user.birth_year else None
        gasto = gasto_por_formula(
            sex=user.sex,
            kg=kg,
            cm=user.height_cm,
            age=edad,
            dias_entreno=await _dias_entreno(session, user_id),
            pasos_por_dia=await _pasos(session, user_id),
            entreno_kcal_dia=await _entreno_kcal_dia(session, user_id, kg),
        )

    hoy = date.today()
    el_plan = plan(
        goal=user.goal,
        rate_kg_week=user.goal_rate,
        goal_weight_kg=user.goal_weight_kg,
        start_kg=user.plan_start_kg,
        started_on=user.plan_started_on,
        current_kg=kg,
        today=hoy,
    )
    # Llegar al peso meta propone mantener. Sólo propone: seguir restando hasta
    # que alguien acepte el mantenimiento sería un objetivo que cambia solo, y
    # la decisión 18 lo prohíbe en las dos direcciones.
    meta = "maintain" if el_plan and el_plan.reached else user.goal or "maintain"
    propuesta = proponer(gasto, goal=meta, rate_kg_week=user.goal_rate)
    macros = reparto_macros(kcal=propuesta.kcal, kg=kg) or {}
    return TargetProposalOut(
        kcal=propuesta.kcal,
        source=propuesta.source,
        days=propuesta.days,
        missing=propuesta.missing,
        floored=propuesta.floored,
        steps_per_day=propuesta.steps_per_day,
        training_kcal_per_day=propuesta.training_kcal_per_day,
        expenditure=propuesta.expenditure,
        plan=GoalPlanOut(**vars(el_plan)) if el_plan else None,
        **macros,
    )


@router.post("/accept", response_model=TargetProfileOut)
async def accept(
    payload: TargetAcceptIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> TargetProfileOut:
    """Acepta un objetivo. Es lo único que lo cambia.

    **No reescribe los días ya congelados**: lo de hoy en adelante toma el
    número nuevo, y lo que dijo el diario de ayer sigue diciéndolo.
    """
    user = await _user(session, user_id)
    user.objetivo_kcal = payload.kcal
    # Las kcal dicen cuánto y los macros cómo: se aceptan juntos, o el reparto
    # que compara Comida seguiría siendo el de otro objetivo. Sin peso no hay
    # reparto que proponer y se deja el que hubiera.
    kg = await _peso(session, user_id)
    macros = reparto_macros(kcal=payload.kcal, kg=kg)
    if macros:
        user.objetivo_proteina = macros["protein"]
        user.objetivo_grasa = macros["fat"]
        user.objetivo_hidratos = macros["carbs"]
    # Aceptar es lo que arranca el plan: hasta entonces era una propuesta. Y si
    # ya arrancó se deja como está, o el reajuste semanal de kcal lo reiniciaría
    # cada semana. Sin peso de partida tampoco hay plan que empezar.
    if user.goal == "maintain":
        user.plan_started_on = None
        user.plan_start_kg = None
    elif (
        user.goal in ("cut", "gain")
        and (user.goal_rate or 0) > 0
        and user.goal_weight_kg is not None
        and user.plan_started_on is None
        and kg is not None
    ):
        user.plan_started_on = date.today()
        user.plan_start_kg = kg
    await session.commit()
    await session.refresh(user)
    return TargetProfileOut.model_validate(user)


async def frozen_target(session: AsyncSession, user_id: int, day: date, fallback: float | None):
    """El objetivo de ese día: el congelado si lo hay, y si no se congela ahora.

    Se llama al leer el diario. Un día que nunca se leyó y ya pasó **no** recibe
    fila: no hubo objetivo congelado, y escribirlo hacia atrás sería inventarse
    lo que aquel día decía la pantalla.
    """
    fila = (
        await session.execute(
            select(DailyTarget).where(
                DailyTarget.user_id == user_id, DailyTarget.log_date == day
            )
        )
    ).scalar_one_or_none()
    if fila is not None:
        return fila.kcal
    if fallback is None or day != datetime.now(UTC).date():
        return fallback
    session.add(DailyTarget(user_id=user_id, log_date=day, kcal=fallback, source="manual"))
    await session.commit()
    return fallback
