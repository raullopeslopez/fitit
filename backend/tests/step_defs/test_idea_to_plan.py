"""Llevar un plato al plan de esta semana, eligiendo el hueco."""

import asyncio
import json
from datetime import date, timedelta

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

from app.auth import get_current_user
from app.db import get_session
from app.main import app
from app.models import Food, Plan, PlanEntry
from app.naming import fold_exercise_name

scenarios("../features/idea_to_plan.feature")

# «Hoy» fijo, y un martes: así ayer, mañana, el jueves y el viernes caen todos
# en la misma semana y ninguno depende del día en que corra la suite.
HOY = date(2026, 9, 22)
LUNES = HOY - timedelta(days=HOY.weekday())
DIAS = {
    "yesterday": HOY - timedelta(days=1),
    "tomorrow": HOY + timedelta(days=1),
    "Thursday": LUNES + timedelta(days=3),
    "Friday": LUNES + timedelta(days=4),
}


def _en_la_bd(trabajo):
    """Corre `trabajo(session, user_id)` contra la misma BD que ve el cliente.

    Hace falta para lo que la API no escribe a propósito: una fila del catálogo
    compartido, y un plan con huecos concretos — el generador es libre de
    escoger el plato de la idea él solo, y entonces «lo he puesto yo» no se
    podría distinguir de «ya estaba».
    """

    async def _run():
        gen = app.dependency_overrides[get_session]()
        session = await gen.__anext__()
        try:
            resultado = await trabajo(session, app.dependency_overrides[get_current_user]())
            await session.commit()
            return resultado
        finally:
            await gen.aclose()

    return asyncio.run(_run())


@pytest.fixture()
def ctx():
    return {}


@given(parsers.parse('the catalogue has "{name}"'))
def given_catalogue(client, ctx, name):
    async def _alta(session, _user_id):
        food = Food(
            user_id=None,
            name=name,
            name_folded=fold_exercise_name(name),
            source="ciqual",
            kcal_100g=19,
            protein_100g=1.8,
            fat_100g=0.2,
            carbs_100g=2.1,
        )
        session.add(food)
        await session.flush()
        return food.id

    ctx.setdefault("foods", {})[name] = _en_la_bd(_alta)


@given(parsers.parse('a dish "{name}" with {grams:d} g of "{food}"'))
def given_dish(client, ctx, name, grams, food):
    resp = client.post(
        "/dishes",
        json={
            "name": name,
            "servings": 1,
            "ingredients": [{"food_id": ctx["foods"][food], "grams": grams}],
        },
    )
    assert resp.status_code == 201, resp.text
    ctx["dish"] = resp.json()


def _plan_con(client, ctx, huecos):
    """Un plan de esta semana con sólo esos huecos, y otro plato en cada uno."""
    resp = client.post("/foods", json={"name": "Lentejas", "kcal_100g": 116})
    assert resp.status_code == 201, resp.text
    resp = client.post(
        "/dishes",
        json={
            "name": "Lentejas estofadas",
            "servings": 1,
            "ingredients": [{"food_id": resp.json()["id"], "grams": 300}],
        },
    )
    assert resp.status_code == 201, resp.text
    otro = resp.json()["id"]

    async def _alta(session, user_id):
        plan = Plan(user_id=user_id, week_start=LUNES, seed=1)
        plan.entries = [
            PlanEntry(log_date=dia, slot=slot, dish_id=otro, grams_json=json.dumps([300]))
            for dia, slot in huecos
        ]
        session.add(plan)

    _en_la_bd(_alta)


@given(parsers.parse('a plan for this week with a "{slot}" on {dia}'))
def given_plan_one(client, ctx, slot, dia):
    _plan_con(client, ctx, [(DIAS[dia], slot)])


@given(parsers.parse('a plan for this week with a "{slot}" yesterday and a "{otro}" tomorrow'))
def given_plan_two(client, ctx, slot, otro):
    _plan_con(client, ctx, [(DIAS["yesterday"], slot), (DIAS["tomorrow"], otro)])


def _fila(client, dia, slot):
    resp = client.get(f"/plans/{LUNES}")
    assert resp.status_code == 200, resp.text
    return next(
        e for e in resp.json()["entries"] if e["log_date"] == str(DIAS[dia]) and e["slot"] == slot
    )


def _poner(client, ctx, dia, slot):
    fila = _fila(client, dia, slot)
    return client.put(
        f"/plans/entries/{fila['id']}/dish",
        json={"dish_id": ctx["dish"]["id"], "date": str(HOY)},
    )


@when(parsers.parse('I put the dish in {dia}\'s "{slot}"'))
def when_put(client, ctx, dia, slot):
    resp = _poner(client, ctx, dia, slot)
    assert resp.status_code == 200, resp.text


@when(parsers.parse('I try to put the dish in {dia}\'s "{slot}"'))
def when_try_put(client, ctx, dia, slot):
    ctx["respuesta"] = _poner(client, ctx, dia, slot)


@when("I ask where the dish can go this week")
def when_ask(client, ctx):
    resp = client.get(f"/plans/entries/ahead?date={HOY}")
    assert resp.status_code == 200, resp.text
    ctx["huecos"] = resp.json()


@then(parsers.parse('{dia}\'s "{slot}" is "{name}"'))
def then_is(client, dia, slot, name):
    assert _fila(client, dia, slot)["dish_name"] == name


@then(parsers.parse('{dia}\'s "{slot}" is not "{name}"'))
def then_is_not(client, dia, slot, name):
    assert _fila(client, dia, slot)["dish_name"] != name


@then(parsers.parse('{dia}\'s "{slot}" is still to be confirmed'))
def then_pending(client, dia, slot):
    fila = _fila(client, dia, slot)
    assert fila["status"] is None
    assert fila["log_entry_id"] is None


@then("nothing was written in the food diary")
def then_no_diary(client):
    for dia in DIAS.values():
        resp = client.get(f"/food-log?date={dia}")
        assert resp.status_code == 200, resp.text
        assert resp.json()["entries"] == []


@then("it says there is no plan for this week")
def then_no_plan(ctx):
    assert ctx["huecos"]["has_plan"] is False
    assert ctx["huecos"]["entries"] == []
    assert ctx["huecos"]["week_start"] == str(LUNES)


@then(parsers.parse('"{name}" is in my dishes'))
def then_in_dishes(client, name):
    resp = client.get("/dishes")
    assert resp.status_code == 200, resp.text
    assert name in [d["name"] for d in resp.json()]


def _ofrecidos(ctx):
    return [(e["log_date"], e["slot"]) for e in ctx["huecos"]["entries"]]


@then(parsers.parse('{dia}\'s "{slot}" is offered'))
def then_offered(ctx, dia, slot):
    assert ctx["huecos"]["has_plan"] is True
    assert (str(DIAS[dia]), slot) in _ofrecidos(ctx)


@then(parsers.parse('{dia}\'s "{slot}" is not offered'))
def then_not_offered(ctx, dia, slot):
    assert (str(DIAS[dia]), slot) not in _ofrecidos(ctx)


@then("it is refused because that day already passed")
def then_refused(ctx):
    assert ctx["respuesta"].status_code == 422, ctx["respuesta"].text
