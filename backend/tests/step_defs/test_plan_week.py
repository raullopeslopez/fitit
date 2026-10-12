"""La semana generada, de punta a punta."""

from datetime import UTC, datetime

from pytest_bdd import given, parsers, scenarios, then, when

from app.main import app
from app.routers import rules as rules_router
from app.routers.plans import get_meal_estimator

scenarios("../features/plan_week.feature")

HUECOS = ("desayuno", "comida", "cena", "snack")


def _food(client, name, **por_100g):
    resp = client.post("/foods", json={"name": name, **por_100g})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _dish(client, name, food_id, **extra):
    body = {
        "name": name,
        "servings": 1,
        "ingredients": [{"food_id": food_id, "grams": 150}],
        **extra,
    }
    resp = client.post("/dishes", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


@given(parsers.parse("today is {hoy}"))
def given_today(monkeypatch, hoy):
    # El reloj del router de reglas, que es el que fecha el alta (`active_from`).
    fijo = datetime.fromisoformat(hoy).replace(hour=12, tzinfo=UTC)

    class Reloj(datetime):
        @classmethod
        def now(cls, tz=None):
            return fijo if tz is None else fijo.astimezone(tz)

    monkeypatch.setattr(rules_router, "datetime", Reloj)


@given(parsers.parse("a repertoire of {cuantos:d} dishes"), target_fixture="repertorio")
def given_repertoire(client, cuantos):
    # Con familia: un alimento sin clasificar haría que una regla de grupo
    # contestara «no puedo saberlo», que es correcto y no es lo que se comprueba.
    food = _food(
        client,
        "Pollo",
        kcal_100g=165,
        protein_100g=31,
        fat_100g=3.6,
        carbs_100g=0,
        familia="carne",
    )
    return [_dish(client, f"Plato {i}", food) for i in range(1, cuantos + 1)]


@given(
    parsers.parse("a repertoire of {cuantos:d} dish that only serves desayuno"),
    target_fixture="repertorio",
)
def given_only_breakfast(client, cuantos):
    food = _food(
        client,
        "Avena",
        kcal_100g=380,
        protein_100g=13,
        fat_100g=7,
        carbs_100g=60,
        familia="cereal",
    )
    return [_dish(client, f"Tazón {i}", food, slots=["desayuno"]) for i in range(1, cuantos + 1)]


@given(parsers.parse('a dish "{name}" that only serves desayuno'))
def given_breakfast_dish(client, name):
    food = _food(
        client,
        "Aguacate",
        kcal_100g=160,
        protein_100g=2,
        fat_100g=15,
        carbs_100g=9,
        familia="fruta",
    )
    _dish(client, name, food, slots=["desayuno"])


@given(parsers.parse("a soft rule of pulses {veces:d} times a week"))
def given_pulses_rule(client):
    resp = client.post(
        "/rules",
        json={
            "type": "group_frequency",
            "scope": "week",
            "hardness": "soft",
            "params": {"familia": "legumbre", "min": 3},
        },
    )
    assert resp.status_code == 201, resp.text


@when(parsers.parse("I generate the week of {inicio}"), target_fixture="respuesta")
def when_generate(client, inicio):
    resp = client.post("/plans", json={"week_start": inicio})
    assert resp.status_code == 201, resp.text
    return resp.json()


@when(parsers.parse("I generate the week of {inicio} with seed {seed:d}"), target_fixture="segundo")
def when_generate_seed(client, inicio, seed):
    resp = client.post("/plans", json={"week_start": inicio, "seed": seed})
    assert resp.status_code == 201, resp.text
    return resp.json()


@when(parsers.parse("I generate the week of {inicio} and it cannot"), target_fixture="negativa")
def when_generate_fails(client, inicio):
    resp = client.post("/plans", json={"week_start": inicio})
    assert resp.status_code == 422, resp.text
    return resp.json()["detail"]


@when(parsers.parse("I ask for the plan of {inicio}"), target_fixture="leido")
def when_read(client, inicio):
    return client.get(f"/plans/{inicio}")


@then(parsers.parse("the plan has {cuantas:d} entries"))
def then_count(respuesta, cuantas):
    assert len(respuesta["entries"]) == cuantas


@then("every day has a desayuno, a comida, a cena and a snack")
def then_every_slot(respuesta):
    por_dia = {}
    for entrada in respuesta["entries"]:
        por_dia.setdefault(entrada["log_date"], set()).add(entrada["slot"])
    assert len(por_dia) == 7
    assert all(huecos == set(HUECOS) for huecos in por_dia.values())


@then("it is the same plan")
def then_same(respuesta, leido):
    assert leido.status_code == 200, leido.text
    guardado = leido.json()
    assert guardado["seed"] == respuesta["seed"]
    assert [(e["log_date"], e["slot"], e["dish_id"]) for e in guardado["entries"]] == [
        (e["log_date"], e["slot"], e["dish_id"]) for e in respuesta["entries"]
    ]


@then("the week changed")
def then_changed(respuesta, segundo):
    assert [e["dish_id"] for e in segundo["entries"]] != [
        e["dish_id"] for e in respuesta["entries"]
    ]


@then("no dish appears on two consecutive days")
def then_no_streak(respuesta):
    por_dia = {}
    for entrada in respuesta["entries"]:
        por_dia.setdefault(entrada["log_date"], set()).add(entrada["dish_id"])
    fechas = sorted(por_dia)
    for uno, siguiente in zip(fechas, fechas[1:]):
        assert not (por_dia[uno] & por_dia[siguiente]), (uno, siguiente)


@then(parsers.parse('"{name}" never appears outside desayuno'))
def then_only_breakfast(respuesta, name):
    fuera = [e for e in respuesta["entries"] if e["dish_name"] == name and e["slot"] != "desayuno"]
    assert fuera == []


@then("it names the slot it could not fill")
def then_names_slot(negativa):
    assert negativa["slot"] in HUECOS
    assert negativa["slot"] != "desayuno"


@then("the plan reports the rule as broken")
def then_reports(respuesta):
    rotas = [v for v in respuesta["verdicts"] if v["state"] == "broken"]
    assert [v["type"] for v in rotas] == ["group_frequency"]


@then("there is no plan")
def then_no_plan(leido):
    assert leido.status_code == 404


# --- confirmar ---------------------------------------------------------------
def _lunes():
    from datetime import date, timedelta

    hoy = date.today()
    return hoy - timedelta(days=hoy.weekday())


def _hoy():
    from datetime import date

    return date.today().isoformat()


def _entrada(plan, fecha, slot):
    return next(e for e in plan["entries"] if e["log_date"] == fecha and e["slot"] == slot)


@when("I generate this week", target_fixture="respuesta")
def when_generate_this_week(client):
    resp = client.post("/plans", json={"week_start": _lunes().isoformat()})
    assert resp.status_code == 201, resp.text
    return resp.json()


@when(parsers.parse("I confirm the {slot:w} of today"), target_fixture="confirmada")
def when_confirm(client, respuesta, slot):
    entrada = _entrada(respuesta, _hoy(), slot)
    resp = client.patch(f"/plans/entries/{entrada['id']}", json={"status": "done"})
    assert resp.status_code == 200, resp.text
    return resp.json()


@when(parsers.parse("I confirm the {slot:w} of today again"))
def when_confirm_again(client, respuesta, slot):
    entrada = _entrada(respuesta, _hoy(), slot)
    resp = client.patch(f"/plans/entries/{entrada['id']}", json={"status": "done"})
    assert resp.status_code == 200, resp.text


@when(parsers.parse("I skip the {slot:w} of today"), target_fixture="confirmada")
def when_skip(client, respuesta, slot):
    entrada = _entrada(respuesta, _hoy(), slot)
    resp = client.patch(f"/plans/entries/{entrada['id']}", json={"status": "skipped"})
    assert resp.status_code == 200, resp.text
    return resp.json()


@when(
    parsers.parse("I try to confirm the {slot:w} of another day of the week"),
    target_fixture="negativa",
)
def when_confirm_other_day(client, respuesta, slot):
    from datetime import timedelta

    # El domingo, salvo que hoy sea domingo: entonces el lunes. Con el domingo
    # fijo, el escenario fallaba justo el día en que «otro día» era hoy.
    domingo = (_lunes() + timedelta(days=6)).isoformat()
    otro = domingo if domingo != _hoy() else _lunes().isoformat()
    entrada = _entrada(respuesta, otro, slot)
    resp = client.patch(f"/plans/entries/{entrada['id']}", json={"status": "done"})
    assert resp.status_code == 422, resp.text
    return resp.json()["detail"]


def _diario(client):
    return client.get(f"/food-log?date={_hoy()}").json()


@then("the diary of today has that meal")
def then_diary_has(client, confirmada):
    dish_id = confirmada["dish_id"]
    assert [e for e in _diario(client)["entries"] if e["dish_id"] == dish_id]


@then("the diary of today has that meal only once")
def then_diary_once(client, respuesta):
    entrada = _entrada(respuesta, _hoy(), "comida")
    filas = [e for e in _diario(client)["entries"] if e["dish_id"] == entrada["dish_id"]]
    assert len(filas) == 1


@then("the diary of today is empty")
def then_diary_empty(client):
    assert _diario(client)["entries"] == []


@then(parsers.parse("the plan says that meal is {estado:w}"))
def then_status(request, estado):
    # Confirmar, saltar y cambiar dejan la fila patched en sitios distintos;
    # lo que se comprueba es el mismo estado.
    fila = (
        request.getfixturevalue("cambio")["fila"]
        if "cambio" in request.fixturenames
        else request.getfixturevalue("confirmada")
    )
    assert fila["status"] == estado


@then(parsers.parse("the {slot:w} of today says nothing yet"))
def then_says_nothing(respuesta, slot):
    entrada = _entrada(respuesta, _hoy(), slot)
    assert entrada["status"] is None
    assert entrada["log_entry_id"] is None


@then("it says that is not today")
def then_not_today(negativa):
    assert "hoy" in negativa["motivo"]


@then("every meal says its kcal")
def then_kcal(respuesta):
    assert all(e["kcal"] is not None and e["kcal"] > 0 for e in respuesta["entries"])


# --- cambiar y adherencia -----------------------------------------------------
@then("every meal lists its ingredients with their grams")
def then_items(respuesta):
    for e in respuesta["entries"]:
        assert [i["food_name"] for i in e["items"]] == ["Pollo", "Aceite"]
        # Los mismos gramos que congeló el plan, ya con su nombre al lado.
        assert [i["grams"] for i in e["items"]] == e["grams"]
        assert all(i["grams"] > 0 for i in e["items"])


@given(parsers.parse("a week planned for {inicio}"), target_fixture="respuesta")
def given_past_week(client, repertorio, inicio):
    resp = client.post("/plans", json={"week_start": inicio})
    assert resp.status_code == 201, resp.text
    return resp.json()


@given(parsers.parse("I ate {kcal:d} kcal on {dia}"))
def given_ate(client, kcal):
    food = _food(client, "Tarta de la abuela", kcal_100g=400)
    resp = client.post(
        "/food-log",
        json={"food_id": food, "grams": 300, "logged_at": "2026-09-15T14:00:00+02:00"},
    )
    assert resp.status_code == 201, resp.text


@given(parsers.parse("I skipped the {slot:w} on {cuantos:d} days of that week"))
def given_skipped_days(client, respuesta, slot, cuantos):
    filas = [e for e in respuesta["entries"] if e["slot"] == slot][:cuantos]
    for fila in filas:
        resp = client.patch(f"/plans/entries/{fila['id']}", json={"status": "skipped"})
        assert resp.status_code == 200, resp.text


def _otro_plato(client, dish_id):
    return next(d for d in client.get("/dishes").json() if d["id"] != dish_id)


@when(parsers.parse("I swap the {slot:w} of today for another dish"), target_fixture="cambio")
def when_swap(client, respuesta, slot):
    entrada = _entrada(respuesta, _hoy(), slot)
    otro = _otro_plato(client, entrada["dish_id"])
    resp = client.patch(
        f"/plans/entries/{entrada['id']}", json={"status": "swapped", "dish_id": otro["id"]}
    )
    assert resp.status_code == 200, resp.text
    return {"fila": resp.json(), "planeado": entrada["dish_id"], "comido": otro["id"]}


@when(
    parsers.parse("I try to swap the {slot:w} of today for a dish that is not mine"),
    target_fixture="leido",
)
def when_swap_foreign(client, respuesta, slot):
    entrada = _entrada(respuesta, _hoy(), slot)
    return client.patch(
        f"/plans/entries/{entrada['id']}", json={"status": "swapped", "dish_id": 99999}
    )


@when(parsers.parse("I ask how the week of {inicio} went"), target_fixture="informe")
def when_adherence(client, inicio):
    return client.get(f"/plans/{inicio}/adherence")


@when("I ask how this week went", target_fixture="informe")
def when_adherence_this_week(client):
    return client.get(f"/plans/{_lunes().isoformat()}/adherence")


@then("the diary of today has the dish I swapped to")
def then_diary_has_swap(client, cambio):
    assert [e for e in _diario(client)["entries"] if e["dish_id"] == cambio["comido"]]


@then("the plan still says the dish it planned")
def then_plan_unchanged(cambio):
    # El plan congela lo que dijo. Lo que comiste vive en el diario, que es
    # donde vive lo que comes.
    assert cambio["fila"]["dish_id"] == cambio["planeado"]


@then("there is no such dish")
def then_no_dish(leido):
    assert leido.status_code == 404


@then(parsers.parse("it covers {dias:d} closed days"))
def then_closed_days(informe, dias):
    assert informe.status_code == 200, informe.text
    assert informe.json()["days"] == dias


@then("it says what I ate and what was planned")
def then_eaten_vs_planned(informe):
    cuerpo = informe.json()
    assert cuerpo["eaten_kcal"] == 1200
    assert cuerpo["planned_kcal"] > 0


@then("nothing counts as followed or missed yet")
def then_nothing_counted(informe):
    cuerpo = informe.json()
    assert cuerpo["followed"] == 0
    assert cuerpo["decided"] == 0
    assert cuerpo["weakest_slot"] is None


@then("it says how many meals are still to come")
def then_pending(informe):
    assert informe.json()["pending"] > 0


@then(parsers.parse("it says the {slot:w} is where the plan falls, {dias:d} days"))
def then_weakest(informe, slot, dias):
    cuerpo = informe.json()
    assert cuerpo["weakest_slot"] == slot
    assert cuerpo["weakest_missed"] == dias


@then("there is no plan")
def then_no_plan_informe(request):
    # Vale para las dos formas de preguntar: leyendo el plan y pidiendo el informe.
    resp = request.getfixturevalue("informe" if "informe" in request.fixturenames else "leido")
    assert resp.status_code == 404


@given(parsers.parse("a repertoire of {cuantos:d} dishes of two ingredients"), target_fixture="repertorio")
def given_repertoire_two(client, cuantos):
    pollo = _food(client, "Pollo", kcal_100g=165, protein_100g=31, fat_100g=3.6, carbs_100g=0, familia="carne")
    aceite = _food(client, "Aceite", kcal_100g=900, protein_100g=0, fat_100g=100, carbs_100g=0)
    platos = []
    for i in range(1, cuantos + 1):
        resp = client.post("/dishes", json={
            "name": f"Plato {i}", "servings": 1,
            "ingredients": [{"food_id": pollo, "grams": 150}, {"food_id": aceite, "grams": 10}],
        })
        assert resp.status_code == 201, resp.text
        platos.append(resp.json())
    return platos


def _entradas_de(client, confirmada):
    return [e for e in _diario(client)["entries"] if e["dish_id"] == confirmada["dish_id"]]


@when("I delete from the diary everything that meal wrote")
def when_delete_all(client, confirmada):
    filas = _entradas_de(client, confirmada)
    assert filas
    for e in filas:
        assert client.delete(f"/food-log/{e['id']}").status_code == 204


@when("I delete from the diary only the entry the plan points to")
def when_delete_linked(client, confirmada):
    assert len(_entradas_de(client, confirmada)) == 2
    assert client.delete(f"/food-log/{confirmada['log_entry_id']}").status_code == 204


def _ahora(client, slot):
    plan = client.get(f"/plans/{_lunes().isoformat()}").json()
    return _entrada(plan, _hoy(), slot)


@then(parsers.parse("the plan now says nothing for the {slot:w} of today"))
def then_now_nothing(client, slot):
    fila = _ahora(client, slot)
    assert fila["status"] is None
    assert fila["log_entry_id"] is None


@then(parsers.parse("the plan still says the {slot:w} of today is done"))
def then_still_done(client, slot):
    assert _ahora(client, slot)["status"] == "done"


@then("the plan points to the ingredient left in the diary")
def then_points_left(client, confirmada):
    (queda,) = _entradas_de(client, confirmada)
    assert _ahora(client, "comida")["log_entry_id"] == queda["id"]


# --- registro sin huecos, fase 1 ---------------------------------------------
def _dia(desplazamiento):
    from datetime import date, timedelta

    return date.today() + timedelta(days=desplazamiento)


_DIAS = {"yesterday": -1, "tomorrow": 1}


@when(parsers.parse("I generate the week that holds {cual:w}"), target_fixture="respuesta")
def when_generate_week_of(client, cual):
    from datetime import timedelta

    dia = _dia(_DIAS[cual])
    lunes = dia - timedelta(days=dia.weekday())
    resp = client.post("/plans", json={"week_start": lunes.isoformat()})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _a_las(cual, hora):
    # Con el offset de Madrid en verano, como manda el móvil: el día alimentario
    # sale del reloj de pared, no de UTC.
    return f"{_dia(_DIAS[cual]).isoformat()}T{hora}:00+02:00"


@when(
    parsers.parse("I confirm the {slot:w} of {cual:w} at {hora} of that day"),
    target_fixture="confirmada",
)
def when_confirm_at(client, respuesta, slot, cual, hora):
    entrada = _entrada(respuesta, _dia(_DIAS[cual]).isoformat(), slot)
    resp = client.patch(
        f"/plans/entries/{entrada['id']}",
        json={"status": "done", "logged_at": _a_las(cual, hora)},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


@when(
    parsers.parse("I try to confirm the {slot:w} of {cual:w} at {hora} of that day"),
    target_fixture="negativa",
)
def when_try_confirm_at(client, respuesta, slot, cual, hora):
    entrada = _entrada(respuesta, _dia(_DIAS[cual]).isoformat(), slot)
    resp = client.patch(
        f"/plans/entries/{entrada['id']}",
        json={"status": "done", "logged_at": _a_las(cual, hora)},
    )
    assert resp.status_code == 422, resp.text
    return resp.json()["detail"]


@then("the diary of yesterday has that meal")
def then_diary_yesterday(client, confirmada):
    diario = client.get(f"/food-log?date={_dia(-1).isoformat()}").json()
    assert diario["entries"], diario
    assert {e["meal_slot"] for e in diario["entries"]} == {confirmada["slot"]}


@then("it says that has not happened yet")
def then_not_yet(negativa):
    assert "todavía" in negativa["motivo"]


# --- registro sin huecos, fase 2 ---------------------------------------------
import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _sin_estimador():
    yield
    app.dependency_overrides.pop(get_meal_estimator, None)


@given(parsers.parse('the foods "{uno}" and "{otro}"'), target_fixture="alimentos")
def given_foods(client, uno, otro):
    return {name: _food(client, name, kcal_100g=300) for name in (uno, otro)}


@given(
    parsers.parse('the model reads "{texto}" as "{linea1}" and "{linea2}"'),
    target_fixture="llamadas",
)
def given_model_reads(texto, linea1, linea2):
    llamadas = []

    async def estimator(description: str, hidden_fat: bool) -> dict:
        llamadas.append({"description": description, "hidden_fat": hidden_fat})
        return {"lines": [linea1, linea2]}

    app.dependency_overrides[get_meal_estimator] = lambda: estimator
    return llamadas


@given("no model to estimate meals")
def given_no_estimator():
    app.dependency_overrides[get_meal_estimator] = lambda: None


@when(parsers.parse('I estimate "{texto}" with oil or sauce'), target_fixture="estimacion")
def when_estimate(client, texto):
    resp = client.post("/plans/out/estimate", json={"description": texto, "hidden_fat": True})
    assert resp.status_code == 200, resp.text
    return resp.json()


@when(parsers.parse('I try to estimate "{texto}"'), target_fixture="negativa")
def when_try_estimate(client, texto):
    return client.post("/plans/out/estimate", json={"description": texto, "hidden_fat": False})


@then(parsers.parse('the estimate has the line "{texto}" matched to "{food}"'))
def then_estimate_line(estimacion, texto, food):
    linea = next(line for line in estimacion["lines"] if line["text"] == texto)
    assert linea["food"]["name"] == food
    assert linea["grams"] == 250


@then("the model was told there was oil or sauce")
def then_told_oil(llamadas):
    assert llamadas[0]["hidden_fat"] is True


@then("it says estimating is not available")
def then_not_available(negativa):
    assert negativa.status_code == 503


@when(
    parsers.parse(
        'I say I ate out the {slot:w} of today: {g1:d} g of "{f1}" and {g2:d} g of "{f2}"'
    ),
    target_fixture="confirmada",
)
def when_out(client, respuesta, alimentos, slot, g1, f1, g2, f2):
    entrada = _entrada(respuesta, _hoy(), slot)
    resp = client.patch(
        f"/plans/entries/{entrada['id']}",
        json={
            "status": "out",
            "items": [
                {"food_id": alimentos[f1], "grams": g1},
                {"food_id": alimentos[f2], "grams": g2},
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


@when(parsers.parse("I say I don't know about the {slot:w} of today"), target_fixture="confirmada")
def when_unknown(client, respuesta, slot):
    entrada = _entrada(respuesta, _hoy(), slot)
    resp = client.patch(f"/plans/entries/{entrada['id']}", json={"status": "unknown"})
    assert resp.status_code == 200, resp.text
    return resp.json()


@then(parsers.parse("the diary of today has {n:d} estimated entries in the {slot:w}"))
def then_estimated(client, n, slot):
    entradas = _diario(client)["entries"]
    assert len(entradas) == n
    assert all(e["entry_source"] == "estimated" and e["meal_slot"] == slot for e in entradas)
