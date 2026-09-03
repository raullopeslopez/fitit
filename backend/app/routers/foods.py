"""The food catalogue: finding a food, and adding one nobody has.

Two kinds of row live in `foods`. The shared catalogue (CIQUAL, later Open Food
Facts) has `user_id = NULL` and is read-only from here — it is measurements, not
belongings. Anything you typed yourself carries your id and is yours to correct.
Search reads both; writes only ever touch yours.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer, selectinload

from ..auth import get_current_user
from ..config import settings
from ..db import get_session
from ..gemini import LabelUnreadable, read_label
from ..label import ColumnRefused, read_from_payload
from ..models import Food, FoodAlias, LogEntry, Portion
from ..naming import fold_exercise_name as fold
from ..nutrition import NUTRIENTS, calcular_nutrientes
from ..schemas import FoodIn, FoodOut, FoodPatch, FrequentFoodOut, LabelReadOut
from ..serialization import to_food_out

router = APIRouter(prefix="/foods", tags=["foods"])

# A search box on a phone is a live filter, not a report. Thirty rows is more
# than fits on the screen twice over, and the cap is what keeps "a" from
# dragging three thousand CIQUAL rows across the wire.
SEARCH_LIMIT = 30

# Una foto de móvil ronda el megabyte. Ocho es sitio de sobra para la que venga
# sin encoger, y un techo que impide que una subida rara ocupe la memoria del
# proceso mientras se descodifica.
MAX_PHOTO_BYTES = 8 * 1024 * 1024

UNKNOWN_NUTRIENTS = dict.fromkeys(NUTRIENTS)


async def get_label_reader():
    """Quien lee la etiqueta, o `None` si la feature está apagada.

    Dependencia y no llamada directa para que la suite pueda ponerle otro
    delante: los tests de esto no llaman a Gemini —no hay red, ni clave, ni
    cuota que gastar en CI— y lo que comprueban es qué hace el backend con lo
    que el modelo conteste, que es donde está todo el riesgo.
    """
    key = settings.gemini_api_key.get_secret_value()
    if not key:
        return None

    async def reader(image: bytes, mime_type: str) -> dict:
        return await read_label(
            image, api_key=key, model=settings.gemini_model, mime_type=mime_type
        )

    return reader


# Cuántas filas se traen para ordenar, antes de quedarse con `SEARCH_LIMIT`.
#
# El orden fino se calcula en Python (`_rank`), así que hace falta el conjunto
# de candidatos... salvo que sea absurdo. Con CIQUAL cargado, buscar `a` casa
# con 3.090 de los 3.185 alimentos: 113 ms de ordenación para pintar treinta
# nombres que, con una sola letra escrita, no responden a ninguna pregunta.
# Medido, 2026-08-31.
#
# El corte va por longitud de nombre ascendente y no arbitrariamente: con una
# consulta corta, los nombres cortos son los que más probablemente se buscan
# (`Pan` antes que `Pan de centeno de la panadería de abajo`). Las búsquedas
# reales no lo tocan — `pollo` casa con 74 filas y `pan` con 111.
CANDIDATE_LIMIT = 400


def _visible(user_id: int):
    """Rows this user may see: the shared catalogue plus their own, unarchived."""
    return (Food.archived.is_(False)) & (or_(Food.user_id.is_(None), Food.user_id == user_id))


def _rank(food: Food, needle: str, alias_hits: set[int]) -> tuple:
    """Best match first: the exact name, then names that start with what was
    typed, then names that merely contain it, and only then alias-only hits.

    Sorted in Python rather than in SQL because the folding it ranks on has no
    portable SQL form (see app/naming.py), and because the candidate set is
    already capped at what one screen can show.
    """
    folded = food.name_folded
    if folded == needle:
        bucket = 0
    elif folded.startswith(needle):
        bucket = 1
    elif f" {needle}" in folded:
        bucket = 2
    elif needle in folded:
        bucket = 3
    elif food.brand_folded and needle in food.brand_folded:
        # Acierto por marca: te ha traído el alimento, pero no por su nombre.
        # Al mismo nivel que un alias, porque es lo mismo que es — otra forma
        # de llamar a la misma cosa.
        bucket = 4
    else:
        bucket = 4 if food.id in alias_hits else 5
    # Yours ahead of the catalogue's at equal rank: you typed it because the
    # catalogue did not have the thing you meant.
    return (bucket, 0 if food.user_id is not None else 1, len(food.name), food.name_folded)


def search_stmt(user_id: int, needle: str):
    """La consulta de la caja de búsqueda.

    Extraída del endpoint para que se pueda compilar y mirar en un test: lo que
    hay que comprobar de ella es qué columnas **no** pide, y eso no se ve desde
    la respuesta HTTP —`FoodOut` no lleva micronutrientes, así que el JSON sale
    igual de bien con la optimización que sin ella—.
    """
    # `nutrients_json` se queda fuera a propósito. Cada byte que viajara aquí se
    # tiraría, y son muchos: una fila de CIQUAL guarda 1,7 KB de vitaminas y
    # ácidos grasos, de modo que una búsqueda de una sola letra (2.822
    # coincidencias sobre el catálogo entero) arrastraba 4,7 MB desde Postgres
    # para pintar treinta nombres. Medido, 2026-08-31.
    stmt = (
        select(Food)
        .options(selectinload(Food.portions), defer(Food.nutrients_json))
        .where(_visible(user_id))
    )
    if not needle:
        # Nada escrito todavía: tu propia estantería, la más reciente primero.
        # Listar el catálogo entero aquí serían tres mil filas que no contestan
        # a ninguna pregunta. Ordenado por id y no por `created_at`: dos
        # alimentos dados de alta en el mismo segundo comparten marca de tiempo,
        # y el id es lo que el orden de inserción es de verdad (mismo
        # razonamiento que `Day.workouts`).
        return stmt.where(Food.user_id == user_id).order_by(Food.id.desc())
    alias_matches = select(FoodAlias.food_id).where(FoodAlias.alias_folded.contains(needle))
    return (
        stmt.where(
            or_(
                Food.name_folded.contains(needle),
                Food.brand_folded.contains(needle),
                Food.id.in_(alias_matches),
            )
        )
        .order_by(func.length(Food.name_folded))
        .limit(CANDIDATE_LIMIT)
    )


@router.get("", response_model=list[FoodOut])
async def search_foods(
    q: str = Query(default="", max_length=80),
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[FoodOut]:
    """Foods matching `q`, best match first. Empty `q` lists your own foods —
    which on a fresh account is the only thing there is to show."""
    needle = fold(q)
    rows = list((await session.execute(search_stmt(user_id, needle))).unique().scalars().all())
    if not needle:
        return [to_food_out(f, user_id) for f in rows[:SEARCH_LIMIT]]

    alias_hits = set(
        (
            await session.execute(
                select(FoodAlias.food_id).where(FoodAlias.alias_folded.contains(needle))
            )
        )
        .scalars()
        .all()
    )
    rows.sort(key=lambda f: _rank(f, needle, alias_hits))
    return [to_food_out(f, user_id) for f in rows[:SEARCH_LIMIT]]


@router.post("", response_model=FoodOut, status_code=status.HTTP_201_CREATED)
async def create_food(
    payload: FoodIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FoodOut:
    """Add a food by hand — the bakery's bread, your mother's piquillos.

    Only ever reached from a form the user filled in. Nothing else in this
    project may write to `foods`: not an import, not the barcode scanner, not
    the parser. A catalogue that grows without anyone deciding it should is a
    catalogue you stop trusting the search results of.
    """
    food = Food(
        user_id=user_id,
        name=payload.name,
        name_folded=fold(payload.name),
        brand=payload.brand or None,
        brand_folded=fold(payload.brand) if payload.brand else None,
        source="manual",
        # A number you typed off a Spanish label is the European convention,
        # where fibre is counted apart from carbohydrate.
        carb_convention="available",
        kcal_100g=payload.kcal_100g,
        protein_100g=payload.protein_100g,
        fat_100g=payload.fat_100g,
        carbs_100g=payload.carbs_100g,
        fiber_100g=payload.fiber_100g,
    )
    session.add(food)
    await session.flush()
    for index, portion in enumerate(payload.portions):
        session.add(
            Portion(
                food_id=food.id,
                label=portion.label,
                grams=portion.grams,
                # First one wins if the form marked several; a default that is
                # ambiguous is not a default.
                is_default=portion.is_default and index == 0,
            )
        )
    await session.commit()
    await session.refresh(food, ["portions"])
    return to_food_out(food, user_id)


@router.post("/label", response_model=LabelReadOut)
async def read_a_label(
    photo: UploadFile = File(...),
    reader=Depends(get_label_reader),
    user_id: int = Depends(get_current_user),
) -> LabelReadOut:
    """Lee la tabla nutricional de una foto y **propone** un alta.

    No escribe. Devuelve lo que rellenaría el formulario, y el formulario sigue
    siendo la única puerta del catálogo — la misma regla que ya vale para el
    import y para el parser. Que la foto acierte no la convierte en permiso.

    Las tres salidas acaban en el mismo sitio, el formulario, y sólo cambia con
    cuánto viene puesto:

    - se leyó          → campos rellenos, y en pantalla de qué columna salieron
    - `refusal=column` → en blanco, porque lo leído era por ración o por 100 ml
    - `refusal=unreadable` → en blanco, porque no hubo respuesta

    Ninguna es un callejón: un fallo aquí te deja tecleando, que es exactamente
    donde estabas antes de que existiera el botón.
    """
    if reader is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="la lectura de etiquetas no está configurada",
        )
    image = await photo.read()
    if len(image) > MAX_PHOTO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="la foto es demasiado grande",
        )
    try:
        payload = await reader(image, photo.content_type or "image/jpeg")
    except LabelUnreadable:
        # Cuota agotada, sin red, respuesta rara: da igual. Lo que la pantalla
        # necesita saber es que hay que teclear, no qué dijo la API de Google.
        return LabelReadOut(refusal="unreadable", nutrients=dict(UNKNOWN_NUTRIENTS))
    try:
        read = read_from_payload(payload)
    except ColumnRefused as refused:
        # Rechazada entera, no reescalada. El nombre y la marca tampoco se
        # aprovechan: si la columna estaba mal leída, lo demás de esa lectura no
        # merece más confianza que ella.
        return LabelReadOut(
            refusal="column",
            refused_column=refused.header,
            nutrients=dict(UNKNOWN_NUTRIENTS),
        )
    return LabelReadOut(
        name=read.name,
        brand=read.brand,
        column_header=read.column_header,
        nutrients=read.nutrients,
        dropped=list(read.dropped),
    )


# El repertorio: cuántas entradas se miran para construirlo, y desde cuándo.
#
# Comer es repetirse, pero lo que repites cambia: un mes de arroz no puede
# seguir mandando en marzo. La ventana es lo que hace que la rejilla se parezca
# a lo que comes *ahora*, y el tope es lo que impide que un diario de dos años
# se traiga entero para contar cuatro filas.
FREQUENT_WINDOW_DAYS = 90
FREQUENT_SCAN = 400


@router.get("/frequent", response_model=list[FrequentFoodOut])
async def frequent_foods(
    limit: int = Query(default=6, ge=1, le=12),
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[FrequentFoodOut]:
    """Lo que sueles comer, lo más repetido primero.

    Va **antes** de `/{food_id}` a propósito: declarado después, «frequent» se
    leería como un id y la ruta contestaría 422 sin llegar aquí.

    El recuento se hace en Python y no en SQL. Son cuatrocientas filas como
    mucho, y la moda de los gramos —la cantidad que de verdad repites, no la
    última que escribiste— pide una ventana que SQLite y Postgres no escriben
    igual. Con este volumen, la claridad gana.
    """
    since = date.today() - timedelta(days=FREQUENT_WINDOW_DAYS)
    entries = list(
        (
            await session.execute(
                select(LogEntry)
                .where(LogEntry.user_id == user_id, LogEntry.log_date >= since)
                .order_by(LogEntry.logged_at.desc(), LogEntry.id.desc())
                .limit(FREQUENT_SCAN)
            )
        )
        .scalars()
        .all()
    )

    # `food_id` es nulo cuando el alimento se borró del catálogo: la fila del
    # diario sigue leyéndose por su nombre congelado, pero no hay nada que
    # volver a registrar de un toque, así que no entra en el repertorio.
    tally: dict[int, list[LogEntry]] = {}
    for entry in entries:
        if entry.food_id is not None:
            tally.setdefault(entry.food_id, []).append(entry)

    # Lo más repetido primero; a igualdad, lo más reciente. `entries` ya viene
    # de la más nueva a la más vieja, así que la primera de cada grupo lo dice.
    ranked = sorted(tally.items(), key=lambda kv: (-len(kv[1]), -kv[1][0].id))[:limit]
    if not ranked:
        return []

    foods = {
        food.id: food
        for food in (
            await session.execute(
                # Sin `defer(nutrients_json)`, a diferencia de la búsqueda:
                # `calcular_nutrientes` lo lee, y una columna diferida se
                # cargaría sola con IO síncrona dentro del bucle asíncrono.
                select(Food).where(
                    Food.id.in_([food_id for food_id, _ in ranked]),
                    # `_visible` y no un `or_` a mano: además de lo que es tuyo
                    # y lo que es de todos, deja fuera lo archivado — un
                    # alimento que retiraste no puede volver de un toque.
                    _visible(user_id),
                )
            )
        )
        .unique()
        .scalars()
        .all()
    }

    out: list[FrequentFoodOut] = []
    for food_id, rows in ranked:
        food = foods.get(food_id)
        if food is None:
            continue
        grams = _most_repeated(row.grams for row in rows)
        out.append(
            FrequentFoodOut(
                food_id=food.id,
                name=food.name,
                brand=food.brand,
                grams=grams,
                kcal=calcular_nutrientes(food, grams)["kcal"],
                meal_slot=_most_repeated(row.meal_slot for row in rows),
                times=len(rows),
            )
        )
    return out


def _most_repeated(values):
    """El valor que más se repite; a igualdad, el de la entrada más reciente.

    El desempate no es un detalle: con 80, 80 y 200 g la moda es 80 —la
    cantidad que de verdad usas—, pero con 80 y 200 las dos empatan y lo último
    que hiciste es la mejor apuesta. `values` llega ya de la más nueva a la más
    vieja, así que el primer máximo que encuentra es el más reciente.
    """
    counts: dict[object, int] = {}
    for value in values:
        counts[value] = counts.get(value, 0) + 1
    return max(counts, key=lambda value: counts[value])


@router.get("/{food_id}", response_model=FoodOut)
async def get_food(
    food_id: int,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FoodOut:
    food = await _load(session, food_id, user_id)
    return to_food_out(food, user_id)


@router.patch("/{food_id}", response_model=FoodOut)
async def correct_food(
    food_id: int,
    payload: FoodPatch,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FoodOut:
    """Correct a food you created.

    Nothing already in the diary moves. `log_entries` froze its numbers when the
    entry was written, and this endpoint does not go looking for them — a label
    you misread in March must not silently restate what February's totals were.
    """
    food = await _load(session, food_id, user_id)
    if food.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="the shared catalogue is not editable",
        )
    fields = payload.model_dump(exclude_unset=True)
    if "name" in fields:
        food.name = fields.pop("name")
        food.name_folded = fold(food.name)
    if "brand" in fields:
        food.brand = fields.pop("brand") or None
        food.brand_folded = fold(food.brand) if food.brand else None
    for field, value in fields.items():
        setattr(food, field, value)
    await session.commit()
    await session.refresh(food, ["portions"])
    return to_food_out(food, user_id)


async def _load(session: AsyncSession, food_id: int, user_id: int) -> Food:
    food = (
        await session.execute(
            select(Food)
            # Sin `defer` aquí, a diferencia de la búsqueda: es una sola fila,
            # 1,7 KB no son nada, y una columna diferida en una sesión async
            # revienta en cuanto alguien la lea — una trampa esperando a que
            # `FoodOut` crezca.
            .options(selectinload(Food.portions))
            .where(Food.id == food_id, _visible(user_id))
        )
    ).scalar_one_or_none()
    if food is None:
        raise HTTPException(status_code=404, detail="food not found")
    return food
