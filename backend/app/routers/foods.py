"""The food catalogue: finding a food, and adding one nobody has.

Two kinds of row live in `foods`. The shared catalogue (CIQUAL, later Open Food
Facts) has `user_id = NULL` and is read-only from here — it is measurements, not
belongings. Anything you typed yourself carries your id and is yours to correct.
Search reads both; writes only ever touch yours.
"""

import logging
from datetime import date, timedelta
from time import perf_counter
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer, selectinload

from ..auth import get_current_user
from ..config import settings
from ..db import get_session
from ..food_groups import FAMILIAS
from ..gemini import LabelUnreadable, read_label
from ..label import ColumnRefused, read_from_payload
from ..openfoodfacts import (
    NotFound,
    Unreachable,
    Unusable,
    fetch,
    looks_like_a_barcode,
    read_product,
)
from ..models import Food, FoodAlias, LogEntry, Portion, visible_foods, visible_portions
from ..naming import fold_exercise_name as fold
from ..nutrition import NUTRIENTS, kcal_disagreement
from ..refuse import nutrientes_de_lo_pesado, referencia
from ..schemas import (
    BarcodeLookupOut,
    BarcodeClash,
    BarcodeTaken,
    BarcodeTakenError,
    BoneReferenceOut,
    KcalMismatch,
    FoodIn,
    FoodOut,
    FoodPatch,
    FrequentFoodOut,
    UsualAmountOut,
    LabelReadOut,
    MyPortionIn,
    PortionOut,
)
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

# La única parte de la app que llama a un tercero mientras alguien espera, y por
# tanto la única que puede fallar por motivos que no están en el código. Sin una
# línea por lectura, «no he podido leer la etiqueta» es indistinguible en los
# logs de «no había clave», de «Google devolvió 503» y de «se acabó la cuota» —
# y averiguar cuál de los cuatro fue exige acceso a la API de Render y a alguien
# que sepa leerla. Pasó el 2026-09-04.
#
# Qué pasó, no qué comes: ni la clave, ni un byte de la foto, ni el nombre del
# alimento. Un log es el sitio más fácil de olvidar que existe.
log = logging.getLogger("app.label")


async def get_barcode_lookup():
    """Quien resuelve un EAN contra Open Food Facts.

    Dependencia y no llamada directa por lo mismo que el lector de etiquetas:
    en la suite no hay red, y lo que hay que fijar no es que OFF conteste sino
    qué hacemos con lo que conteste — que es donde está todo el riesgo.
    """
    return fetch


# De la familia que eliges al código que se guarda.
#
# Se pide la **familia** y no el código porque es lo que alguien sabe de un
# brócoli, y porque es el vocabulario que hablan las reglas. Se guarda el primer
# subgrupo de esa familia: `familia()` lo vuelve a leer como la misma familia,
# que es lo único que se consulta. La distinción que se pierde —pescado crudo
# contra cocinado— no la pregunta ninguna regla.
def _codigos_de_familia(nombre: str | None) -> tuple[str | None, str | None]:
    codes = FAMILIAS.get(nombre or "")
    if not codes:
        return None, None
    subgroup = codes[0]
    return subgroup[:2], subgroup


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
            image,
            api_key=key,
            model=settings.gemini_model,
            mime_type=mime_type,
            fallback=settings.gemini_fallback_model or None,
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
        .where(visible_foods(user_id))
    )
    if not needle:
        # Nada escrito todavía: tu propia estantería, la más reciente primero.
        # Listar el catálogo entero aquí serían tres mil filas que no contestan
        # a ninguna pregunta. Ordenado por id y no por `created_at`: dos
        # alimentos dados de alta en el mismo segundo comparten marca de tiempo,
        # y el id es lo que el orden de inserción es de verdad (mismo
        # razonamiento que `Day.workouts`).
        #
        # Con su tope, como la otra rama: sin él se traía la estantería entera
        # para cortarla a treinta en Python, que es la única consulta del
        # módulo que no se limitaba a sí misma.
        return stmt.where(Food.user_id == user_id).order_by(Food.id.desc()).limit(SEARCH_LIMIT)
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
    rows = _sin_repetidos(rows)
    return [to_food_out(f, user_id) for f in rows[:SEARCH_LIMIT]]


