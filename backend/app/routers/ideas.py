"""Ideas con un alimento: «me apetece acelga, ¿qué hago con ella?».

El alimento se elige primero y casi nunca está en la despensa todavía, así que
la pregunta no es la de `/dishes/generate`. El modelo busca en la web recetas
reales construidas alrededor de ese alimento y trae nombre, modo, minutos y el
enlace a la original. Nada más: una idea **no es un plato**, y nada de aquí
escribe en `dishes` ni en `foods`.

Buscar cuesta cuota y segundos, y las recetas de acelgas no cambian de una
semana a otra. Así que cada búsqueda **se guarda contra el alimento**, sin
usuario —una receta no es un dato tuyo—, y volver a preguntar contesta con lo
guardado sin llamar al modelo. Sólo «Otras ideas» (`more`) vuelve a buscar, y
lo que encuentra se suma.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..config import settings
from ..db import get_session
from ..dish_draft import build_draft_lines, dish_method, dump_recipe, load_recipe
from ..gemini import ModelUnavailable, find_ideas
from ..ideas import IdeasRefused, read_ideas
from ..models import Dish, DishIdea, Food, visible_foods
from ..recipe_page import PageUnreachable, fetch_page, read_recipe
from ..schemas import (
    DishDraftOut,
    DishIdeaOut,
    DishIdeasIn,
    DishIdeasOut,
    DraftFoodOut,
    DraftLineOut,
)

router = APIRouter(prefix="/dish-ideas", tags=["dish-ideas"])


def ideas_available() -> bool:
    """Si este servidor sabe buscar ideas. Lo lee el día, como `label_reading`."""
    return bool(settings.gemini_api_key.get_secret_value())


async def get_idea_finder():
    """Quien busca recetas en la web, o `None` si la función está apagada.

    Dependencia por lo mismo que `get_dish_proposer`: la suite no tiene red, ni
    clave, ni cuota, y lo que se comprueba es qué hace el backend con lo que
    conteste.
    """
    key = settings.gemini_api_key.get_secret_value()
    if not key:
        return None

    async def finder(**kwargs):
        return await find_ideas(**kwargs, api_key=key, model=settings.gemini_model)

    return finder


async def _stored(session: AsyncSession, food_id: int) -> list[DishIdea]:
    """Lo guardado para el alimento: la búsqueda más nueva arriba y, dentro de
    cada búsqueda, en el orden en que el modelo las dio."""
    return list(
        (
            await session.execute(
                select(DishIdea)
                .where(DishIdea.food_id == food_id)
                .order_by(DishIdea.created_at.desc(), DishIdea.id.asc())
            )
        )
        .scalars()
        .all()
    )


def _utc(moment: datetime | None) -> datetime | None:
    """SQLite devuelve las horas sin zona y Postgres con ella; aquí todas en UTC."""
    if moment is not None and moment.tzinfo is None:
        return moment.replace(tzinfo=UTC)
    return moment


async def _saved(session: AsyncSession, user_id: int, idea_ids: list[int]) -> dict[int, int]:
    """idea → **tu** plato hecho con ella. El más reciente si hay varios."""
    if not idea_ids:
        return {}
    rows = await session.execute(
        select(Dish.idea_id, Dish.id)
        .where(Dish.user_id == user_id, Dish.idea_id.in_(idea_ids))
        .order_by(Dish.id)
    )
    return {idea_id: dish_id for idea_id, dish_id in rows.all()}


async def _out(
    session: AsyncSession,
    user_id: int,
    ideas: list[DishIdea],
    *,
    new_ids: frozenset[int] = frozenset(),
    refusal: str | None = None,
    quota_scope: str | None = None,
) -> DishIdeasOut:
    saved = await _saved(session, user_id, [i.id for i in ideas])
    return DishIdeasOut(
        ideas=[
            DishIdeaOut(
                id=i.id,
                name=i.name,
                url=i.url,
                method=i.method,
                minutes=i.minutes,
                created_at=_utc(i.created_at),
                new=i.id in new_ids,
                dish_id=saved.get(i.id),
            )
            for i in ideas
        ],
        new_count=len(new_ids),
        refusal=refusal,
        quota_scope=quota_scope,
        stored_at=max((_utc(i.created_at) for i in ideas), default=None),
    )


@router.post("", response_model=DishIdeasOut)
async def dish_ideas(
    payload: DishIdeasIn,
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    finder=Depends(get_idea_finder),
) -> DishIdeasOut:
    """Ideas con un alimento: lo guardado, o una búsqueda si hace falta.

    Se busca sólo si no hay nada guardado o si se pide `more`. Sin cuota, sin
    red o con una respuesta ilegible, lo guardado se devuelve igual con el
    motivo al lado: nunca un 500.
    """
    food = (
        await session.execute(
            select(Food).where(Food.id == payload.food_id, visible_foods(user_id))
        )
    ).scalar_one_or_none()
    if food is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alimento no encontrado")

    stored = await _stored(session, food.id)
    if stored and not payload.more:
        return await _out(session, user_id, stored)

    if finder is None:
        return await _out(session, user_id, stored, refusal="off")

    try:
        raw = await finder(food=food.name, avoid=[i.name for i in stored])
    except ModelUnavailable as exc:
        return await _out(
            session, user_id, stored,
            refusal="quota" if exc.quota else "unavailable", quota_scope=exc.quota,
        )

    try:
        found = read_ideas(raw)
    except IdeasRefused:
        # Una respuesta ilegible no se guarda: guardarla sería servirla para
        # siempre sin volver a preguntar.
        return await _out(session, user_id, stored, refusal="unusable")

    # Lo que la identifica es el enlace, no cómo la llamó el modelo esta vez.
    known = {i.url for i in stored}
    # Una hora para toda la tanda: es lo que agrupa «lo encontrado a la vez» y
    # permite ordenar la tanda más nueva arriba sin desordenar la de dentro.
    now = datetime.now(UTC)
    nuevas = [
        DishIdea(food_id=food.id, name=f.name, url=f.url, method=f.method, minutes=f.minutes, created_at=now)
        for f in found
        if f.url not in known
    ]
    if nuevas:
        session.add_all(nuevas)
        try:
            await session.commit()
        except IntegrityError:
            # Otra búsqueda del mismo alimento guardó el mismo enlace a la vez.
            # Lo suyo vale igual: se sirve lo que haya quedado.
            await session.rollback()
            return await _out(session, user_id, await _stored(session, food.id))

    return await _out(
        session, user_id, await _stored(session, food.id),
        new_ids=frozenset(i.id for i in nuevas),
    )


# --- Fase 2: abrir una idea como plato ---------------------------------------------


async def get_page_fetcher():
    """Quien descarga la página de una receta. Dependencia para que la suite no
    salga a la red; lo que se comprueba es qué se hace con lo que publica."""
    return fetch_page


@router.get("/{idea_id}/draft", response_model=DishDraftOut)
async def idea_draft(
    idea_id: int,
    servings: float | None = Query(default=None, gt=0, le=100),
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    fetcher=Depends(get_page_fetcher),
) -> DishDraftOut:
    """La idea como borrador de plato: las líneas de su receta y con qué casan.

    **SSRF.** Sólo se abre el enlace guardado en la idea, nunca uno que llegue
    en la petición: aquí no entra ninguna URL. Y `fetch_page` comprueba además
    adónde lleva ese enlace de verdad.

    La página se lee **una vez** y se guarda en la idea (`recipe_json`), también
    si no publica receta. Lo que no se guarda es un fallo de red: mañana puede
    contestar.

    `servings` son las raciones que dice la persona. Sin ellas, las que publica
    la página; y si tampoco, `None`, y los gramos por ración quedan
    desconocidos hasta que alguien lo diga. Nunca 1 por defecto.

    Nada de aquí escribe en `foods` ni en `dishes`.
    """
    idea = (
        await session.execute(
            select(DishIdea)
            .join(Food, Food.id == DishIdea.food_id)
            .where(DishIdea.id == idea_id, visible_foods(user_id))
        )
    ).scalar_one_or_none()
    if idea is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Idea no encontrada")

    saved = await _saved(session, user_id, [idea.id])
    draft = DishDraftOut(
        idea_id=idea.id,
        name=idea.name,
        url=idea.url,
        method=dish_method(idea.method),
        dish_id=saved.get(idea.id),
    )

    if idea.recipe_json is None:
        try:
            html = await fetcher(idea.url)
        except PageUnreachable:
            draft.refusal = "unreachable"
            return draft
        idea.recipe_json = dump_recipe(read_recipe(html))
        await session.commit()

    recipe = load_recipe(idea.recipe_json)
    if not recipe.found:
        draft.refusal = "no_recipe_data"
        return draft

    draft.servings_published = recipe.servings is not None
    draft.servings = servings if servings is not None else recipe.servings
    lines = await build_draft_lines(session, user_id, recipe.ingredients, draft.servings)
    draft.lines = [
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
        for line in lines
    ]
    return draft
