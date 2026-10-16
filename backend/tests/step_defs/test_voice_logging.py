import asyncio

import pytest
from pytest_bdd import given, parsers, scenario, then, when

from app.auth import get_current_user, hash_password
from app.db import get_session
from app.main import app
from app.models import Food, User
from app.naming import fold_exercise_name

FEATURE = "../features/voice_logging.feature"


# Fase 1 (raciones tuyas). Las demás entran con la fase 2, y entonces esto pasa a
# `scenarios(FEATURE)`.
@scenario(FEATURE, "A portion on a shared food is mine, and only mine")
def test_a_portion_on_a_shared_food_is_mine():
    pass


@scenario(FEATURE, "Someone else cannot log with my portion")
def test_someone_else_cannot_log_with_my_portion():
    pass


@pytest.fixture()
def ctx():
    return {"foods": {}}


async def _con_sesion(fn):
    gen = app.dependency_overrides[get_session]()
    session = await gen.__anext__()
    try:
        return await fn(session)
    finally:
        await gen.aclose()


def _como_otra(client, fn):
    """Lo que vería otra persona: un usuario de verdad detrás del override."""

    async def crear(session):
        user = User(username="otra", password_hash=hash_password("otra-pass"))
        session.add(user)
        await session.commit()
        return user.id

    otra = asyncio.run(_con_sesion(crear))
    yo = app.dependency_overrides[get_current_user]
    app.dependency_overrides[get_current_user] = lambda: otra
    try:
        return fn()
    finally:
        app.dependency_overrides[get_current_user] = yo


@given(parsers.parse('a shared food "{name}"'))
def given_shared(client, ctx, name):
    async def crear(session):
        food = Food(name=name, name_folded=fold_exercise_name(name), user_id=None, kcal_100g=140)
        session.add(food)
        await session.commit()
        return food.id

    ctx["foods"][name] = asyncio.run(_con_sesion(crear))


@when(parsers.parse('I save a portion "{label}" of {grams:g} g on "{name}"'))
@given(parsers.parse('I saved a portion "{label}" of {grams:g} g on "{name}"'))
def when_save_portion(client, ctx, label, grams, name):
    resp = client.post(f"/foods/{ctx['foods'][name]}/portions", json={"label": label, "grams": grams})
    assert resp.status_code == 201, resp.text
    ctx["portion"] = resp.json()["id"]


@when(parsers.parse('someone else logs {count:d} of my portion on "{name}"'))
def when_someone_else_logs(client, ctx, count, name):
    body = {"food_id": ctx["foods"][name], "portion_id": ctx["portion"], "quantity": count}
    ctx["response"] = _como_otra(client, lambda: client.post("/food-log", json=body))


@then(parsers.parse("the answer is {code:d}"))
def then_answer(ctx, code):
    assert ctx["response"].status_code == code, ctx["response"].text


def _portions(client, food_id):
    resp = client.get(f"/foods/{food_id}")
    assert resp.status_code == 200, resp.text
    return [(p["label"], p["grams"]) for p in resp.json()["portions"]]


@then(parsers.parse('"{name}" shows my portion "{label}" of {grams:g} g'))
def then_shows(client, ctx, name, label, grams):
    assert (label, grams) in _portions(client, ctx["foods"][name])


@then(parsers.parse('someone else sees no portions on "{name}"'))
def then_someone_else(client, ctx, name):
    assert _como_otra(client, lambda: _portions(client, ctx["foods"][name])) == []