def _sin_repetidos(rows: list[Food]) -> list[Food]:
    """Un mismo código de barras sale una vez, y es el tuyo.

    Con el catálogo del súper importado, el queso batido que diste de alta
    escaneando y el del catálogo son el mismo producto: enseñar los dos es
    preguntarte cuál es cuál. Lo tuyo manda porque es lo que corregiste.
    """
    tuyos = {f.barcode for f in rows if f.barcode and f.user_id is not None}
    # Y el mismo producto del catálogo en dos envases —brik y pack— son dos
    # códigos que tienen que poder escanearse, pero una sola fila al buscar.
    # Mismo nombre, marca y cifras: no hay nada que elegir entre ellos.
    vistos: set[tuple] = set()
    fuera = []
    for f in rows:
        if f.user_id is None and f.barcode in tuyos:
            continue
        if f.user_id is None and f.barcode:
            clave = (f.name_folded, f.brand_folded, f.kcal_100g, f.protein_100g)
            if clave in vistos:
                continue
            vistos.add(clave)
        fuera.append(f)
    return fuera


@router.post(
    "",
    response_model=FoodOut,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"model": BarcodeTakenError, "description": "That barcode is already yours"}},
)
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
    if payload.barcode:
        await _refuse_a_taken_barcode(session, user_id, payload.barcode)

    food = Food(
        user_id=user_id,
        name=payload.name,
        name_folded=fold(payload.name),
        brand=payload.brand or None,
        brand_folded=fold(payload.brand) if payload.brand else None,
        barcode=payload.barcode or None,
        source="manual",
        # A number you typed off a Spanish label is the European convention,
        # where fibre is counted apart from carbohydrate.
        carb_convention="available",
        kcal_100g=payload.kcal_100g,
        protein_100g=payload.protein_100g,
        fat_100g=payload.fat_100g,
        carbs_100g=payload.carbs_100g,
        fiber_100g=payload.fiber_100g,
        refuse_pct=payload.refuse_pct,
        kcal_basis=payload.kcal_basis,
        **dict(zip(("group_code", "subgroup_code"), _codigos_de_familia(payload.familia), strict=True)),
    )
    session.add(food)
    await session.flush()
    for portion in _portion_rows(payload.portions, food.id):
        session.add(portion)
    try:
        await session.commit()
    except IntegrityError:
        # La comprobación de arriba resuelve el caso normal; ésta es la carrera
        # que deja pasar, y es la que de verdad ocurre: dos toques seguidos en
        # «Guardar» son dos peticiones que miran antes de que ninguna escriba.
        await session.rollback()
        clash = (
            await session.execute(
                select(Food).where(Food.user_id == user_id, Food.barcode == payload.barcode)
            )
        ).scalar_one_or_none()
        if clash is None:
            raise
        raise _barcode_taken(clash) from None
    await session.refresh(food, ["portions"])
    return to_food_out(food, user_id)


async def _refuse_a_taken_barcode(
    session: AsyncSession, user_id: int, barcode: str, *, except_food_id: int | None = None
) -> None:
    """Salta con un 409 si ese código ya es de otro alimento tuyo.

    `except_food_id` deja que una corrección reescriba el código que el
    alimento ya tenía sin chocar consigo mismo (mismo motivo por el que el
    renombrado de ejercicios se excluye de su propia comprobación).
    """
    stmt = select(Food).where(Food.user_id == user_id, Food.barcode == barcode)
    if except_food_id is not None:
        stmt = stmt.where(Food.id != except_food_id)
    clash = (await session.execute(stmt)).scalar_one_or_none()
    if clash is not None:
        raise _barcode_taken(clash)


