"""Los días cuidados: la cifra norte, contada sobre una ventana y nunca en racha."""

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/cared_days.feature")


@given(parsers.parse("I ate something on {dia}"))
def given_ate(client, dia):
    food = client.post("/foods", json={"name": "Pan", "kcal_100g": 250}).json()
    resp = client.post(
        "/food-log", json={"food_id": food["id"], "grams": 80, "logged_at": f"{dia}T13:00:00+02:00"}
    )
    assert resp.status_code == 201, resp.text


@given(parsers.parse("I trained on {dia}"))
def given_trained(client, dia):
    workout = client.post("/workouts", json={"date": dia}).json()
    resp = client.post(f"/workouts/{workout['id']}/sets", json={"exercise_name": "Remo", "reps": 8, "weight": 60})
    assert resp.status_code == 201, resp.text


@given(parsers.parse("I opened a workout on {dia} and logged nothing"))
def given_empty_workout(client, dia):
    assert client.post("/workouts", json={"date": dia}).status_code == 201


@when(
    parsers.parse("I ask which days I looked after myself from {desde} to {hasta}"),
    target_fixture="cuidados",
)
def when_ask(client, desde, hasta):
    resp = client.get(f"/cared-days?from={desde}&to={hasta}")
    assert resp.status_code == 200, resp.text
    return resp.json()


@then(parsers.parse("the days are {dias}"))
def then_days(cuidados, dias):
    assert cuidados["days"] == dias.split(", ")


@then("no day counts")
def then_none(cuidados):
    assert cuidados["days"] == []
