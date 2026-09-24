"""Convertir una idea en plato: la receta la dice su página, no un modelo.

La página se sustituye por una dependencia (`get_page_fetcher`), igual que el
buscador en `test_dish_ideas.py`: aquí no hay red. Lo que se comprueba es qué
hace el backend con lo que la página publica — qué casa, qué pregunta, qué
guarda y cuántas veces la pide. El escenario de SSRF usa el `fetch_page` de
verdad con un DNS y un transporte de mentira, porque lo que se fija ahí es
precisamente lo que hace `fetch_page`.
"""

import asyncio
import json

import httpx
import pytest
from pytest_bdd import given, parsers, scenarios, then, when

from app.auth import get_current_user, hash_password
from app.db import get_session
from app.main import app
from app.models import DishIdea, Food, User
from app.naming import fold_exercise_name
from app.recipe_page import fetch_page
from app.routers.ideas import get_page_fetcher

scenarios("../features/dish_from_idea.feature")

KCAL_100G = 20


@pytest.fixture(autouse=True)
def _limpiar_override():
    yield
    app.dependency_overrides.pop(get_page_fetcher, None)


@pytest.fixture()
def web():
    """Lo que publica la página de la idea, y cuántas veces se ha pedido."""
    return {"html": None, "fetched": 0}


def _instalar(web):
    async def fetcher(url):
        web["fetched"] += 1
        return web["html"]

    app.dependency_overrides[get_page_fetcher] = lambda: fetcher


def _receta(lines, servings=None):
    recipe = {"@context": "https://schema.org", "@type": "Recipe", "name": "Receta",
              "recipeIngredient": list(lines)}
    if servings is not None:
        recipe["recipeYield"] = servings
    return f'<html><script type="application/ld+json">{json.dumps(recipe)}</script></html>'


def _lines(text):
    """`"a", "b" and "c"` → `["a", "b", "c"]`."""
    return [part.strip().strip('"') for part in text.replace(" and ", ", ").split('", "')]


async def _con_sesion(fn):
    gen = app.dependency_overrides[get_session]()
    session = await gen.__anext__()
    try:
        return await fn(session)
    finally:
        await gen.aclose()


def _catalogo(name):
    async def crear(session):
        food = Food(
            name=name, name_folded=fold_exercise_name(name), user_id=None, kcal_100g=KCAL_100G
        )
        session.add(food)
        await session.commit()
        return food.id

    return asyncio.run(_con_sesion(crear))


def _idea(food_id, name, url):
    async def crear(session):
        idea = DishIdea(food_id=food_id, name=name, url=url, method="horno", minutes=30)
        session.add(idea)
        await session.commit()
        return idea.id

    return asyncio.run(_con_sesion(crear))


@pytest.fixture()
def foods():
    return {}


@pytest.fixture()
def ideas():
    return {}


# --- Given ----------------------------------------------------------------------


@given(parsers.parse('the catalogue has "{name}"'))
def given_catalogue(client, foods, name):
    foods[name] = _catalogo(name)


@given(parsers.parse('an idea "{name}" for "{food}"'))
def given_idea(client, foods, ideas, name, food):
    ideas[name] = _idea(foods[food], name, "https://recetas.example/acelgas")
    ideas["_current"] = ideas[name]


@given(parsers.parse('its page publishes {servings:d} servings with {lines}'))
def given_page(web, servings, lines):
    web["html"] = _receta(_lines(lines), servings)
    _instalar(web)


@given(parsers.parse("its page publishes no servings with {lines}"))
def given_page_no_servings(web, lines):
    web["html"] = _receta(_lines(lines))
    _instalar(web)


@given("its page publishes no recipe data")
def given_no_recipe(web):
    web["html"] = "<html><head><title>Acelgas</title></head><body>Receta</body></html>"
    _instalar(web)


@given(
    parsers.parse('an idea "{name}" for "{food}" whose link resolves to "{address}"')
)
def given_idea_internal(client, foods, ideas, web, name, food, address):
    ideas[name] = _idea(foods[food], name, "https://acelgas.example/receta")

    async def dns(host, port):
        return [address]

    def handler(request):
        web["fetched"] += 1
        return httpx.Response(200, text=_receta(["500 gr de acelgas"], 2))

    async def fetcher(url):
        return await fetch_page(url, transport=httpx.MockTransport(handler), resolve=dns)

    app.dependency_overrides[get_page_fetcher] = lambda: fetcher