def _barcode_taken(clash: Food) -> HTTPException:
    """El 409 de un código repetido, con el alimento que ya lo lleva dentro.

    Mismo trato que el 409 del renombrado: el número por sí solo no deja hacer
    nada. La búsqueda va por nombre y no por código, así que el cliente no
    tiene forma de encontrar el alimento que choca — y es casi siempre uno que
    acabas de crear sin enterarte.
    """
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=BarcodeTaken(
            message="ya tienes un alimento con ese código de barras",
            food=BarcodeClash(id=clash.id, name=clash.name, brand=clash.brand),
        ).model_dump(),
    )


def _portion_rows(portions, food_id: int) -> list[Portion]:
    """Las raciones tal y como se guardan, con una sola por defecto.

    La primera **marcada** gana, no la primera a secas: un valor por defecto
    ambiguo no es un valor por defecto, pero exigir que sea la de arriba
    descartaba en silencio la marca de cualquier otra y dejaba el alimento sin
    ninguna. Compartida entre el alta y la corrección para que la regla no se
    conteste distinto según por dónde entres.
    """
    default_at = next((i for i, p in enumerate(portions) if p.is_default), None)
    return [
        Portion(food_id=food_id, label=p.label, grams=p.grams, is_default=i == default_at)
        for i, p in enumerate(portions)
    ]


