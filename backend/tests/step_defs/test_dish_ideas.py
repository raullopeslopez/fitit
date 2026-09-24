"""Ideas con un alimento: recetas de la web, guardadas por alimento.

El buscador se sustituye por una dependencia, igual que en
`test_propose_dishes.py`: aquí no hay red, ni clave, ni cuota. Lo que se
comprueba es qué hace el backend con lo que conteste — qué guarda, qué tira y
cuándo vuelve a preguntar.
"""

import asyncio

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

from app.auth import get_current_user, hash_password
from app.db import get_session
from app.gemini import ModelUnavailable
from app.main import app
from app.models import Food, User
from app.naming import fold_exercise_name
from app.routers.ideas import get_idea_finder

scenarios("../features/dish_ideas.feature")


@pytest.fixture(autouse=True)
def _limpiar_override():
    yield
    app.dependency_overrides.pop(get_idea_finder, None)


@pytest.fixture()
def web():
    """Lo que «encuentra la web» en la próxima búsqueda, y cuántas se hicieron."""
    return {"found": [], "calls": 0, "boom": None, "raw": None}


def _instalar(web):
    async def finder(**_kwargs):
        web["calls"] += 1
        if web["boom"] is not None:
            raise web["boom"]
        if web["raw"] is not None:
            return web["raw"]
        return {"ideas": list(web["found"])}

    app.dependency_overrides[get_idea_finder] = lambda: finder


def _sesion():
    """Una sesión sobre la misma base que habla el cliente."""
    return app.dependency_overrides[get_session]()


async def _con_sesion(fn):
    gen = _sesion()
    session = await gen.__anext__()
    try:
        return await fn(session)
    finally:
        await gen.aclose()


def _catalogo(name):
    """Una fila de CIQUAL: `user_id IS NULL`. No hay API que la escriba, y es
    a propósito — `POST /foods` da de alta alimentos tuyos, no del catálogo."""

    async def crear(session):
        food = Food(name=name, name_folded=fold_exercise_name(name), user_id=None, kcal_100g=20)
        session.add(food)
        await session.commit()
        return food.id

    return asyncio.run(_con_sesion(crear))


@pytest.fixture()
def foods():
    return {}


@given(parsers.parse('the catalogue has "{name}"'))
def given_catalogue(client, foods, name):
    foods[name] = _catalogo(name)


@given(
    parsers.parse(
        'the web search finds "{name}" at "{url}", "{method}", {minutes:d} minutes'
    )
)
def given_found(web, name, url, method, minutes):
    web["found"].append({"name": name, "url": url, "method": method, "minutes": minutes})
    _instalar(web)


@given(parsers.parse('the web search now finds "{name}" at "{url}", "{method}", {minutes:d} minutes'))
def given_found_now(web, name, url, method, minutes):
    # «now» sustituye lo que había: es la búsqueda siguiente, no la misma.
    web["found"] = [{"name": name, "url": url, "method": method, "minutes": minutes}]
    _instalar(web)


@given(parsers.parse('the web search finds "{name}" with no link'))
def given_found_no_link(web, name):
    web["found"].append({"name": name, "method": "olla", "minutes": 20})
    _instalar(web)


@given("the model has no quota left for today")
def given_no_quota(web):
    web["boom"] = ModelUnavailable("429", quota="day")
    _instalar(web)


@given("the model answers something that is not a list of recipes")
def given_garbage(web):
    web["raw"] = "Aquí tienes unas recetas de acelgas muy ricas: primero lavas las hojas…"
    _instalar(web)


def _pedir(client, foods, name, *, more=False):
    resp = client.post("/dish-ideas", json={"food_id": foods[name], "more": more})
    assert resp.status_code == 200, resp.text
    return resp.json()


@given(parsers.parse('I have asked for ideas with "{name}"'))
def given_asked(client, foods, name):
    _pedir(client, foods, name)


@given(parsers.parse('another user has asked for ideas with "{name}"'))
def given_other_user_asked(client, foods, name):
    async def crear(session):
        user = User(username="otra", password_hash=hash_password("otra-pass"))
        session.add(user)
        await session.commit()
        return user.id

    otra = asyncio.run(_con_sesion(crear))
    yo = app.dependency_overrides[get_current_user]
    app.dependency_overrides[get_current_user] = lambda: otra
    try:
        _pedir(client, foods, name)
    finally:
        app.dependency_overrides[get_current_user] = yo


@when(parsers.parse('I ask for ideas with "{name}"'), target_fixture="answer")
def when_ask(client, foods, name):
    return _pedir(client, foods, name)


@when(parsers.parse('I ask for other ideas with "{name}"'), target_fixture="answer")
def when_ask_more(client, foods, name):
    return _pedir(client, foods, name, more=True)


@when("I ask for ideas with a food that does not exist", target_fixture="response")
def when_ask_missing(client):
    return client.post("/dish-ideas", json={"food_id": 999_999})


@then(parsers.re(r"I get (?P<count>\d+) ideas?"))
def then_count(answer, count):
    assert len(answer["ideas"]) == int(count), answer


def _idea(answer, name):
    return next(i for i in answer["ideas"] if i["name"] == name)


@then(parsers.parse('the idea "{name}" links to "{url}"'))
def then_links(answer, name, url):
    assert _idea(answer, name)["url"] == url


@then(parsers.parse('the idea "{name}" is cooked in "{method}" in {minutes:d} minutes'))
def then_cooked(answer, name, method, minutes):
    idea = _idea(answer, name)
    assert idea["method"] == method
    assert idea["minutes"] == minutes


@then(parsers.parse('there is no idea called "{name}"'))
def then_no_idea(answer, name):
    assert all(i["name"] != name for i in answer["ideas"])


@then(parsers.parse('"{name}" is not in my dishes'))
def then_not_a_dish(client, name):
    assert all(d["name"] != name for d in client.get("/dishes").json())


@then(parsers.re(r"the model was asked (?P<times>\d+) times?"))
def then_asked(web, times):
    assert web["calls"] == int(times)


@then("it says the quota is gone for the day")
def then_quota(answer):
    assert answer["refusal"] == "quota"
    assert answer["quota_scope"] == "day"


@then("it says the answer could not be read")
def then_unusable(answer):
    assert answer["refusal"] == "unusable"


@then(parsers.parse('no ideas are stored for "{name}"'))
def then_nothing_stored(client, foods, web, name):
    # Se pregunta otra vez con el modelo ya sano: si algo se hubiera guardado,
    # contestaría lo guardado sin llamarlo.
    web["raw"] = None
    web["found"] = []
    antes = web["calls"]
    answer = _pedir(client, foods, name)
    assert answer["ideas"] == []
    assert web["calls"] == antes + 1


@then("the answer is not found")
def then_not_found(response):
    assert response.status_code == 404
