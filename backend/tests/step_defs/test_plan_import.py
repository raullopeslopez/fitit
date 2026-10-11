"""Qué hace el backend con lo que el modelo lea de un PDF.

Como en la etiqueta, ninguno de estos escenarios llama a Gemini: la dependencia
se sustituye por una función que contesta lo que haga falta. Lo que se fija
aquí es qué se hace con la respuesta —emparejar, reconocer lo tuyo, no
guardar nada—, que es donde está el riesgo.
"""

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

from app.gemini import LabelUnreadable
from app.main import app
from app.routers.plan_import import get_plan_reader

scenarios("../features/plan_import.feature")

PDF = b"%PDF-1.4 un plan"


def _install(payload=None, *, fails=False, configured=True, quota=None):
    if not configured:
        app.dependency_overrides[get_plan_reader] = lambda: None
        return

    async def reader(document: bytes) -> dict:
        if quota:
            raise LabelUnreadable("429", quota=quota)
        if fails:
            raise LabelUnreadable("no contestó")
        return payload

    app.dependency_overrides[get_plan_reader] = lambda: reader


@pytest.fixture(autouse=True)
def _clear_reader():
    yield
    app.dependency_overrides.pop(get_plan_reader, None)


def _food(client, name):
    resp = client.post("/foods", json={"name": name, "kcal_100g": 300})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@given(parsers.parse('the PDF holds a week with "{dish}" for the {slot} on {day}'))
def given_week(client, dish, slot, day):
    _food(client, "Lentejas")
    _install(
        {
            "dishes": [
                {"name": dish, "slots": [slot], "ingredients": ["80 g lentejas", "50 g chorizo"]},
            ],
            "week": [{"day": day, "slot": slot, "dish": dish}],
        }
    )


@given(parsers.parse('I already have the dish "{name}"'))
def given_dish(client, name):
    food = _food(client, "Patata")
    resp = client.post(
        "/dishes",
        json={"name": name, "servings": 1, "ingredients": [{"food_id": food, "grams": 200}]},
    )
    assert resp.status_code == 201, resp.text


@given(parsers.parse('the PDF names "{dish}" for the {slot} on {day} without describing it'))
def given_undescribed(dish, slot, day):
    _install({"dishes": [], "week": [{"day": day, "slot": slot, "dish": dish}]})


@given("the model cannot read the PDF")
def given_unreadable():
    _install(fails=True)


@given("the model is out of quota for the day")
def given_quota():
    _install(quota="day")


@given("no model is configured")
def given_not_configured():
    _install(configured=False)


@when("I upload the plan", target_fixture="respuesta")
def when_upload(client):
    return client.post("/plans/import", files={"document": ("plan.pdf", PDF, "application/pdf")})


@when("I upload a photo instead of a PDF", target_fixture="respuesta")
def when_upload_photo(client):
    _install({"dishes": [], "week": []})
    return client.post(
        "/plans/import", files={"document": ("plan.jpg", b"\xff\xd8\xff", "image/jpeg")}
    )


def _dish(respuesta, name):
    return next(d for d in respuesta.json()["dishes"] if d["name"] == name)


@then(parsers.parse('it proposes the dish "{name}" as new'))
def then_new(respuesta, name):
    assert respuesta.status_code == 200, respuesta.text
    dish = _dish(respuesta, name)
    assert dish["status"] == "new"
    assert dish["dish_id"] is None


@then(parsers.parse('it proposes the dish "{name}" as new with no lines'))
def then_new_empty(respuesta, name):
    dish = _dish(respuesta, name)
    assert dish["status"] == "new"
    assert dish["lines"] == []


@then(parsers.parse('its line "{text}" is matched to "{food}"'))
def then_line(respuesta, text, food):
    line = next(
        line for d in respuesta.json()["dishes"] for line in d["lines"] if line["text"] == text
    )
    assert line["status"] == "chosen"
    assert line["food"]["name"] == food
    # Un plan es para una persona: los gramos de la línea son los de la ración.
    assert line["grams"] == 80


@then(parsers.parse('the week puts "{name}" in the {slot} of day {day:d}'))
def then_week(respuesta, name, slot, day):
    body = respuesta.json()
    celdas = [
        c
        for c in body["week"]
        if c["day"] == day and c["slot"] == slot and body["dishes"][c["dish"]]["name"] == name
    ]
    assert len(celdas) == 1, body["week"]


@then("I still have no dishes")
def then_nothing_saved(client):
    assert client.get("/dishes").json() == []


@then(parsers.parse('it says "{name}" is a dish I already have'))
def then_existing(client, respuesta, name):
    dish = _dish(respuesta, name)
    assert dish["status"] == "existing"
    assert dish["dish_id"] == client.get("/dishes").json()[0]["id"]
    assert dish["lines"] == []


@then("it is refused as not a PDF")
def then_not_pdf(respuesta):
    assert respuesta.status_code == 415


@then("it says the plan could not be read")
def then_unreadable(respuesta):
    assert respuesta.status_code == 200
    body = respuesta.json()
    assert body["refusal"] == "unreadable"
    assert body["dishes"] == [] and body["week"] == []


@then("it says the quota is spent for the day")
def then_quota(respuesta):
    body = respuesta.json()
    assert body["refusal"] == "quota"
    assert body["quota_scope"] == "day"


@then("it says reading plans is not available")
def then_not_available(respuesta):
    assert respuesta.status_code == 503
