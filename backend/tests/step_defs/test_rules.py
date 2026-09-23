"""Las reglas, juzgando un día."""

from datetime import UTC, date, datetime, timedelta

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/rules.feature")


def _regla(client, **fields):
    resp = client.post("/rules", json=fields)
    assert resp.status_code == 201, resp.text
    return resp.json()


@given(parsers.parse("I weigh {kg:g} kg"))
def given_weight(client, kg):
    # Dos pesadas: una sola no es una tendencia, y las reglas por kilo miran la
    # tendencia (ver `weight.py`).
    for atras in (1, 0):
        dia = (date.today() - timedelta(days=atras)).isoformat()
        assert client.post("/body-weight", json={"measured_on": dia, "kg": kg}).status_code == 201


@given(parsers.parse("a hard rule of {lo:g} to {hi:g} g of protein per kilo"))
def given_protein_rule(client, lo, hi):
    _regla(
        client,
        type="macro_per_kg",
        scope="day",
        hardness="hard",
        params={"macro": "protein", "min": lo, "max": hi},
    )


@given(parsers.parse("a hard rule of vegetables at {slot:w}"))
def given_veg_rule(client, slot):
    _regla(
        client,
        type="group_presence",
        scope="slot",
        slot=slot,
        hardness="hard",
        params={"familia": "verdura"},
    )


@given(parsers.parse("a hard rule of vegetables at {slot:w} on training days"))
def given_veg_rule_training(client, slot):
    _regla(
        client,
        type="group_presence",
        scope="slot",
        slot=slot,
        hardness="hard",
        day_condition="training",
        params={"familia": "verdura"},
    )


@given(parsers.parse("a hard rule of vegetables at {slot:w} that I retired yesterday"))
def given_retired_rule(client, slot):
    regla = _regla(
        client,
        type="group_presence",
        scope="slot",
        slot=slot,
        hardness="hard",
        params={"familia": "verdura"},
    )
    ayer = (date.today() - timedelta(days=1)).isoformat()
    resp = client.patch(f"/rules/{regla['id']}", json={"active_to": ayer})
    assert resp.status_code == 200, resp.text


@given(parsers.parse("a soft rule of pulses at least {n:d} times a week"))
def given_pulses_rule(client, n):
    _regla(
        client,
        type="group_frequency",
        scope="week",
        hardness="soft",
        params={"familia": "legumbre", "min": n},
    )


def _comer(client, name, grams, slot, *, familia=None, protein=None, when_=None):
    body = {"name": name}
    if familia:
        body["familia"] = familia
    if protein is not None:
        body["protein_100g"] = protein
    food = client.post("/foods", json=body).json()
    entrada = {"food_id": food["id"], "grams": grams}
    if slot:
        entrada["meal_slot"] = slot
    if when_:
        entrada["logged_at"] = when_
    resp = client.post("/food-log", json=entrada)
    assert resp.status_code == 201, resp.text


@when(parsers.parse("I eat {grams:g} g of protein today"))
def when_eat_protein(client, grams):
    # 100 g de proteína por 100 g ⇒ los gramos comidos son los de proteína.
    _comer(client, "Proteína pura", grams, "comida", protein=100)


@when(parsers.parse('I eat "{name}" at {slot:w}'))
def when_eat_named(client, name, slot):
    _comer(client, name, 100, slot, familia="verdura")


@when(parsers.parse('I eat "{name}" at {slot:w}, which has no group'))
def when_eat_unclassified(client, name, slot):
    _comer(client, name, 100, slot)


@when(parsers.parse("I eat pulses on {n:d} days this week"))
def when_eat_pulses(client, n):
    hoy = datetime.now(UTC).replace(hour=12)
    lunes = hoy - timedelta(days=hoy.weekday())
    for i in range(n):
        _comer(
            client,
            f"Lentejas {i}",
            100,
            "comida",
            familia="legumbre",
            when_=(lunes + timedelta(days=i)).isoformat(),
        )


@when(parsers.parse("I eat nothing green at {slot:w} on a day I did not train"))
def when_no_green(client, slot):
    _comer(client, "Pan", 100, slot)


@when("I try to save a rule of a type nobody has written", target_fixture="refusal")
def when_bad_rule(client):
    return client.post(
        "/rules", json={"type": "come_mejor", "scope": "day", "hardness": "soft", "params": {}}
    )


@then("it is refused")
def then_refused(refusal):
    assert refusal.status_code == 422, refusal.text


def _veredictos(client):
    resp = client.get("/rules/verdicts")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _uno(client):
    salida = _veredictos(client)
    assert len(salida["verdicts"]) >= 1, salida
    return salida["verdicts"][0]


@then("the rule is broken")
def then_broken(client):
    assert _uno(client)["state"] == "broken", _veredictos(client)


@then("the rule is met")
def then_met(client):
    assert _uno(client)["state"] == "met", _veredictos(client)


@then("the rule cannot say")
def then_unknown(client):
    assert _uno(client)["state"] == "unknown", _veredictos(client)


@then("nothing is judged today")
def then_nothing_judged(client):
    """Una regla retirada no sale: ya no es tuya para este día."""
    assert _veredictos(client)["verdicts"] == []


@then("the rule does not apply")
def then_na(client):
    assert _uno(client)["state"] == "n_a", _veredictos(client)


@then(parsers.parse("it says I am {short:g} g short"))
@then(parsers.parse("it says I am {short:g} short"))
def then_short(client, short):
    assert _uno(client)["short_by"] == short


@then(parsers.parse("it says {n:d} food could not be classified"))
def then_unclassified(client, n):
    assert _uno(client)["unclassified"] == n


@then("the day is not acceptable")
def then_not_acceptable(client):
    assert _veredictos(client)["acceptable"] is False


@then("the day is acceptable")
def then_acceptable(client):
    assert _veredictos(client)["acceptable"] is True
