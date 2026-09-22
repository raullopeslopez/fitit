"""El repertorio, poblado sin teclearlo.

El modelo se sustituye por una dependencia: aquí no hay red, ni clave, ni cuota
que gastar. Lo que se comprueba es qué hace el backend con lo que conteste.
"""

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

from app.gemini import ModelUnavailable
from app.main import app
from app.routers.dishes import get_dish_proposer

scenarios("../features/propose_dishes.feature")


@pytest.fixture(autouse=True)
def _limpiar_override():
    yield
    app.dependency_overrides.pop(get_dish_proposer, None)


def _proponer(payload=None, *, boom=None):
    async def proposer(**_kwargs):
        if boom is not None:
            raise boom
        return payload

    app.dependency_overrides[get_dish_proposer] = lambda: proposer


@given(parsers.parse('I have logged "{a}" and "{b}"'))
def given_pantry(client, a, b):
    # 200 g de pechuga son 242 kcal: 121 por 100 g.
    for name, kcal in ((a, 121), (b, 130)):
        food = client.post("/foods", json={"name": name, "kcal_100g": kcal}).json()
        assert client.post("/food-log", json={"food_id": food["id"], "grams": 100}).status_code == 201


@given(parsers.parse('a dish "{name}" for {servings:d} servings with {grams:g} g of "{food}"'))
def given_dish(client, name, servings, grams, food):
    match = next(f for f in client.get(f"/foods?q={food}").json() if f["name"] == food)
    resp = client.post(
        "/dishes",
        json={
            "name": name,
            "servings": servings,
            "ingredients": [{"food_id": match["id"], "grams": grams}],
        },
    )
    assert resp.status_code == 201, resp.text


def _dish_payload(name, grams, food, **extra):
    return {
        "dishes": [
            {
                "name": name,
                "method": "air_fryer",
                "basis": "raw",
                "servings": 1,
                "ingredients": [{"food": food, "grams": grams}],
                **extra,
            }
        ]
    }


@given(parsers.parse('the model proposes "{name}" with {grams:g} g of "{food}"'))
def given_proposal(name, grams, food):
    _proponer(_dish_payload(name, grams, food))


@given(
    parsers.parse(
        'the model proposes "{name}" with {grams:g} g of "{food}" and claims {kcal:d} kcal'
    )
)
def given_proposal_with_numbers(name, grams, food, kcal):
    # Las cifras van dentro a propósito: lo que se comprueba es que se ignoran.
    _proponer(_dish_payload(name, grams, food, kcal=kcal, nutrients={"kcal": kcal}))


@given("the model has no quota left for today")
def given_no_quota():
    _proponer(boom=ModelUnavailable("429", quota="day"))


@when("I ask for dishes", target_fixture="generated")
def when_generate(client):
    resp = client.post("/dishes/generate", json={"n": 3})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _mine(client):
    return client.get("/dishes").json()


@then(parsers.parse('"{name}" is in my dishes'))
def then_in_dishes(client, name):
    assert any(d["name"] == name for d in _mine(client)), _mine(client)


@then(parsers.parse('"{name}" is not in my dishes'))
def then_not_in_dishes(client, name):
    assert not any(d["name"] == name for d in _mine(client))


@then(parsers.parse('"{name}" has {kcal:g} kcal per serving'))
def then_kcal(client, name, kcal):
    dish = next(d for d in _mine(client) if d["name"] == name)
    assert dish["per_serving"]["kcal"] == kcal


@then("nothing is waiting in the suggestions drawer")
def then_no_suggestions(generated):
    assert generated["suggestions"] == []


@then(parsers.parse('the suggestions drawer holds "{name}"'))
def then_drawer_holds(generated, name):
    assert any(s["name"] == name for s in generated["suggestions"]), generated


@then(parsers.parse('it says "{food}" is what I am missing'))
def then_missing(generated, food):
    (sugerencia,) = generated["suggestions"]
    assert sugerencia["missing"] == [food]


@then(parsers.parse('I have {count:d} dish called "{name}"'))
def then_count(client, count, name):
    assert len([d for d in _mine(client) if d["name"] == name]) == count


@then("it says the quota is gone for the day")
def then_quota(generated):
    assert generated["refusal"] == "quota"
    assert generated["quota_scope"] == "day"


@then("my dishes are still there to read")
def then_still_readable(client):
    assert client.get("/dishes").status_code == 200


@then("it says there is nothing in the pantry yet")
def then_empty_pantry(generated):
    assert generated["refusal"] == "empty_pantry"
