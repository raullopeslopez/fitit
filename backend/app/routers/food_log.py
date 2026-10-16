"""The diary: what was eaten, on which food day, and what it adds up to.

Every number written here is frozen at the moment of writing. Correcting a food
afterwards changes the catalogue, never the history — which is the whole reason
the macro columns are copies rather than a join.
"""

import logging
from datetime import UTC, date, datetime, timedelta
from time import perf_counter
from typing import get_args

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import get_current_user
from ..config import settings
from ..db import get_session
from ..models import Food, LogEntry, PlanEntry, User, visible_foods, visible_portions
from ..schemas import MealSlot
from ..nutrition import (
    calcular_nutrientes,
    desperdicio_de_sobras,
    dump_nutrients,
    escalar_gramos,
    escalar_nutrientes,
    food_log_date,
    gramos_de_medida,
    gramos_comestibles,
    restante,
    sumar_nutrientes,
)
from ..refuse import nutrientes_de_lo_pesado
from ..schemas import (
    BoneIn,
    BoneOut,
    FoodDayOut,
    LogEntryIn,
    LogEntryOut,
    LogEntryPatch,
    RecomputeIn,
    RecomputeOut,
    SlotTotalsOut,
)
from ..routers.targets import frozen_target
from ..serialization import to_entry_out
from ..dish_draft import candidate_foods
from ..gemini import LabelUnreadable, read_voice
from ..schemas import DraftFoodOut, VoiceBatchIn, VoiceLineOut, VoiceOut
from ..voice import Habit, parse_heard, voice_lines
from .foods import FREQUENT_WINDOW_DAYS, _most_repeated
from .ideas import ideas_available

router = APIRouter(prefix="/food-log", tags=["food-log"])
log = logging.getLogger("app.voice")


