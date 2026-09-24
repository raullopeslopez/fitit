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

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import get_current_user
from ..db import get_session
from ..food_groups import familia
from ..models import (
    BodyWeight,
    DailyTarget,
    Day,
    Dish,
    Food,
    LogEntry,
    Plan,
    PlanEntry,
    Rule,
    User,
)
from ..nutrition import NUTRIENTS, Ajustable, food_log_date, macros_de_plato
from ..planner import HUECOS, PlanImposible, PlatoCandidato, generar
from .dishes import registrar_plato
from ..rules import desde_fila
from ..schemas import (
    AdherenceOut,
    PlanEntryOut,
    PlanAheadOut,
    PlanEntryPatch,
    PlanEntryReplan,
    PlanIn,
    PlanOut,
    PlanSlotAheadOut,
    SlotAdherenceOut,
    VerdictOut,
)
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

    # Confirmar y cambiar escriben las dos en el diario; lo que cambia es **qué**
    # plato y con qué gramos. Saltárselo no escribe nada.
    escribe = payload.status == "done" or (payload.status == "swapped" and payload.dish_id)
    if escribe and fila.log_entry_id is None:
        moment = payload.logged_at or datetime.now(UTC)
        if food_log_date(moment) != fila.log_date:
            raise HTTPException(
                status_code=422,
                detail={"motivo": "sólo se confirma el día de hoy", "log_date": str(fila.log_date)},
            )
        cual = payload.dish_id or fila.dish_id
        dish = (
            await session.execute(
                select(Dish)
                .options(selectinload(Dish.ingredients))
                .where(Dish.id == cual, Dish.user_id == user_id)
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
        if payload.dish_id:
            # Lo que comiste no es lo que el plan pesó: los gramos congelados
            # son de **otro plato**. Se usa la receta del sustituto, una ración.
            raciones = dish.servings or 1
            gramos = [i.grams / raciones for i in dish.ingredients]
        else:
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


@router.get("/entries/ahead", response_model=PlanAheadOut)
async def entries_ahead(
    date_: date | None = Query(default=None, alias="date"),
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PlanAheadOut:
    """Los huecos de esta semana a los que todavía se puede llevar un plato.

    «Todavía» es **desde hoy** y **sin decir**: el pasado no se replanifica
    —cambiarlo reescribiría lo que el plan decía que ibas a comer— y una fila
    ya confirmada, saltada o cambiada ya tiene respuesta. Hoy entra entero: la
    cena de hoy aún no ha pasado a mediodía.

    `date` es el día alimentario del móvil (`foodDayIso()`), igual que en
    `GET /food-log`: es el móvil el que sabe en qué lado de las 04:00 está.
    """
    hoy = date_ or food_log_date(datetime.now(UTC))
    lunes = hoy - timedelta(days=hoy.weekday())
    plan = (
        await session.execute(
            select(Plan)
            .options(selectinload(Plan.entries))
            .where(Plan.user_id == user_id, Plan.week_start == lunes)
        )
    ).scalar_one_or_none()
    if plan is None:
        return PlanAheadOut(week_start=lunes, has_plan=False)

    filas = sorted(
        (f for f in plan.entries if f.status is None and f.log_date >= hoy),
        key=lambda f: (f.log_date, HUECOS.index(f.slot) if f.slot in HUECOS else len(HUECOS)),
    )
    ids = {f.dish_id for f in filas}
    nombres = {}
    if ids:
        nombres = dict(
            (await session.execute(select(Dish.id, Dish.name).where(Dish.id.in_(ids)))).all()
        )
    return PlanAheadOut(
        week_start=lunes,
        has_plan=True,
        entries=[
            PlanSlotAheadOut(
                id=f.id,
                log_date=f.log_date,
                slot=f.slot,
                dish_id=f.dish_id,
                dish_name=nombres.get(f.dish_id, ""),
            )
            for f in filas
        ],
    )


@router.put("/entries/{entry_id}/dish", response_model=PlanEntryOut)
async def replan_entry(
    entry_id: int,
    payload: PlanEntryReplan,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PlanEntryOut:
    """Poner otro plato en un hueco que todavía no ha pasado.

    **No es `swapped`.** Aquel es «hoy comí otra cosa»: escribe el diario y sólo
    vale para el día que estás viviendo. Esto cambia lo que el plan dice que vas
    a comer, así que no escribe nada y la fila sigue **por confirmar**: el día
    que toque se confirma o se salta como cualquier otra.

    Los gramos que se congelan son los de la receta, una ración — los mismos que
    usa `swapped` con un sustituto. Los que el generador había resuelto eran de
    **otro plato** y no significan nada para éste.
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

    hoy = payload.date or food_log_date(datetime.now(UTC))
    if fila.log_date < hoy:
        raise HTTPException(
            status_code=422,
            detail={"motivo": "ese día ya pasó", "log_date": str(fila.log_date)},
        )
    if fila.status is not None:
        raise HTTPException(
            status_code=409,
            detail={"motivo": "esa comida ya tiene respuesta", "status": fila.status},
        )

    dish = (
        await session.execute(
            select(Dish)
            .options(selectinload(Dish.ingredients))
            .where(Dish.id == payload.dish_id, Dish.user_id == user_id)
        )
    ).scalar_one_or_none()
    if dish is None:
        raise HTTPException(status_code=404, detail="dish not found")

    raciones = dish.servings or 1
    fila.dish_id = dish.id
    fila.grams_json = json.dumps([round(i.grams / raciones, 2) for i in dish.ingredients])
    await session.commit()
    await session.refresh(fila)

    return PlanEntryOut(
        id=fila.id,
        log_date=fila.log_date,
        slot=fila.slot,
        dish_id=fila.dish_id,
        dish_name=dish.name,
        grams=json.loads(fila.grams_json),
        status=fila.status,
        log_entry_id=fila.log_entry_id,
    )


# La banda dentro de la que comer no es fallar. Sin ella, 150 g planificados y
# 165 comidos se pintan como incumplimiento y la métrica deja de mirarse.
TOLERANCIA = 0.10

# Cuántas veces hay que caerse en el mismo hueco para llamarlo patrón. Una vez
# es un martes; dos ya es dónde se te rompe el plan.
MINIMO_PATRON = 2


@router.get("/{week_start}/adherence", response_model=AdherenceOut)
async def adherence(
    week_start: date,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AdherenceOut:
    """Cómo fue la semana, en las dos métricas que hacen falta.

    **La nutricional** —lo comido contra lo planificado— sólo mira los días
    **cerrados**: a media mañana diría 15 % y eso no sería cómo va la semana,
    sería la hora que es.

    **La literal** —filas confirmadas sobre filas de las que dijiste algo— mira
    la semana entera, y es la que permite decir dónde se cae el plan. Lo que no
    confirmaste **no cuenta como incumplido**: se cuenta aparte, callado, porque
    un plan que no confirmaste no es un plan roto.
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

    hoy = food_log_date(datetime.now(UTC))
    cerrados = [dia for dia in _semana(week_start) if dia < hoy]

    seguidas = sum(1 for f in plan.entries if f.status == "done")
    dichas = sum(1 for f in plan.entries if f.status)
    calladas = sum(1 for f in plan.entries if not f.status and f.log_date < hoy)
    por_venir = sum(1 for f in plan.entries if not f.status and f.log_date >= hoy)

    por_hueco: dict[str, dict[str, int]] = {}
    for fila in plan.entries:
        cuenta = por_hueco.setdefault(fila.slot, {"followed": 0, "decided": 0})
        if fila.status:
            cuenta["decided"] += 1
        if fila.status == "done":
            cuenta["followed"] += 1

    flojo = None
    fallos = 0
    for slot in HUECOS:
        cuenta = por_hueco.get(slot)
        if not cuenta:
            continue
        perdidas = cuenta["decided"] - cuenta["followed"]
        if perdidas >= MINIMO_PATRON and perdidas > fallos:
            flojo, fallos = slot, perdidas

    planificadas = None
    comidas = None
    dentro = None
    if cerrados:
        kcal = await _kcal_congeladas(session, plan)
        valores = [kcal.get(f.id) for f in plan.entries if f.log_date in cerrados]
        # Un `None` deja la suma desconocida, igual que en el diario: un total
        # parcial pintado como total mentiría del tamaño de lo que falta.
        planificadas = None if any(v is None for v in valores) else round(sum(valores), 2)

        filas = (
            await session.execute(
                select(LogEntry.kcal).where(
                    LogEntry.user_id == user_id, LogEntry.log_date.in_(cerrados)
                )
            )
        ).scalars().all()
        comidas = None if any(v is None for v in filas) else round(sum(filas), 2)

        if planificadas and comidas is not None:
            dentro = abs(comidas - planificadas) <= planificadas * TOLERANCIA

    return AdherenceOut(
        week_start=week_start,
        days=len(cerrados),
        eaten_kcal=comidas,
        planned_kcal=planificadas,
        within_tolerance=dentro,
        followed=seguidas,
        decided=dichas,
        silent=calladas,
        pending=por_venir,
        by_slot=[
            SlotAdherenceOut(slot=slot, **por_hueco[slot]) for slot in HUECOS if slot in por_hueco
        ],
        weakest_slot=flojo,
        weakest_missed=fallos,
    )
