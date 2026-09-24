"""La semana generada.

Este router lee, escribe y traduce; **el generador no vive aquí**, vive en
`app/planner.py`, y la aritmética en `nutrition.py`. Lo único que se decide en
este fichero es de dónde salen los cuatro datos que el generador necesita: qué
platos hay, qué objetivo tiene cada día, qué reglas están vigentes y qué se
comió la semana pasada.

Un plan **se guarda con su semilla**. Sin ella no se puede volver a obtener, y
entonces «regenerar con una regla nueva y comparar las dos semanas» no existe:
sólo habría una semana nueva sin nada con que medirla.
"""

import json
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import get_current_user
from ..db import get_session
from ..food_groups import familia
from ..models import BodyWeight, DailyTarget, Day, Dish, Food, Plan, PlanEntry, Rule, User
from ..nutrition import NUTRIENTS, Ajustable, food_log_date, macros_de_plato
from ..planner import HUECOS, PlanImposible, PlatoCandidato, generar
from .dishes import registrar_plato
from ..rules import desde_fila
from ..schemas import PlanEntryOut, PlanEntryPatch, PlanIn, PlanOut, VerdictOut
from ..weight import tendencia

router = APIRouter(prefix="/plans", tags=["plans"])

DIAS = 7

# Cuántas semanas atrás se mira para saber qué días entrenas. Cuatro es un mes:
# suficiente para que un patrón se vea y poco para que un cambio de rutina se
# note pronto.
SEMANAS_DE_RUTINA = 4

# Cuántas de esas cuatro hacen falta para dar un día por habitual. Con una sola
# vez no es una rutina, es una tarde.
MINIMO_PARA_RUTINA = 2


def _semana(inicio: date) -> list[date]:
    return [inicio + timedelta(days=i) for i in range(DIAS)]


@dataclass(frozen=True)
class Repertorio:
    """Los platos como los ve el generador, y con qué volver a la receta.

    `base` son los gramos por ración de **cada** ingrediente, en orden, y
    `movibles` dice cuáles de ellos llevan banda. Con las dos, los gramos que el
    generador resolvió se vuelven a poner en su sitio dentro de la receta — que
    es lo que hay que congelar, no sólo la parte que se movió.
    """

    candidatos: list[PlatoCandidato]
    base: dict[int, list[float]]
    movibles: dict[int, list[int]]

    def completos(self, dish_id: int, resueltos) -> list[float]:
        gramos = list(self.base.get(dish_id, []))
        for posicion, g in zip(self.movibles.get(dish_id, []), resueltos):
            gramos[posicion] = g
        return gramos


async def _candidatos(session: AsyncSession, user_id: int) -> Repertorio:
    """Los platos, vistos como el generador los necesita.

    Todo se expresa **por ración**: los gramos de la receta y su banda se
    dividen entre las raciones, porque lo que el plan propone es una ración. Un
    plato de cuatro raciones con 400 g de arroz y banda 200–800 entra como 100 g
    con banda 50–200.
    """
    dishes = (
        (
            await session.execute(
                select(Dish).options(selectinload(Dish.ingredients)).where(Dish.user_id == user_id)
            )
        )
        .scalars()
        .all()
    )

    ids = {i.food_id for d in dishes for i in d.ingredients}
    foods: dict[int, Food] = {}
    if ids:
        foods = {
            food.id: food
            for food in (await session.execute(select(Food).where(Food.id.in_(ids))))
            .scalars()
            .all()
        }

    candidatos = []
    base: dict[int, list[float]] = {}
    movibles: dict[int, list[int]] = {}
    for dish in dishes:
        raciones = dish.servings or 1
        fijos: list[tuple[Food, float]] = []
        ajustables: list[Ajustable] = []
        familias: list[str | None] = []
        base[dish.id] = []
        movibles[dish.id] = []
        for ing in dish.ingredients:
            food = foods.get(ing.food_id)
            if food is None:
                continue
            familias.append(familia(food.subgroup_code))
            gramos = ing.grams / raciones
            if gramos <= 0:
                continue
            base[dish.id].append(gramos)
            if ing.min_grams is None and ing.max_grams is None:
                # Sin banda no es «desconocido»: es que nadie ha dicho que se
                # pueda tocar, y se queda donde la receta lo puso.
                fijos.append((food, gramos))
                continue
            movibles[dish.id].append(len(base[dish.id]) - 1)
            ajustables.append(
                Ajustable(
                    por_100g={campo: getattr(food, f"{campo}_100g", None) for campo in NUTRIENTS},
                    gramos=gramos,
                    minimo=(ing.min_grams or 0.0) / raciones,
                    maximo=(ing.max_grams or ing.grams) / raciones,
                )
            )
        # `{}` y no los totales de una lista vacía: un plato sin nada fijo
        # aporta **cero**, no «no se sabe». La diferencia la lee
        # `ajustar_gramos`, y confundirlas dejaría el día sin nada que perseguir.
        fijo = macros_de_plato(fijos)[0] if fijos else {}
        candidatos.append(
            PlatoCandidato(
                id=dish.id,
                nombre=dish.name,
                slots=tuple(dish.slots.split(",")) if dish.slots else (),
                metodo=dish.method,
                familias=tuple(familias),
                bloque=dish.is_block,
                fijo=fijo,
                ajustables=tuple(ajustables),
            )
        )
    return Repertorio(candidatos=candidatos, base=base, movibles=movibles)