@router.post("", response_model=LogEntryOut, status_code=status.HTTP_201_CREATED)
async def log_food(
    payload: LogEntryIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> LogEntryOut:
    food = (
        await session.execute(
            select(Food)
            .options(selectinload(Food.portions))
            # `visible_foods` y no un `or_` a mano: la regla de qué alimentos
            # existen para ti es una sola, y esta copia se había quedado sin la
            # mitad que descarta lo archivado — se podía registrar un alimento
            # que la búsqueda ya no enseñaba.
            .where(Food.id == payload.food_id, visible_foods(user_id))
        )
    ).scalar_one_or_none()
    if food is None:
        raise HTTPException(status_code=404, detail="food not found")

    grams = _resolve_grams(payload, food, user_id)
    # The moment carries the phone's offset, and the offset is what decides
    # which food day a supper lands on. Absent means now.
    moment = payload.logged_at or datetime.now(UTC)
    computed, edible = _pesar(food, grams, payload.with_bone)

    entry = LogEntry(
        user_id=user_id,
        # Stored UTC; the food day was already read off the local clock above.
        logged_at=moment.astimezone(UTC) if moment.tzinfo else moment.replace(tzinfo=UTC),
        log_date=food_log_date(moment),
        meal_slot=payload.meal_slot,
        food_id=food.id,
        # A copy of the name, so the row still reads if the food is deleted.
        food_name_snapshot=food.name,
        grams=grams,
        edible_grams=edible,
        nutrients_json=dump_nutrients(computed.pop("nutrients")),
        entry_source=payload.entry_source,
        measure=payload.measure,
        measure_count=payload.quantity if payload.measure else None,
        **computed,
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return to_entry_out(entry)


# --- La voz (docs/registro-por-voz.md) ------------------------------------------

# Treinta segundos de opus son unos 250 KB; esto deja margen sin dejar que una
# subida cualquiera llegue al modelo, que cobra por lo que oye.
VOICE_MAX_BYTES = 2 * 1024 * 1024


async def get_voice_reader():
    """Quien oye una nota de voz, o `None` si no hay clave. Dependencia para
    que los tests la sustituyan, como `get_meal_estimator`."""
    key = settings.gemini_api_key.get_secret_value()
    if not key:
        return None

    async def reader(audio: bytes, mime_type: str) -> dict:
        return await read_voice(
            audio,
            mime_type=mime_type,
            api_key=key,
            model=settings.gemini_model,
            fallback=settings.gemini_fallback_model or None,
        )

    return reader


@router.post("/voice", response_model=VoiceOut)
async def hear(
    audio: UploadFile = File(...),
    reader=Depends(get_voice_reader),
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> VoiceOut:
    """Una nota de voz, en líneas casadas con tus alimentos. **No guarda nada**,
    ni el audio: lo oído pasa por «Revisa lo que has dicho» (CLAUDE.md)."""
    started = perf_counter()

    def note(outcome: str, **fields) -> None:
        # Una línea por dictado, como `label read`: sin lo transcrito, que es lo
        # que dijiste y no hace falta para saber qué falló.
        parts = " ".join(f"{k}={v}" for k, v in fields.items() if v not in (None, ""))
        elapsed = round((perf_counter() - started) * 1000)
        log.info("voice heard: outcome=%s ms=%d %s", outcome, elapsed, parts)

    if reader is None:
        note("not_configured")
        raise HTTPException(status_code=503, detail="la voz no está configurada")
    data = await audio.read(VOICE_MAX_BYTES + 1)
    kb = len(data) // 1024
    if len(data) > VOICE_MAX_BYTES:
        note("too_big", kb=kb)
        raise HTTPException(status_code=413, detail="la nota de voz es demasiado larga")
    mime = audio.content_type or "audio/webm"
    try:
        crudo = await reader(data, mime)
    except LabelUnreadable as exc:
        if exc.quota:
            note("quota", kb=kb, scope=exc.quota, detail=exc.detail)
            return VoiceOut(refusal="quota", quota_scope=exc.quota)
        # Un 5xx es el modelo saturado o caído, no un audio que no se entiende:
        # decir «no he entendido nada» a quien habló claro le hace repetir lo
        # mismo contra un modelo que sigue sin poder (2026-10-16, 503 «high
        # demand» en gemini-3.8-flash).
        if (exc.detail or "").startswith("5"):
            note("busy", kb=kb, mime=mime, detail=exc.detail)
            return VoiceOut(refusal="busy")
        note("unreadable", kb=kb, mime=mime, detail=exc.detail)
        return VoiceOut(refusal="unreadable")
    transcript, heard = parse_heard(crudo)
    if not heard:
        note("nothing_heard", kb=kb, mime=mime)
        return VoiceOut(transcript=transcript, refusal="unreadable")

    foods = await candidate_foods(session, user_id, [h.name for h in heard])
    habits = await _habits(session, user_id, [f.id for f in foods])
    lines = voice_lines(heard, foods, user_id, habits)
    note(
        "ok",
        kb=kb,
        lines=len(lines),
        chosen=sum(1 for line in lines if line.status == "chosen"),
        ambiguous=sum(1 for line in lines if line.status == "ambiguous"),
        missing=sum(1 for line in lines if line.status == "missing"),
    )
    return VoiceOut(
        transcript=transcript,
        lines=[
            VoiceLineOut(
                text=line.text,
                status=line.status,
                food=DraftFoodOut(id=line.food.id, name=line.food.name) if line.food else None,
                candidates=[DraftFoodOut(id=f.id, name=f.name) for f in line.candidates],
                grams=line.grams,
                measure=line.measure,
                measure_count=line.measure_count,
                estimated=line.estimated,
                unit_question=line.unit_question,
            )
            for line in lines
        ],
    )


async def _habits(session: AsyncSession, user_id: int, food_ids: list[int]) -> dict[int, Habit]:
    """Lo que repites de estos alimentos, con la ventana y la moda de `/frequent`:
    lo que la voz elige sola tiene que ser lo mismo que los frecuentes ofrecen."""
    if not food_ids:
        return {}
    since = date.today() - timedelta(days=FREQUENT_WINDOW_DAYS)
    rows = (
        await session.execute(
            select(LogEntry)
            .where(
                LogEntry.user_id == user_id,
                LogEntry.food_id.in_(food_ids),
                LogEntry.log_date >= since,
            )
            .order_by(LogEntry.logged_at.desc(), LogEntry.id.desc())
        )
    ).scalars()
    by_food: dict[int, list[LogEntry]] = {}
    for row in rows:
        by_food.setdefault(row.food_id, []).append(row)
    habits = {}
    for food_id, entries in by_food.items():
        measure, count, grams = _most_repeated((e.measure, e.measure_count, e.grams) for e in entries)
        habits[food_id] = Habit(times=len(entries), grams=grams, measure=measure, measure_count=count)
    return habits


@router.post("/batch", response_model=list[LogEntryOut], status_code=status.HTTP_201_CREATED)
async def log_batch(
    payload: VoiceBatchIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[LogEntryOut]:
    """Lo confirmado en el modal de la voz, **todo o nada**: si una línea apunta a
    un alimento que no existe para ti, no se escribe ninguna. Van como `voice`,
    salvo las de gramos del modelo, que van como `estimated` para que el diario
    las diga igual que lo de «Comer fuera»."""
    ids = {e.food_id for e in payload.entries}
    foods = {
        f.id: f
        for f in (
            await session.execute(select(Food).where(Food.id.in_(ids), visible_foods(user_id)))
        ).scalars()
    }
    if ids - foods.keys():
        raise HTTPException(status_code=404, detail="food not found")

    moment = payload.logged_at or datetime.now(UTC)
    stamp = moment.astimezone(UTC) if moment.tzinfo else moment.replace(tzinfo=UTC)
    entries = []
    for item in payload.entries:
        food = foods[item.food_id]
        grams = gramos_de_medida(item.measure, item.quantity) if item.measure else item.grams
        computed, edible = _pesar(food, grams, False)
        entries.append(
            LogEntry(
                user_id=user_id,
                logged_at=stamp,
                log_date=food_log_date(moment),
                meal_slot=payload.meal_slot,
                food_id=food.id,
                food_name_snapshot=food.name,
                grams=grams,
                edible_grams=edible,
                nutrients_json=dump_nutrients(computed.pop("nutrients")),
                entry_source="estimated" if item.estimated else "voice",
                measure=item.measure,
                measure_count=item.quantity if item.measure else None,
                **computed,
            )
        )
    session.add_all(entries)
    await session.commit()
    for entry in entries:
        await session.refresh(entry)
    return [to_entry_out(e) for e in entries]


# Lo que se contesta cuando se pesa con hueso un alimento del que no se sabe si
# sus kcal lo cuentan. La pantalla no debería llegar aquí —pregunta antes—,
# pero un cliente que no pregunte tiene que enterarse de qué falta.
NO_SE_SABE_EL_HUESO = (
    "no se sabe si las kcal de este alimento son con hueso o de la parte comestible: "
    "dilo en el alimento antes de pesarlo con hueso"
)


def _pesar(food: Food, grams: float, with_bone: bool) -> tuple[dict, float | None]:
    try:
        return nutrientes_de_lo_pesado(food, grams, with_bone)
    except ValueError:
        raise HTTPException(status_code=422, detail=NO_SE_SABE_EL_HUESO) from None


def _resolve_grams(payload: LogEntryIn, food: Food, user_id: int) -> float:
    """Grams, from whichever of the two ways the client asked.

    "Dos rebanadas" is the point of the portions table: it is the amount you
    actually know, and converting it here means the diary never asks you to
    weigh bread.
    """
    if payload.portion_id is not None:
        portion = next((p for p in visible_portions(food, user_id) if p.id == payload.portion_id), None)
        if portion is None:
            raise HTTPException(status_code=404, detail="portion not found for this food")
        return round(portion.grams * payload.quantity, 2)
    if payload.measure is not None:
        # «2 cdas»: lo que pesan según la tabla, igual para todo alimento.
        return gramos_de_medida(payload.measure, payload.quantity)
    if payload.grams is None:
        raise HTTPException(status_code=422, detail="grams, portion_id or measure is required")
    return payload.grams


@router.get("", response_model=FoodDayOut)
async def get_food_day(
    date_: date | None = Query(default=None, alias="date"),
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FoodDayOut:
    """One food day, with its totals. Defaults to the day you are in now."""
    log_date = date_ or food_log_date(datetime.now(UTC))
    entries = list(
        (
            await session.execute(
                select(LogEntry)
                .where(LogEntry.user_id == user_id, LogEntry.log_date == log_date)
                .order_by(LogEntry.logged_at, LogEntry.id)
            )
        )
        .scalars()
        .all()
    )
    totals, unknown = sumar_nutrientes(entries)
    user = await session.get(User, user_id)
    kcal_del_dia = await frozen_target(session, user_id, log_date, user.objetivo_kcal)
    return FoodDayOut(
        date=log_date,
        entries=[to_entry_out(e) for e in entries],
        totals=totals,
        unknown=unknown,
        by_slot=_by_slot(entries),
        # El objetivo del día, congelado la primera vez que el día se lee. En
        # cuanto la cifra se deriva —y se mueve sola porque bajas de peso o
        # porque hay más historial—, leerla del perfil reescribiría el pasado.
        target_kcal=kcal_del_dia,
        target_protein=user.objetivo_proteina,
        target_fat=user.objetivo_grasa,
        target_carbs=user.objetivo_hidratos,
        remaining_kcal=restante(kcal_del_dia, totals["kcal"]),
        remaining_protein=restante(user.objetivo_proteina, totals["protein"]),
        remaining_fat=restante(user.objetivo_grasa, totals["fat"]),
        remaining_carbs=restante(user.objetivo_hidratos, totals["carbs"]),
        label_reading=bool(settings.gemini_api_key.get_secret_value()),
        dish_ideas=ideas_available(),
    )


# Las cinco comidas, en el orden en que se comen y con el montón sin asignar al
# final. Es el mismo orden que la pantalla dibuja, y sale de `MealSlot` para que
# añadir una comida sea un sitio y no tres.
SLOT_ORDER: tuple[str | None, ...] = (*get_args(MealSlot), None)


def _by_slot(entries) -> list[SlotTotalsOut]:
    """Un subtotal por comida, **incluidas las vacías**.

    Salen todas para que la pantalla pueda dibujar un raíl que todavía no tiene
    nada sin sumar por su cuenta: una comida vacía suma `null`, no 0, y esa
    regla vive en `sumar_nutrientes` y en ningún otro sitio.
    """
    out = []
    for slot in SLOT_ORDER:
        totals, unknown = sumar_nutrientes([e for e in entries if (e.meal_slot or None) == slot])
        out.append(SlotTotalsOut(slot=slot, totals=totals, unknown=unknown))
    return out


@router.post("/recompute", response_model=RecomputeOut)
async def recompute_day(
    payload: RecomputeIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RecomputeOut:
    """Vuelve a aplicar un alimento corregido a lo registrado de **un** día.

    La única excepción a que `log_entries` congela, y por eso está aquí sola,
    con nombre propio y sin que nada la llame por su cuenta.

    Existe porque la regla del congelado no distinguía dos casos que no son el
    mismo. Si el alimento **cambió** —otra receta, una medición mejor—, lo de
    marzo estaba bien entonces y recalcularlo reescribiría un mes ya cerrado:
    eso es lo que el congelado protege y sigue protegiendo. Pero si el alimento
    estaba **mal tecleado**, no hubo ningún día en que esa cifra fuera cierta, y
    congelarla es conservar el error. Corregir el alimento es justo lo que hace
    alguien que acaba de darse cuenta de lo segundo.

    Dos cosas la mantienen a raya, y las dos son deliberadas:

    - **Sólo un día**, el que se está mirando. El alcance es lo único que separa
      «arreglo lo de hoy» de «un dedo equivocado me cambia el trimestre».
    - **Sólo cuando alguien lo pide.** Guardar una corrección no dispara esto;
      la pantalla ofrece y se puede decir que no, y decir que no deja el diario
      exactamente como estaba.

    La aritmética sigue siendo la de siempre (`calcular_nutrientes`, en
    `nutrition.py`), aplicada a los gramos que cada entrada ya tenía: esto
    re-lee el alimento, no re-pesa la entrada.
    """
    food = (
        await session.execute(
            select(Food).where(Food.id == payload.food_id, visible_foods(user_id))
        )
    ).scalar_one_or_none()
    if food is None:
        raise HTTPException(status_code=404, detail="food not found")

    entries = list(
        (
            await session.execute(
                select(LogEntry).where(
                    LogEntry.user_id == user_id,
                    LogEntry.log_date == payload.date,
                    LogEntry.food_id == food.id,
                )
            )
        )
        .scalars()
        .all()
    )
    for entry in entries:
        computed, edible = _rehacer(food, entry)
        entry.edible_grams = edible
        entry.nutrients_json = dump_nutrients(computed.pop("nutrients"))
        for field, value in computed.items():
            setattr(entry, field, value)
        # El nombre viaja con las cifras: si corregiste la errata del nombre, la
        # fila del diario tiene que dejar de enseñarla también.
        entry.food_name_snapshot = food.name
    await session.commit()
    return RecomputeOut(updated=len(entries))


def _rehacer(food: Food, entry: LogEntry) -> tuple[dict, float | None]:
    """Vuelve a leer el alimento para una entrada, pesada como se pesó.

    Una entrada pesada con hueso se rehace con el hueso que el alimento dice
    **ahora** — corregirlo es justo para lo que existe `recompute`. Si ahora
    nadie sabe a qué se refieren sus kcal, se queda con los comestibles que ya
    tenía: rehacer no puede convertir una cifra en un error.
    """
    with_bone = entry.edible_grams is not None
    try:
        return nutrientes_de_lo_pesado(food, entry.grams, with_bone)
    except ValueError:
        return calcular_nutrientes(food, entry.edible_grams), entry.edible_grams


@router.post("/{entry_id}/bone", response_model=BoneOut)
async def weigh_leftover_bone(
    entry_id: int,
    payload: BoneIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BoneOut:
    """El hueso que sobró en el plato, pesado: el desperdicio de verdad.

    Corrige la entrada —los comestibles pasan a ser lo pesado menos el hueso,
    y los nutrientes se reescalan desde lo congelado, como al repesar— y, si
    el alimento es tuyo, le deja escrito ese desperdicio para la próxima vez.

    El catálogo compartido no se toca: es de todos, y tu muslo de hoy no es la
    media de los muslos. La entrada sí, porque es tuya.

    Sólo para entradas pesadas con hueso cuyas kcal salen de la carne. Con
    kcal «tal cual se vende» el hueso no cambia la cifra, y en una entrada
    pesada sin hueso los gramos ya son la carne: dividir el hueso entre ellos
    daría un desperdicio que no existe.
    """
    entry = await _load_entry(session, entry_id, user_id)
    if entry.edible_grams is None:
        raise HTTPException(status_code=422, detail="esta entrada no se pesó con hueso")
    try:
        refuse = desperdicio_de_sobras(entry.grams, payload.bone_grams)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="el hueso tiene que pesar menos que lo que pesaste",
        ) from None

    food = None
    if entry.food_id is not None:
        food = (
            await session.execute(
                select(Food).where(Food.id == entry.food_id, visible_foods(user_id))
            )
        ).scalar_one_or_none()
    food_updated = food is not None and food.user_id == user_id
    if food_updated:
        food.refuse_pct = refuse

    edible = gramos_comestibles(entry.grams, refuse)
    rescaled = escalar_nutrientes(entry, old_grams=entry.edible_grams, new_grams=edible)
    entry.nutrients_json = dump_nutrients(rescaled.pop("nutrients"))
    for field, value in rescaled.items():
        setattr(entry, field, value)
    entry.edible_grams = edible
    await session.commit()
    await session.refresh(entry)
    return BoneOut(entry=to_entry_out(entry), refuse_pct=refuse, food_updated=food_updated)


@router.patch("/{entry_id}", response_model=LogEntryOut)
async def correct_entry(
    entry_id: int,
    payload: LogEntryPatch,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> LogEntryOut:
    """Re-weigh, re-slot or re-date an entry.

    Changing the grams rescales what was frozen; it does not read the food
    again. Going back to `foods` would quietly adopt any correction made to it
    since, turning "I put 200 g, not 150" into a silent rewrite of the numbers
    you were looking at when you typed it. Moving it in time changes nothing but
    when it happened, for the same reason.
    """
    entry = await _load_entry(session, entry_id, user_id)
    fields = payload.model_dump(exclude_unset=True)
    if "meal_slot" in fields:
        entry.meal_slot = fields["meal_slot"]
    moment = fields.get("logged_at")
    if moment is not None:
        # El día se deriva del sello con `food_log_date`, la misma regla y el
        # mismo sitio que al escribirla: si el re-fechado tuviera la suya, una
        # entrada movida caería en un día distinto del que caería recién
        # creada a esa misma hora.
        entry.logged_at = moment.astimezone(UTC) if moment.tzinfo else moment.replace(tzinfo=UTC)
        entry.log_date = food_log_date(moment)
    new_grams = fields.get("grams")
    if new_grams is not None and new_grams != entry.grams:
        rescaled = escalar_nutrientes(entry, old_grams=entry.grams, new_grams=new_grams)
        entry.nutrients_json = dump_nutrients(rescaled.pop("nutrients"))
        for field, value in rescaled.items():
            setattr(entry, field, value)
        # Pesada con hueso, la parte comestible crece en la misma proporción.
        entry.edible_grams = escalar_gramos(
            entry.edible_grams, old_grams=entry.grams, new_grams=new_grams
        )
        entry.grams = new_grams
        # Repesada en gramos, ya no es «2 cdas»: lo que hiciste ahora es pesar.
        entry.measure = None
        entry.measure_count = None
    await session.commit()
    await session.refresh(entry)
    return to_entry_out(entry)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(
    entry_id: int,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Borra una entrada del diario, y el plan se entera.

    Si la entrada la escribió «Lo comí» (la comida del plan la enlaza), lo que
    pasa con el plan depende de lo que quede de ese plato en esa comida: si
    queda otro ingrediente —un plato de dos son dos entradas—, el enlace pasa a
    él y la comida sigue confirmada; si no queda nada, la confirmación se
    deshace y la comida vuelve a no tener respuesta. Antes el enlace se vaciaba
    solo (`ON DELETE SET NULL`) y el plan seguía diciendo «Comido» sin nada
    detrás. Se hace aquí y no confiando en la base: SQLite ni lo vacía.
    """
    entry = await _load_entry(session, entry_id, user_id)
    enlazadas = (
        await session.execute(select(PlanEntry).where(PlanEntry.log_entry_id == entry.id))
    ).scalars().all()
    hermana = None
    if enlazadas and entry.dish_id is not None:
        hermana = (
            await session.execute(
                select(LogEntry.id).where(
                    LogEntry.user_id == user_id,
                    LogEntry.log_date == entry.log_date,
                    LogEntry.meal_slot == entry.meal_slot,
                    LogEntry.dish_id == entry.dish_id,
                    LogEntry.id != entry.id,
                ).order_by(LogEntry.id).limit(1)
            )
        ).scalar_one_or_none()
    for fila in enlazadas:
        fila.log_entry_id = hermana
        if hermana is None:
            fila.status = None
    await session.delete(entry)
    await session.commit()


async def _load_entry(session: AsyncSession, entry_id: int, user_id: int) -> LogEntry:
    entry = await session.get(LogEntry, entry_id)
    if entry is None or entry.user_id != user_id:
        raise HTTPException(status_code=404, detail="entry not found")
    return entry
