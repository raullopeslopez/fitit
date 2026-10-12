"""El ticket de la compra: leerlo, revisarlo y guardarlo como lo que hay en casa."""

from datetime import date, timedelta

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

from app.main import app
from app.routers.pantry import get_ticket_reader

scenarios("../features/ticket.feature")

PDF = b"%PDF-1.4 ticket"


@pytest.fixture(autouse=True)
def _sin_lector():
    yield
    app.dependency_overrides.pop(get_ticket_reader, None)


def _lunes():
    hoy = date.today()
    return hoy - timedelta(days=hoy.weekday())


def _food(client, name):
    resp = client.post("/foods", json={"name": name, "kcal_100g": 165, "protein_100g": 31})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.fixture
def alimentos():
    return {}


@given(parsers.parse('the foods "{uno}" and "{otro}"'))
def given_foods(client, alimentos, uno, otro):
    for name in (uno, otro):
        alimentos[name] = _food(client, name)


@given(parsers.parse('the food "{name}"'))
def given_food(client, alimentos, name):
    alimentos[name] = _food(client, name)


@given(parsers.parse('a planned week of {n:d} dishes with 150 g of "{name}"'))
def given_week(client, alimentos, n, name):
    alimentos[name] = _food(client, name)
    for i in range(1, n + 1):
        resp = client.post(
            "/dishes",
            json={"name": f"Plato {i}", "servings": 1, "ingredients": [{"food_id": alimentos[name], "grams": 150}]},
        )
        assert resp.status_code == 201, resp.text
    resp = client.post("/plans", json={"week_start": _lunes().isoformat()})
    assert resp.status_code == 201, resp.text


@given(parsers.parse('the model reads the ticket as "{uno}" and "{otro}"'))
def given_reader(uno, otro):
    async def reader(document: bytes) -> dict:
        return {"lines": [uno, otro]}

    app.dependency_overrides[get_ticket_reader] = lambda: reader


@given("no model to read tickets")
def given_no_reader():
    app.dependency_overrides[get_ticket_reader] = lambda: None


def _subir(client, contenido=PDF, tipo="application/pdf"):
    return client.post("/pantry/ticket", files={"document": ("ticket.pdf", contenido, tipo)})


@when("I upload the ticket", target_fixture="ticket")
def when_upload(client):
    resp = _subir(client)
    assert resp.status_code == 200, resp.text
    return resp.json()


@when("I upload a photo as the ticket", target_fixture="negativa")
def when_upload_photo(client):
    return _subir(client, b"\xff\xd8 jpeg", "image/jpeg")


@when("I try to upload the ticket", target_fixture="negativa")
def when_try_upload(client):
    return _subir(client)


def _guardar(client, alimentos, pares):
    resp = client.post(
        "/pantry",
        json={
            "items": [{"food_id": alimentos[name], "grams": g} for g, name in pares],
            "week_start": _lunes().isoformat(),
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@when(
    parsers.parse('I save from the ticket {g1:d} g of "{f1}" and {g2:d} g of "{f2}"'),
    target_fixture="compra",
)
def when_save_two(client, alimentos, g1, f1, g2, f2):
    return _guardar(client, alimentos, [(g1, f1), (g2, f2)])


@when(parsers.parse('I save from the ticket only {g:d} g of "{f}"'), target_fixture="compra")
def when_save_one(client, alimentos, g, f):
    return _guardar(client, alimentos, [(g, f)])


@then(parsers.parse('the ticket has the line "{texto}" matched to "{food}" with {gramos:d} g'))
def then_line(ticket, texto, food, gramos):
    linea = next(line for line in ticket["lines"] if line["text"] == texto)
    assert linea["food"]["name"] == food
    assert linea["grams"] == gramos


@then("I have nothing at home")
def then_nothing(client):
    assert client.get("/pantry").json() == []


@then(parsers.parse('I have at home {g1:d} g of "{f1}" and {g2:d} g of "{f2}"'))
def then_at_home(client, g1, f1, g2, f2):
    casa = {i["name"]: i["grams"] for i in client.get("/pantry").json()}
    assert casa == {f1: g1, f2: g2}


@then(parsers.parse("the shopping had {dentro:d} on the list, {fuera:d} off the list and nothing missing"))
def then_compared(compra, dentro, fuera):
    assert (compra["in_list"], compra["off_list"], compra["missing"]) == (dentro, fuera, [])


@then(parsers.parse('the shopping had {dentro:d} on the list, {fuera:d} off the list and "{falta}" missing'))
def then_missing(compra, dentro, fuera, falta):
    assert (compra["in_list"], compra["off_list"], compra["missing"]) == (dentro, fuera, [falta])


@then("the shopping is not compared with any list")
def then_not_compared(compra):
    assert compra["in_list"] is None and compra["missing"] == []
    assert compra["saved"] == 1


@then("it is refused as not a PDF")
def then_not_pdf(negativa):
    assert negativa.status_code == 415


@then("it says reading tickets is not available")
def then_not_available(negativa):
    assert negativa.status_code == 503
