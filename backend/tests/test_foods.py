"""The catalogue: finding a food, adding one, correcting one."""


def create(client, name, **fields):
    resp = client.post("/foods", json={"name": name, **fields})
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_search_is_accent_and_case_blind(client):
    create(client, "Plátano")
    assert [f["name"] for f in client.get("/foods?q=PLATANO").json()] == ["Plátano"]
    assert [f["name"] for f in client.get("/foods?q=plá").json()] == ["Plátano"]


def test_search_puts_the_exact_name_first(client):
    create(client, "Arroz integral cocido")
    create(client, "Arroz")
    assert [f["name"] for f in client.get("/foods?q=arroz").json()][0] == "Arroz"


def test_search_matches_a_word_inside_the_name(client):
    create(client, "Pechuga de pollo a la plancha")
    assert [f["name"] for f in client.get("/foods?q=pollo").json()] == [
        "Pechuga de pollo a la plancha"
    ]


def test_empty_query_lists_your_own_shelf_newest_first(client):
    create(client, "Pan")
    create(client, "Aceite de oliva")
    assert [f["name"] for f in client.get("/foods").json()] == ["Aceite de oliva", "Pan"]


def test_a_food_you_only_know_the_calories_of_is_still_a_food(client):
    food = create(client, "Piquillos de mi madre", kcal_100g=60)
    assert food["kcal_100g"] == 60
    # Not 0. Nobody weighed the protein.
    assert food["protein_100g"] is None


def test_zero_is_stored_as_zero_not_as_unknown(client):
    food = create(client, "Agua", kcal_100g=0, fat_100g=0)
    assert food["kcal_100g"] == 0
    assert food["fat_100g"] == 0


def test_portions_come_back_with_the_food(client):
    food = create(
        client,
        "Pan de molde",
        kcal_100g=250,
        portions=[{"label": "rebanada", "grams": 30, "is_default": True}],
    )
    assert food["portions"] == [
        {"id": food["portions"][0]["id"], "label": "rebanada", "grams": 30, "is_default": True}
    ]


def test_logging_a_portion_needs_no_scale(client):
    food = create(
        client,
        "Pan de molde",
        kcal_100g=250,
        portions=[{"label": "rebanada", "grams": 30, "is_default": True}],
    )
    resp = client.post(
        "/food-log",
        json={"food_id": food["id"], "portion_id": food["portions"][0]["id"], "quantity": 2},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["grams"] == 60
    assert resp.json()["kcal"] == 150


def test_grams_and_portion_together_is_refused(client):
    food = create(client, "Pan", kcal_100g=250, portions=[{"label": "rebanada", "grams": 30}])
    resp = client.post(
        "/food-log",
        json={"food_id": food["id"], "grams": 100, "portion_id": food["portions"][0]["id"]},
    )
    assert resp.status_code == 422


def test_an_amount_is_required(client):
    food = create(client, "Pan", kcal_100g=250)
    assert client.post("/food-log", json={"food_id": food["id"]}).status_code == 422


def test_correcting_a_food_updates_the_catalogue(client):
    food = create(client, "Pan de la panadería", kcal_100g=250)
    resp = client.patch(f"/foods/{food['id']}", json={"kcal_100g": 300, "name": "Pan de pueblo"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["kcal_100g"] == 300
    # The fold follows the rename, or the food stops answering to its own name.
    assert [f["name"] for f in client.get("/foods?q=pueblo").json()] == ["Pan de pueblo"]


def test_logging_an_unknown_food_is_a_404(client):
    assert client.post("/food-log", json={"food_id": 9999, "grams": 100}).status_code == 404
