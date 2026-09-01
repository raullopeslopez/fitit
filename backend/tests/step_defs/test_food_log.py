from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/food_log.feature")


def _create_food(client, name, *, kcal=None, protein=None, fiber=None):
    resp = client.post(
        "/foods",
        json={
            "name": name,
            "kcal_100g": kcal,
            "protein_100g": protein,
            "fiber_100g": fiber,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@given(
    parsers.parse(
        'a food "{name}" with {kcal:g} kcal and {protein:g} g of protein per 100 g'
    ),
    target_fixture="food",
)
def given_food_with_protein(client, name, kcal, protein):
    return _create_food(client, name, kcal=kcal, protein=protein)


@given(
    parsers.parse('a food "{name}" with {kcal:g} kcal per 100 g and no fibre on record'),
    target_fixture="food",
)
def given_food_without_fibre(client, name, kcal):
    # fiber_100g omitted on purpose: unknown, which is not the same as 0.
    return _create_food(client, name, kcal=kcal)


@given(parsers.parse('a food "{name}" with {kcal:g} kcal per 100 g'), target_fixture="food")
def given_food(client, name, kcal):
    return _create_food(client, name, kcal=kcal)


def _log(client, food, grams, logged_at=None):
    body = {"food_id": food["id"], "grams": grams}
    if logged_at is not None:
        body["logged_at"] = logged_at
    resp = client.post("/food-log", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


@given(parsers.parse('I log {grams:g} g of "{name}"'), target_fixture="entry")
def given_logged(client, food, grams, name):
    return _log(client, food, grams)


@when(parsers.parse('I log {grams:g} g of "{name}"'), target_fixture="entry")
def when_log(client, food, grams, name):
    return _log(client, food, grams)


@when(
    parsers.parse('I log {grams:g} g of "{name}" at {time} on {day}'),
    target_fixture="entry",
)
def when_log_at(client, food, grams, name, time, day):
    # +02:00 is the offset Madrid is on in September; the food day is the local
    # one, so the offset is the whole point of sending it.
    return _log(client, food, grams, logged_at=f"{day}T{time}:00+02:00")


@when(parsers.parse('I correct "{name}" to {kcal:g} kcal per 100 g'))
def when_correct_food(client, food, name, kcal):
    resp = client.patch(f"/foods/{food['id']}", json={"kcal_100g": kcal})
    assert resp.status_code == 200, resp.text


def _day(client, log_date):
    resp = client.get(f"/food-log?date={log_date}")
    assert resp.status_code == 200, resp.text
    return resp.json()


@then(parsers.parse("the day totals {kcal:g} kcal and {protein:g} g of protein"))
def then_day_totals(client, entry, kcal, protein):
    totals = _day(client, entry["log_date"])["totals"]
    assert totals["kcal"] == kcal
    assert totals["protein"] == protein


@then(parsers.parse("that entry records {kcal:g} kcal"))
def then_entry_kcal(entry, kcal):
    assert entry["kcal"] == kcal


@then("that entry's fibre is unknown, not zero")
def then_entry_fibre_unknown(entry):
    assert entry["fiber"] is None


@then("the day's fibre total is unknown, not zero")
def then_day_fibre_unknown(client, entry):
    day = _day(client, entry["log_date"])
    assert day["totals"]["fiber"] is None
    # And it says so out loud, so the screen can distinguish it from a zero.
    assert day["unknown"]["fiber"] == 1


@then(parsers.parse("the entry I already logged still records {kcal:g} kcal"))
def then_frozen(client, entry, kcal):
    day = _day(client, entry["log_date"])
    assert [e["kcal"] for e in day["entries"]] == [kcal]


@then(parsers.parse("it counts towards {day}"))
def then_log_date(entry, day):
    assert entry["log_date"] == day
