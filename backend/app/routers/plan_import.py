"""Subir un PDF de plan y ver qué platos y qué semana trae. No guarda nada.

Las piezas ya existen y aquí sólo se encadenan:

- el PDF → `gemini.read_plan` (transcribe la tabla, temperatura 0);
- la respuesta → `plan_import.read_plan_payload` (qué se cree de ella);
- cada plato → tu repertorio por nombre plegado (`existing`) o, si es nuevo,
  sus líneas → `dish_draft.build_draft_lines` (cantidad, gramos, alimento).

Lo leído son cifras que ha interpretado un modelo, y por la regla de CLAUDE.md
pasan por una pantalla de revisión antes de escribir nada. Esto es lo que esa
pantalla enseña; guardar es otra petición.
"""

from __future__ import annotations

import json
import logging
from datetime import timedelta
from time import perf_counter

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..config import settings
from ..db import get_session
from ..dish_draft import build_draft_lines
from ..gemini import LabelUnreadable, read_plan
from ..llm_quota import spend_llm_call
from ..models import Dish, DishIngredient, Pauta, PautaEntry
from ..naming import fold_exercise_name
from ..plan_import import read_plan_payload
from ..schemas import (
    DraftFoodOut,
    DraftLineOut,
    ImportedDishOut,
    ImportedSlotOut,
    PautaDishIn,
    PautaSaveIn,
    PautaSaveOut,
    PlanImportOut,
    PlanTextIn,
)
from .dishes import _foods

log = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/plans", tags=["plans"])

# Un plan de nutricionista son unas pocas páginas. Gemini acepta PDF en línea
# hasta 20 MB por petición; 15 deja margen para el base64 y el prompt.
MAX_PDF_BYTES = 15 * 1024 * 1024


async def get_plan_reader():
    """Quien lee el PDF, o `None` si no hay clave. Dependencia para que los
    tests la sustituyan, como `get_label_reader`."""
    key = settings.gemini_api_key.get_secret_value()
    if not key:
        return None

    async def reader(document: bytes) -> dict:
        return await read_plan(
            document,
            api_key=key,
            model=settings.gemini_model,
            fallback=settings.gemini_fallback_model or None,
        )

    return reader


@router.post("/import", response_model=PlanImportOut, dependencies=[Depends(spend_llm_call)])
async def import_plan(
    document: UploadFile = File(...),
    reader=Depends(get_plan_reader),
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PlanImportOut:
    started = perf_counter()

    def note(outcome: str, **fields) -> None:
        parts = " ".join(f"{k}={v}" for k, v in fields.items() if v not in (None, ""))
        elapsed = round((perf_counter() - started) * 1000)
        log.info("plan import: outcome=%s ms=%d %s", outcome, elapsed, parts)

    if reader is None:
        note("not_configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="la lectura de planes no está configurada",
        )
    # Sólo PDF, decidido así: una foto de una tabla se lee peor, y un formato
    # menos es una pantalla de errores menos.
    if document.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="sólo se leen PDF"
        )
    data = await document.read()
    if len(data) > MAX_PDF_BYTES:
        note("too_big", kb=len(data) // 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="el PDF es demasiado grande",
        )

    try:
        payload = await reader(data)
    except LabelUnreadable as exc:
        if exc.quota:
            note("quota", model=settings.gemini_model, scope=exc.quota)
            return PlanImportOut(refusal="quota", quota_scope=exc.quota)
        note(
            "unreadable",
            model=settings.gemini_model,
            error=exc.detail or type(exc.__cause__).__name__,
        )
        return PlanImportOut(refusal="unreadable")

    propuesta = await _propuesta(session, user_id, read_plan_payload(payload))
    note(
        "ok",
        model=settings.gemini_model,
        dishes=len(propuesta.dishes),
        new=sum(1 for d in propuesta.dishes if d.status == "new"),
        week=len(propuesta.week),
    )
    return propuesta


def _json_de(text: str):
    """El objeto JSON de un texto pegado, o `None`.

    Lo que se copia de un chat rara vez es sólo el JSON: viene con una frase
    delante, el bloque de código y una pregunta detrás. Se toma desde la primera
    llave hasta la última, que es justo eso.
    """
    inicio, fin = text.find("{"), text.rfind("}")
    if inicio < 0 or fin <= inicio:
        return None
    try:
        return json.loads(text[inicio : fin + 1])
    except ValueError:
        return None


