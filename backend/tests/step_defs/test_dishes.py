from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/dishes.feature")


# --- alimentos ---------------------------------------------------------------
@given(parsers.parse('a food "{name}" with {kcal:g} kcal and {protein:g} g of protein per 100 g'))
def given_food(client, name, kcal, protein):
    resp = client.post("/foods", json={"name": name, "kcal_100g": kcal, "protein_100g": protein})
    assert resp.status_code == 201, resp.text


@given(parsers.parse('a food "{name}" with {kcal:g} kcal per 100 g'))
def given_food_kcal(client, name, kcal):
    resp = client.post("/foods", json={"name": name, "kcal_100g": kcal})
    assert resp.status_code == 201, resp.text


@given(parsers.parse('a food "{name}" with {kcal:g} kcal per 100 g and no fibre on record'))
def given_food_no_fibre(client, name, kcal):
    # `fiber_100g` omitido a propósito: desconocido, que no es 0.
    resp = client.post("/foods", json={"name": name, "kcal_100g": kcal})
    assert resp.status_code == 201, resp.text


def _food_id(client, name):
    match = next(f for f in client.get(f"/foods?q={name}").json() if f["name"] == name)
    return match["id"]


# --- platos ------------------------------------------------------------------
def _save(client, name, servings, pairs, **extra):
    body = {
        "name": name,
        "servings": servings,
        "ingredients": [{"food_id": _food_id(client, food), "grams": grams} for grams, food in pairs],
        **extra,
    }
    resp = client.post("/dishes", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


@given(
    parsers.parse(
        'a dish "{name}" for {servings:d} servings with {g1:g} g of "{f1}" and {g2:g} g of "{f2}"'
    )
)
@when(
    parsers.parse(
        'I save a dish "{name}" for {servings:d} servings with {g1:g} g of "{f1}" and {g2:g} g of "{f2}"'
    )
)
def save_two(client, name, servings, g1, f1, g2, f2):
    _save(client, name, servings, [(g1, f1), (g2, f2)])


@given(parsers.parse('a dish "{name}" for {servings:d} servings with {g1:g} g of "{f1}"'))
@when(parsers.parse('I save a dish "{name}" for {servings:d} servings with {g1:g} g of "{f1}"'))
def save_one(client, name, servings, g1, f1):
    _save(client, name, servings, [(g1, f1)])


@when(
    parsers.parse(
        'I save a dish "{name}" weighed {basis:w}, cooked in the {method}, '
        'for {servings:d} serving with {g1:g} g of "{f1}"'
    )
)
def save_with_method(client, name, basis, method, servings, g1, f1):
    _save(client, name, servings, [(g1, f1)], basis=basis, method=method.replace(" ", "_"))


def _dish(client, name):
    match = next((d for d in client.get("/dishes").json() if d["name"] == name), None)
    assert match is not None, f"{name} no está entre los platos"
    return client.get(f"/dishes/{match['id']}").json()


@when(parsers.parse('I correct "{name}" to {servings:d} servings'))
def correct_servings(client, name, servings):
    dish = _dish(client, name)
    resp = client.patch(f"/dishes/{dish['id']}", json={"servings": servings})
    assert resp.status_code == 200, resp.text


# --- registrar ---------------------------------------------------------------
def _log(client, name, servings, slot):
    dish = _dish(client, name)
    resp = client.post(
        f"/dishes/{dish['id']}/log", json={"servings": servings, "meal_slot": slot}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@given(parsers.parse('I log {servings:d} serving of "{name}" at {slot:w}'))
@when(parsers.parse('I log {servings:d} serving of "{name}" at {slot:w}'))
@when(parsers.parse('I log {servings:d} servings of "{name}" at {slot:w}'))
def log_dish(client, servings, name, slot):
    _log(client, name, servings, slot)


# --- comprobaciones ----------------------------------------------------------
@then(parsers.parse('"{name}" has {kcal:g} kcal per serving'))
def then_kcal_per_serving(client, name, kcal):
    assert _dish(client, name)["per_serving"]["kcal"] == kcal


@then(parsers.parse('"{name}" has {protein:g} g of protein per serving'))
def then_protein_per_serving(client, name, protein):
    assert _dish(client, name)["per_serving"]["protein"] == protein


@then(parsers.parse('"{name}" has unknown fibre per serving, not zero'))
def then_fibre_unknown(client, name):
    assert _dish(client, name)["per_serving"]["fiber"] is None


@then(parsers.parse('"{name}" is weighed {basis:w}'))
def then_basis(client, name, basis):
    assert _dish(client, name)["basis"] == basis


@then(parsers.parse('"{name}" was cooked in the {method}'))
def then_method(client, name, method):
    assert _dish(client, name)["method"] == method.replace(" ", "_")


def _day(client):
    return client.get("/food-log").json()


@then(parsers.parse("the diary holds {count:d} entries"))
@then(parsers.parse("the diary holds {count:d} entry"))
def then_entry_count(client, count):
    assert len(_day(client)["entries"]) == count


@then(parsers.parse("that entry records {grams:g} g"))
def then_entry_grams(client, grams):
    (entry,) = _day(client)["entries"]
    assert entry["grams"] == grams


def _slot_kcal(client, slot):
    row = next(s for s in _day(client)["by_slot"] if s["slot"] == slot)
    return row["totals"]["kcal"]


@then(parsers.parse("{slot:w} totals {kcal:g} kcal"))
@then(parsers.parse("{slot:w} still totals {kcal:g} kcal"))
def then_slot_totals(client, slot, kcal):
    assert _slot_kcal(client, slot) == kcal


@when(parsers.parse('I search the food catalogue for "{name}"'), target_fixture="catalogue_hits")
def when_search_catalogue(client, name):
    return client.get(f"/foods?q={name}").json()


@then("the food catalogue has nothing by that name")
def then_catalogue_empty(catalogue_hits):
    assert catalogue_hits == []


@then(parsers.parse('there is no way to delete "{name}"'))
def then_no_delete(client, name):
    dish = _dish(client, name)
    resp = client.delete(f"/dishes/{dish['id']}")
    assert resp.status_code in (404, 405), resp.text
