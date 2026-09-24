"""La semana generada, de punta a punta."""

from pytest_bdd import given, parsers, scenarios, then, when

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
    parsers.parse("I try to confirm the {slot:w} of the last day of the week"),
    target_fixture="negativa",
)
def when_confirm_other_day(client, respuesta, slot):
    from datetime import timedelta

    otro = (_lunes() + timedelta(days=6)).isoformat()
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
def then_status(confirmada, estado):
    assert confirmada["status"] == estado


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
