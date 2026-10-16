import pytest
from pytest_bdd import given, parsers, scenarios, then, when

from app.ingredient_line import parse_line
from app.nutrition import medida_casera

scenarios("../features/household_measures.feature")


@pytest.fixture()
def ctx():
    return {"foods": {}}


def _log(client, ctx, name, **amount):
    resp = client.post("/food-log", json={"food_id": ctx["foods"][name], **amount})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _measure(client, ctx, name, count, measure):
    return _log(client, ctx, name, measure=measure, quantity=count)


# --- Given ----------------------------------------------------------------------


@given(parsers.parse('a food "{name}" with {kcal:g} kcal per 100 g'))
def given_food(client, ctx, name, kcal):
    resp = client.post("/foods", json={"name": name, "kcal_100g": kcal})
    assert resp.status_code == 201, resp.text
    ctx["foods"][name] = resp.json()["id"]


@given(parsers.parse('I logged {count:g} "{measure}" of "{name}"'))
def given_logged(client, ctx, count, measure, name):
    ctx["entry"] = _measure(client, ctx, name, count, measure)


@given(parsers.parse('I have logged {count:g} "{measure}" of "{name}" twice and {grams:g} g once'))
def given_twice_and_once(client, ctx, count, measure, name, grams):
    _log(client, ctx, name, grams=grams)
    _measure(client, ctx, name, count, measure)
    _measure(client, ctx, name, count, measure)


@given(parsers.parse('I have logged {grams:g} g of "{name}", then {count:g} "{measure}"'))
def given_grams_then_measure(client, ctx, grams, name, count, measure):
    _log(client, ctx, name, grams=grams)
    _measure(client, ctx, name, count, measure)


@given(parsers.parse('I have logged {count:g} "{measure}" of "{name}" three times'))
def given_three_times(client, ctx, count, measure, name):
    for _ in range(3):
        _measure(client, ctx, name, count, measure)


# --- When -----------------------------------------------------------------------


@when(parsers.parse('I log {count:g} "{measure}" of "{name}"'))
def when_log_measure(client, ctx, count, measure, name):
    ctx["entry"] = _measure(client, ctx, name, count, measure)


@when(parsers.parse('I log {grams:g} g of "{name}"'))
def when_log_grams(client, ctx, grams, name):
    ctx["entry"] = _log(client, ctx, name, grams=grams)


@when(parsers.parse('I try to log {grams:g} g and {count:g} "{measure}" of "{name}" at once'))
def when_try_both(client, ctx, grams, count, measure, name):
    ctx["response"] = client.post(
        "/food-log",
        json={"food_id": ctx["foods"][name], "grams": grams, "measure": measure, "quantity": count},
    )


@when(parsers.parse('I try to log {count:g} "{measure}" of "{name}"'))
def when_try_measure(client, ctx, count, measure, name):
    ctx["response"] = client.post(
        "/food-log",
        json={"food_id": ctx["foods"][name], "measure": measure, "quantity": count},
    )


@when(parsers.parse("I re-weigh that entry to {grams:g} g"))
def when_reweigh(client, ctx, grams):
    resp = client.patch(f"/food-log/{ctx['entry']['id']}", json={"grams": grams})
    assert resp.status_code == 200, resp.text
    ctx["entry"] = resp.json()


@when(parsers.parse('I ask for my amounts of "{name}"'))
def when_amounts(client, ctx, name):
    resp = client.get(f"/foods/{ctx['foods'][name]}/usual")
    assert resp.status_code == 200, resp.text
    ctx["amounts"] = resp.json()


@when("I ask for my frequent foods")
def when_frequent(client, ctx):
    resp = client.get("/foods/frequent")
    assert resp.status_code == 200, resp.text
    ctx["frequent"] = resp.json()


@when(parsers.parse("I ask for the household measure of {grams:g} g"))
def when_household(ctx, grams):
    ctx["household"] = medida_casera(grams)


@when(parsers.parse('a recipe line reads "{line}"'))
def when_recipe_line(ctx, line):
    ctx["line"] = parse_line(line)


# --- Then -----------------------------------------------------------------------


@then(parsers.parse("the entry weighs {grams:g} g"))
def then_weighs(ctx, grams):
    assert ctx["entry"]["grams"] == grams


@then(parsers.parse('the entry\'s measure is {count:g} "{measure}"'))
def then_measure(ctx, count, measure):
    assert ctx["entry"]["measure"] == measure
    assert ctx["entry"]["measure_count"] == count


@then(parsers.parse("the entry has {kcal:g} kcal"))
def then_kcal(ctx, kcal):
    assert ctx["entry"]["kcal"] == pytest.approx(kcal)


@then("the entry has no measure")
def then_no_measure(ctx):
    assert ctx["entry"]["measure"] is None
    assert ctx["entry"]["measure_count"] is None


@then("the request is rejected as invalid")
def then_rejected(ctx):
    assert ctx["response"].status_code == 422, ctx["response"].text


def _amount(text):
    """«2 cda ×2» → (2, "cda", 2); «30 g ×1» → (30, None, 1)."""
    amount, times = text.split(" ×")
    count, unit = amount.split(" ")
    return float(count), None if unit == "g" else unit, int(times)


def _as_tuple(row):
    if row["measure"] is None:
        return row["grams"], None, row["times"]
    return row["measure_count"], row["measure"], row["times"]


@then(parsers.parse("the amounts are {expected}"))
def then_amounts(ctx, expected):
    assert [_as_tuple(a) for a in ctx["amounts"]] == [_amount(p) for p in expected.split(", ")]


@then(parsers.parse("the latest amount is {count:g} {measure}"))
def then_latest(ctx, count, measure):
    latest = [a for a in ctx["amounts"] if a["latest"]]
    assert len(latest) == 1
    assert (latest[0]["measure_count"], latest[0]["measure"]) == (count, measure)


@then(parsers.parse('"{name}" is offered as {count:g} {measure}, {grams:g} g'))
def then_offered(ctx, name, count, measure, grams):
    row = next(r for r in ctx["frequent"] if r["name"] == name)
    assert (row["measure_count"], row["measure"], row["grams"]) == (count, measure, grams)


def _shown(text):
    """«½ cdta» → (0.5, "cdta"); «2 cdas» → (2, "cda")."""
    count, unit = text.split(" ")
    count = 0.5 if count == "½" else float(count)
    return count, unit.removesuffix("s")


@then(parsers.parse('the measure is "{shown}"'))
def then_household(ctx, shown):
    count, measure = _shown(shown)
    assert ctx["household"] is not None
    assert (ctx["household"].count, ctx["household"].measure) == (count, measure)


@then("there is no measure")
def then_no_household(ctx):
    assert ctx["household"] is None


@then(parsers.parse("the line weighs {grams:g} g"))
def then_line_grams(ctx, grams):
    assert ctx["line"].grams == grams


@then("the line has no grams")
def then_line_no_grams(ctx):
    assert ctx["line"].grams is None