@router.get("/barcode/{ean}", response_model=BarcodeLookupOut)
async def scan_barcode(
    ean: str,
    lookup=Depends(get_barcode_lookup),
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BarcodeLookupOut:
    """Resuelve un código de barras. La puerta barata.

    Primero mira si ya lo tienes: **un producto conocido no consulta a nadie**,
    así que la segunda vez que escaneas el mismo yogur funciona sin red, sin
    espera y sin gastar la cuota de fotos. Ésa es la regla que hace que esto
    valga la pena, y la que el escáner suele romper.

    Si no lo tienes, se lo pregunta a Open Food Facts y devuelve una
    **propuesta** para el formulario. No escribe: dar de alta sigue siendo cosa
    de alguien mirando lo que hay escrito. Que un código acierte no es permiso.

    Ninguna de sus salidas es un callejón — la peor te deja tecleando con el
    código ya puesto, que es una línea menos que antes de escanear.
    """
    started = perf_counter()

    def note(outcome: str, **fields) -> None:
        parts = " ".join(f"{k}={v}" for k, v in fields.items() if v not in (None, "", ()))
        log.info(
            "barcode scan: outcome=%s ms=%d %s",
            outcome,
            round((perf_counter() - started) * 1000),
            parts,
        )

    code = ean.strip()
    if not looks_like_a_barcode(code):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="eso no es un código de barras",
        )

    mine = (
        (
            await session.execute(
                select(Food)
                .options(selectinload(Food.portions))
                .where(Food.barcode == code, Food.user_id == user_id, Food.archived.is_(False))
            )
        )
        .scalars()
        .first()
    )
    if mine is not None:
        # `asked=no` es la línea que dice que la regla se está cumpliendo: un
        # producto conocido no sale a la red. Si esto empieza a salir `yes` para
        # cosas que ya tienes, el escáner ha dejado de ser la puerta barata.
        note("mine", asked="no")
        return BarcodeLookupOut(barcode=code, food=to_food_out(mine, user_id))

    # Después de lo tuyo, el catálogo compartido: los productos del súper que
    # importa `scripts/import_off.py` ya están en la base, y escanear uno es lo
    # mismo que escanear uno tuyo. Lo tuyo va antes porque es lo que corregiste.
    shared = (
        (
            await session.execute(
                select(Food)
                .options(selectinload(Food.portions))
                .where(Food.barcode == code, Food.user_id.is_(None), Food.archived.is_(False))
            )
        )
        .scalars()
        .first()
    )
    if shared is not None:
        note("catalogue", asked="no")
        return BarcodeLookupOut(barcode=code, food=to_food_out(shared, user_id))

    try:
        payload = await lookup(code)
        read = read_product(code, payload)
    except NotFound:
        note("unknown", asked="yes")
        return BarcodeLookupOut(barcode=code, refusal="unknown")
    except Unusable as refused:
        # Con su motivo: «no me vale» sin decir por qué se lee como un fallo de
        # la app, y esto no lo es — es una ficha que no da para lo que pide la
        # base de datos.
        note("unusable", asked="yes", reason=repr(refused.reason))
        return BarcodeLookupOut(barcode=code, refusal="unusable", refused_reason=refused.reason)
    except Unreachable as exc:
        note("offline", asked="yes", error=type(exc.__cause__).__name__)
        return BarcodeLookupOut(barcode=code, refusal="offline")

    off_by = kcal_disagreement(**read.nutrients)
    note(
        "off",
        asked="yes",
        per=read.per,
        read=sum(1 for v in read.nutrients.values() if v is not None),
        mismatch=f"{off_by[0]}vs{off_by[1]}" if off_by else None,
    )
    return BarcodeLookupOut(
        barcode=code,
        name=read.name,
        brand=read.brand,
        per=read.per,
        nutrients=read.nutrients,
        mismatch=KcalMismatch(declared=off_by[0], computed=off_by[1]) if off_by else None,
    )


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
    started = perf_counter()

    def note(outcome: str, **fields) -> None:
        parts = " ".join(f"{k}={v}" for k, v in fields.items() if v not in (None, "", ()))
        elapsed = round((perf_counter() - started) * 1000)
        log.info("label read: outcome=%s ms=%d %s", outcome, elapsed, parts)

    if reader is None:
        note("not_configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="la lectura de etiquetas no está configurada",
        )
    image = await photo.read()
    if len(image) > MAX_PHOTO_BYTES:
        note("too_big", kb=len(image) // 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="la foto es demasiado grande",
        )
    try:
        payload = await reader(image, photo.content_type or "image/jpeg")
    except LabelUnreadable as exc:
        # Sin red, saturado, respuesta rara: da igual cuál, se termina tecleando.
        # La cuota es la excepción y viaja aparte, porque repetir la foto no la
        # arregla y hay que decirlo o te quedas insistiendo.
        if exc.quota:
            note("quota", model=settings.gemini_model, scope=exc.quota)
            return LabelReadOut(
                refusal="quota",
                quota_scope=exc.quota,
                nutrients=dict(UNKNOWN_NUTRIENTS),
            )
        # Lo que contestó la API —`503`, `ReadTimeout`—, no su mensaje: no puede
        # llevar dentro trozos de la petición. Sin `detail`, la clase del error
        # de debajo; con ella sola, hasta el 2026-10-05 el log decía
        # `ModelUnavailable` a todo, que es el nombre del envoltorio.
        note(
            "unreadable",
            model=settings.gemini_model,
            error=exc.detail or type(exc.__cause__).__name__,
        )
        return LabelReadOut(refusal="unreadable", nutrients=dict(UNKNOWN_NUTRIENTS))
    try:
        read = read_from_payload(payload)
    except ColumnRefused as refused:
        note("column", model=settings.gemini_model, header=repr(refused.header))
        # Rechazada entera, no reescalada. El nombre y la marca tampoco se
        # aprovechan: si la columna estaba mal leída, lo demás de esa lectura no
        # merece más confianza que ella.
        return LabelReadOut(
            refusal="column",
            refused_column=refused.header,
            nutrients=dict(UNKNOWN_NUTRIENTS),
        )
    # Lo único que caza un dígito mal leído: las kcal y los macros de una
    # etiqueta tienen que dar lo mismo, y un 3 leído como 8 rompe la igualdad.
    off_by = kcal_disagreement(**read.nutrients)
    note(
        "ok",
        model=settings.gemini_model,
        per=read.per,
        mismatch=f"{off_by[0]}vs{off_by[1]}" if off_by else None,
        # Cuántas cifras se creyeron y cuántas se tiraron. Es lo que dice, con
        # el tiempo, si el modelo va bien — sin guardar ni una etiqueta.
        read=sum(1 for v in read.nutrients.values() if v is not None),
        dropped=",".join(read.dropped),
    )
    return LabelReadOut(
        name=read.name,
        brand=read.brand,
        column_header=read.column_header,
        per=read.per,
        # La transcripción viaja a la pantalla. Es lo único que contesta a «¿qué
        # ha leído?» sin obligar a creerse el veredicto — y sin ella, un
        # formulario vacío y uno relleno se explican igual de mal.
        rows=[str(row) for row in (payload.get("rows") or [])][:20],
        nutrients=read.nutrients,
        dropped=list(read.dropped),
        mismatch=KcalMismatch(declared=off_by[0], computed=off_by[1]) if off_by else None,
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
    # Comida simple, «Otra cosa»: lo que sueles comer *en esa comida*. Con
    # ella, el recuento y la cantidad salen sólo de lo apuntado ahí: la leche
    # de la cena no es la del desayuno.
    slot: Literal["desayuno", "comida", "cena", "snack"] | None = Query(default=None),
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
                .where(
                    LogEntry.user_id == user_id,
                    LogEntry.log_date >= since,
                    *([LogEntry.meal_slot == slot] if slot else []),
                )
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
                    # `visible_foods` y no un `or_` a mano: además de lo que
                    # es tuyo y lo que es de todos, deja fuera lo archivado — un
                    # alimento que retiraste no puede volver de un toque.
                    visible_foods(user_id),
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
        # La cantidad que más repites, con su medida si fue una: «2 cdas» se
        # repite como «2 cdas», no como los 30 g que pesan.
        measure, measure_count, grams = _most_repeated(
            (row.measure, row.measure_count, row.grams) for row in rows
        )
        # Como se pesó la última vez: con hueso o sin él.
        with_bone = rows[0].edible_grams is not None
        try:
            kcal = nutrientes_de_lo_pesado(food, grams, with_bone)[0]["kcal"]
        except ValueError:
            # Nadie sabe ya si sus kcal cuentan el hueso: sin previsión.
            kcal = None
        out.append(
            FrequentFoodOut(
                food_id=food.id,
                name=food.name,
                brand=food.brand,
                grams=grams,
                kcal=kcal,
                meal_slot=_most_repeated(row.meal_slot for row in rows),
                times=len(rows),
                with_bone=with_bone,
                measure=measure,
                measure_count=measure_count,
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


USUAL_AMOUNTS = 3


@router.get("/bone-reference", response_model=BoneReferenceOut)
async def bone_reference(
    name: str = Query(min_length=1, max_length=160),
    _user_id: int = Depends(get_current_user),
) -> BoneReferenceOut:
    """El hueso típico de un nombre, para que el alta proponga «Lleva hueso».

    Sólo lee la tabla de `refuse.py`; no toca la base. Antes de `/{food_id}`,
    que si no se quedaría con «bone-reference» como si fuera un id.
    """
    ref = referencia(name)
    return BoneReferenceOut(refuse_pct=ref.refuse_pct if ref else None)


@router.get("/{food_id}/usual", response_model=list[UsualAmountOut])
async def usual_amounts(
    food_id: int,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[UsualAmountOut]:
    """Las cantidades que repites para este alimento, la más repetida primero.

    La misma ventana y el mismo desempate que `/frequent`, para que la rejilla y
    la hoja hablen de lo mismo. Sin índice nuevo ni nada precalculado: son las
    entradas de un alimento en noventa días, y cualquier dato derivado habría que
    mantenerlo al día en cada escritura — y `recompute` reescribe entradas.

    Se agrupa en Python y no con `GROUP BY round(grams, 1)`: Postgres no tiene
    `round` para `double precision` con decimales, y SQLite sí, así que la
    consulta que pasaría los tests reventaría en producción.
    """
    await _load(session, food_id, user_id)
    since = date.today() - timedelta(days=FREQUENT_WINDOW_DAYS)
    rows = (
        await session.execute(
            select(LogEntry.grams, LogEntry.measure, LogEntry.measure_count)
            .where(
                LogEntry.user_id == user_id,
                LogEntry.food_id == food_id,
                LogEntry.log_date >= since,
            )
            .order_by(LogEntry.logged_at.desc(), LogEntry.id.desc())
        )
    ).all()

    # Redondeado a la décima: 125 y 125,00001 son la misma cantidad, y la
    # aritmética de una ración por cuántas deja colas así. Una medida casera
    # cuenta por sí misma: «2 cdas» y «30 g» son dos cantidades distintas.
    counts: dict[tuple, int] = {}
    grams_of: dict[tuple, float] = {}
    for grams, measure, measure_count in rows:
        key = (measure, measure_count) if measure else (None, round(grams, 1))
        counts[key] = counts.get(key, 0) + 1
        grams_of.setdefault(key, round(grams, 1))
    if not counts:
        return []
    # `sorted` es estable y `counts` guarda el orden de la primera aparición,
    # que es la más reciente: a igualdad, gana lo último que hiciste.
    ranked = [key for key, _ in sorted(counts.items(), key=lambda kv: -kv[1])[:USUAL_AMOUNTS]]
    # La última siempre entra, porque con su unidad se abre la hoja. Si no
    # llegó a las tres primeras, ocupa el sitio de la tercera: tiene como
    # mucho sus mismas veces, así que el orden no cambia.
    latest = next(iter(counts))
    if latest not in ranked:
        ranked[-1] = latest
    return [
        UsualAmountOut(
            grams=grams_of[key],
            times=counts[key],
            measure=key[0],
            measure_count=key[1] if key[0] else None,
            latest=key == latest,
        )
        for key in ranked
    ]


@router.post("/{food_id}/portions", response_model=PortionOut, status_code=status.HTTP_201_CREATED)
async def add_my_portion(
    food_id: int,
    payload: MyPortionIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PortionOut:
    """Una ración tuya sobre cualquier alimento que veas, también del catálogo.

    No es editar el alimento —el catálogo compartido no se toca—: es tu dato sobre
    él, que sólo ves tú. Lo escribe el modal de la voz cuando confirmas cuánto
    pesa «un huevo» (docs/registro-por-voz.md). Si ya tenías una con esa
    etiqueta, se corrige en vez de duplicarse.
    """
    food = await _load(session, food_id, user_id)
    label = payload.label
    mine = next(
        (p for p in visible_portions(food, user_id) if p.user_id == user_id and p.label == label),
        None,
    )
    if mine is None:
        mine = Portion(food_id=food.id, label=label, grams=payload.grams, user_id=user_id)
        session.add(mine)
    else:
        mine.grams = payload.grams
    await session.commit()
    return PortionOut.model_validate(mine)


@router.get("/{food_id}", response_model=FoodOut)
async def get_food(
    food_id: int,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FoodOut:
    food = await _load(session, food_id, user_id)
    return to_food_out(food, user_id)


@router.patch(
    "/{food_id}",
    response_model=FoodOut,
    responses={409: {"model": BarcodeTakenError, "description": "That barcode is already yours"}},
)
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
        if fields["name"] is None:
            # El único campo del patch donde `null` no significa nada: la
            # columna es NOT NULL y el nombre es por lo que se busca. Los demás
            # sí lo aceptan a propósito —desmedir un nutriente es legítimo, y es
            # la regla de que `NULL` no es `0`—, así que el rechazo va por
            # campo y no por la petición entera. Antes llegaba a `fold(None)`.
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="un alimento no puede quedarse sin nombre",
            )
        food.name = fields.pop("name")
        food.name_folded = fold(food.name)
    if "brand" in fields:
        food.brand = fields.pop("brand") or None
        food.brand_folded = fold(food.brand) if food.brand else None
    if "barcode" in fields:
        new_barcode = fields.pop("barcode") or None
        if new_barcode:
            await _refuse_a_taken_barcode(
                session, user_id, new_barcode, except_food_id=food.id
            )
        food.barcode = new_barcode
    if "portions" in fields:
        fields.pop("portions")
        # La lista entera sustituye a la anterior. Se puede rehacer sin miedo
        # porque el diario guarda los gramos ya resueltos y nunca un puntero a
        # la ración: nada de lo registrado apunta a estas filas.
        food.portions.clear()
        food.portions.extend(_portion_rows(payload.portions or [], food.id))
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
            .where(Food.id == food_id, visible_foods(user_id))
        )
    ).scalar_one_or_none()
    if food is None:
        raise HTTPException(status_code=404, detail="food not found")
    return food
