"""Lo que hay en casa: el ticket de la compra, leído y revisado (registro sin
huecos, fase 6.1).

El ticket de Mercadona es un PDF con texto y sin código de producto, con los
nombres cortados a 20 caracteres y comida mezclada con lo que no lo es. Un
modelo lo lee y devuelve **sólo las líneas de comida con lo comprado en
gramos**; casarlas con alimentos es `build_draft_lines`, lo mismo que en un plan
o una comida de fuera. Lo leído no escribe nada: es interpretado, y pasa por la
pantalla de revisión (CLAUDE.md). Lo que se guarda es lo revisado.
"""

import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..config import settings
from ..db import get_session
from ..dish_draft import build_draft_lines
from ..gemini import LabelUnreadable, read_ticket
from ..models import Food, PantryItem, visible_foods
from ..nutrition import food_log_date
from ..schemas import (
    DraftFoodOut,
    DraftLineOut,
    PantryIn,
    PantryItemOut,
    PantrySavedOut,
    TicketOut,
)
from .plans import _lista_de

router = APIRouter(prefix="/pantry", tags=["pantry"])
log = logging.getLogger("uvicorn.error")

# Un ticket es una página o dos.
MAX_TICKET_BYTES = 5 * 1024 * 1024

# Lo que se cuenta como «en casa»: lo comprado en las dos últimas semanas. Sin
# apuntar lo que se gasta, más atrás ya no se sabe si queda.
EN_CASA = timedelta(days=14)


async def get_ticket_reader():
    """Quien lee el ticket, o `None` si no hay clave. Dependencia para que los
    tests la sustituyan, como `get_plan_reader`."""
    key = settings.gemini_api_key.get_secret_value()
    if not key:
        return None

    async def reader(document: bytes) -> dict:
        return await read_ticket(
            document,
            api_key=key,
            model=settings.gemini_model,
            fallback=settings.gemini_fallback_model or None,
        )

    return reader


@router.post("/ticket", response_model=TicketOut)
async def read_ticket_pdf(
    document: UploadFile = File(...),
    reader=Depends(get_ticket_reader),
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> TicketOut:
    """Las líneas de comida del ticket, casadas con alimentos. No guarda nada."""
    if reader is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="la lectura de tickets no está configurada",
        )
    if document.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="sólo se leen PDF"
        )
    data = await document.read()
    if len(data) > MAX_TICKET_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="el PDF es demasiado grande"
        )
    try:
        crudo = await reader(data)
    except LabelUnreadable as exc:
        if exc.quota:
            return TicketOut(refusal="quota", quota_scope=exc.quota)
        log.info("ticket: unreadable %s", exc.detail or type(exc.__cause__).__name__)
        return TicketOut(refusal="unreadable")

    textos = [t for t in (crudo or {}).get("lines") or [] if isinstance(t, str) and t.strip()]
    if not textos:
        return TicketOut(refusal="unreadable")
    # Una «ración» de compra es lo comprado entero: los gramos de la línea.
    lineas = await build_draft_lines(session, user_id, textos, 1)
    log.info("ticket: ok lines=%d matched=%d", len(lineas), sum(1 for x in lineas if x.food))
    return TicketOut(
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


@router.post("", response_model=PantrySavedOut, status_code=status.HTTP_201_CREATED)
async def save_pantry(
    payload: PantryIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PantrySavedOut:
    """Guarda lo revisado del ticket como lo que hay en casa, y dice cómo fue la
    compra contra la lista de esa semana: cuántos alimentos estaban en ella,
    cuántos no, y qué de la lista no se compró. Sin semana planificada no hay
    con qué comparar, y se dice (`in_list` a `None`), no se inventa un cero."""
    ids = sorted({i.food_id for i in payload.items})
    visibles = set(
        (await session.execute(select(Food.id).where(Food.id.in_(ids), visible_foods(user_id))))
        .scalars()
        .all()
    )
    if set(ids) - visibles:
        raise HTTPException(status_code=404, detail="food not found")

    hoy = payload.date or food_log_date(datetime.now(UTC))
    for item in payload.items:
        session.add(PantryItem(user_id=user_id, food_id=item.food_id, grams=item.grams, bought_on=hoy))
    await session.commit()

    comprado = set(ids)
    if payload.week_start is None:
        return PantrySavedOut(saved=len(ids))
    try:
        pasillos = await _lista_de(session, user_id, payload.week_start)
    except HTTPException:
        return PantrySavedOut(saved=len(ids))
    en_lista = {a.food_id: a.name for articulos in pasillos.values() for a in articulos}
    return PantrySavedOut(
        saved=len(ids),
        in_list=len(comprado & en_lista.keys()),
        off_list=len(comprado - en_lista.keys()),
        missing=sorted(nombre for fid, nombre in en_lista.items() if fid not in comprado),
    )


@router.get("", response_model=list[PantryItemOut])
async def read_pantry(
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[PantryItemOut]:
    """Lo que hay en casa: lo comprado en las dos últimas semanas, sumado por
    alimento, lo más reciente primero."""
    desde = food_log_date(datetime.now(UTC)) - EN_CASA
    filas = (
        await session.execute(
            select(
                PantryItem.food_id,
                Food.name,
                func.sum(PantryItem.grams),
                func.max(PantryItem.bought_on),
            )
            .join(Food, Food.id == PantryItem.food_id)
            .where(PantryItem.user_id == user_id, PantryItem.bought_on >= desde)
            .group_by(PantryItem.food_id, Food.name)
            .order_by(func.max(PantryItem.bought_on).desc(), Food.name)
        )
    ).all()
    return [
        PantryItemOut(food_id=fid, name=name, grams=round(grams, 1), bought_on=bought)
        for fid, name, grams, bought in filas
    ]
