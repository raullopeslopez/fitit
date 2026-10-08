"""La lista de la compra, sacada de la semana planificada, y su envío a Taski."""

import asyncio
from datetime import date, timedelta

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

from app.db import get_session
from app.main import app
from app.taski import Unreachable, get_taski

scenarios("../features/shopping_list.feature", "../features/shopping_to_taski.feature")


def _lunes():
    hoy = date.today()
    return hoy - timedelta(days=hoy.weekday())


def _semana(client, food_id, platos=12):
    for i in range(1, platos + 1):
        resp = client.post(
            "/dishes",
            json={"name": f"Plato {i}", "servings": 1, "ingredients": [{"food_id": food_id, "grams": 150}]},
        )
        assert resp.status_code == 201, resp.text
    resp = client.post("/plans", json={"week_start": _lunes().isoformat()})
    assert resp.status_code == 201, resp.text


def _food(client, **campos):
    resp = client.post("/foods", json={"kcal_100g": 165, "protein_100g": 31, **campos})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@given(parsers.parse('a planned week of {n:d} dishes with 150 g of "{name}" from the meat aisle'))
def given_week_meat(client, n, name):
    _semana(client, _food(client, name=name, familia="carne"), n)


@given(parsers.parse('a planned week of {n:d} dishes with 150 g of "{name}" with {pct:g} % bone'))
def given_week_bone(client, n, name, pct):
    _semana(client, _food(client, name=name, familia="carne", refuse_pct=pct, kcal_basis="edible"), n)


@given(
    parsers.parse(
        'a planned week of {n:d} dishes with 150 g of the catalogue product "{name}" sold in {pack:g} g packs'
    )
)
def given_week_pack(client, n, name, pack):
    from app.models import Food
    from app.naming import fold_exercise_name as fold

    async def sembrar():
        gen = app.dependency_overrides[get_session]()
        session = await gen.__anext__()
        try:
            food = Food(user_id=None, name=name, name_folded=fold(name), brand="Hacendado",
                        brand_folded="hacendado", source="off", source_ref="8480000510716",
                        barcode="8480000510716", kcal_100g=46, protein_100g=8.0, package_grams=pack)
            session.add(food)
            await session.commit()
            return food.id
        finally:
            await gen.aclose()

    _semana(client, asyncio.run(sembrar()), n)


@when("I ask for the shopping list of that week", target_fixture="lista")
def when_list(client):
    resp = client.get(f"/plans/{_lunes().isoformat()}/shopping")
    assert resp.status_code == 200, resp.text
    return resp.json()


@when("I ask for the shopping list of a week never planned", target_fixture="respuesta")
def when_list_none(client):
    return client.get("/plans/2026-01-05/shopping")


def _item(lista, name):
    return next(i for a in lista["aisles"] for i in a["items"] if i["name"] == name)


@then(parsers.parse('"{name}" is on the list with {grams:g} g'))
def then_grams(lista, name, grams):
    assert _item(lista, name)["grams"] == grams


@then(parsers.parse('"{name}" is in the aisle "{aisle}"'))
def then_aisle(lista, name, aisle):
    (pasillo,) = [a for a in lista["aisles"] if any(i["name"] == name for i in a["items"])]
    assert pasillo["name"] == aisle


@then(parsers.parse('"{name}" is on the list with {packs:d} packs of {pack:g} g'))
def then_packs(lista, name, packs, pack):
    item = _item(lista, name)
    assert item["packs"] == packs
    assert item["package_grams"] == pack


@then("there is no list")
def then_no_list(respuesta):
    assert respuesta.status_code == 404


# --- Taski -------------------------------------------------------------------
# En la suite no hay red: Taski es una lista en memoria con las dos llamadas que
# Fitit le hace. Lo que se fija no es que Taski conteste, sino qué le mandamos.


class TaskiFalso:
    def __init__(self, items=None, *, caido=False):
        self.items = list(items or [])
        self.caido = caido

    async def listar(self) -> list[dict]:
        if self.caido:
            raise Unreachable("sin red")
        return list(self.items)

    async def anadir(self, item: dict) -> None:
        if self.caido:
            raise Unreachable("sin red")
        self.items.append({**item, "checked": False})


@pytest.fixture()
def taski():
    caja = {"taski": None}
    app.dependency_overrides[get_taski] = lambda: caja["taski"]
    yield caja
    app.dependency_overrides.pop(get_taski, None)


@given("Taski is reachable with an empty list")
def given_taski_empty(taski):
    taski["taski"] = TaskiFalso()


@given(parsers.parse('Taski already has "{name}" ticked off'))
def given_taski_ticked(taski, name):
    taski["taski"] = TaskiFalso([{"name": name, "checked": True}])


@given("Taski cannot be reached")
def given_taski_down(taski):
    taski["taski"] = TaskiFalso(caido=True)


@given("Taski is not configured")
def given_taski_off(taski):
    taski["taski"] = None


def _enviar(client, fuera=()):
    lista = client.get(f"/plans/{_lunes().isoformat()}/shopping").json()
    ids = [i["food_id"] for a in lista["aisles"] for i in a["items"] if i["name"] in fuera]
    return client.post(f"/plans/{_lunes().isoformat()}/shopping/taski", json={"skip_food_ids": ids})


@when("I send the shopping list of that week to Taski", target_fixture="envio")
def when_send(client):
    resp = _enviar(client)
    assert resp.status_code == 200, resp.text
    return resp.json()


@when(parsers.parse('I send the shopping list of that week to Taski leaving out "{name}"'))
def when_send_skip(client, name):
    resp = _enviar(client, fuera=(name,))
    assert resp.status_code == 200, resp.text


@when("I try to send the shopping list of that week to Taski", target_fixture="respuesta")
def when_try_send(client):
    return _enviar(client)


def _en_taski(taski, name):
    return [i for i in taski["taski"].items if i["name"] == name]


@then(parsers.parse('Taski has "{name}" with quantity "{quantity}" in "{category}"'))
def then_taski_item(taski, name, quantity, category):
    (item,) = _en_taski(taski, name)
    assert item["quantity"] == quantity
    assert item["category"] == category


@then("the note on it says it comes from Fitit's plan")
def then_taski_note(taski):
    (item,) = taski["taski"].items
    assert item["notes"].startswith("Plan de Fitit · semana del ")


@then(parsers.parse('Taski has "{name}" once'))
def then_taski_once(taski, name):
    assert len(_en_taski(taski, name)) == 1


@then("Taski has nothing")
def then_taski_empty(taski):
    assert taski["taski"].items == []


@then(parsers.parse("{n:d} item was added"))
@then(parsers.parse("{n:d} items were added"))
def then_added(envio, n):
    assert envio["added"] == n


@then(parsers.parse("the answer is {status:d}"))
def then_status(respuesta, status):
    assert respuesta.status_code == status, respuesta.text
