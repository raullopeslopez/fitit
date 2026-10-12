"""Platos: lo que de verdad se cocina, y registrarlos en el diario.

Dos reglas de la casa gobiernan este fichero:

- **La aritmética no vive aquí.** `macros_de_plato()` y `macros_por_racion()`
  están en `nutrition.py`, con el resto. Este router lee, escribe y traduce.
- **Registrar un plato congela una entrada por ingrediente, no una suma.** Una
  sola fila con el total sería más corta de leer y perdería tres cosas que ya
  funcionan: repesar una entrada (`escalar_nutrientes`), corregir un
  ingrediente suelto, y el subtotal por comida, que cuenta filas de alimento.
  El diario sigue siendo filas de alimento; el plato es de dónde salieron.
"""

from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import get_current_user
from ..config import settings
from ..db import get_session
from ..gemini import ModelUnavailable, suggest_dishes
from ..models import Batch, Dish, DishIdea, DishIngredient, Food, LogEntry, User, visible_foods
from ..naming import fold_exercise_name as fold
from ..nutrition import calcular_nutrientes, dump_nutrients, food_log_date, macros_de_plato
from ..nutrition import macros_por_racion, proteina_minima
from ..repertoire import ProposalRefused, read_proposals
from ..schemas import (
    BatchIn,
    BatchOut,
    DishDiscardedOut,
    DishGenerateIn,
    DishGenerateOut,
    DishIn,
    DishLogIn,
    DishOut,
    DishPatch,
    DishPreviewIn,
    DishPreviewOut,
    DishSuggestionOut,
    LogEntryOut,
)
from ..serialization import to_entry_out

router = APIRouter(prefix="/dishes", tags=["dishes"])


async def _load(session: AsyncSession, dish_id: int, user_id: int) -> Dish:
    """El plato, o un 404. Nunca el de otro: un id ajeno no confirma nada."""
    dish = (
        await session.execute(
            select(Dish)
            .options(selectinload(Dish.ingredients))
            .where(Dish.id == dish_id, Dish.user_id == user_id)
        )
    ).scalar_one_or_none()
    if dish is None:
        raise HTTPException(status_code=404, detail="dish not found")
    return dish


async def _foods(session: AsyncSession, user_id: int, ids: list[int]) -> dict[int, Food]:
    """Los alimentos que el plato nombra, comprobando que existen **para ti**.

    `visible_foods` y no un `or_` a mano: la regla de qué alimentos existen para
    alguien es una sola y vive en `models.py`.
    """
    rows = (
        await session.execute(select(Food).where(Food.id.in_(ids), visible_foods(user_id)))
    ).scalars().all()
    found = {food.id: food for food in rows}
    missing = [i for i in ids if i not in found]
    if missing:
        raise HTTPException(status_code=404, detail=f"food not found: {missing[0]}")
    return found


# Cuánto dura una olla: lo que se come de una tanda en una semana. Pasado eso,
# lo que quede ya no es aquella olla.
DURA_LA_OLLA = timedelta(days=6)


async def _ollas(session: AsyncSession, user_id: int, dish_ids) -> dict[int, Batch]:
    """La olla vigente de cada plato: la última pesada de los últimos días."""
    if not dish_ids:
        return {}
    desde = food_log_date(datetime.now(UTC)) - DURA_LA_OLLA
    ollas: dict[int, Batch] = {}
    for olla in (
        await session.execute(
            select(Batch)
            .where(Batch.user_id == user_id, Batch.dish_id.in_(dish_ids), Batch.cooked_on >= desde)
            .order_by(Batch.cooked_on, Batch.id)
        )
    ).scalars():
        ollas[olla.dish_id] = olla
    return ollas


def _olla_out(olla: Batch | None) -> BatchOut | None:
    if olla is None:
        return None
    return BatchOut(id=olla.id, cooked_grams=olla.cooked_grams, cooked_on=olla.cooked_on)


