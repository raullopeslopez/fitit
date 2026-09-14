from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/meal_subtotals.feature")


@given(parsers.parse('a food "{name}" with {kcal:g} kcal per 100 g'), target_fixture="food")
def given_food(client, name, kcal):
    resp = client.post("/foods", json={"name": name, "kcal_100g": kcal})
    assert resp.status_code == 201, resp.text
    return resp.json()


@given(parsers.parse('a food "{name}" with no kcal on record'))
def given_food_without_kcal(client, name):
    # kcal_100g omitido a propósito: desconocido, que no es 0.
    resp = client.post("/foods", json={"name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _log(client, name, grams, slot):
    food = next(f for f in client.get(f"/foods?q={name}").json() if f["name"] == name)
    body = {"food_id": food["id"], "grams": grams}
    if slot is not None:
        body["meal_slot"] = slot
    resp = client.post("/food-log", json=body)
    assert resp.status_code == 201, resp.text


@when(parsers.parse('I log {grams:g} g of "{name}" at {slot:w}'))
def when_log_at(client, grams, name, slot):
    _log(client, name, grams, slot)


@when(parsers.parse('I log {grams:g} g of "{name}" at no meal in particular'))
def when_log_unassigned(client, grams, name):
    _log(client, name, grams, None)


def _slot(client, slot):
    day = client.get("/food-log").json()
    row = next((s for s in day["by_slot"] if s["slot"] == slot), None)
    assert row is not None, f"{slot} no viene en {[s['slot'] for s in day['by_slot']]}"
    return row


@then(parsers.parse("{slot:w} totals {kcal:g} kcal"))
def then_slot_totals(client, slot, kcal):
    assert _slot(client, slot)["totals"]["kcal"] == kcal


@then("the unassigned pile totals 150 kcal")
def then_unassigned_totals(client):
    assert _slot(client, None)["totals"]["kcal"] == 150


@then(parsers.parse("{slot:w}'s kcal are unknown, not zero"))
def then_slot_unknown(client, slot):
    assert _slot(client, slot)["totals"]["kcal"] is None


@then(parsers.parse("{slot:w} is missing nothing, because there is nothing in it"))
def then_slot_missing_nothing(client, slot):
    assert _slot(client, slot)["unknown"]["kcal"] == 0


@then(parsers.parse("{slot:w} is missing {count:d} entry's kcal"))
def then_slot_missing(client, slot, count):
    assert _slot(client, slot)["unknown"]["kcal"] == count


@then(parsers.parse("the day totals {kcal:g} kcal"))
def then_day_totals(client, kcal):
    assert client.get("/food-log").json()["totals"]["kcal"] == kcal