async def _objetivos(session: AsyncSession, user_id: int, dias) -> dict[date, dict]:
    """El objetivo de cada día: el congelado manda sobre el del perfil.

    `daily_targets` sólo congela las kcal; el reparto en macros es de las
    reglas y vive en el perfil. Un macro que nadie ha fijado **no aparece**, y
    así no dirige el ajuste: `None` es «no lo he dicho», no «que salga cero».
    """
    user = await session.get(User, user_id)
    base = {
        "kcal": user.objetivo_kcal,
        "protein": user.objetivo_proteina,
        "fat": user.objetivo_grasa,
        "carbs": user.objetivo_hidratos,
    }
    congelados = {
        fila.log_date: fila.kcal
        for fila in (
            await session.execute(
                select(DailyTarget).where(
                    DailyTarget.user_id == user_id, DailyTarget.log_date.in_(dias)
                )
            )
        )
        .scalars()
        .all()
    }
    objetivos = {}
    for dia in dias:
        valores = dict(base)
        if congelados.get(dia) is not None:
            valores["kcal"] = congelados[dia]
        objetivos[dia] = {k: v for k, v in valores.items() if v is not None}
    return objetivos


async def _reglas(session: AsyncSession, user_id: int, dias) -> list[dict]:
    filas = (
        (
            await session.execute(
                select(Rule).where(
                    Rule.user_id == user_id,
                    Rule.active_from <= dias[-1],
                    (Rule.active_to.is_(None)) | (Rule.active_to >= dias[0]),
                )
            )
        )
        .scalars()
        .all()
    )
    return [desde_fila(fila) for fila in filas]


async def _entrenos(session: AsyncSession, user_id: int, dias) -> set[date]:
    """Qué días de esta semana vas a entrenar.

    Un plan mira hacia delante y el diario sólo sabe del pasado, así que esto es
    una **predicción** y se dice: el día de la semana que has entrenado al menos
    dos de las últimas cuatro. Los días ya pasados no se predicen, se saben.
    """
    desde = dias[0] - timedelta(weeks=SEMANAS_DE_RUTINA)
    pasados = (
        (
            await session.execute(
                select(Day.date).where(
                    Day.user_id == user_id, Day.date >= desde, Day.date <= dias[-1]
                )
            )
        )
        .scalars()
        .all()
    )
    cuenta = Counter(d.weekday() for d in pasados if d < dias[0])
    habituales = {wd for wd, n in cuenta.items() if n >= MINIMO_PARA_RUTINA}
    reales = set(pasados)
    return {d for d in dias if d in reales or d.weekday() in habituales}


async def _historial(session: AsyncSession, user_id: int, inicio: date) -> dict[int, date]:
    """Qué plato se planificó por última vez, y cuándo.

    Sin esto el generador puede cumplir «no repetir dentro de la semana» y
    devolverte la misma semana otra vez.
    """
    filas = (
        await session.execute(
            select(PlanEntry.dish_id, PlanEntry.log_date)
            .join(Plan, Plan.id == PlanEntry.plan_id)
            .where(
                Plan.user_id == user_id,
                PlanEntry.log_date < inicio,
                PlanEntry.log_date >= inicio - timedelta(days=2 * DIAS),
            )
        )
    ).all()
    ultimo: dict[int, date] = {}
    for dish_id, fecha in filas:
        if dish_id not in ultimo or fecha > ultimo[dish_id]:
            ultimo[dish_id] = fecha
    return ultimo


async def _peso(session: AsyncSession, user_id: int) -> float | None:
    pesadas = (
        await session.execute(
            select(BodyWeight.measured_on, BodyWeight.kg).where(BodyWeight.user_id == user_id)
        )
    ).all()
    return tendencia([(d, kg) for d, kg in pesadas]).kg


