"""Qué hace el backend con un código de barras.

Ningún escenario sale a la red: la consulta a Open Food Facts se sustituye por
una función que devuelve lo que queramos. Lo que hay que fijar no es que OFF
conteste —eso es asunto suyo— sino qué hace la app con lo que conteste, y sobre
todo qué hace cuando la ficha viene a medias, que es lo normal en una base que
rellena cualquiera.
"""

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

from app.main import app
from app.openfoodfacts import Unreachable
from app.routers.foods import get_barcode_lookup

scenarios("../features/scan_barcode.feature")


FICHA = {
    "status": 1,
    "product": {
        "product_name": "Yogur natural",
        "brands": "Hacendado",
        "nutrition_data_per": "100g",
        "quantity": "500 g",
        "nutriments": {
            "energy-kcal_100g": 61,
            "proteins_100g": 3.8,
            "fat_100g": 3.2,
            "carbohydrates_100g": 4.5,
            "fiber_100g": 0.3,
        },
    },
}


@pytest.fixture()
def asked():
    """Cuántas veces se ha preguntado a OFF. Un escenario entero depende de que
    la respuesta sea cero."""
    return {"veces": 0}


@pytest.fixture(autouse=True)
def _clear_lookup():
    yield
    app.dependency_overrides.pop(get_barcode_lookup, None)


def _install(asked, payload=None, *, offline=False):
    async def lookup(ean: str) -> dict:
        asked["veces"] += 1
        if offline:
            raise Unreachable("sin red")
        return payload

    app.dependency_overrides[get_barcode_lookup] = lambda: lookup


def _product(**overrides):
    product = {**FICHA["product"], **overrides}
    return {"status": 1, "product": product}


@given(parsers.parse('I already have "{name}" with the barcode "{ean}"'))
def given_already_mine(client, asked, name, ean):
    # Instalado igualmente, para poder comprobar que **no** se llama.
    _install(asked, FICHA)
    resp = client.post("/foods", json={"name": name, "kcal_100g": 61, "barcode": ean})
    assert resp.status_code == 201, resp.text


@given(parsers.parse('Open Food Facts knows "{ean}" as "{name}" of "{brand}"'))
def given_off_knows(asked, ean, name, brand):
    _install(asked, _product(product_name=name, brands=brand))


@given(parsers.parse('Open Food Facts has "{ean}" with its figures per serving'))
def given_per_serving(asked, ean):
    _install(asked, _product(nutrition_data_per="serving"))


@given(parsers.parse('Open Food Facts has "{ean}" with no calories on it'))
def given_no_kcal(asked, ean):
    nutriments = {k: v for k, v in FICHA["product"]["nutriments"].items() if "energy" not in k}
    _install(asked, _product(nutriments=nutriments))


@given(parsers.parse('Open Food Facts knows "{ean}" but carries no fibre for it'))
def given_no_fibre(asked, ean):
    nutriments = {k: v for k, v in FICHA["product"]["nutriments"].items() if "fiber" not in k}
    _install(asked, _product(nutriments=nutriments))


@given(parsers.parse('Open Food Facts has never heard of "{ean}"'))
def given_unknown(asked, ean):
    _install(asked, {"status": 0})


@given("Open Food Facts cannot be reached")
def given_offline(asked):
    _install(asked, offline=True)


@when(parsers.parse('I scan "{code}"'), target_fixture="response")
def when_scan(client, asked, code):
    if get_barcode_lookup not in app.dependency_overrides:
        _install(asked, {"status": 0})
    return client.get(f"/foods/barcode/{code}")


@then(parsers.parse('it hands me back "{name}" straight away'))
def then_already_mine(response, name):
    assert response.status_code == 200, response.text
    assert response.json()["food"]["name"] == name


@then("Open Food Facts is never asked")
def then_not_asked(asked):
    """La regla que hace que esto valga la pena: un producto conocido se
    registra sin red. Si se pregunta igual, el escáner deja de funcionar en el
    súper y gasta cuota por un dato que ya estaba en la base."""
    assert asked["veces"] == 0


@then(parsers.parse('the form comes back holding "{name}" of "{brand}"'))
def then_proposal(response, name, brand):
    body = response.json()
    assert body["food"] is None, "una propuesta no es un alimento tuyo"
    assert body["name"] == name
    assert body["brand"] == brand


@then(parsers.parse("it proposes {kcal:d} kcal per 100 g"))
def then_kcal(response, kcal):
    assert response.json()["nutrients"]["kcal"] == kcal


@then(parsers.parse('the catalogue still does not have "{name}"'))
def then_not_created(client, name):
    """Escanear no da de alta. La única puerta sigue siendo el formulario."""
    assert client.get(f"/foods?q={name}").json() == []


@then("nothing is proposed")
def then_nothing(response):
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["food"] is None
    assert body["nutrients"] == {}


@then(parsers.parse('it says the entry could not be used because "{reason}"'))
def then_unusable(response, reason):
    body = response.json()
    assert body["refusal"] == "unusable"
    assert body["refused_reason"] == reason


@then("the proposed fibre is unknown, not zero")
def then_fibre_unknown(response):
    assert response.json()["nutrients"]["fiber"] is None


@then("it says the code is unknown")
def then_unknown(response):
    assert response.json()["refusal"] == "unknown"


@then("it gives me back the code so the food I type keeps it")
def then_code_kept(response):
    """Sin esto, un código que OFF no conoce se escanea una vez y se pierde: el
    alimento que das de alta no lo lleva, y mañana vuelves a preguntar por él."""
    assert response.json()["barcode"] == "8410128750121"


@then("it says it could not ask")
def then_offline(response):
    assert response.json()["refusal"] == "offline"


@then("the app refuses it as malformed")
def then_malformed(response, asked):
    assert response.status_code == 422
    assert asked["veces"] == 0, "no se pregunta por algo que no es un código"


def _en_la_base(fn):
    """Ejecuta `fn(session)` sobre la base que ve `client`. El catálogo
    compartido no tiene puerta HTTP —lo escriben los scripts de import—, así
    que se siembra por debajo."""
    import asyncio

    from app.db import get_session

    async def go():
        gen = app.dependency_overrides[get_session]()
        session = await gen.__anext__()
        try:
            return await fn(session)
        finally:
            await gen.aclose()

    return asyncio.run(go())


@given(parsers.parse('the catalogue has "{name}" with the barcode "{ean}"'))
def given_catalogue_has(client, asked, name, ean):
    from app.models import Food
    from app.naming import fold_exercise_name as fold

    # Instalado para poder comprobar que **no** se llama.
    _install(asked, FICHA)

    async def sembrar(session):
        session.add(
            Food(
                user_id=None, name=name, name_folded=fold(name), brand="Hacendado",
                brand_folded="hacendado", barcode=ean, source="off", source_ref=ean,
                kcal_100g=46, protein_100g=8.0, fat_100g=0.1, carbs_100g=3.5,
            )
        )
        await session.commit()

    _en_la_base(sembrar)


@when(parsers.parse('I search for "{q}"'), target_fixture="results")
def when_search(client, q):
    resp = client.get("/foods", params={"q": q})
    assert resp.status_code == 200, resp.text
    return resp.json()


@then(parsers.parse('only one result carries the barcode "{ean}"'))
def then_one_with_barcode(results, ean):
    assert [r["barcode"] for r in results].count(ean) == 1, results


@then(parsers.parse('that result is "{name}"'))
def then_that_result(results, name):
    assert any(r["name"] == name for r in results)


@then(parsers.parse('"{name}" appears once'))
def then_appears_once(results, name):
    assert [r["name"] for r in results].count(name) == 1, results
