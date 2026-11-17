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
import logging
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .. import compra
from ..auth import get_current_user
from ..db import get_session
from ..despensa import alimentos_en_casa
from ..food_groups import familia
from ..models import (
    BodyWeight,
    DailyTarget,
    Day,
    Dish,
    DishIngredient,
    Food,
    LogEntry,
    Pauta,
    Plan,
    PlanEntry,
    Rule,
    User,
    visible_portions,
)
from ..nutrition import NUTRIENTS, Ajustable, calcular_nutrientes, dump_nutrients, food_log_date, macros_de_plato
from ..nutrition import gramos_de_fraccion, hidrato_del_entreno, medida_de_pieza
from ..planner import (
    HUECOS,
    PlanImposible,
    PlatoCandidato,
    ajustar_comida,
    generar,
    peso_en_casa,
    reajustar_dia,
)
from ..shopping import lista
from ..taski import Taski, get_taski, pendientes
from ..taski import Unreachable as TaskiUnreachable
from .dishes import registrar_plato
from .ideas import ideas_available
from ..config import settings
from ..dish_draft import build_draft_lines
from ..gemini import LabelUnreadable, estimate_meal
from ..llm_quota import spend_llm_call
from ..naming import fold_exercise_name
from ..rules import desde_fila
from ..schemas import (
    AdherenceOut,
    ShoppingListOut,
    ShoppingOut,
    ShoppingToTaskiIn,
    ShoppingToTaskiOut,
    PlanEntryOut,
    PlanDesvioOut,
    PlanItemOut,
    PlanAheadOut,
    PlanEntryPatch,
    DraftFoodOut,
    DraftLineOut,
    OutEstimateIn,
    OutEstimateOut,
    PlanEntryReplan,
    PlanIn,
    PlanOut,
    PlanSlotAheadOut,
    SlotAdherenceOut,
    VerdictOut,
)
from ..weight import tendencia

log = logging.getLogger("uvicorn.error")
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


# La banda que reciben los ingredientes de un plato de la pauta cuando nadie le
# puso una: entre la mitad y el doble de la receta. La pauta dice qué comer, no
# cuánto, y su receta da las proporciones; sin banda, «a la plancha con 150 g»
# se quedaría en 150 g aunque el día pidiera el doble. La mitad y el doble y no
# más: por debajo deja de ser el plato, y por encima es otra comida.
HOLGURA_PAUTA = (0.5, 2.0)