async def _kcal_congeladas(session: AsyncSession, plan: Plan) -> dict[int, float | None]:
    """Lo que suma cada fila del plan, con los gramos que congeló.

    Se recalcula desde los gramos guardados y no desde la receta: es la misma
    distinción que en el diario — lo que el plan dijo no se vuelve a derivar de
    un plato que puede haber cambiado desde entonces.
    """
    ids = {fila.dish_id for fila in plan.entries}
    if not ids:
        return {}
    dishes = {
        dish.id: dish
        for dish in (
            await session.execute(
                select(Dish).options(selectinload(Dish.ingredients)).where(Dish.id.in_(ids))
            )
        ).scalars().all()
    }
    food_ids = {i.food_id for dish in dishes.values() for i in dish.ingredients}
    foods = {
        food.id: food
        for food in (
            await session.execute(select(Food).where(Food.id.in_(food_ids)))
        ).scalars().all()
    }
    kcal: dict[int, float | None] = {}
    for fila in plan.entries:
        dish = dishes.get(fila.dish_id)
        gramos = json.loads(fila.grams_json) if fila.grams_json else []
        if dish is None or not gramos:
            kcal[fila.id] = None
            continue
        pares = [
            (foods[i.food_id], g)
            for i, g in zip(dish.ingredients, gramos)
            if i.food_id in foods and g > 0
        ]
        kcal[fila.id] = macros_de_plato(pares)[0].get("kcal") if pares else None
    return kcal


def _to_out(
    plan: Plan,
    nombres: dict[int, str],
    veredictos,
    score: float,
    kcal: dict[int, float | None] | None = None,
) -> PlanOut:
    return PlanOut(
        id=plan.id,
        week_start=plan.week_start,
        seed=plan.seed,
        entries=[
            PlanEntryOut(
                id=fila.id,
                log_date=fila.log_date,
                slot=fila.slot,
                dish_id=fila.dish_id,
                dish_name=nombres.get(fila.dish_id, ""),
                grams=json.loads(fila.grams_json) if fila.grams_json else [],
                kcal=(kcal or {}).get(fila.id),
                status=fila.status,
                log_entry_id=fila.log_entry_id,
            )
            for fila in plan.entries
        ],
        verdicts=[VerdictOut(**vars(v)) for v in veredictos],
        score=score,
    )


