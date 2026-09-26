"""El objetivo, derivado en vez de tecleado."""

from datetime import UTC, date, datetime, timedelta

from pytest_bdd import given, parsers, scenarios, then, when

from app.targets import factor_actividad, mifflin

scenarios("../features/derived_target.feature")


def _perfil(client, **fields):
    resp = client.patch("/targets", json=fields)
    assert resp.status_code == 200, resp.text


def _pesar(client, kg, on):
    resp = client.post("/body-weight", json={"measured_on": on, "kg": kg})
    assert resp.status_code == 201, resp.text


@given(parsers.parse("I am a {age:d} year old man, {cm:g} cm, weighing {kg:g} kg"))
def given_body(client, age, cm, kg):
    _perfil(client, height_cm=cm, birth_year=date.today().year - age, sex="male")
    _pesar(client, kg, date.today().isoformat())


@given(parsers.parse("my goal is to lose {rate:g} kg a week"))
def given_cut(client, rate):
    _perfil(client, goal="cut", goal_rate=rate)


@given("my goal is to maintain")
def given_maintain(client):
    _perfil(client, goal="maintain", goal_rate=0)


@given(
    parsers.parse(
        "I have eaten {kcal:d} kcal a day for three weeks and not moved on the scale"
    )
)
def given_eaten_flat(client, kcal):
    _comer(client, kcal, dias=21)
    _pesar(client, 78, (date.today() - timedelta(days=20)).isoformat())
    _pesar(client, 78, date.today().isoformat())


@given(parsers.parse("I have eaten {kcal:d} kcal a day for three weeks and lost {lost:g} kg"))
def given_eaten_lost(client, kcal, lost):
    _comer(client, kcal, dias=21)
    _pesar(client, 78 + lost, (date.today() - timedelta(days=20)).isoformat())
    _pesar(client, 78, date.today().isoformat())


def _comer(client, kcal_dia, *, dias):
    """Un alimento de 100 kcal/100 g, registrado cada día de la ventana."""
    food = client.post("/foods", json={"name": "Comida de prueba", "kcal_100g": 100}).json()
    for atras in range(dias):
        momento = datetime.now(UTC).replace(hour=12) - timedelta(days=atras)
        resp = client.post(
            "/food-log",
            json={
                "food_id": food["id"],
                "grams": kcal_dia,  # 100 kcal/100 g ⇒ los gramos son las kcal
                "logged_at": momento.isoformat(),
            },
        )
        assert resp.status_code == 201, resp.text


@when("I ask what I should eat", target_fixture="propuesta")
@given("I ask what I should eat", target_fixture="propuesta")
def when_ask(client):
    resp = client.get("/targets/proposal")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _mantenimiento(client):
    """Lo que la fórmula da para mantener, con el perfil que hay puesto."""
    perfil = client.get("/targets").json()
    edad = date.today().year - perfil["birth_year"]
    peso = client.get("/body-weight").json()[0]["kg"]
    basal = mifflin(sex=perfil["sex"], kg=peso, cm=perfil["height_cm"], age=edad)
    return round(basal * factor_actividad(0), 0)


@then("it proposes fewer calories than my maintenance")
def then_below_maintenance(client, propuesta):
    assert propuesta["kcal"] < _mantenimiento(client)


@then("it proposes my maintenance")
def then_maintenance(client, propuesta):
    assert propuesta["kcal"] == _mantenimiento(client)


@then("it says the number came from the formula")
def then_from_formula(propuesta):
    assert propuesta["source"] == "formula"


@then("it says the number came from my own data")
def then_from_data(propuesta):
    assert propuesta["source"] == "measured"


@then(parsers.parse("it proposes {kcal:g} kcal"))
def then_proposes(propuesta, kcal):
    assert propuesta["kcal"] == kcal


@then(parsers.parse("it proposes more than {kcal:g} kcal"))
def then_proposes_more(propuesta, kcal):
    assert propuesta["kcal"] > kcal


@then("it says it cannot work out a number yet")
def then_no_number(propuesta):
    assert propuesta["kcal"] is None


@then("it says what it is missing")
def then_missing(propuesta):
    assert propuesta["missing"], propuesta


@then("my daily target has not changed")
def then_unchanged(client):
    assert client.get("/targets").json()["objetivo_kcal"] is None


@when("I accept what it proposes")
@given("I accept what it proposes")
def when_accept(client, propuesta):
    resp = client.post("/targets/accept", json={"kcal": propuesta["kcal"]})
    assert resp.status_code == 200, resp.text


@then("my daily target is what it proposed")
def then_target_set(client, propuesta):
    assert client.get("/targets").json()["objetivo_kcal"] == propuesta["kcal"]


@given("today's diary has been read", target_fixture="leido")
def given_day_read(client):
    day = client.get("/food-log").json()
    return day["target_kcal"]


@when(parsers.parse("I accept a target of {kcal:g} kcal instead"))
def when_accept_other(client, kcal):
    resp = client.post("/targets/accept", json={"kcal": kcal})
    assert resp.status_code == 200, resp.text


@then("what today's diary says I was aiming for has not moved")
def then_frozen(client, leido):
    assert client.get("/food-log").json()["target_kcal"] == leido


# --- Meta de pasos diaria -----------------------------------------------------


@when("I ask for my profile", target_fixture="perfil")
def when_ask_profile(client):
    resp = client.get("/targets")
    assert resp.status_code == 200, resp.text
    return resp.json()


@when(parsers.parse("I set my daily steps goal to {steps:d}"), target_fixture="perfil")
@given(parsers.parse("I set my daily steps goal to {steps:d}"), target_fixture="perfil")
def when_set_steps_goal(client, steps):
    resp = client.patch("/targets", json={"steps_goal": steps})
    assert resp.status_code == 200, resp.text
    return resp.json()


@when("I clear my daily steps goal", target_fixture="perfil")
def when_clear_steps_goal(client):
    resp = client.patch("/targets", json={"steps_goal": None})
    assert resp.status_code == 200, resp.text
    return resp.json()


@when(parsers.parse("I try to set my daily steps goal to {steps:d}"), target_fixture="rechazo")
def when_try_set_steps_goal(client, steps):
    return client.patch("/targets", json={"steps_goal": steps})


@then(parsers.parse("my daily steps goal is {steps:d}"))
def then_steps_goal_is(perfil, steps):
    assert perfil["steps_goal"] == steps


@then("my daily steps goal is not set")
def then_steps_goal_unset(perfil):
    assert perfil["steps_goal"] is None


@then("it is rejected")
def then_rejected(rechazo):
    assert rechazo.status_code == 422, rechazo.text
