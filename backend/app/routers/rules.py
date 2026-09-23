"""Las reglas que sigues, y el veredicto de un día.

El motor vive en `app/rules.py`: el catálogo cerrado, los seis evaluadores y la
regla del `NULL`. Aquí se leen los datos que necesita —el día, la semana, tu
peso, si entrenaste— y se traduce.
"""

import json
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..db import get_session
from ..food_groups import familia
from ..models import BodyWeight, Day, Dish, Food, LogEntry, Rule
from ..rules import Comida, Contexto, Dia, RuleRefused, aceptable, desde_fila, evaluar, validar
from ..schemas import DayVerdictsOut, RuleIn, RuleOut, RulePatch, VerdictOut
from ..weight import tendencia

router = APIRouter(prefix="/rules", tags=["rules"])


def _to_out(row: Rule) -> RuleOut:
    return RuleOut(
        id=row.id,
        type=row.type,
        scope=row.scope,
        slot=row.slot,
        day_condition=row.day_condition,
        hardness=row.hardness,
        params=json.loads(row.params_json),
        active_from=row.active_from,
        active_to=row.active_to,
    )


def _as_dict(row: Rule) -> dict:
    return desde_fila(row)


@router.post("", response_model=RuleOut, status_code=status.HTTP_201_CREATED)
async def create_rule(
    payload: RuleIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RuleOut:
    """Guarda una regla, si la app sabe juzgarla.

    El catálogo es cerrado a propósito: una regla que nadie sabe evaluar no
    debe llegar a la base de datos, porque acabaría pintada en una pantalla
    diciendo algo que no se ha comprobado.
    """
    candidata = payload.model_dump()
    try:
        validar(candidata)
    except RuleRefused as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    row = Rule(
        user_id=user_id,
        type=payload.type,
        scope=payload.scope,
        slot=payload.slot,
        day_condition=payload.day_condition,
        hardness=payload.hardness,
        params_json=json.dumps(payload.params, sort_keys=True),
        active_from=datetime.now(UTC).date(),
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _to_out(row)


@router.get("", response_model=list[RuleOut])
async def list_rules(
    include_retired: bool = False,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[RuleOut]:
    """Tus reglas. Por defecto, las que siguen vigentes."""
    query = select(Rule).where(Rule.user_id == user_id)
    if not include_retired:
        hoy = datetime.now(UTC).date()
        query = query.where(or_(Rule.active_to.is_(None), Rule.active_to >= hoy))
    rows = (await session.execute(query.order_by(Rule.id))).scalars().all()
    return [_to_out(row) for row in rows]


@router.patch("/{rule_id}", response_model=RuleOut)
async def correct_rule(
    rule_id: int,
    payload: RulePatch,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RuleOut:
    """Corrige o retira. **No hay `DELETE`**: retirarla es ponerle fecha de fin,
    para que el pasado siga juzgado como se juzgó."""
    row = (
        await session.execute(select(Rule).where(Rule.id == rule_id, Rule.user_id == user_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="rule not found")

    fields = payload.model_dump(exclude_unset=True)
    if "params" in fields:
        candidata = {**_as_dict(row), "params": fields["params"]}
        try:
            validar(candidata)
        except RuleRefused as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        row.params_json = json.dumps(fields["params"], sort_keys=True)
    if "hardness" in fields:
        row.hardness = fields["hardness"]
    if "active_to" in fields:
        row.active_to = fields["active_to"]

    await session.commit()
    await session.refresh(row)
    return _to_out(row)


async def _dia(session: AsyncSession, user_id: int, day: date) -> Dia:
    """Un día, con lo que las reglas necesitan mirar."""
    entries = (
        await session.execute(
            select(LogEntry).where(LogEntry.user_id == user_id, LogEntry.log_date == day)
        )
    ).scalars().all()

    ids = {e.food_id for e in entries if e.food_id}
    familias_por_food: dict[int, str | None] = {}
    if ids:
        for food in (
            await session.execute(select(Food).where(Food.id.in_(ids)))
        ).scalars().all():
            familias_por_food[food.id] = familia(food.subgroup_code)

    por_slot: dict[str | None, list[LogEntry]] = {}
    for entry in entries:
        por_slot.setdefault(entry.meal_slot, []).append(entry)

    comidas = tuple(
        Comida(
            slot=slot,
            # `None` es **sin clasificar**, nunca «de ninguna familia»: un
            # alimento que diste de alta a mano no trae grupo.
            familias=tuple(familias_por_food.get(e.food_id) for e in filas),
            # `None` en cuanto una entrada no suma: un subtotal parcial
            # pintado como total mentiría del tamaño de lo que falta.
            kcal=None if any(e.kcal is None for e in filas) else sum(e.kcal for e in filas),
        )
        for slot, filas in por_slot.items()
    )

    macros: dict = {}
    for campo in ("kcal", "protein", "fat", "carbs", "fiber"):
        valores = [getattr(e, campo) for e in entries]
        macros[campo] = None if any(v is None for v in valores) or not valores else sum(valores)

    dish_ids = {e.dish_id for e in entries if e.dish_id}
    metodos: tuple[str, ...] = ()
    if dish_ids:
        metodos = tuple(
            m
            for m in (
                await session.execute(select(Dish.method).where(Dish.id.in_(dish_ids)))
            ).scalars().all()
            if m
        )

    entrenado = (
        await session.execute(select(Day.id).where(Day.user_id == user_id, Day.date == day))
    ).scalar_one_or_none() is not None

    return Dia(fecha=day, entrenado=entrenado, macros=macros, comidas=comidas, metodos=metodos)


@router.get("/verdicts", response_model=DayVerdictsOut)
async def verdicts(
    day: date | None = None,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DayVerdictsOut:
    """Qué dicen tus reglas de un día."""
    day = day or datetime.now(UTC).date()

    rows = (
        await session.execute(
            select(Rule).where(
                Rule.user_id == user_id,
                Rule.active_from <= day,
                or_(Rule.active_to.is_(None), Rule.active_to >= day),
            )
        )
    ).scalars().all()
    reglas = [_as_dict(row) for row in rows]

    hoy = await _dia(session, user_id, day)
    # La semana que contiene el día, de lunes a domingo: es la unidad en la que
    # se planifica, y la que una regla semanal está contando.
    lunes = day - timedelta(days=day.weekday())
    semana = tuple(
        [await _dia(session, user_id, lunes + timedelta(days=i)) for i in range(7)]
    )

    pesadas = (
        await session.execute(
            select(BodyWeight.measured_on, BodyWeight.kg).where(BodyWeight.user_id == user_id)
        )
    ).all()
    peso = tendencia([(d, kg) for d, kg in pesadas])

    resultados = evaluar(reglas, Contexto(dia=hoy, semana=semana, kg=peso.kg))
    return DayVerdictsOut(
        date=day,
        verdicts=[VerdictOut(**vars(v)) for v in resultados],
        acceptable=aceptable(resultados),
    )