@router.post("", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
async def generate_plan(
    payload: PlanIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PlanOut:
    """Genera la semana y la guarda, pisando la que hubiera para esa semana.

    Pisar y no acumular es a propósito: dos planes para el mismo lunes serían
    dos verdades sobre el mismo día, y la pantalla tendría que elegir una sin
    criterio. Lo que sí se conserva es la semilla, que es lo que permite volver.
    """
    dias = _semana(payload.week_start)
    repertorio = await _candidatos(session, user_id)
    if not repertorio.candidatos:
        raise HTTPException(
            status_code=422,
            detail={"slot": None, "motivo": "no hay platos en el repertorio"},
        )

    seed = payload.seed if payload.seed is not None else payload.week_start.toordinal()
    try:
        propuesta = generar(
            dias=dias,
            candidatos=repertorio.candidatos,
            objetivos=await _objetivos(session, user_id, dias),
            reglas=await _reglas(session, user_id, dias),
            entrenos=await _entrenos(session, user_id, dias),
            historial=await _historial(session, user_id, payload.week_start),
            kg=await _peso(session, user_id),
            seed=seed,
        )
    except PlanImposible as refusal:
        # 422 y no 500: no poder llenar un hueco es una respuesta, y lleva
        # dentro lo único que se puede hacer al respecto — qué hueco es.
        raise HTTPException(
            status_code=422, detail={"slot": refusal.slot, "motivo": refusal.motivo}
        ) from refusal

    anterior = (
        await session.execute(
            select(Plan).where(Plan.user_id == user_id, Plan.week_start == payload.week_start)
        )
    ).scalar_one_or_none()
    if anterior is not None:
        await session.delete(anterior)
        await session.flush()

    plan = Plan(
        user_id=user_id,
        week_start=payload.week_start,
        seed=seed,
        entries=[
            PlanEntry(
                log_date=entrada.fecha,
                slot=entrada.slot,
                dish_id=entrada.dish_id,
                # Los gramos de **todos** los ingredientes, no sólo de los que
                # se movieron: el plan congela lo que dijo, y reconstruirlo
                # mañana desde la receta daría otra cifra porque el objetivo
                # se mueve con el peso.
                grams_json=json.dumps(repertorio.completos(entrada.dish_id, entrada.gramos)),
            )
            for entrada in propuesta.entradas
        ],
    )
    session.add(plan)
    await session.commit()
    await session.refresh(plan, ["entries"])

    nombres = {plato.id: plato.nombre for plato in repertorio.candidatos}
    return _to_out(
        plan,
        nombres,
        propuesta.veredictos,
        propuesta.puntuacion,
        await _kcal_congeladas(session, plan),
    )


@router.get("/{week_start}", response_model=PlanOut)
async def read_plan(
    week_start: date,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PlanOut:
    """El plan guardado de esa semana, tal y como se generó.

    No regenera: un plan es un compromiso adquirido por adelantado, y uno que
    cambiara al mirarlo no sería un plan. Los veredictos no se recalculan aquí
    por lo mismo — llegan vacíos, y quien quiera juzgar la semana de hoy tiene
    `GET /rules/verdicts`, que mira lo que de verdad has comido.
    """
    plan = (
        await session.execute(
            select(Plan)
            .options(selectinload(Plan.entries))
            .where(Plan.user_id == user_id, Plan.week_start == week_start)
        )
    ).scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=404, detail="plan not found")

    ids = {fila.dish_id for fila in plan.entries}
    nombres = {}
    if ids:
        nombres = dict(
            (await session.execute(select(Dish.id, Dish.name).where(Dish.id.in_(ids)))).all()
        )
    return _to_out(plan, nombres, (), 0.0, await _kcal_congeladas(session, plan))


__all__ = ["HUECOS", "router"]


@router.patch("/entries/{entry_id}", response_model=PlanEntryOut)
async def correct_entry(
    entry_id: int,
    payload: PlanEntryPatch,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PlanEntryOut:
    """Confirmar, saltar o cambiar una comida del plan.

    Confirmar **escribe el diario con los gramos que el plan congeló**, no con
    los de la receta: entre que se generó la semana y hoy, el objetivo ha podido
    moverse, y recalcularlos aquí haría que comieras una cifra distinta de la
    que el plan te enseñó.

    Confirmar dos veces no escribe dos veces. Y sólo se confirma **el día que
    estás viviendo**: una entrada del diario se fecha por el instante en que la
    escribes (la regla de las 04:00), así que dar por comida la cena del viernes
    un lunes pondría comida del viernes en el lunes.
    """
    fila = (
        await session.execute(
            select(PlanEntry)
            .join(Plan, Plan.id == PlanEntry.plan_id)
            .where(PlanEntry.id == entry_id, Plan.user_id == user_id)
        )
    ).scalar_one_or_none()
    if fila is None:
        raise HTTPException(status_code=404, detail="plan entry not found")

    if payload.status == "done" and fila.log_entry_id is None:
        moment = payload.logged_at or datetime.now(UTC)
        if food_log_date(moment) != fila.log_date:
            raise HTTPException(
                status_code=422,
                detail={"motivo": "sólo se confirma el día de hoy", "log_date": str(fila.log_date)},
            )
        dish = (
            await session.execute(
                select(Dish)
                .options(selectinload(Dish.ingredients))
                .where(Dish.id == fila.dish_id, Dish.user_id == user_id)
            )
        ).scalar_one_or_none()
        if dish is None:
            raise HTTPException(status_code=404, detail="dish not found")
        ids = [i.food_id for i in dish.ingredients]
        foods = {
            food.id: food
            for food in (
                await session.execute(select(Food).where(Food.id.in_(ids)))
            ).scalars().all()
        }
        gramos = json.loads(fila.grams_json) if fila.grams_json else []
        entries = await registrar_plato(
            session,
            dish=dish,
            foods=foods,
            user_id=user_id,
            moment=moment,
            meal_slot=fila.slot,
            gramos=gramos,
        )
        await session.flush()
        # La primera de las filas que escribió esta confirmación. Es el asa de
        # lo registrado: el grupo entero se reconoce por `dish_id` y el día,
        # igual que el diario ya agrupa un plato en pantalla.
        fila.log_entry_id = entries[0].id if entries else None

    fila.status = payload.status
    await session.commit()
    await session.refresh(fila)

    nombre = (
        await session.execute(select(Dish.name).where(Dish.id == fila.dish_id))
    ).scalar_one_or_none()
    return PlanEntryOut(
        id=fila.id,
        log_date=fila.log_date,
        slot=fila.slot,
        dish_id=fila.dish_id,
        dish_name=nombre or "",
        grams=json.loads(fila.grams_json) if fila.grams_json else [],
        status=fila.status,
        log_entry_id=fila.log_entry_id,
    )
