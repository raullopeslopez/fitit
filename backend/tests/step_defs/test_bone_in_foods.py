import asyncio

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

from app.auth import get_current_user
from app.db import get_session
from app.main import app
from app.models import Food
from app.naming import fold_exercise_name

scenarios("../features/bone_in_foods.feature")


@pytest.fixture()
def ctx():
    return {"foods": {}}


def _en_la_bd(trabajo):
    """Una fila que la API no tiene forma de escribir: el catálogo compartido
    lo escribe el import, nunca una petición."""

    async def _run():
        gen = app.dependency_overrides[get_session]()
        session = await gen.__anext__()
        try:
            resultado = await trabajo(session, app.dependency_overrides[get_current_user]())
            await session.commit()
            return resultado
        finally:
            await gen.aclose()

    return asyncio.run(_run())


@given(
    parsers.parse(
        'the catalogue has "{name}" with {kcal:g} kcal and {protein:g} g of protein per 100 g'
    )
)
def given_catalogue(client, ctx, name, kcal, protein):
    async def _alta(session, _user_id):
        food = Food(
            user_id=None,
            name=name,
            name_folded=fold_exercise_name(name),
            source="ciqual",
            kcal_100g=kcal,
            protein_100g=protein,
        )
        session.add(food)
        await session.flush()
        return food.id

    ctx["foods"][name] = _en_la_bd(_alta)


_BASES = {"edible part": "edible", "food as sold": "as_sold"}


def _add(client, ctx, name, **body):
    resp = client.post("/foods", json={"name": name, **body})
    assert resp.status_code == 201, resp.text
    ctx["foods"][name] = resp.json()["id"]
    ctx["food"] = resp.json()


@given(parsers.parse('I add "{name}" with {kcal:g} kcal per 100 g'))
def given_mine(client, ctx, name, kcal):
    _add(client, ctx, name, kcal_100g=kcal)


@given(parsers.parse('I add "{name}" with {kcal:g} kcal per 100 g, whose kcal are for the {basis}'))
def given_mine_with_basis(client, ctx, name, kcal, basis):
    _add(client, ctx, name, kcal_100g=kcal, kcal_basis=_BASES[basis])


@given(
    parsers.parse(
        'I add "{name}" with {kcal:g} kcal per 100 g, {pct:g} % bone, whose kcal are for the {basis}'
    )
)
def given_mine_with_bone(client, ctx, name, kcal, pct, basis):
    _add(client, ctx, name, kcal_100g=kcal, refuse_pct=pct, kcal_basis=_BASES[basis])


@given(parsers.parse('I add "{name}" with {kcal:g} kcal per 100 g and no bone'))
def given_mine_without_bone(client, ctx, name, kcal):
    _add(client, ctx, name, kcal_100g=kcal, refuse_pct=0)


def _log(client, ctx, name, grams, *, with_bone):
    body = {"food_id": ctx["foods"][name], "grams": grams}
    if with_bone:
        body["with_bone"] = True
    return client.post("/food-log", json=body)


@given(parsers.parse('I log {grams:g} g of "{name}" with the bone'))
@when(parsers.parse('I log {grams:g} g of "{name}" with the bone'))
def when_log_with_bone(client, ctx, grams, name):
    resp = _log(client, ctx, name, grams, with_bone=True)
    assert resp.status_code == 201, resp.text
    ctx["entry"] = resp.json()


@when(parsers.parse('I log {grams:g} g of "{name}"'))
def when_log(client, ctx, grams, name):
    resp = _log(client, ctx, name, grams, with_bone=False)
    assert resp.status_code == 201, resp.text
    ctx["entry"] = resp.json()


@when(parsers.parse('I try to log {grams:g} g of "{name}" with the bone'))
def when_try_log(client, ctx, grams, name):
    ctx["refused"] = _log(client, ctx, name, grams, with_bone=True)


@when(parsers.parse('I look up "{name}"'))
def when_look_up(client, ctx, name):
    resp = client.get(f"/foods/{ctx['foods'][name]}")
    assert resp.status_code == 200, resp.text
    ctx["food"] = resp.json()


@when(parsers.parse('I say the kcal of "{name}" are for the edible part'))
def when_say_basis(client, ctx, name):
    resp = client.patch(f"/foods/{ctx['foods'][name]}", json={"kcal_basis": "edible"})
    assert resp.status_code == 200, resp.text


@when(parsers.parse("I weigh {bone:g} g of leftover bone from that entry"))
def when_weigh_bone(client, ctx, bone):
    resp = client.post(f"/food-log/{ctx['entry']['id']}/bone", json={"bone_grams": bone})
    assert resp.status_code == 200, resp.text
    ctx["bone"] = resp.json()
    ctx["entry"] = resp.json()["entry"]


@when(parsers.parse("I correct that entry to {grams:g} g"))
def when_reweigh(client, ctx, grams):
    resp = client.patch(f"/food-log/{ctx['entry']['id']}", json={"grams": grams})
    assert resp.status_code == 200, resp.text
    ctx["entry"] = resp.json()


