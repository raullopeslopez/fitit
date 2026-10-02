"""Muscle groups: auto-assigned on first use, exposed per exercise, editable."""


def _log(client, workout_id, name):
    r = client.post(
        f"/workouts/{workout_id}/sets",
        json={"exercise_name": name, "reps": 5, "weight": 50},
    )
    assert r.status_code == 201, r.text


def _exercise(client, name):
    return next(e for e in client.get("/exercises").json() if e["name"] == name)


def test_muscle_groups_endpoint(client):
    resp = client.get("/muscle-groups")
    assert resp.status_code == 200, resp.text
    groups = resp.json()
    assert groups[0] == "Pecho"
    assert "Bíceps" in groups
    # Nine since the leg split (Cuádriceps / Femoral / Gemelo replaced "Pierna"),
    # ten since Glúteo left Femoral.
    assert len(groups) == 10
    assert {"Cuádriceps", "Glúteo", "Femoral", "Gemelo"} <= set(groups)


def test_auto_assigns_group_on_first_use(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], "Press banca")

    assert _exercise(client, "Press banca")["muscle_group"] == "Pecho"


def test_unknown_exercise_has_no_group_until_set(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], "Malabares")

    ex = _exercise(client, "Malabares")
    assert ex["muscle_group"] is None

    # The user fixes it by hand.
    r = client.patch(f"/exercises/{ex['id']}", json={"muscle_group": "Core"})
    assert r.status_code == 200, r.text
    assert r.json()["muscle_group"] == "Core"
    assert _exercise(client, "Malabares")["muscle_group"] == "Core"


def test_override_wins_over_the_classifier(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], "Press banca")  # classifier says Pecho
    ex = _exercise(client, "Press banca")

    r = client.patch(f"/exercises/{ex['id']}", json={"muscle_group": "Hombro"})
    assert r.status_code == 200, r.text
    assert _exercise(client, "Press banca")["muscle_group"] == "Hombro"

    # Clearing it reverts to the auto guess.
    r = client.patch(f"/exercises/{ex['id']}", json={"muscle_group": None})
    assert r.status_code == 200, r.text
    assert _exercise(client, "Press banca")["muscle_group"] == "Pecho"


def test_rejects_an_unknown_group(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], "Press banca")
    ex = _exercise(client, "Press banca")

    r = client.patch(f"/exercises/{ex['id']}", json={"muscle_group": "Antebrazo"})
    assert r.status_code == 422, r.text


def test_patch_missing_exercise_is_404(client):
    r = client.patch("/exercises/9999", json={"muscle_group": "Core"})
    assert r.status_code == 404, r.text


def test_create_rejects_an_unknown_group(client):
    """`PATCH` validated the group against the canonical nine and `POST` did
    not, so the one door that creates an exercise outright would take anything
    sixty characters long. Nothing in the UI sends it — exercises are born from
    logging a set, which goes through the classifier — but the hole was real
    from the API, and `frontend/src/muscles.js` leans on it being closed: the
    `Sin grupo` sentinel is documented as safe *because* no exercise can hold
    it as an actual group."""
    r = client.post("/exercises", json={"name": "Invento", "muscle_group": "Antebrazo"})
    assert r.status_code == 422, r.text


def test_create_rejects_the_ungrouped_sentinel(client):
    r = client.post("/exercises", json={"name": "Invento", "muscle_group": "Sin grupo"})
    assert r.status_code == 422, r.text


def test_create_still_takes_a_real_group(client):
    r = client.post("/exercises", json={"name": "Invento", "muscle_group": "Core"})
    assert r.status_code == 201, r.text
    assert r.json()["muscle_group"] == "Core"


def test_create_without_a_group_still_auto_classifies(client):
    r = client.post("/exercises", json={"name": "Press banca"})
    assert r.status_code == 201, r.text
    assert r.json()["muscle_group"] == "Pecho"