def _abrir(client, idea_id, servings=None):
    params = {"servings": servings} if servings is not None else None
    return client.get(f"/dish-ideas/{idea_id}/draft", params=params)


@given("I have opened the idea as a dish", target_fixture="draft")
def given_opened(client, ideas):
    resp = _abrir(client, ideas["_current"])
    assert resp.status_code == 200, resp.text
    return resp.json()


@given("another user has saved the idea as a dish")
def given_other_saved(client, ideas):
    async def crear(session):
        user = User(username="otra", password_hash=hash_password("otra-pass"))
        session.add(user)
        await session.commit()
        return user.id

    otra = asyncio.run(_con_sesion(crear))
    yo = app.dependency_overrides[get_current_user]
    app.dependency_overrides[get_current_user] = lambda: otra
    try:
        draft = _abrir(client, ideas["_current"]).json()
        resp = client.post("/dishes", json=_payload(draft, ideas["_current"]))
        assert resp.status_code == 201, resp.text
    finally:
        app.dependency_overrides[get_current_user] = yo


# --- When -----------------------------------------------------------------------


@when("I open the idea as a dish", target_fixture="draft")
def when_open(client, ideas):
    resp = _abrir(client, ideas["_current"])
    assert resp.status_code == 200, resp.text
    return resp.json()


@when(parsers.parse("I open the idea as a dish for {servings:d} servings"), target_fixture="draft")
def when_open_for(client, ideas, servings):
    resp = _abrir(client, ideas["_current"], servings)
    assert resp.status_code == 200, resp.text
    return resp.json()


@when(parsers.parse('I open "{name}" as a dish'), target_fixture="draft")
def when_open_named(client, ideas, name):
    resp = _abrir(client, ideas[name])
    assert resp.status_code == 200, resp.text
    return resp.json()


@when("I open as a dish an idea that does not exist", target_fixture="response")
def when_open_missing(client, web):
    _instalar(web)
    return _abrir(client, 999_999)


def _payload(draft, idea_id):
    """El borrador tal cual, por la puerta de siempre. Ya en raciones: los
    gramos del borrador son de **una** ración."""
    return {
        "name": draft["name"],
        "servings": 1,
        "basis": "raw",
        "idea_id": idea_id,
        "ingredients": [
            {"food_id": (line["food"] or {}).get("id"), "grams": line["grams"]}
            for line in draft["lines"]
        ],
    }


@when("I save the draft as it is", target_fixture="response")
def when_save_as_is(client, ideas, draft):
    return client.post("/dishes", json=_payload(draft, ideas["_current"]))


@when("I save the draft", target_fixture="response")
def when_save(client, ideas, draft):
    resp = client.post("/dishes", json=_payload(draft, ideas["_current"]))
    assert resp.status_code == 201, resp.text
    return resp