@when("I ask what I usually eat")
def when_frequent(client, ctx):
    resp = client.get("/foods/frequent")
    assert resp.status_code == 200, resp.text
    ctx["frequent"] = resp.json()


@then(parsers.parse("the entry weighs {grams:g} g, of which {edible:g} g are edible"))
def then_edible(ctx, grams, edible):
    assert ctx["entry"]["grams"] == grams
    assert ctx["entry"]["edible_grams"] == edible


@then("the entry has no edible weight apart")
def then_no_edible(ctx):
    assert ctx["entry"]["edible_grams"] is None


@then(parsers.parse("the entry records {kcal:g} kcal and {protein:g} g of protein"))
def then_kcal_protein(ctx, kcal, protein):
    assert ctx["entry"]["kcal"] == kcal
    assert ctx["entry"]["protein"] == protein


@then(parsers.parse("the entry records {kcal:g} kcal"))
def then_kcal(ctx, kcal):
    assert ctx["entry"]["kcal"] == kcal


@then(parsers.parse("it says {pct:g} % of it is bone, by reference"))
def then_refuse_reference(ctx, pct):
    assert ctx["food"]["refuse_pct"] == pct
    assert ctx["food"]["refuse_source"] == "referencia"


@then(parsers.parse("it says its kcal are for the {basis}"))
def then_basis(ctx, basis):
    assert ctx["food"]["kcal_basis"] == _BASES[basis]


@then(parsers.parse("it says {pct:g} % of it is bone, as I said"))
def then_refuse_mine(ctx, pct):
    assert ctx["food"]["refuse_pct"] == pct
    assert ctx["food"]["refuse_source"] == "tuyo"


@then("it says it has no bone")
def then_no_bone(ctx):
    assert ctx["food"]["refuse_pct"] is None
    assert ctx["food"]["kcal_basis"] is None


@when(parsers.parse('I ask how much bone "{name}" usually has'))
def when_bone_reference(client, ctx, name):
    resp = client.get("/foods/bone-reference", params={"name": name})
    assert resp.status_code == 200, resp.text
    ctx["reference"] = resp.json()


@then(parsers.parse("it says {pct:g} %, by reference"))
def then_reference(ctx, pct):
    assert ctx["reference"]["refuse_pct"] == pct


@then("it says the table knows no bone for it")
def then_no_reference(ctx):
    assert ctx["reference"]["refuse_pct"] is None


@then("it says nobody knows what its kcal are for")
def then_basis_unknown(ctx):
    assert ctx["food"]["kcal_basis"] == "unknown"


@then("it is refused until I say what the kcal are for")
def then_refused(ctx):
    resp = ctx["refused"]
    assert resp.status_code == 422, resp.text
    assert "hueso" in resp.json()["detail"]


@then(parsers.parse('"{name}" now says {pct:g} % of it is bone, measured by me'))
def then_refuse_measured(client, ctx, name, pct):
    food = client.get(f"/foods/{ctx['foods'][name]}").json()
    assert food["refuse_pct"] == pct
    assert food["refuse_source"] == "tuyo"
    assert ctx["bone"]["food_updated"] is True


@then(parsers.parse("the catalogue food still says {pct:g} % of it is bone, by reference"))
def then_catalogue_untouched(client, ctx, pct):
    (food_id,) = ctx["foods"].values()
    food = client.get(f"/foods/{food_id}").json()
    assert food["refuse_pct"] == pct
    assert food["refuse_source"] == "referencia"
    assert ctx["bone"]["food_updated"] is False


@then(
    parsers.parse('"{name}" comes back as {grams:g} g with the bone, {kcal:g} kcal')
)
def then_frequent(ctx, name, grams, kcal):
    (item,) = [f for f in ctx["frequent"] if f["name"] == name]
    assert item["grams"] == grams
    assert item["with_bone"] is True
    assert item["kcal"] == kcal


@given(parsers.parse('I log {grams:g} g of "{name}"'))
def given_log(client, ctx, grams, name):
    when_log(client, ctx, grams, name)


@when(parsers.parse("I try to weigh {bone:g} g of leftover bone from that entry"))
def when_try_bone(client, ctx, bone):
    ctx["refused"] = client.post(
        f"/food-log/{ctx['entry']['id']}/bone", json={"bone_grams": bone}
    )


@then("it is refused because that entry was not weighed with the bone")
def then_bone_refused(ctx):
    assert ctx["refused"].status_code == 422, ctx["refused"].text
    assert "hueso" in ctx["refused"].json()["detail"]


@when(parsers.parse('I say "{name}" is {pct:g} % bone and redo that day'))
def when_correct_and_redo(client, ctx, name, pct):
    food_id = ctx["foods"][name]
    resp = client.patch(f"/foods/{food_id}", json={"refuse_pct": pct})
    assert resp.status_code == 200, resp.text
    resp = client.post(
        "/food-log/recompute", json={"food_id": food_id, "date": ctx["entry"]["log_date"]}
    )
    assert resp.status_code == 200, resp.text
    day = client.get(f"/food-log?date={ctx['entry']['log_date']}").json()
    (ctx["entry"],) = day["entries"]