async def _candidatos(
    session: AsyncSession,
    user_id: int,
    holgura: frozenset[int] = frozenset(),
    en_casa: frozenset[int] = frozenset(),
) -> Repertorio:
    """Los platos, vistos como el generador los necesita.

    Todo se expresa **por ración**: los gramos de la receta y su banda se
    dividen entre las raciones, porque lo que el plan propone es una ración. Un
    plato de cuatro raciones con 400 g de arroz y banda 200–800 entra como 100 g
    con banda 50–200.

    Los platos de `holgura` —los que fija la pauta— mueven también lo que no
    tiene banda, dentro de `HOLGURA_PAUTA`.
    """
    dishes = (
        (
            await session.execute(
                select(Dish)
                .options(selectinload(Dish.ingredients))
                # Tus sitios son platos `fuera`: dónde comiste, no qué cocinas.
                # El generador no los baraja (fase 4 los reserva aparte).
                .where(Dish.user_id == user_id, Dish.kind == "casa")
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
            sin_banda = ing.min_grams is None and ing.max_grams is None
            if sin_banda and dish.id in holgura:
                movibles[dish.id].append(len(base[dish.id]) - 1)
                ajustables.append(
                    Ajustable(
                        por_100g={campo: getattr(food, f"{campo}_100g", None) for campo in NUTRIENTS},
                        gramos=gramos,
                        minimo=gramos * HOLGURA_PAUTA[0],
                        maximo=gramos * HOLGURA_PAUTA[1],
                    )
                )
                continue
            if sin_banda:
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
                # Fase 6.2: lo que hay en casa pesa más al elegir.
                puntuacion=peso_en_casa([i.food_id for i in dish.ingredients], en_casa),
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
    return (await _congelado(session, plan))[0]


async def _congelado(
    session: AsyncSession, plan: Plan
) -> tuple[dict[int, float | None], dict[int, list[PlanItemOut]], dict[int, dict | None]]:
    """Lo que suma cada fila del plan, y qué lleva, con los gramos que congeló.

    Se recalcula desde los gramos guardados y no desde la receta: es la misma
    distinción que en el diario — lo que el plan dijo no se vuelve a derivar de
    un plato que puede haber cambiado desde entonces.
    """
    ids = {fila.dish_id for fila in plan.entries}
    if not ids:
        return {}, {}, {}
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
            await session.execute(
                select(Food).options(selectinload(Food.portions)).where(Food.id.in_(food_ids))
            )
        ).scalars().all()
    }
    kcal: dict[int, float | None] = {}
    items: dict[int, list[PlanItemOut]] = {}
    macros: dict[int, dict | None] = {}
    for fila in plan.entries:
        dish = dishes.get(fila.dish_id)
        gramos = json.loads(fila.grams_json) if fila.grams_json else []
        if dish is None or not gramos:
            kcal[fila.id] = None
            items[fila.id] = []
            macros[fila.id] = None
            continue
        pares = [
            (foods[i.food_id], g)
            for i, g in zip(dish.ingredients, gramos)
            if i.food_id in foods and g > 0
        ]
        macros[fila.id] = macros_de_plato(pares)[0] if pares else None
        kcal[fila.id] = macros[fila.id].get("kcal") if macros[fila.id] else None
        items[fila.id] = [
            PlanItemOut(food_name=food.name, grams=g, measure=_en_piezas(food, g, plan.user_id))
            for food, g in pares
        ]
    return kcal, items, macros


def _en_piezas(food: Food, gramos: float, user_id: int) -> str | None:
    """«2 huevos»: la ración de pieza del alimento —la tuya antes que la del
    catálogo, y la marcada por defecto antes que otra—, o `None`."""
    raciones = sorted(
        visible_portions(food, user_id), key=lambda p: (p.user_id is None, not p.is_default)
    )
    if not raciones:
        return None
    return medida_de_pieza(gramos, raciones[0].grams, raciones[0].label)


def _desvios(plan: Plan, macros: dict[int, dict | None], objetivos: dict) -> list[PlanDesvioOut]:
    """Los días que se salen de su objetivo más allá de `TOLERANCIA`.

    Un día con un plato desconocido en un nutriente no dice nada de ese
    nutriente: una suma parcial comparada con el objetivo avisaría de una falta
    que puede no existir (la regla del `NULL`).
    """
    por_dia: dict[date, list[dict | None]] = {}
    for fila in plan.entries:
        por_dia.setdefault(fila.log_date, []).append(macros.get(fila.id))
    desvios = []
    for dia in sorted(por_dia):
        filas = por_dia[dia]
        objetivo = objetivos.get(dia, {})
        for nutriente in ("kcal", "protein", "fat", "carbs"):
            meta = objetivo.get(nutriente)
            if not meta:
                continue
            valores = [f.get(nutriente) if f else None for f in filas]
            if any(v is None for v in valores):
                continue
            diff = sum(valores) - meta
            if abs(diff) > meta * TOLERANCIA:
                desvios.append(PlanDesvioOut(log_date=dia, nutrient=nutriente, diff=round(diff)))
    return desvios


async def _pauta_vigente(session: AsyncSession, user_id: int, week_start: date) -> Pauta | None:
    """La pauta que manda en esa semana: la más reciente que ya había empezado."""
    return (
        await session.execute(
            select(Pauta)
            .options(selectinload(Pauta.entries))
            .where(Pauta.user_id == user_id, Pauta.active_from <= week_start)
            .order_by(Pauta.active_from.desc(), Pauta.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


def _to_out(
    plan: Plan,
    nombres: dict[int, str],
    veredictos,
    score: float,
    kcal: dict[int, float | None] | None = None,
    items: dict[int, list[PlanItemOut]] | None = None,
    *,
    has_pauta: bool = False,
    macros: dict[int, dict | None] | None = None,
    desvios: list[PlanDesvioOut] | None = None,
    sitios: frozenset[int] = frozenset(),
    shopping: ShoppingOut | None = None,
) -> PlanOut:
    return PlanOut(
        id=plan.id,
        week_start=plan.week_start,
        seed=plan.seed,
        has_pauta=has_pauta,
        dish_ideas=ideas_available(),
        desvios=desvios or [],
        entries=[
            PlanEntryOut(
                id=fila.id,
                log_date=fila.log_date,
                slot=fila.slot,
                dish_id=fila.dish_id,
                dish_name=nombres.get(fila.dish_id, ""),
                grams=json.loads(fila.grams_json) if fila.grams_json else [],
                kcal=(kcal or {}).get(fila.id),
                items=(items or {}).get(fila.id, []),
                status=fila.status,
                log_entry_id=fila.log_entry_id,
                place=fila.dish_id in sitios,
                carbs_shift=fila.carbs_shift,
                protein=((macros or {}).get(fila.id) or {}).get("protein"),
                carbs=((macros or {}).get(fila.id) or {}).get("carbs"),
                fat=((macros or {}).get(fila.id) or {}).get("fat"),
            )
            for fila in plan.entries
        ],
        verdicts=[VerdictOut(**vars(v)) for v in veredictos],
        score=score,
        shopping=shopping,
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
    pauta = await _pauta_vigente(session, user_id, payload.week_start)
    fijados = {(e.weekday, e.slot): e.dish_id for e in pauta.entries} if pauta else {}
    repertorio = await _candidatos(
        session,
        user_id,
        frozenset(fijados.values()),
        frozenset(await alimentos_en_casa(session, user_id)),
    )
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
            fijados=fijados,
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
    kcal, items, macros = await _congelado(session, plan)
    return _to_out(
        plan,
        nombres,
        propuesta.veredictos,
        propuesta.puntuacion,
        kcal,
        items,
        has_pauta=pauta is not None,
        macros=macros,
        desvios=_desvios(plan, macros, await _objetivos(session, user_id, dias)),
        shopping=await compra.de_la_semana(session, user_id, payload.week_start),
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
    sitios: set[int] = set()
    if ids:
        for dish_id, name, kind in (
            await session.execute(select(Dish.id, Dish.name, Dish.kind).where(Dish.id.in_(ids)))
        ).all():
            nombres[dish_id] = name
            if kind == "fuera":
                sitios.add(dish_id)
    kcal, items, macros = await _congelado(session, plan)
    return _to_out(
        plan,
        nombres,
        (),
        0.0,
        kcal,
        items,
        has_pauta=await _pauta_vigente(session, user_id, week_start) is not None,
        macros=macros,
        desvios=_desvios(plan, macros, await _objetivos(session, user_id, _semana(week_start))),
        sitios=frozenset(sitios),
        shopping=await compra.de_la_semana(session, user_id, week_start),
    )


async def _lista_de(session: AsyncSession, user_id: int, week_start: date):
    """La lista de una semana planificada, por pasillo. 404 si no se planificó."""
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
    platos = {
        dish.id: dish
        for dish in (
            await session.execute(
                select(Dish).options(selectinload(Dish.ingredients)).where(Dish.id.in_(ids))
            )
        ).scalars()
    } if ids else {}
    food_ids = {i.food_id for dish in platos.values() for i in dish.ingredients}
    foods = {
        food.id: food
        for food in (await session.execute(select(Food).where(Food.id.in_(food_ids)))).scalars()
    } if food_ids else {}
    # Una comida fuera reservada no se compra: la cocina otro.
    de_casa = [fila for fila in plan.entries if getattr(platos.get(fila.dish_id), "kind", None) == "casa"]
    return lista(de_casa, platos, foods)


@router.get("/{week_start}/shopping", response_model=ShoppingListOut)
async def shopping_list(
    week_start: date,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ShoppingListOut:
    """Lo que hay que comprar para la semana planificada, por pasillo.

    Sale de los gramos que el plan congeló en cada comida, no de las recetas:
    es lo que la semana dice que vas a comer. El cálculo es de `app/shopping.py`.
    """
    por_pasillo = await _lista_de(session, user_id, week_start)
    return ShoppingListOut(
        week_start=week_start,
        aisles=[{"name": nombre, "items": [vars(a) for a in articulos]} for nombre, articulos in por_pasillo.items()],
    )


@router.post("/{week_start}/shopping/taski", response_model=ShoppingToTaskiOut)
async def shopping_to_taski(
    week_start: date,
    payload: ShoppingToTaskiIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    taski: Taski | None = Depends(get_taski),
) -> ShoppingToTaskiOut:
    """Manda a Taski lo que falta de la lista. En un solo sentido; las reglas
    —qué se manda, con qué nombre, en qué categoría— son de `app/taski.py`."""
    if taski is None:
        raise HTTPException(status_code=503, detail="taski not configured")
    por_pasillo = await _lista_de(session, user_id, week_start)
    total = sum(1 for articulos in por_pasillo.values() for a in articulos if a.food_id not in payload.skip_food_ids)
    try:
        nuevos = pendientes(por_pasillo, await taski.listar(), week_start, set(payload.skip_food_ids))
        for item in nuevos:
            await taski.anadir(item)
    except TaskiUnreachable as exc:
        # Lo que contestó Taski, para que un fallo se pueda leer en el log.
        log.warning("taski: %s", exc)
        raise HTTPException(status_code=502, detail="taski unreachable") from exc
    # Sólo con la lista ya en Taski: un envío fallido no deja nada esperando ticket.
    await compra.abrir(session, user_id, week_start)
    return ShoppingToTaskiOut(added=len(nuevos), already=total - len(nuevos))


__all__ = ["HUECOS", "router"]


def _momento_de(fila: PlanEntry, logged_at: datetime | None) -> datetime:
    """El instante con que se apunta una comida del plan: el que mandó el móvil,
    que tiene que caer en su día y no en el futuro."""
    moment = logged_at or datetime.now(UTC)
    if moment > datetime.now(UTC) + timedelta(minutes=5):
        raise HTTPException(
            status_code=422,
            detail={"motivo": "eso todavía no ha pasado", "log_date": str(fila.log_date)},
        )
    if food_log_date(moment) != fila.log_date:
        raise HTTPException(
            status_code=422,
            detail={"motivo": "sólo se confirma el día de hoy", "log_date": str(fila.log_date)},
        )
    return moment


async def _registrar_fuera(session, user_id, items, moment, slot) -> list[LogEntry]:
    """Lo comido fuera, una entrada por línea revisada, con `entry_source`
    «estimated».

    Las cifras salen del alimento, como cualquier entrada (`calcular_nutrientes`):
    lo estimado son los **gramos**, que puso un modelo y revisaste tú. Por eso
    la marca va en la entrada y no en el alimento.
    """
    ids = [i.food_id for i in items]
    foods = {f.id: f for f in (await session.execute(select(Food).where(Food.id.in_(ids)))).scalars()}
    entries = []
    for item in items:
        food = foods.get(item.food_id)
        if food is None or (food.user_id is not None and food.user_id != user_id):
            raise HTTPException(status_code=404, detail="food not found")
        computed = calcular_nutrientes(food, item.grams)
        entry = LogEntry(
            user_id=user_id,
            logged_at=moment.astimezone(UTC) if moment.tzinfo else moment.replace(tzinfo=UTC),
            log_date=food_log_date(moment),
            meal_slot=slot,
            food_id=food.id,
            food_name_snapshot=food.name,
            grams=round(item.grams, 2),
            nutrients_json=dump_nutrients(computed.pop("nutrients")),
            entry_source="estimated",
            **computed,
        )
        session.add(entry)
        entries.append(entry)
    await session.flush()
    return entries


async def _cerrar_fuera(session, user_id, fila: PlanEntry, payload: PlanEntryPatch) -> None:
    """Apunta lo comido fuera: desde uno de tus sitios, desde las líneas
    revisadas guardándolas como sitio nuevo, o desde las líneas sin más."""
    moment = _momento_de(fila, payload.logged_at)
    sitio = payload.dish_id
    if payload.place_name:
        nuevo = await _nuevo_sitio(session, user_id, payload.place_name, payload.items)
        await session.flush()
        sitio = nuevo.id
    if sitio:
        # Desde el sitio, con su `dish_id`: es lo que lo pone primero en tu
        # lista la próxima vez.
        entries = await _registrar_sitio(session, user_id, sitio, moment, fila.slot)
    else:
        entries = await _registrar_fuera(session, user_id, payload.items, moment, fila.slot)
    fila.log_entry_id = entries[0].id if entries else None


async def _nuevo_sitio(session, user_id, nombre, items) -> Dish:
    """Lo comido fuera, guardado como uno de tus sitios (fase 3): un plato
    `fuera` de una ración con las líneas que revisaste, marcado `estimated`
    hasta que lo corrijas. Un nombre que ya usas es un 409: dos «Bar Paco» no
    se distinguirían en la lista."""
    folded = fold_exercise_name(nombre)
    clash = (
        await session.execute(select(Dish).where(Dish.user_id == user_id, Dish.name_folded == folded))
    ).scalar_one_or_none()
    if clash is not None:
        raise HTTPException(status_code=409, detail={"motivo": f"ya tienes «{clash.name}»"})
    dish = Dish(
        user_id=user_id,
        name=nombre.strip(),
        name_folded=folded,
        kind="fuera",
        estimated=True,
        servings=1,
        basis="cooked",
        ingredients=[DishIngredient(food_id=i.food_id, grams=i.grams) for i in items],
    )
    session.add(dish)
    return dish


async def _registrar_sitio(session, user_id, dish_id, moment, slot) -> list[LogEntry]:
    """Uno de tus sitios, apuntado de un toque con sus líneas de una ración.
    Lo escribe `registrar_plato`, que sabe si va como `estimated`."""
    dish = (
        await session.execute(
            select(Dish)
            .options(selectinload(Dish.ingredients))
            .where(Dish.id == dish_id, Dish.user_id == user_id, Dish.kind == "fuera")
        )
    ).scalar_one_or_none()
    if dish is None:
        raise HTTPException(status_code=404, detail="place not found")
    ids = [i.food_id for i in dish.ingredients]
    foods = {f.id: f for f in (await session.execute(select(Food).where(Food.id.in_(ids)))).scalars()}
    entries = await registrar_plato(
        session,
        dish=dish,
        foods=foods,
        user_id=user_id,
        moment=moment,
        meal_slot=slot,
        gramos=[i.grams / (dish.servings or 1) for i in dish.ingredients],
    )
    await session.flush()
    return entries


async def get_meal_estimator():
    """Quien describe una comida de fuera, o `None` si no hay clave. Dependencia
    para que los tests la sustituyan, como `get_plan_reader`."""
    key = settings.gemini_api_key.get_secret_value()
    if not key:
        return None

    async def estimator(description: str, hidden_fat: bool) -> dict:
        return await estimate_meal(
            description,
            hidden_fat,
            api_key=key,
            model=settings.gemini_model,
            fallback=settings.gemini_fallback_model or None,
        )

    return estimator


@router.post("/out/estimate", response_model=OutEstimateOut, dependencies=[Depends(spend_llm_call)])
async def estimate_out(
    payload: OutEstimateIn,
    estimator=Depends(get_meal_estimator),
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> OutEstimateOut:
    """Una comida de fuera, en líneas casadas con alimentos. No guarda nada: lo
    leído son gramos que ha puesto un modelo, y pasan por revisión (CLAUDE.md)."""
    if estimator is None:
        raise HTTPException(status_code=503, detail="la estimación no está configurada")
    try:
        crudo = await estimator(payload.description, payload.hidden_fat)
    except LabelUnreadable as exc:
        if exc.quota:
            return OutEstimateOut(refusal="quota", quota_scope=exc.quota)
        return OutEstimateOut(refusal="unreadable")
    textos = [t for t in (crudo or {}).get("lines") or [] if isinstance(t, str) and t.strip()]
    if not textos:
        return OutEstimateOut(refusal="unreadable")
    lineas = await build_draft_lines(session, user_id, textos, 1)
    return OutEstimateOut(
        lines=[
            DraftLineOut(
                text=line.text,
                quantity=line.quantity,
                unit=line.unit,
                recipe_grams=line.recipe_grams,
                grams=line.grams,
                status=line.status,
                food=DraftFoodOut(id=line.food.id, name=line.food.name) if line.food else None,
                candidates=[DraftFoodOut(id=f.id, name=f.name) for f in line.candidates],
            )
            for line in lineas
        ]
    )


def _gramos_a_congelar(fila: PlanEntry, dish: Dish, payload: PlanEntryPatch) -> list[float]:
    """Los gramos que se apuntan al confirmar: una parte de la olla, la receta
    de un sustituto, o lo que el plan congeló."""
    if payload.fraction is not None:
        # Fase 5: una parte de la olla. Se congela esa fracción de la receta
        # entera, no la ración que el plan resolvió: es lo que de verdad
        # salió de la olla.
        return gramos_de_fraccion([i.grams for i in dish.ingredients], payload.fraction)
    if payload.dish_id:
        # Lo que comiste no es lo que el plan pesó: los gramos congelados
        # son de **otro plato**. Se usa la receta del sustituto, una ración.
        raciones = dish.servings or 1
        return [i.grams / raciones for i in dish.ingredients]
    return json.loads(fila.grams_json) if fila.grams_json else []


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
    if payload.status == "out":
        if not payload.items and not payload.dish_id:
            raise HTTPException(status_code=422, detail={"motivo": "falta qué comiste"})
        if fila.log_entry_id is None:
            await _cerrar_fuera(session, user_id, fila, payload)
    elif escribe and fila.log_entry_id is None:
        moment = payload.logged_at or datetime.now(UTC)
        # Un día pasado se cierra después, con la hora de aquel día (registro sin
        # huecos, fase 1): es lo que deja apuntada la cena que se olvidó. Lo que
        # no se cierra es lo que todavía no ha pasado. Cinco minutos de margen
        # para el reloj del móvil.
        if moment > datetime.now(UTC) + timedelta(minutes=5):
            raise HTTPException(
                status_code=422,
                detail={"motivo": "eso todavía no ha pasado", "log_date": str(fila.log_date)},
            )
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
        gramos = _gramos_a_congelar(fila, dish, payload)
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


async def _reservar_fuera(session: AsyncSession, user_id: int, fila: PlanEntry) -> None:
    """Una comida fuera puesta en el plan reserva su cifra, y lo que queda del
    día sin decir se reparte el resto (registro sin huecos, fase 4).

    Sólo se mueve lo que no tiene respuesta y es tuyo de casa; lo demás —lo
    dicho, el propio sitio— entra fijo con lo que el plan congeló.

    La regla del `NULL`, leída aquí: un macro que algo fijo no tiene medido
    deja de dirigir el ajuste —no se puede repartir el resto de una suma que no
    se sabe—, y sin kcal fijas o sin objetivo de kcal no se reajusta nada.
    """
    plan = (
        await session.execute(
            select(Plan).options(selectinload(Plan.entries)).where(Plan.id == fila.plan_id)
        )
    ).scalar_one()
    dia = [f for f in plan.entries if f.log_date == fila.log_date]
    pauta = await _pauta_vigente(session, user_id, plan.week_start)
    holgura = frozenset(e.dish_id for e in pauta.entries) if pauta else frozenset()
    repertorio = await _candidatos(session, user_id, holgura)
    por_id = {p.id: p for p in repertorio.candidatos}
    _, _, macros = await _congelado(session, plan)

    elegidos: list[tuple[str, PlatoCandidato]] = []
    movidas: set[int] = set()
    fijas: list[dict] = []
    for f in dia:
        candidato = por_id.get(f.dish_id)
        if f.status is None and f.id != fila.id and candidato is not None:
            elegidos.append((f.slot, candidato))
            movidas.add(f.id)
            continue
        cifra = macros.get(f.id)
        if not cifra or cifra.get("kcal") is None:
            return
        fijas.append(cifra)
        elegidos.append((f.slot, PlatoCandidato(id=f.dish_id, nombre="", bloque=True, fijo=cifra)))
    objetivo = (await _objetivos(session, user_id, (fila.log_date,))).get(fila.log_date, {})
    if not movidas or objetivo.get("kcal") is None:
        return
    objetivo = {
        campo: meta
        for campo, meta in objetivo.items()
        if all(cifra.get(campo) is not None for cifra in fijas)
    }

    for f, (_slot, plato, gramos) in zip(dia, reajustar_dia(elegidos, objetivo)):
        if f.id in movidas:
            f.grams_json = json.dumps(repertorio.completos(plato.id, gramos))


async def hidrato_al_entreno(session: AsyncSession, user_id: int, momento: datetime) -> None:
    """El hidrato sigue al entreno: la comida de después gana, la merienda y la
    cena ceden, y el día suma lo mismo (opción C, 2026-10-18).

    Lo llama la primera serie del día. **Una vez por día**: en cuanto una fila
    lleva `carbs_shift`, el día ya se ajustó, y las series siguientes no lo
    rehacen. Sólo se mueve lo que no tiene respuesta y es tuyo de casa —lo dicho
    ya se comió, y un sitio o un bloque es lo que es—; quién gana y cuánto lo
    decide `hidrato_del_entreno` con la hora de la pared de la serie.

    Cada comida que se mueve conserva lo que tenía y cambia sólo su hidrato, y
    sus kcal con él: el objetivo nuevo es su cifra congelada más o menos esos
    gramos. Lo que de verdad se movió —las bandas mandan— es lo que se guarda.
    """
    fecha = food_log_date(momento)
    plan = (
        await session.execute(
            select(Plan)
            .options(selectinload(Plan.entries))
            .where(Plan.user_id == user_id, Plan.week_start == fecha - timedelta(days=fecha.weekday()))
        )
    ).scalar_one_or_none()
    if plan is None:
        return
    dia = [f for f in plan.entries if f.log_date == fecha]
    if any(f.carbs_shift is not None for f in dia):
        return

    pauta = await _pauta_vigente(session, user_id, plan.week_start)
    holgura = frozenset(e.dish_id for e in pauta.entries) if pauta else frozenset()
    repertorio = await _candidatos(session, user_id, holgura)
    por_id = {p.id: p for p in repertorio.candidatos}
    _, _, macros = await _congelado(session, plan)
    movibles = {
        f.slot: f
        for f in dia
        if f.status is None and f.dish_id in por_id and (macros.get(f.id) or {}).get("carbs") is not None
    }
    cambios = hidrato_del_entreno(
        [(slot, macros[f.id]["carbs"]) for slot, f in movibles.items()],
        hora=momento.hour + momento.minute / 60,
    )
    if not cambios:
        return

    objetivo = (await _objetivos(session, user_id, (fecha,))).get(fecha, {})
    for slot, gramos_h in cambios.items():
        fila = movibles[slot]
        antes = macros[fila.id]
        # Sólo el hidrato y la proteína: las kcal le siguen solas (4 por gramo),
        # y perseguirlas con su peso de siempre se comía un tercio del cambio
        # (43,7 g de 50 con pollo y arroz) por clavar unas kcal que ya iban a
        # cuadrar. La grasa tampoco: el arroz trae la suya y no hay forma de
        # moverlo sin tocarla.
        parte = {"carbs": antes["carbs"] + gramos_h}
        if antes.get("protein") is not None:
            parte["protein"] = antes["protein"]
        congelados = json.loads(fila.grams_json) if fila.grams_json else []
        desde = [
            congelados[pos] for pos in repertorio.movibles.get(fila.dish_id, []) if pos < len(congelados)
        ]
        plato = por_id[fila.dish_id]
        gramos, despues = ajustar_comida(
            plato, parte, objetivo or parte, desde if len(desde) == len(plato.ajustables) else None
        )
        fila.grams_json = json.dumps(repertorio.completos(fila.dish_id, gramos))
        fila.carbs_shift = round((despues.get("carbs") or 0.0) - antes["carbs"], 1)
    await session.commit()


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
    if dish.kind == "fuera":
        await _reservar_fuera(session, user_id, fila)
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
