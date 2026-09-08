"""The day view: entries, totals, and the difference between 0 and unknown."""

from tests.test_foods import create


def test_an_empty_day_totals_unknown_not_zero(client):
    day = client.get("/food-log?date=2026-08-31").json()
    assert day["entries"] == []
    # You have not eaten zero calories; you have not written anything down.
    assert day["totals"]["kcal"] is None
    assert day["unknown"]["kcal"] == 0


def test_without_a_target_the_day_carries_none(client):
    day = client.get("/food-log?date=2026-08-31").json()
    assert day["target_kcal"] is None
    assert day["target_protein"] is None
    assert day["remaining_kcal"] is None


def test_the_day_carries_the_target_and_what_remains(client):
    client.patch("/auth/me", json={"objetivo_kcal": 2800, "objetivo_proteina": 160})
    food = create(client, "Arroz", kcal_100g=130)
    client.post(
        "/food-log",
        json={"food_id": food["id"], "grams": 100, "logged_at": "2026-08-31T14:00:00+02:00"},
    )
    day = client.get("/food-log?date=2026-08-31").json()
    assert day["target_kcal"] == 2800
    assert day["target_protein"] == 160
    assert day["remaining_kcal"] == 2670


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


# La otra mitad del contrato con `foodDayIso()` en el frontend. Los demás specs
# de este fichero mandan siempre `+02:00` explícito, así que ninguno miraba lo
# que decide el offset: el corte de las 04:00 es **local**, y un desayuno a las
# 05:00 en Madrid es del día 8 aunque en UTC sean todavía las 03:00 del 8 y
# restarle cuatro horas a eso dé el 7. El cliente sellaba con `toISOString()`
# —siempre UTC— y por ahí se colaba la entrada al día anterior (2026-09-08).
def test_the_cut_is_local_not_utc(client):
    food = create(client, "Tostada", kcal_100g=250)
    client.post(
        "/food-log",
        json={"food_id": food["id"], "grams": 100, "logged_at": "2026-09-08T05:00:00+02:00"},
    )
    assert [e["food_name"] for e in client.get("/food-log?date=2026-09-08").json()["entries"]] == [
        "Tostada"
    ]
    assert client.get("/food-log?date=2026-09-07").json()["entries"] == []


def test_before_the_cut_belongs_to_the_day_you_have_been_awake_for(client):
    food = create(client, "Queso", kcal_100g=350)
    client.post(
        "/food-log",
        json={"food_id": food["id"], "grams": 30, "logged_at": "2026-09-08T01:30:00+02:00"},
    )
    assert [e["food_name"] for e in client.get("/food-log?date=2026-09-07").json()["entries"]] == [
        "Queso"
    ]


def test_an_entry_filed_on_the_wrong_day_can_be_moved(client):
    # Sin esto, arreglar una entrada mal fechada era borrarla y volver a
    # escribirla. El día se deriva del sello con la misma regla que al crearla,
    # que es la única que existe.
    food = create(client, "Tostada", kcal_100g=250)
    entry = client.post(
        "/food-log",
        json={"food_id": food["id"], "grams": 100, "logged_at": "2026-09-07T23:00:00+02:00"},
    ).json()
    assert entry["log_date"] == "2026-09-07"
    moved = client.patch(
        f"/food-log/{entry['id']}", json={"logged_at": "2026-09-08T14:00:00+02:00"}
    )
    assert moved.status_code == 200
    assert moved.json()["log_date"] == "2026-09-08"
    assert client.get("/food-log?date=2026-09-07").json()["entries"] == []
    assert len(client.get("/food-log?date=2026-09-08").json()["entries"]) == 1


def test_moving_an_entry_does_not_reread_the_food(client):
    # Re-fechar es re-fechar. Las cifras siguen siendo las que se congelaron,
    # aunque el alimento se haya corregido por medio.
    food = create(client, "Tostada", kcal_100g=250)
    entry = client.post(
        "/food-log",
        json={"food_id": food["id"], "grams": 100, "logged_at": "2026-09-07T23:00:00+02:00"},
    ).json()
    client.patch(f"/foods/{food['id']}", json={"kcal_100g": 999})
    moved = client.patch(
        f"/food-log/{entry['id']}", json={"logged_at": "2026-09-08T14:00:00+02:00"}
    ).json()
    assert moved["kcal"] == 250