@when("I preview the draft", target_fixture="preview")
def when_preview(client, draft):
    body = _payload(draft, None)
    resp = client.post(
        "/dishes/preview", json={"servings": body["servings"], "ingredients": body["ingredients"]}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


@when(parsers.parse('I look at the ideas with "{food}"'), target_fixture="answer")
def when_look(client, foods, food):
    resp = client.post("/dish-ideas", json={"food_id": foods[food]})
    assert resp.status_code == 200, resp.text
    return resp.json()


# --- Then -----------------------------------------------------------------------


def _line(draft, text):
    return next(line for line in draft["lines"] if line["text"] == text)


@then(parsers.parse('the draft has {grams:g} g of "{food}"'))
def then_grams_of(draft, grams, food):
    line = next(line for line in draft["lines"] if (line["food"] or {}).get("name") == food)
    assert line["grams"] == grams


@then(parsers.re(r"the draft has (?P<count>\d+) ingredients?"))
def then_count(draft, count):
    assert len(draft["lines"]) == int(count), draft


@then(parsers.parse('the line "{text}" is matched to "{food}"'), target_fixture="line")
def then_matched(draft, text, food):
    line = _line(draft, text)
    assert line["status"] == "chosen", line
    assert line["food"]["name"] == food
    return line


@then(parsers.parse('the line "{text}" is not matched yet'), target_fixture="line")
def then_not_matched(draft, text):
    line = _line(draft, text)
    assert line["status"] == "ambiguous", line
    assert line["food"] is None
    return line


@then(parsers.parse('it offers "{first}" and "{second}"'))
def then_offers(line, first, second):
    # Los dos y nada más; el orden es cosa de `match_ingredient` (lo crudo delante).
    assert sorted(c["name"] for c in line["candidates"]) == sorted([first, second])


@then(parsers.parse('the line "{text}" is missing'))
def then_missing(draft, text):
    line = _line(draft, text)
    assert line["status"] == "missing"
    assert line["food"] is None
    assert line["candidates"] == []


@then(parsers.parse('the catalogue has no food called "{name}"'))
def then_no_food(client, name):
    async def buscar(session):
        from sqlalchemy import select

        rows = (await session.execute(select(Food.name))).scalars().all()
        return [n for n in rows if name.lower() in n.lower()]

    assert asyncio.run(_con_sesion(buscar)) == []


@then("its grams are unknown")
def then_grams_unknown(line):
    # NULL, no 0: `None` en JSON.
    assert line["grams"] is None


@then(parsers.parse('it is refused because "{food}" has no grams'))
def then_refused_grams(response, draft, foods, food):
    assert response.status_code == 422, response.text
    ids = [(line["food"] or {}).get("id") for line in draft["lines"]]
    index = ids.index(foods[food])
    locs = [tuple(err["loc"]) for err in response.json()["detail"]]
    assert ("body", "ingredients", index, "grams") in locs, locs


def _mis_platos(client):
    return client.get("/dishes").json()


@then(parsers.parse('"{name}" is not in my dishes'))
def then_not_in_dishes(client, name):
    assert all(d["name"] != name for d in _mis_platos(client))


@then(parsers.parse('"{name}" is in my dishes'))
def then_in_dishes(client, name):
    assert any(d["name"] == name for d in _mis_platos(client))


@then("the idea says it was saved as that dish")
def then_idea_saved(client, foods, ideas, response):
    dish_id = response.json()["id"]
    answer = client.post("/dish-ideas", json={"food_id": foods["Acelga, cruda"]}).json()
    idea = next(i for i in answer["ideas"] if i["id"] == ideas["_current"])
    assert idea["dish_id"] == dish_id
    # Con su nombre, que puede no ser el de la idea: «Ponerlo en el plan» desde
    # la fila titula la hoja con el plato, no con la receta.
    assert idea["dish_name"] == response.json()["name"]
    # Y el borrador también lo sabe: volver a abrirla dice que ya está guardada.
    assert client.get(f"/dish-ideas/{ideas['_current']}/draft").json()["dish_id"] == dish_id


@then("the idea is not saved")
def then_idea_not_saved(answer, ideas):
    idea = next(i for i in answer["ideas"] if i["id"] == ideas["_current"])
    assert idea["dish_id"] is None


@then(
    parsers.parse('"{name}" has the kcal of {grams:g} g of "{food}" per serving')
)
def then_dish_kcal(client, name, grams, food):
    dish = next(d for d in _mis_platos(client) if d["name"] == name)
    assert dish["per_serving"]["kcal"] == pytest.approx(KCAL_100G * grams / 100)


@then(parsers.parse('the preview has the kcal of {grams:g} g of "{food}" per serving'))
def then_preview_kcal(preview, grams, food):
    assert preview["per_serving"]["kcal"] == pytest.approx(KCAL_100G * grams / 100)


@then("the draft asks how many servings it is for")
def then_asks_servings(draft):
    assert draft["servings"] is None
    assert draft["servings_published"] is False


@then(parsers.re(r"the page was fetched (?P<times>\d+) times?"))
def then_fetched(web, times):
    assert web["fetched"] == int(times)


@then("it says the recipe does not publish its ingredients")
def then_no_recipe(draft):
    assert draft["refusal"] == "no_recipe_data"


@then("it says the recipe page could not be opened")
def then_unreachable(draft):
    assert draft["refusal"] == "unreachable"
    assert draft["lines"] == []


@then("the answer is not found")
def then_not_found(response):
    assert response.status_code == 404


@then("no page was fetched")
def then_nothing_fetched(web):
    assert web["fetched"] == 0