def _to_out(dish: Dish, foods: dict[int, Food], olla: Batch | None = None) -> DishOut:
    pares = [(foods[i.food_id], i.grams) for i in dish.ingredients]
    totales, unknown = macros_de_plato(pares)
    return DishOut(
        id=dish.id,
        name=dish.name,
        servings=dish.servings,
        basis=dish.basis,
        method=dish.method,
        slots=dish.slots.split(",") if dish.slots else None,
        is_block=dish.is_block,
        kind=dish.kind,
        estimated=dish.estimated,
        batch=_olla_out(olla),
        ingredients=[
            {
                "id": i.id,
                "food_id": i.food_id,
                "food_name": foods[i.food_id].name,
                "grams": i.grams,
                "min_grams": i.min_grams,
                "max_grams": i.max_grams,
            }
            for i in dish.ingredients
        ],
        per_serving=macros_por_racion(totales, dish.servings),
        unknown=unknown,
    )


async def _out(session: AsyncSession, dish: Dish, user_id: int) -> DishOut:
    foods = await _foods(session, user_id, [i.food_id for i in dish.ingredients])
    ollas = await _ollas(session, user_id, [dish.id])
    return _to_out(dish, foods, ollas.get(dish.id))


@router.post("", response_model=DishOut, status_code=status.HTTP_201_CREATED)
async def create_dish(
    payload: DishIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DishOut:
    """Da de alta un plato. **No escribe en `foods`**: un plato no es un alimento.

    Es también la puerta de una idea convertida en plato (`idea_id`): el mismo
    alta, con la idea anotada, en una sola petición. Nada más crea platos.
    """
    await _foods(session, user_id, [i.food_id for i in payload.ingredients])
    if payload.idea_id is not None:
        idea = (
            await session.execute(
                select(DishIdea.id)
                .join(Food, Food.id == DishIdea.food_id)
                .where(DishIdea.id == payload.idea_id, visible_foods(user_id))
            )
        ).scalar_one_or_none()
        if idea is None:
            raise HTTPException(status_code=404, detail="idea not found")
    folded = fold(payload.name)
    clash = (
        await session.execute(
            select(Dish).where(Dish.user_id == user_id, Dish.name_folded == folded)
        )
    ).scalar_one_or_none()
    if clash is not None:
        raise HTTPException(status_code=409, detail=f"ya tienes «{clash.name}»")

    dish = Dish(
        user_id=user_id,
        name=payload.name,
        name_folded=folded,
        basis=payload.basis,
        method=payload.method,
        servings=payload.servings,
        slots=",".join(payload.slots) if payload.slots else None,
        is_block=payload.is_block,
        idea_id=payload.idea_id,
        ingredients=[
            DishIngredient(
                food_id=i.food_id,
                grams=i.grams,
                min_grams=i.min_grams,
                max_grams=i.max_grams,
            )
            for i in payload.ingredients
        ],
    )
    session.add(dish)
    await session.commit()
    await session.refresh(dish, ["ingredients"])
    return await _out(session, dish, user_id)


@router.post("/preview", response_model=DishPreviewOut)
async def preview_dish(
    payload: DishPreviewIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DishPreviewOut:
    """Lo que costaría una ración, **sin guardar nada**.

    Para el borrador de una idea: la pantalla enseña las macros por ración
    mientras se decide, y no las calcula ella — la aritmética es la misma que
    la del plato guardado (`macros_de_plato`, `macros_por_racion`).
    """
    foods = await _foods(session, user_id, [i.food_id for i in payload.ingredients])
    totales, unknown = macros_de_plato([(foods[i.food_id], i.grams) for i in payload.ingredients])
    return DishPreviewOut(
        per_serving=macros_por_racion(totales, payload.servings), unknown=unknown
    )


@router.get("", response_model=list[DishOut])
async def list_dishes(
    q: str = "",
    kind: Literal["casa", "fuera"] = "casa",
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[DishOut]:
    """Tus platos. `q` pliega igual que la búsqueda de alimentos.

    Con `kind=fuera`, tus sitios, del último en que comiste al primero: es el
    orden en que se vuelve a ellos. Uno sin entradas va al final, por nombre.
    """
    query = (
        select(Dish)
        .options(selectinload(Dish.ingredients))
        .where(Dish.user_id == user_id, Dish.kind == kind)
    )
    if q:
        query = query.where(Dish.name_folded.contains(fold(q)))
    if kind == "fuera":
        ultima = (
            select(func.max(LogEntry.id))
            .where(LogEntry.dish_id == Dish.id)
            .correlate(Dish)
            .scalar_subquery()
        )
        query = query.order_by(ultima.desc().nulls_last(), Dish.name)
    else:
        query = query.order_by(Dish.name)
    dishes = (await session.execute(query)).scalars().all()
    ids = {i.food_id for d in dishes for i in d.ingredients}
    foods = await _foods(session, user_id, sorted(ids)) if ids else {}
    ollas = await _ollas(session, user_id, [d.id for d in dishes])
    return [_to_out(dish, foods, ollas.get(dish.id)) for dish in dishes]


@router.get("/{dish_id}", response_model=DishOut)
async def get_dish(
    dish_id: int,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DishOut:
    return await _out(session, await _load(session, dish_id, user_id), user_id)


@router.patch("/{dish_id}", response_model=DishOut)
async def correct_dish(
    dish_id: int,
    payload: DishPatch,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DishOut:
    """Corrige el plato. **No toca lo ya registrado**: las entradas del diario
    llevan sus macros congelados y esto no las mira siquiera.

    Corregir las líneas de un sitio lo hace tuyo: lo que se apunte desde él
    deja de ser `estimated`. Lo ya apuntado sigue como se apuntó.
    """
    dish = await _load(session, dish_id, user_id)
    fields = payload.model_dump(exclude_unset=True)

    if "name" in fields:
        dish.name = fields["name"]
        dish.name_folded = fold(fields["name"])
    for key in ("servings", "basis", "method", "is_block"):
        if key in fields:
            setattr(dish, key, fields[key])
    if "slots" in fields:
        dish.slots = ",".join(fields["slots"]) if fields["slots"] else None
    if payload.ingredients is not None:
        await _foods(session, user_id, [i.food_id for i in payload.ingredients])
        dish.ingredients = [
            DishIngredient(
                food_id=i.food_id,
                grams=i.grams,
                min_grams=i.min_grams,
                max_grams=i.max_grams,
            )
            for i in payload.ingredients
        ]
        dish.estimated = False

    await session.commit()
    await session.refresh(dish, ["ingredients"])
    return await _out(session, dish, user_id)


@router.post("/{dish_id}/batches", response_model=BatchOut, status_code=status.HTTP_201_CREATED)
async def weigh_batch(
    dish_id: int,
    payload: BatchIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BatchOut:
    """Pesar la olla (fase 5). Una olla nueva sustituye a la anterior: la
    vigente es siempre la última que pesaste."""
    dish = await _load(session, dish_id, user_id)
    olla = Batch(
        user_id=user_id,
        dish_id=dish.id,
        cooked_grams=payload.cooked_grams,
        cooked_on=payload.date or food_log_date(datetime.now(UTC)),
    )
    session.add(olla)
    await session.commit()
    return _olla_out(olla)


@router.post("/{dish_id}/log", response_model=list[LogEntryOut], status_code=status.HTTP_201_CREATED)
async def log_dish(
    dish_id: int,
    payload: DishLogIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[LogEntryOut]:
    """Registra N raciones: una entrada congelada por ingrediente.

    Los gramos de cada fila son los del plato escalados por las raciones que te
    comes — la misma cuenta que hace `macros_por_racion`, pero sobre el peso.
    """
    dish = await _load(session, dish_id, user_id)
    foods = await _foods(session, user_id, [i.food_id for i in dish.ingredients])
    factor = payload.servings / dish.servings
    entries = await registrar_plato(
        session,
        dish=dish,
        foods=foods,
        user_id=user_id,
        moment=payload.logged_at or datetime.now(UTC),
        meal_slot=payload.meal_slot,
        gramos=[ingredient.grams * factor for ingredient in dish.ingredients],
    )
    await session.commit()
    for entry in entries:
        await session.refresh(entry)
    return [to_entry_out(entry) for entry in entries]


async def registrar_plato(
    session: AsyncSession,
    *,
    dish: Dish,
    foods: dict[int, Food],
    user_id: int,
    moment: datetime,
    meal_slot: str | None,
    gramos: list[float],
) -> list[LogEntry]:
    """Congela una entrada por ingrediente. **No hace commit**: lo hace quien llama.

    Está aquí y no duplicada en el plan porque escribir el diario desde un plato
    es una sola cosa, y dos copias acabarían congelando cifras distintas. Lo
    único que cambia entre los dos usos son los gramos: los de la receta
    escalados por las raciones cuando lo registras a mano, y los que el
    generador resolvió cuando confirmas un plan.
    """
    entries = []
    for ingredient, peso in zip(dish.ingredients, gramos):
        food = foods[ingredient.food_id]
        peso = round(peso, 2)
        if peso <= 0:
            continue
        computed = calcular_nutrientes(food, peso)
        entry = LogEntry(
            user_id=user_id,
            logged_at=moment.astimezone(UTC) if moment.tzinfo else moment.replace(tzinfo=UTC),
            log_date=food_log_date(moment),
            meal_slot=meal_slot,
            food_id=food.id,
            food_name_snapshot=food.name,
            grams=peso,
            nutrients_json=dump_nutrients(computed.pop("nutrients")),
            # Un sitio sin corregir apunta lo que estimó un modelo, y así se
            # dice en el diario («~250 g · estimado»).
            entry_source="estimated" if dish.estimated else "dish",
            dish_id=dish.id,
            **computed,
        )
        session.add(entry)
        entries.append(entry)
    return entries


async def get_dish_proposer():
    """Quien propone platos, o `None` si la feature está apagada.

    Dependencia y no llamada directa por lo mismo que `get_label_reader`: la
    suite no llama a Gemini —no hay red, ni clave, ni cuota que gastar en CI— y
    lo que se comprueba es qué hace el backend con lo que el modelo conteste,
    que es donde está el riesgo.
    """
    key = settings.gemini_api_key.get_secret_value()
    if not key:
        return None

    async def proposer(**kwargs) -> dict:
        return await suggest_dishes(**kwargs, api_key=key, model=settings.gemini_model)

    return proposer


# Cuántos platos tuyos se le enseñan por comida. Bastan para que vea qué
# cocinas; más alarga el prompt y empuja a copiar en vez de variar.
MAX_EJEMPLOS = 12


async def _ejemplos(session: AsyncSession, user_id: int) -> dict[str, list[str]]:
    """Tus platos por comida, para que el modelo proponga parecidos.

    Los que no dicen comida van a `cualquiera`: valen para todas, y repetirlos
    en las cuatro listas los contaría cuatro veces. Los más recientes primero:
    lo último que diste de alta —la pauta del nutricionista— es lo que más se
    parece a lo que comes ahora.
    """
    dishes = (
        await session.execute(
            select(Dish.name, Dish.slots).where(Dish.user_id == user_id).order_by(Dish.id.desc())
        )
    ).all()
    ejemplos: dict[str, list[str]] = {}
    for name, slots in dishes:
        for slot in (slots.split(",") if slots else ["cualquiera"]):
            lista = ejemplos.setdefault(slot, [])
            if len(lista) < MAX_EJEMPLOS:
                lista.append(name)
    return ejemplos


# Cuántos nombres se le mandan como despensa. Más que esto no afina la
# propuesta: alarga el prompt y le da sitio para irse por las ramas.
PANTRY_LIMIT = 60


# Los básicos de definición que el modelo recibe además de tu despensa (opción A,
# docs/catalogo-supermercado.md): la despensa sola es lo que ya comes, y con ella
# no aparece nunca la merluza que no has comprado todavía.
#
# **Una lista, no un cálculo.** Elegir por proteína por caloría sobre el catálogo
# entero se probó contra prod (6 oct) y salía faneca, pintarroja, sangre de
# vacuno y clara en polvo de CIQUAL, y sacarina e infusiones de Open Food Facts.
# Esto es lo que se vende en un súper español, crudo como se compra, con buena
# proteína por caloría; y lo que completa un plato, porque sin hidrato ni verdura
# el modelo sólo podría combinar proteína con proteína. Nombres exactos de CIQUAL.
# Los envasados de marca no van aquí: entran cuando los escaneas, por tu despensa.
BASICOS = (
    # Proteína
    "Pollo, pechuga, sin piel, cruda", "Pollo, contramuslo, carne, crudo", "Pavo, filete, crudo",
    "Cerdo, lomo magro, crudo", "Cerdo, solomillo, crudo", "Vacuno, solomillo, crudo",
    "Vacuno, carne picada 10 % MG, cruda", "Conejo, carne cruda", "Merluza, cruda",
    "Merluza, filete, congelado, crudo", "Bacalao fresco, crudo", "Rape, crudo", "Lenguado, crudo",
    "Dorada, cruda, de acuicultura", "Lubina (Mediterráneo), cruda, de acuicultura",
    "Salmón, crudo, de acuicultura", "Sepia, cruda", "Calamar, crudo", "Gamba, cruda",
    "Atún, al natural, en conserva, escurrido", "Huevo, crudo", "Huevo, clara, cruda",
    "Queso batido natural, 0 % MG", "Queso fresco tipo petit suisse, natural, 0 % MG",
    # Lo que completa el plato
    "Arroz blanco, crudo", "Arroz integral, crudo", "Patata, sin piel, cruda", "Copos de avena",
    "Lenteja, seca", "Garbanzo, seco", "Brócoli, crudo", "Calabacín, pulpa y piel, crudo",
    "Pimiento rojo, crudo", "Tomate, crudo", "Cebolla, cruda", "Espinaca, cruda",
    "Judía verde, cruda", "Aceite de oliva virgen extra", "Plátano, pulpa, crudo", "Fresa, cruda",
)


async def _basicos(session: AsyncSession) -> list[Food]:
    """Los básicos del catálogo compartido, en el orden de la lista."""
    filas = (
        await session.execute(
            select(Food).where(
                Food.user_id.is_(None), Food.archived.is_(False), Food.name.in_(BASICOS)
            )
        )
    ).scalars().all()
    return sorted(filas, key=lambda f: BASICOS.index(f.name))


async def _despensa(session: AsyncSession, user_id: int) -> list[Food]:
    """Lo que tienes: lo que has dado de alta y lo que has registrado alguna vez.

    No es «todo el catálogo»: CIQUAL son 3.185 alimentos y mandárselos enteros
    haría que propusiera con cosas que no has comprado en tu vida. La despensa
    es la huella de lo que de verdad pasa por tu cocina.
    """
    propios = select(Food).where(Food.user_id == user_id)
    registrados = select(Food).where(
        Food.id.in_(select(LogEntry.food_id).where(LogEntry.user_id == user_id))
    )
    rows = (
        await session.execute(propios.union(registrados).limit(PANTRY_LIMIT))
    ).all()
    ids = [row[0] for row in rows]
    if not ids:
        return []
    foods = (await session.execute(select(Food).where(Food.id.in_(ids)))).scalars().all()
    return list(foods)


def _plato(propuesta, user_id: int, folded: str) -> Dish:
    """La propuesta, convertida en un plato tuyo, con las comidas que dijo."""
    return Dish(
        user_id=user_id,
        name=propuesta.name,
        name_folded=folded,
        method=propuesta.method,
        basis=propuesta.basis,
        servings=propuesta.servings,
        slots=",".join(propuesta.slots) if propuesta.slots else None,
        ingredients=[DishIngredient(food_id=i.food_id, grams=i.grams) for i in propuesta.ingredients],
    )


def _repartir(propuestas, objetivo, foods, tomados: set[str], user_id: int):
    """Cada propuesta a su sitio: plato nuevo, cajón de sugerencias o descartada
    por poca proteína. Un plato que ya tienes no se duplica ni se pisa: lo tuyo
    manda sobre lo propuesto, que es lo mismo que hace el import de CIQUAL."""
    creados: list[Dish] = []
    sugerencias: list[DishSuggestionOut] = []
    descartados: list[DishDiscardedOut] = []
    for propuesta in propuestas:
        if not propuesta.usable:
            sugerencias.append(_sugerencia(propuesta))
            continue
        descarte = _poca_proteina(propuesta, objetivo, foods)
        if descarte is not None:
            descartados.append(descarte)
            continue
        folded = fold(propuesta.name)
        if folded in tomados:
            continue
        tomados.add(folded)
        creados.append(_plato(propuesta, user_id, folded))
    return creados, sugerencias, descartados


def _sugerencia(propuesta) -> DishSuggestionOut:
    """Al cajón: nombra un alimento que no tienes."""
    return DishSuggestionOut(
        name=propuesta.name,
        method=propuesta.method,
        basis=propuesta.basis,
        servings=propuesta.servings,
        ingredients=[{"food_name": i.food_name, "grams": i.grams} for i in propuesta.ingredients],
        missing=propuesta.unknown,
    )


def _poca_proteina(propuesta, objetivo: float | None, foods: dict[int, Food]) -> DishDiscardedOut | None:
    """El control determinista: el modelo propone, la aritmética tumba.

    Una comida o una cena que no llega a la proteína de tu objetivo no entra, y
    se dice cuánto daba. Sin la cifra (algún ingrediente sin medir) no se puede
    prometer que llega, y tampoco entra: `NULL` no es `0`, ni es «suficiente».
    """
    minimo = proteina_minima(objetivo, propuesta.slots)
    if minimo is None:
        return None
    totales, _ = macros_de_plato([(foods[i.food_id], i.grams) for i in propuesta.ingredients])
    proteina = macros_por_racion(totales, propuesta.servings)["protein"]
    if proteina is not None and proteina >= minimo:
        return None
    return DishDiscardedOut(name=propuesta.name, protein=proteina, floor=minimo)


@router.post("/generate", response_model=DishGenerateOut)
async def generate_dishes(
    payload: DishGenerateIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    proposer=Depends(get_dish_proposer),
) -> DishGenerateOut:
    """Pide platos con lo que tienes y guarda los que se sostienen solos.

    **Guarda sin preguntar**, y es seguro por una razón concreta: el modelo
    propone *qué combinar* y nunca *cuánto suma*. Los macros los calcula
    `nutrition.py` sobre fichas reales, así que no hay ninguna cifra inventada
    que pueda colarse. La frontera de la casa —dato identificado contra dato
    interpretado— se respeta sola mientras eso siga siendo verdad.

    Lo que no se sostiene solo es lo que nombra un alimento que no tienes: ahí
    sí habría que escribir una ficha, y escribirla desde lo que dijo un modelo
    sería dato interpretado. Eso se aparta al cajón de sugerencias.
    """
    # La despensa se mira **antes** que el modelo, y no es indiferente: no tener
    # nada registrado es un hecho sobre ti que no cambia porque la función esté
    # encendida o apagada, y es el único de los dos que puedes arreglar tú.
    # Contestar «la función está apagada» a quien además no ha registrado nada
    # le manda a buscar una clave de API cuando lo que necesita es apuntar una
    # comida.
    despensa = await _despensa(session, user_id)
    if not despensa:
        return DishGenerateOut(refusal="empty_pantry")

    if proposer is None:
        return DishGenerateOut(refusal="off")

    objetivo = (await session.get(User, user_id)).objetivo_proteina
    # Tu despensa primero; los básicos detrás, sin repetir lo que ya tienes.
    ya = {food.id for food in despensa}
    despensa = despensa + [food for food in await _basicos(session) if food.id not in ya]

    try:
        raw = await proposer(
            foods=[food.name for food in despensa],
            methods=list(payload.methods),
            minutes=payload.minutes,
            n=payload.n,
            examples=await _ejemplos(session, user_id),
            # Se le dice para que proponga mejor, no para que lo cumpla: quien
            # decide es `proteina_minima` sobre las cifras del catálogo.
            protein_floor=proteina_minima(objetivo, ("comida",)),
        )
    except ModelUnavailable as exc:
        # Nunca un 500: las cuatro formas de no haber podido acaban en la misma
        # pantalla, y «vuelve mañana» no es «algo se ha roto».
        return DishGenerateOut(
            refusal="quota" if exc.quota else "unavailable", quota_scope=exc.quota
        )

    por_nombre = {food.name.strip().lower(): food for food in despensa}
    try:
        propuestas = read_proposals(raw, resolve=lambda n: getattr(por_nombre.get(n.strip().lower()), "id", None))
    except ProposalRefused:
        return DishGenerateOut(refusal="unusable")

    tomados = {
        row[0]
        for row in (
            await session.execute(select(Dish.name_folded).where(Dish.user_id == user_id))
        ).all()
    }

    por_id = {food.id: food for food in despensa}
    creados, sugerencias, descartados = _repartir(propuestas, objetivo, por_id, tomados, user_id)
    for dish in creados:
        session.add(dish)

    if creados:
        await session.commit()
        for dish in creados:
            await session.refresh(dish, ["ingredients"])

    return DishGenerateOut(
        created=[await _out(session, dish, user_id) for dish in creados],
        suggestions=sugerencias,
        discarded=descartados,
    )