# Volver a aplicar un alimento corregido a lo ya registrado.
#
# Es la única excepción a que `log_entries` congela, y existe porque la regla no
# distinguía dos casos que no son el mismo: un alimento que **cambió** (la
# receta, o una medición mejor) y un alimento que estaba **mal tecleado**. En el
# primero congelar es lo correcto; en el segundo no hubo ningún día en que la
# cifra fuera cierta, y el diario lleva mintiendo desde el primero.
#
# Nunca automático y nunca a todo el historial: sólo el día que se está mirando,
# y sólo cuando alguien lo pide (2026-09-08).


def test_recomputing_reapplies_the_corrected_food_to_that_day(client):
    food = create(client, "Pan", kcal_100g=250)
    client.post(
        "/food-log",
        json={"food_id": food["id"], "grams": 100, "logged_at": "2026-09-08T14:00:00+02:00"},
    )
    client.patch(f"/foods/{food['id']}", json={"kcal_100g": 265})
    # Sigue congelado hasta que alguien lo pida.
    assert client.get("/food-log?date=2026-09-08").json()["totals"]["kcal"] == 250

    resp = client.post("/food-log/recompute", json={"food_id": food["id"], "date": "2026-09-08"})
    assert resp.status_code == 200
    assert resp.json()["updated"] == 1
    assert client.get("/food-log?date=2026-09-08").json()["totals"]["kcal"] == 265


def test_recomputing_respects_the_grams_of_each_entry(client):
    food = create(client, "Pan", kcal_100g=250)
    for grams in (100, 200):
        client.post(
            "/food-log",
            json={"food_id": food["id"], "grams": grams, "logged_at": "2026-09-08T14:00:00+02:00"},
        )
    client.patch(f"/foods/{food['id']}", json={"kcal_100g": 300})
    client.post("/food-log/recompute", json={"food_id": food["id"], "date": "2026-09-08"})
    assert [e["kcal"] for e in client.get("/food-log?date=2026-09-08").json()["entries"]] == [
        300,
        600,
    ]


def test_recomputing_leaves_every_other_day_alone(client):
    # El alcance es el día que estás mirando, y punto. Un dedo equivocado no
    # puede cambiar los totales de un mes que ya diste por bueno.
    food = create(client, "Pan", kcal_100g=250)
    for iso in ("2026-09-07T14:00:00+02:00", "2026-09-08T14:00:00+02:00"):
        client.post("/food-log", json={"food_id": food["id"], "grams": 100, "logged_at": iso})
    client.patch(f"/foods/{food['id']}", json={"kcal_100g": 265})
    client.post("/food-log/recompute", json={"food_id": food["id"], "date": "2026-09-08"})
    assert client.get("/food-log?date=2026-09-08").json()["totals"]["kcal"] == 265
    assert client.get("/food-log?date=2026-09-07").json()["totals"]["kcal"] == 250


def test_recomputing_leaves_other_foods_alone(client):
    pan = create(client, "Pan", kcal_100g=250)
    queso = create(client, "Queso", kcal_100g=350)
    for food in (pan, queso):
        client.post(
            "/food-log",
            json={"food_id": food["id"], "grams": 100, "logged_at": "2026-09-08T14:00:00+02:00"},
        )
    client.patch(f"/foods/{pan['id']}", json={"kcal_100g": 265})
    client.patch(f"/foods/{queso['id']}", json={"kcal_100g": 400})
    client.post("/food-log/recompute", json={"food_id": pan["id"], "date": "2026-09-08"})
    assert [e["kcal"] for e in client.get("/food-log?date=2026-09-08").json()["entries"]] == [
        265,
        350,
    ]


def test_recomputing_keeps_unknown_unknown(client):
    # `NULL` no es `0`, tampoco por aquí: un nutriente que el alimento no tiene
    # medido sigue sin medir en la entrada.
    food = create(client, "Piquillos de mi madre", kcal_100g=60)
    client.post(
        "/food-log",
        json={"food_id": food["id"], "grams": 100, "logged_at": "2026-09-08T14:00:00+02:00"},
    )
    client.patch(f"/foods/{food['id']}", json={"kcal_100g": 70})
    client.post("/food-log/recompute", json={"food_id": food["id"], "date": "2026-09-08"})
    entry_out = client.get("/food-log?date=2026-09-08").json()["entries"][0]
    assert entry_out["kcal"] == 70
    assert entry_out["protein"] is None


def test_recomputing_a_day_with_nothing_of_that_food_changes_nothing(client):
    food = create(client, "Pan", kcal_100g=250)
    resp = client.post("/food-log/recompute", json={"food_id": food["id"], "date": "2026-09-08"})
    assert resp.status_code == 200
    assert resp.json()["updated"] == 0
