import asyncio

from pytest_bdd import given, parsers, scenarios, then, when

from app.auth import get_current_user, hash_password
from app.db import get_session
from app.main import app
from app.models import Food, User
from app.naming import fold_exercise_name

scenarios("../features/usual_amounts.feature")


async def _con_sesion(fn):
    gen = app.dependency_overrides[get_session]()
    session = await gen.__anext__()
    try:
        return await fn(session)
    finally:
        await gen.aclose()


def _food(client, foods, name):
    resp = client.post("/foods", json={"name": name, "kcal_100g": 100})
    assert resp.status_code == 201, resp.text
    foods[name] = resp.json()["id"]
    return foods[name]


def _log(client, food_id, grams):
    resp = client.post("/food-log", json={"food_id": food_id, "grams": grams})
    assert resp.status_code == 201, resp.text



@given(
    parsers.parse('I have logged "{name}" at {a:g} g three times and at {b:g} g once'),
    target_fixture="foods",
)
def given_three_and_one(client, name, a, b):
    foods = {}
    food = _food(client, foods, name)
    for grams in (a, a, a, b):
        _log(client, food, grams)
    return foods


@given(parsers.parse('I have logged "{name}" at {a:g} g, then {b:g} g'), target_fixture="foods")
def given_then(client, name, a, b):
    foods = {}
    food = _food(client, foods, name)
    for grams in (a, b):
        _log(client, food, grams)
    return foods


@given(
    parsers.parse('I have logged "{name}" at {a:g}, {b:g}, {c:g} and {d:g} g'),
    target_fixture="foods",
)
def given_four(client, name, a, b, c, d):
    foods = {}
    food = _food(client, foods, name)
    for grams in (a, b, c, d):
        _log(client, food, grams)
    return foods


@given(parsers.parse('a food "{name}" I never logged'), target_fixture="foods")
def given_never(client, name):
    foods = {}
    _food(client, foods, name)
    return foods


@given(parsers.parse('someone else logged {grams:g} g of a shared food "{name}"'), target_fixture="foods")
def given_someone_else(client, grams, name):
    async def crear(session):
        food = Food(name=name, name_folded=fold_exercise_name(name), user_id=None, kcal_100g=350)
        user = User(username="otra", password_hash=hash_password("otra-pass"))
        session.add_all([food, user])
        await session.commit()
        return food.id, user.id

    food_id, otra = asyncio.run(_con_sesion(crear))
    yo = app.dependency_overrides[get_current_user]
    app.dependency_overrides[get_current_user] = lambda: otra
    try:
        _log(client, food_id, grams)
    finally:
        app.dependency_overrides[get_current_user] = yo
    return {name: food_id}


@when(parsers.parse('I ask for my amounts of "{name}"'), target_fixture="amounts")
def when_ask(client, foods, name):
    resp = client.get(f"/foods/{foods[name]}/usual")
    assert resp.status_code == 200, resp.text
    return resp.json()


@then(parsers.parse("the amounts are {expected}"))
def then_amounts(amounts, expected):
    wanted = []
    for part in expected.split(", "):
        grams, times = part.split(" g ×")
        wanted.append({"grams": float(grams), "times": int(times)})
    assert amounts == wanted


@then(parsers.parse("there are {n:d} amounts"))
def then_count(amounts, n):
    assert len(amounts) == n