@router.post("/import/text", response_model=PlanImportOut)
async def import_plan_text(
    payload: PlanTextIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PlanImportOut:
    """Un plan pegado como texto: el JSON que escribe Claude con el formato de
    `PLAN_PROMPT`. Va por el mismo camino que lo que lee Gemini de un PDF,
    pero sin modelo: aquí nadie transcribe, el texto ya es la transcripción.

    Sigue sin guardar nada. Los platos y las cantidades los ha escrito un
    modelo, y pasan por la misma pantalla de revisión que el PDF.
    """
    crudo = _json_de(payload.text)
    read = read_plan_payload(crudo)
    if not isinstance(crudo, dict) or (not read.dishes and not read.week):
        log.info("plan import: outcome=unreadable source=text chars=%d", len(payload.text))
        return PlanImportOut(refusal="unreadable")
    propuesta = await _propuesta(session, user_id, read)
    log.info(
        "plan import: outcome=ok source=text dishes=%d week=%d",
        len(propuesta.dishes),
        len(propuesta.week),
    )
    return propuesta


async def _propuesta(session: AsyncSession, user_id: int, read) -> PlanImportOut:
    """Lo leído contra tu repertorio: lo tuyo se reconoce por nombre, y lo
    nuevo trae sus líneas casadas con alimentos."""
    mine = {
        dish.name_folded: dish.id
        for dish in (await session.execute(select(Dish).where(Dish.user_id == user_id)))
        .scalars()
        .all()
    }
    dishes: list[ImportedDishOut] = []
    for dish in read.dishes:
        existing = mine.get(fold_exercise_name(dish.name))
        if existing is not None:
            dishes.append(
                ImportedDishOut(
                    name=dish.name, slots=dish.slots, status="existing", dish_id=existing
                )
            )
            continue
        # Una ración: un plan es para una persona, y los gramos que da son los
        # que se comen. Sin esto `gramos_por_racion` no sabría entre cuántos
        # dividir y dejaría todas las líneas sin gramos.
        lines = await build_draft_lines(session, user_id, dish.ingredients, 1)
        dishes.append(
            ImportedDishOut(
                name=dish.name,
                slots=dish.slots,
                status="new",
                lines=[
                    DraftLineOut(
                        text=line.text,
                        quantity=line.quantity,
                        unit=line.unit,
                        recipe_grams=line.recipe_grams,
                        grams=line.grams,
                        status=line.status,
                        food=DraftFoodOut(id=line.food.id, name=line.food.name)
                        if line.food
                        else None,
                        candidates=[DraftFoodOut(id=f.id, name=f.name) for f in line.candidates],
                    )
                    for line in lines
                ],
            )
        )

    return PlanImportOut(
        dishes=dishes,
        week=[ImportedSlotOut(day=c.day, slot=c.slot, dish=c.dish) for c in read.week],
    )


async def _plato_de(session: AsyncSession, user_id: int, dish: PautaDishIn) -> Dish:
    """El plato de una casilla: el tuyo, o uno nuevo dado de alta aquí."""
    if dish.dish_id is not None:
        mio = await session.get(Dish, dish.dish_id)
        if mio is None or mio.user_id != user_id:
            raise HTTPException(status_code=404, detail="dish not found")
        return mio
    # Un nombre que ya tienes es ese plato, igual que al leer el PDF: guardar
    # dos veces lo mismo no puede abrir un segundo plato con el mismo nombre.
    folded = fold_exercise_name(dish.name)
    mismo = (
        await session.execute(
            select(Dish).where(Dish.user_id == user_id, Dish.name_folded == folded)
        )
    ).scalar_one_or_none()
    if mismo is not None:
        return mismo
    # Un plato sin ingredientes no es un plato: es un nombre (`DishIn`).
    if not dish.ingredients:
        raise HTTPException(
            status_code=422, detail=f"«{dish.name}» no tiene ingredientes"
        )
    await _foods(session, user_id, [i.food_id for i in dish.ingredients])
    nuevo = Dish(
        user_id=user_id,
        name=dish.name,
        name_folded=folded,
        basis="raw",
        servings=1,
        slots=",".join(dish.slots) if dish.slots else None,
        ingredients=[
            DishIngredient(
                food_id=i.food_id, grams=i.grams, min_grams=i.min_grams, max_grams=i.max_grams
            )
            for i in dish.ingredients
        ],
    )
    session.add(nuevo)
    await session.flush()
    return nuevo


@router.post("/import/save", response_model=PautaSaveOut, status_code=status.HTTP_201_CREATED)
async def save_imported(
    payload: PautaSaveIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PautaSaveOut:
    """Guarda lo revisado de una vez: los platos nuevos y la pauta.

    Todo o nada: si un plato no se puede guardar, no queda ni él ni la pauta.
    Una pauta a medias pondría en la semana platos que no dijiste.
    """
    if any(c.dish >= len(payload.dishes) for c in payload.week):
        raise HTTPException(status_code=422, detail="una casilla apunta a un plato que no existe")

    platos = [await _plato_de(session, user_id, d) for d in payload.dishes]
    lunes = payload.week_start - timedelta(days=payload.week_start.weekday())
    vistas: set[tuple[int, str]] = set()
    entries = []
    for celda in payload.week:
        if (celda.day, celda.slot) in vistas:
            continue
        vistas.add((celda.day, celda.slot))
        entries.append(
            PautaEntry(weekday=celda.day, slot=celda.slot, dish_id=platos[celda.dish].id)
        )
    pauta = Pauta(user_id=user_id, active_from=lunes, entries=entries)
    session.add(pauta)
    await session.commit()
    log.info(
        "plan import: outcome=saved dishes=%d slots=%d", len(platos), len(entries)
    )
    return PautaSaveOut(pauta_id=pauta.id, active_from=lunes, dish_ids=[p.id for p in platos])
