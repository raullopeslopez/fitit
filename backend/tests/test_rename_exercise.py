"""Renaming an exercise: the row is renamed in place, so every past set,
history point and record follows automatically (they reference it by id)."""


def _log(client, workout_id, name):
    r = client.post(
        f"/workouts/{workout_id}/sets",
        json={"exercise_name": name, "reps": 5, "weight": 50},
    )
    assert r.status_code == 201, r.text


def _exercise(client, name):
    return next((e for e in client.get("/exercises").json() if e["name"] == name), None)


def test_rename_updates_the_name(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], "Press banca")
    ex = _exercise(client, "Press banca")

    r = client.patch(f"/exercises/{ex['id']}", json={"name": "Press de banca"})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Press de banca"

    # The old name is gone; the new one is listed.
    assert _exercise(client, "Press banca") is None
    assert _exercise(client, "Press de banca")["id"] == ex["id"]


def test_rename_keeps_past_sets_and_history(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], "Press banca")
    ex = _exercise(client, "Press banca")

    client.patch(f"/exercises/{ex['id']}", json={"name": "Press de banca"})

    # History and previous marks follow the rename.
    hist = client.get("/exercises/history", params={"name": "Press de banca"}).json()
    assert len(hist) == 1
    prev = client.get("/exercises/previous", params={"name": "Press de banca"}).json()
    assert prev["found"] is True
    assert prev["sets"][0]["exercise_name"] == "Press de banca"


def test_rename_preserves_the_muscle_group(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], "Press banca")  # classifier -> Pecho
    ex = _exercise(client, "Press banca")
    client.patch(f"/exercises/{ex['id']}", json={"muscle_group": "Hombro"})

    # A name-only patch must not wipe the muscle-group override.
    r = client.patch(f"/exercises/{ex['id']}", json={"name": "Press militar"})
    assert r.status_code == 200, r.text
    assert r.json()["muscle_group"] == "Hombro"


def test_rename_normalizes_whitespace(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], "Press banca")
    ex = _exercise(client, "Press banca")

    r = client.patch(f"/exercises/{ex['id']}", json={"name": "  Press   de banca  "})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Press de banca"


def test_rename_to_own_name_fixes_casing(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], "press banca")
    ex = _exercise(client, "press banca")

    # A case-only change is not a collision with itself.
    r = client.patch(f"/exercises/{ex['id']}", json={"name": "Press Banca"})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Press Banca"


def test_rename_onto_another_exercise_is_rejected(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], "Press banca")
    _log(client, workout["id"], "Sentadilla")
    banca = _exercise(client, "Press banca")

    # Renaming onto an existing exercise would merge two distinct lifts.
    r = client.patch(f"/exercises/{banca['id']}", json={"name": "Sentadilla"})
    assert r.status_code == 409, r.text
    # Both survive, unchanged.
    assert _exercise(client, "Press banca") is not None
    assert _exercise(client, "Sentadilla") is not None


def test_collision_check_is_case_insensitive(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], "Press banca")
    _log(client, workout["id"], "Sentadilla")
    banca = _exercise(client, "Press banca")

    r = client.patch(f"/exercises/{banca['id']}", json={"name": "  sentadilla  "})
    assert r.status_code == 409, r.text


def test_rename_rejects_a_blank_name(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], "Press banca")
    ex = _exercise(client, "Press banca")

    r = client.patch(f"/exercises/{ex['id']}", json={"name": "   "})
    assert r.status_code == 422, r.text


def test_rename_missing_exercise_is_404(client):
    r = client.patch("/exercises/9999", json={"name": "Whatever"})
    assert r.status_code == 404, r.text
