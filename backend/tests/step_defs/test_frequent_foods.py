from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/frequent_foods.feature")


def _food(client, name):
    resp = client.post("/foods", json={"name": name, "kcal_100g": 100})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _log(client, food, grams, meal_slot=None):
    body = {"food_id": food["id"], "grams": grams}
    if meal_slot is not None:
        body["meal_slot"] = meal_slot
    resp = client.post("/food-log", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


@given(parsers.parse('I have logged {grams:g} g of "{name}" three times'))
def given_logged_thrice(client, grams, name):
    food = _food(client, name)
    for _ in range(3):
        _log(client, food, grams)


@given(parsers.parse('I have logged {grams:g} g of "{name}" once'))
def given_logged_once(client, grams, name):
    _log(client, _food(client, name), grams)


@given(parsers.parse('I have logged "{name}" at {a:g} g, then {b:g} g, then {c:g} g'))
def given_logged_amounts(client, name, a, b, c):
    food = _food(client, name)
    for grams in (a, b, c):
        _log(client, food, grams)


@given(parsers.parse('I have logged "{name}" twice at breakfast and once at dinner'))
def given_logged_slots(client, name):
    food = _food(client, name)
    _log(client, food, 125, meal_slot="desayuno")
    _log(client, food, 125, meal_slot="desayuno")
    _log(client, food, 125, meal_slot="cena")


@given(parsers.parse('I have logged "{name}" twice at dinner'))
def given_twice_dinner(client, name):
    food = _food(client, name)
    for _ in range(2):
        _log(client, food, 67, meal_slot="cena")


@given(parsers.parse('I have logged "{name}" three times at breakfast'))
def given_thrice_breakfast(client, name):
    food = _food(client, name)
    for _ in range(3):
        _log(client, food, 50, meal_slot="desayuno")


@given(parsers.parse('I have logged "{name}" at {a:g} g for breakfast twice and at {b:g} g for dinner once'))
def given_amounts_by_meal(client, name, a, b):
    food = _food(client, name)
    _log(client, food, a, meal_slot="desayuno")
    _log(client, food, a, meal_slot="desayuno")
    _log(client, food, b, meal_slot="cena")


@when("I ask for what I usually eat at dinner", target_fixture="frequent")
def when_ask_dinner(client):
    resp = client.get("/foods/frequent?slot=cena")
    assert resp.status_code == 200, resp.text
    return resp.json()


@when("I ask for what I always eat", target_fixture="frequent")
def when_ask(client):
    resp = client.get("/foods/frequent")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _find(frequent, name):
    row = next((r for r in frequent if r["name"] == name), None)
    assert row is not None, f"{name} is not in {[r['name'] for r in frequent]}"
    return row


@then(parsers.parse('"{first}" comes before "{second}"'))
def then_order(frequent, first, second):
    names = [row["name"] for row in frequent]
    assert names.index(first) < names.index(second)


@then(parsers.parse('"{name}" offers {grams:g} g'))
def then_offers(frequent, name, grams):
    assert _find(frequent, name)["grams"] == grams


@then(parsers.parse('"{name}" comes back for {slot}'))
def then_slot(frequent, name, slot):
    spanish = {"breakfast": "desayuno", "lunch": "comida", "dinner": "cena"}
    assert _find(frequent, name)["meal_slot"] == spanish[slot]


@then(parsers.parse('"{name}" is in the list'))
def then_in(frequent, name):
    _find(frequent, name)


@then(parsers.parse('"{name}" is not in the list'))
def then_not_in(frequent, name):
    assert name not in [row["name"] for row in frequent]


@then("the list is empty")
def then_empty(frequent):
    assert frequent == []
