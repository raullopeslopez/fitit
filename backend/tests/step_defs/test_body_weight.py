from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/body_weight.feature")


def _weigh(client, kg, on):
    return client.post("/body-weight", json={"measured_on": on, "kg": kg})


@given(parsers.parse("I weighed {kg:g} kg on {on}"))
@when(parsers.parse("I weigh {kg:g} kg on {on}"))
def weigh(client, kg, on):
    resp = _weigh(client, kg, on)
    assert resp.status_code == 201, resp.text


@when(parsers.parse("I try to weigh {kg:g} kg on {on}"), target_fixture="refusal")
def try_weigh(client, kg, on):
    return _weigh(client, kg, on)


@then("the weigh-in is refused")
def then_refused(refusal):
    assert refusal.status_code == 422, refusal.text


def _history(client):
    resp = client.get("/body-weight")
    assert resp.status_code == 200, resp.text
    return resp.json()


@then(parsers.parse("my weight history holds {kg:g} kg for {on}"))
def then_history_holds(client, kg, on):
    rows = {row["measured_on"]: row["kg"] for row in _history(client)}
    assert rows.get(on) == kg, rows


@then(parsers.parse("my weight history holds {count:d} weigh-in"))
@then(parsers.parse("my weight history holds {count:d} weigh-ins"))
def then_history_count(client, count):
    assert len(_history(client)) == count


def _trend(client):
    resp = client.get("/body-weight/trend")
    assert resp.status_code == 200, resp.text
    return resp.json()


@then(parsers.parse("my trend is unknown, not {instead_of:g}"))
def then_trend_unknown(client, instead_of):
    # Las dos mitades importan: que no haya tendencia, y que no se haya
    # rellenado con la pesada que sí hay.
    trend = _trend(client)
    assert trend["kg"] is None, trend
    assert trend["kg"] != instead_of


@then(parsers.parse("my trend is {kg:g} kg"))
def then_trend_is(client, kg):
    assert _trend(client)["kg"] == kg


@then(parsers.parse("my trend says it used {count:d} weigh-ins"))
def then_trend_count(client, count):
    assert _trend(client)["weigh_ins"] == count


@then(parsers.parse("my trend is measured up to {on}"))
def then_trend_up_to(client, on):
    assert _trend(client)["up_to"] == on
