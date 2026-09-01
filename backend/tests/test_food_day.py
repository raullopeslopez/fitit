"""The day view: entries, totals, and the difference between 0 and unknown."""

from tests.test_foods import create


def test_an_empty_day_totals_unknown_not_zero(client):
    day = client.get("/food-log?date=2026-08-31").json()
    assert day["entries"] == []
    # You have not eaten zero calories; you have not written anything down.
    assert day["totals"]["kcal"] is None
    assert day["unknown"]["kcal"] == 0


def test_totals_add_up_across_entries(client):
    rice = create(client, "Arroz", kcal_100g=130, protein_100g=2.7)
    chicken = create(client, "Pollo", kcal_100g=165, protein_100g=31)
    for food, grams in ((rice, 200), (chicken, 150)):
        client.post(
            "/food-log",
            json={"food_id": food["id"], "grams": grams, "logged_at": "2026-08-31T14:00:00+02:00"},
        )
    totals = client.get("/food-log?date=2026-08-31").json()["totals"]
    assert totals["kcal"] == 507.5
    assert totals["protein"] == 51.9


def test_one_missing_nutrient_makes_the_whole_total_unknown(client):
    known = create(client, "Arroz", kcal_100g=130, fiber_100g=0.4)
    guessy = create(client, "Salsa de casa", kcal_100g=90)
    for food in (known, guessy):
        client.post(
            "/food-log",
            json={"food_id": food["id"], "grams": 100, "logged_at": "2026-08-31T14:00:00+02:00"},
        )
    day = client.get("/food-log?date=2026-08-31").json()
    assert day["totals"]["kcal"] == 220
    assert day["totals"]["fiber"] is None  # 0.4 g is not the day's fibre, it is part of it
    assert day["unknown"]["fiber"] == 1


def test_entries_come_back_oldest_first(client):
    food = create(client, "Pan", kcal_100g=250)
    for hour in ("21:00", "09:00", "14:00"):
        client.post(
            "/food-log",
            json={
                "food_id": food["id"],
                "grams": 100,
                "logged_at": f"2026-08-31T{hour}:00+02:00",
            },
        )
    day = client.get("/food-log?date=2026-08-31").json()
    assert [e["logged_at"][11:16] for e in day["entries"]] == ["07:00", "12:00", "19:00"]


def test_reweighing_an_entry_rescales_what_was_frozen(client):
    food = create(client, "Pan", kcal_100g=250)
    entry = client.post(
        "/food-log",
        json={"food_id": food["id"], "grams": 100, "logged_at": "2026-08-31T09:00:00+02:00"},
    ).json()
    # The food is corrected between logging and re-weighing. The re-weigh must
    # not adopt the correction: 150 g of what you ate, not of what it says now.
    client.patch(f"/foods/{food['id']}", json={"kcal_100g": 400})
    resp = client.patch(f"/food-log/{entry['id']}", json={"grams": 150})
    assert resp.status_code == 200, resp.text
    assert resp.json()["kcal"] == 375


def test_moving_an_entry_between_meals_leaves_its_numbers_alone(client):
    food = create(client, "Pan", kcal_100g=250)
    entry = client.post(
        "/food-log",
        json={
            "food_id": food["id"],
            "grams": 100,
            "meal_slot": "comida",
            "logged_at": "2026-08-31T09:00:00+02:00",
        },
    ).json()
    resp = client.patch(f"/food-log/{entry['id']}", json={"meal_slot": "desayuno"})
    assert resp.json()["meal_slot"] == "desayuno"
    assert resp.json()["kcal"] == 250


def test_deleting_an_entry_removes_it_from_the_day(client):
    food = create(client, "Pan", kcal_100g=250)
    entry = client.post(
        "/food-log",
        json={"food_id": food["id"], "grams": 100, "logged_at": "2026-08-31T09:00:00+02:00"},
    ).json()
    assert client.delete(f"/food-log/{entry['id']}").status_code == 204
    assert client.get("/food-log?date=2026-08-31").json()["entries"] == []


def test_the_entry_keeps_the_name_the_food_had(client):
    food = create(client, "Pan de la panadería", kcal_100g=250)
    client.post(
        "/food-log",
        json={"food_id": food["id"], "grams": 100, "logged_at": "2026-08-31T09:00:00+02:00"},
    )
    client.patch(f"/foods/{food['id']}", json={"name": "Pan de pueblo"})
    day = client.get("/food-log?date=2026-08-31").json()
    assert [e["food_name"] for e in day["entries"]] == ["Pan de la panadería"]
