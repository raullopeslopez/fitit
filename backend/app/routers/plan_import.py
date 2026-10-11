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

import logging
from time import perf_counter

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..config import settings
from ..db import get_session
from ..dish_draft import build_draft_lines
from ..gemini import LabelUnreadable, read_plan
from ..models import Dish
from ..naming import fold_exercise_name
from ..plan_import import read_plan_payload
from ..schemas import (
    DraftFoodOut,
    DraftLineOut,
    ImportedDishOut,
    ImportedSlotOut,
    PlanImportOut,
)

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


@router.post("/import", response_model=PlanImportOut)
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

    read = read_plan_payload(payload)

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

    note(
        "ok",
        model=settings.gemini_model,
        dishes=len(dishes),
        new=sum(1 for d in dishes if d.status == "new"),
        week=len(read.week),
    )
    return PlanImportOut(
        dishes=dishes,
        week=[ImportedSlotOut(day=c.day, slot=c.slot, dish=c.dish) for c in read.week],
    )
