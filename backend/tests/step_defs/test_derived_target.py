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
    _pesar_extremos(client, 78, 78)


@given(parsers.parse("I have eaten {kcal:d} kcal a day for three weeks and lost {lost:g} kg"))
def given_eaten_lost(client, kcal, lost):
    _comer(client, kcal, dias=21)
    _pesar_extremos(client, 78 + lost, 78)


@given(
    parsers.parse(
        "I have eaten {kcal:d} kcal a day for three weeks "
        "and only weighed in at the start and the end"
    )
)
def given_eaten_two_weigh_ins(client, kcal):
    _comer(client, kcal, dias=21)
    _pesar(client, 78, (date.today() - timedelta(days=20)).isoformat())
    _pesar(client, 78, date.today().isoformat())


@given(parsers.parse("today I have only logged {kcal:d} kcal so far"))
def given_today_partial(client, kcal):
    _comer(client, kcal, dias=1, desde=0)


def _andar(client, pasos, dias):
    """`pasos` cada día, desde ayer hacia atrás: hoy todavía se está andando."""
    hoy = datetime.now(UTC).date()
    resp = client.put(
        "/steps",
        json={
            "days": [
                {"date": (hoy - timedelta(days=atras)).isoformat(), "steps": pasos}
                for atras in range(1, dias + 1)
            ]
        },
    )
    assert resp.status_code == 200, resp.text


@given(parsers.parse("I have walked {pasos:d} steps a day for two weeks"))
def given_walked_two_weeks(client, pasos):
    _andar(client, pasos, 14)


@given(parsers.parse("I have walked {pasos:d} steps a day for three days"))
def given_walked_three_days(client, pasos):
    _andar(client, pasos, 3)


@given("yesterday I trained for an hour")
def given_trained_yesterday(client):
    ayer = datetime.now(UTC) - timedelta(days=1)
    workout = client.post("/workouts", json={"date": ayer.date().isoformat()}).json()
    for minuto in (0, 30, 60):
        momento = ayer.replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(
            minutes=minuto
        )
        resp = client.post(
            f"/workouts/{workout['id']}/sets",
            json={
                "exercise_name": "Sentadilla",
                "reps": 5,
                "weight": 100,
                "performed_at": momento.isoformat(),
            },
        )
        assert resp.status_code == 201, resp.text


def _pesar_extremos(client, al_principio, al_final):
    """Dos pesadas en cada extremo de la ventana: lo mínimo para que cada mitad
    tenga tendencia."""
    for atras in (20, 19):
        _pesar(client, al_principio, (date.today() - timedelta(days=atras)).isoformat())
    for atras in (1, 0):
        _pesar(client, al_final, (date.today() - timedelta(days=atras)).isoformat())


def _comer(client, kcal_dia, *, dias, desde=1):
    """Un alimento de 100 kcal/100 g, registrado cada día desde hace `desde`
    días hacia atrás. Por defecto empieza ayer: hoy es un día sin terminar."""
    food = client.post("/foods", json={"name": "Comida de prueba", "kcal_100g": 100}).json()
    for atras in range(desde, desde + dias):
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


@then(parsers.parse("it proposes my sedentary maintenance plus {extra:d} kcal"))
def then_sedentary_plus(client, propuesta, extra):
    perfil = client.get("/targets").json()
    edad = date.today().year - perfil["birth_year"]
    peso = client.get("/body-weight").json()[0]["kg"]
    basal = mifflin(sex=perfil["sex"], kg=peso, cm=perfil["height_cm"], age=edad)
    assert propuesta["kcal"] == round(basal * 1.2 + extra, 0)


@then(parsers.parse("it counts {steps:d} steps a day"))
def then_counts_steps(propuesta, steps):
    assert propuesta["steps_per_day"] == steps


@then("it does not count my steps")
def then_no_steps(propuesta):
    assert propuesta["steps_per_day"] is None


@then(parsers.parse("it counts {kcal:d} kcal a day of training"))
def then_counts_training(propuesta, kcal):
    assert propuesta["training_kcal_per_day"] == kcal


@then("it proposes fewer calories than my maintenance")
def then_below_maintenance(client, propuesta):
    assert propuesta["kcal"] < _mantenimiento(client)


@then("it proposes my maintenance")
def then_maintenance(client, propuesta):
    assert propuesta["kcal"] == _mantenimiento(client)


@then(parsers.parse("it proposes {grams:d} g of protein"))
def then_protein(propuesta, grams):
    assert propuesta["protein"] == grams


@then("it proposes a quarter of the calories as fat")
def then_fat_quarter(propuesta):
    assert propuesta["fat"] == round(propuesta["kcal"] * 0.25 / 9)


@then("it proposes the rest as carbohydrates")
def then_carbs_rest(propuesta):
    resto = propuesta["kcal"] - 4 * propuesta["protein"] - 9 * propuesta["fat"]
    assert propuesta["carbs"] == round(resto / 4)


@then("my macro targets are the ones it proposed")
def then_macros_set(client, propuesta):
    me = client.get("/auth/me").json()
    assert me["objetivo_proteina"] == propuesta["protein"]
    assert me["objetivo_grasa"] == propuesta["fat"]
    assert me["objetivo_hidratos"] == propuesta["carbs"]


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


@then(parsers.parse("it says my expenditure is {kcal:g} kcal"))
def then_expenditure(propuesta, kcal):
    assert propuesta["expenditure"] == kcal


@then("it says it has no expenditure")
def then_no_expenditure(propuesta):
    assert propuesta["expenditure"] is None
