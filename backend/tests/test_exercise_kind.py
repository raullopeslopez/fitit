"""Exercises carry a `kind` (strength | cardio) so cardio can log different
metrics. It defaults to strength; the API surfaces it so the UI can pick the
right logging screen when you add an exercise."""


def test_new_exercise_defaults_to_strength(client):
    w = client.post("/workouts", json={}).json()
    r = client.post(
        f"/workouts/{w['id']}/sets",
        json={"exercise_name": "Bench", "reps": 5, "weight": 60, "unit": "kg"},
    )
    assert r.status_code == 201, r.text

    ex = next(e for e in client.get("/exercises").json() if e["name"] == "Bench")
    assert ex["kind"] == "strength"


def test_create_a_cardio_exercise(client):
    r = client.post("/exercises", json={"name": "Correr", "kind": "cardio"})
    assert r.status_code == 201, r.text
    assert r.json()["kind"] == "cardio"


def test_previous_marks_report_the_kind_of_a_known_exercise(client):
    client.post("/exercises", json={"name": "Correr", "kind": "cardio"})

    body = client.get("/exercises/previous", params={"name": "Correr"}).json()
    assert body["kind"] == "cardio"


def test_previous_marks_kind_is_null_for_an_unknown_exercise(client):
    body = client.get("/exercises/previous", params={"name": "Nadar"}).json()
    assert body["found"] is False
    assert body["kind"] is None
