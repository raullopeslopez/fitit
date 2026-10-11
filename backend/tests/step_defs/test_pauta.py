"""Guardar lo revisado de un PDF de plan, y la semana que lo sigue."""

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/pauta.feature")

def _food(client, name, **por_100g):
    resp = client.post(
        "/foods",
        json={
            "name": name,
            "kcal_100g": 165,
            "protein_100g": 20,
            "fat_100g": 5,
            "carbs_100g": 10,
            **por_100g,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _nuevo(client, name, slots=("comida",)):
    food = _food(client, f"Base de {name}")
    return {
        "name": name,
        "slots": list(slots),
        "ingredients": [{"food_id": food, "grams": 150}],
    }


def _guardar(client, week_start, dishes, week):
    return client.post(
        "/plans/import/save",
        json={"week_start": week_start, "dishes": dishes, "week": week},
    )


@given(parsers.parse('I already have the dish "{name}"'), target_fixture="mio")
def given_dish(client, name):
    food = _food(client, "Patata")
    resp = client.post(
        "/dishes",
        json={"name": name, "servings": 1, "ingredients": [{"food_id": food, "grams": 200}]},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@given(parsers.parse("a repertoire of {cuantos:d} dishes"))
def given_repertoire(client, cuantos):
    food = _food(client, "Pollo", protein_100g=31, fat_100g=3.6, carbs_100g=0)
    for i in range(1, cuantos + 1):
        resp = client.post(
            "/dishes",
            json={
                "name": f"Plato {i}",
                "servings": 1,
                "ingredients": [{"food_id": food, "grams": 150}],
            },
        )
        assert resp.status_code == 201, resp.text


@given(parsers.parse('a pauta from {inicio} with "{name}" for the {slot:w} of every day'))
def given_pauta(client, inicio, name, slot):
    resp = _guardar(
        client,
        inicio,
        [_nuevo(client, name, slots=(slot,))],
        [{"day": d, "slot": slot, "dish": 0} for d in range(7)],
    )
    assert resp.status_code == 201, resp.text


@given(parsers.parse("my targets add up to {kcal:d} kcal a day"))
def given_kcal_target(client, kcal):
    # Las kcal salen del reparto (`atwater_kcal`): 135 g de proteína y 60 de
    # grasa son 1.080 kcal, y los hidratos ponen el resto. El único alimento de
    # los platos no tiene esas proporciones, así que los macros no caben y lo
    # que se comprueba es que las kcal sí.
    resp = client.patch(
        "/auth/me",
        json={
            "objetivo_proteina": 135,
            "objetivo_grasa": 60,
            "objetivo_hidratos": (kcal - 135 * 4 - 60 * 9) / 4,
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["objetivo_kcal"] == kcal


@given(parsers.parse("a pauta from {inicio} with a fixed recipe for every meal of every day"))
def given_fixed_pauta(client, inicio):
    slots = ("desayuno", "comida", "cena", "snack")
    resp = _guardar(
        client,
        inicio,
        [_nuevo(client, f"Receta de {slot}", slots=(slot,)) for slot in slots],
        [{"day": d, "slot": slot, "dish": i} for d in range(7) for i, slot in enumerate(slots)],
    )
    assert resp.status_code == 201, resp.text


@when(
    parsers.parse('I save a pauta with "{mine}" as mine and "{new}" as new'),
    target_fixture="guardada",
)
def when_save_mixed(client, mio, mine, new):
    resp = _guardar(
        client,
        "2026-09-21",
        [
            {"name": mine, "slots": ["desayuno"], "dish_id": mio["id"]},
            _nuevo(client, new),
        ],
        [{"day": 0, "slot": "desayuno", "dish": 0}, {"day": 0, "slot": "comida", "dish": 1}],
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@when("I save a pauta with a dish that is not mine", target_fixture="respuesta")
def when_save_foreign(client):
    return _guardar(
        client,
        "2026-09-21",
        [{"name": "De otro", "slots": ["comida"], "dish_id": 999_999}],
        [{"day": 0, "slot": "comida", "dish": 0}],
    )


@when(
    parsers.parse('I save a pauta with "{name}" as new and no ingredients'),
    target_fixture="respuesta",
)
def when_save_empty(client, name):
    return _guardar(
        client,
        "2026-09-21",
        [{"name": name, "slots": ["cena"], "ingredients": []}],
        [{"day": 4, "slot": "cena", "dish": 0}],
    )


@when(parsers.parse("I generate the week of {inicio}"), target_fixture="plan")
def when_generate(client, inicio):
    resp = client.post("/plans", json={"week_start": inicio})
    assert resp.status_code == 201, resp.text
    return resp.json()


@then(parsers.parse('I have the dishes "{a}" and "{b}"'))
def then_dishes(client, a, b):
    assert sorted(d["name"] for d in client.get("/dishes").json()) == sorted([a, b])


def _platos(plan, slot):
    return [e["dish_name"] for e in plan["entries"] if e["slot"] == slot]


@then(parsers.parse('every {slot:w} of the week is "{name}"'))
def then_every(plan, slot, name):
    platos = _platos(plan, slot)
    assert len(platos) == 7
    assert set(platos) == {name}


@then(parsers.parse('no {slot:w} of the week is "{name}"'))
def then_none(plan, slot, name):
    assert name not in _platos(plan, slot)


@then(parsers.parse("every {slot:w} of the week is still chosen by the generator"))
def then_generated(plan, slot):
    platos = _platos(plan, slot)
    assert len(platos) == 7
    assert all(p.startswith("Plato ") for p in platos)


@then("the plan says it follows a pauta")
def then_has_pauta(client, plan):
    assert plan["has_pauta"] is True
    assert client.get(f"/plans/{plan['week_start']}").json()["has_pauta"] is True


@then("the plan says it follows no pauta")
def then_no_pauta(plan):
    assert plan["has_pauta"] is False


@then("there is no such dish")
def then_no_dish(respuesta):
    assert respuesta.status_code == 404


@then("it is refused as incomplete")
def then_incomplete(client, respuesta):
    assert respuesta.status_code == 422
    assert client.get("/dishes").json() == []



@then(parsers.parse("every day of the week adds up to {kcal:d} kcal, give or take 2%"))
def then_day_kcal(plan, kcal):
    por_dia: dict[str, float] = {}
    for e in plan["entries"]:
        por_dia[e["log_date"]] = por_dia.get(e["log_date"], 0) + e["kcal"]
    assert len(por_dia) == 7
    for dia, total in por_dia.items():
        assert abs(total - kcal) <= kcal * 0.02, (dia, total)


def _desvios(plan):
    por_dia: dict[str, dict[str, float]] = {}
    for d in plan["desvios"]:
        por_dia.setdefault(d["log_date"], {})[d["nutrient"]] = d["diff"]
    return por_dia


@then("every day says its carbs fall short and its protein runs over")
def then_desvios(client, plan):
    # Leído también de vuelta: el aviso se calcula al leer el plan, no se guarda.
    for cuerpo in (plan, client.get(f"/plans/{plan['week_start']}").json()):
        por_dia = _desvios(cuerpo)
        assert len(por_dia) == 7
        for dia in por_dia.values():
            assert dia["carbs"] < 0
            assert dia["protein"] > 0


@then("no day says its kcal are off")
def then_kcal_ok(plan):
    assert all(d["nutrient"] != "kcal" for d in plan["desvios"])
