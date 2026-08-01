"""A logged set carries the muscle group of the exercise it belongs to.

The per-muscle views read the whole tree from `GET /days`, so the group has to
travel with the set. Without it the client would have to cross-reference
`/exercises` by name on every render.
"""


def _log(client, workout_id, name):
    resp = client.post(
        f"/workouts/{workout_id}/sets",
        json={"exercise_name": name, "reps": 8, "weight": 60},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _sets_of_first_day(client):
    resp = client.get("/days")
    assert resp.status_code == 200, resp.text
    return resp.json()[0]["workouts"][0]["sets"]


def test_days_carries_the_muscle_group_of_each_set(client):
    workout = client.post("/workouts", json={"date": "2026-07-20"}).json()
    _log(client, workout["id"], "Press banca")
    _log(client, workout["id"], "Dominadas")

    groups = {s["exercise_name"]: s["muscle_group"] for s in _sets_of_first_day(client)}

    assert groups == {"Press banca": "Pecho", "Dominadas": "Espalda"}


def test_a_manual_override_wins(client):
    workout = client.post("/workouts", json={"date": "2026-07-20"}).json()
    logged = _log(client, workout["id"], "Press banca")
    exercise_id = logged["sets"][0]["exercise_id"]

    client.patch(f"/exercises/{exercise_id}", json={"muscle_group": "Hombro"})

    assert _sets_of_first_day(client)[0]["muscle_group"] == "Hombro"


def test_an_untagged_exercise_falls_back_to_the_classifier(client):
    # Clearing the override drops the stored value; the set still needs a colour,
    # so it falls back to the name-based guess exactly as `/exercises` does.
    workout = client.post("/workouts", json={"date": "2026-07-20"}).json()
    logged = _log(client, workout["id"], "Press banca")
    exercise_id = logged["sets"][0]["exercise_id"]

    client.patch(f"/exercises/{exercise_id}", json={"muscle_group": None})

    assert _sets_of_first_day(client)[0]["muscle_group"] == "Pecho"


def test_an_unrecognized_exercise_has_no_group(client):
    workout = client.post("/workouts", json={"date": "2026-07-20"}).json()
    _log(client, workout["id"], "Zumbido lateral")

    assert _sets_of_first_day(client)[0]["muscle_group"] is None


def test_the_group_survives_an_edit(client):
    """`PATCH /workouts/sets/{id}` returns the set on its own — same shape."""
    workout = client.post("/workouts", json={"date": "2026-07-20"}).json()
    set_id = _log(client, workout["id"], "Press banca")["sets"][0]["id"]

    resp = client.patch(
        f"/workouts/sets/{set_id}",
        json={"exercise_name": "Sentadilla", "reps": 5, "weight": 100},
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["muscle_group"] == "Cuádriceps"
