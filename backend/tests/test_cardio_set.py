"""Cardio sets carry duration (+ optional distance in km) instead of reps/weight.
The kind is resolved from the exercise (existing) or the payload (new), and the
metric fields are validated to match it."""


def _cardio_exercise(client, name="Correr"):
    r = client.post("/exercises", json={"name": name, "kind": "cardio"})
    assert r.status_code == 201, r.text


def test_log_a_cardio_set_with_duration_and_distance(client):
    _cardio_exercise(client)
    w = client.post("/workouts", json={}).json()

    r = client.post(
        f"/workouts/{w['id']}/sets",
        json={
            "exercise_name": "Correr",
            "duration_seconds": 1470,  # 24:30
            "distance": 5.2,  # kilometres; there is no other unit
        },
    )
    assert r.status_code == 201, r.text
    s = r.json()["sets"][0]
    assert s["kind"] == "cardio"
    assert s["duration_seconds"] == 1470
    assert s["distance"] == 5.2
    assert s["reps"] is None
    assert s["weight"] is None


def test_log_a_cardio_set_duration_only_creates_the_exercise_as_cardio(client):
    w = client.post("/workouts", json={}).json()

    r = client.post(
        f"/workouts/{w['id']}/sets",
        json={"exercise_name": "Plancha", "kind": "cardio", "duration_seconds": 60},
    )
    assert r.status_code == 201, r.text
    s = r.json()["sets"][0]
    assert s["kind"] == "cardio"
    assert s["duration_seconds"] == 60
    assert s["distance"] is None


def test_cardio_set_requires_a_duration(client):
    _cardio_exercise(client)
    w = client.post("/workouts", json={}).json()

    r = client.post(
        f"/workouts/{w['id']}/sets",
        json={"exercise_name": "Correr", "distance": 5.0},
    )
    assert r.status_code == 422, r.text


def test_strength_set_rejects_cardio_fields(client):
    w = client.post("/workouts", json={}).json()

    r = client.post(
        f"/workouts/{w['id']}/sets",
        json={
            "exercise_name": "Bench",
            "reps": 5,
            "weight": 60,
            "duration_seconds": 60,
        },
    )
    assert r.status_code == 422, r.text


def test_strength_set_still_needs_reps(client):
    """Weight is optional (bodyweight work carries none — see
    tests/features/bodyweight_set.feature); reps are what make it a set."""
    w = client.post("/workouts", json={}).json()

    assert (
        client.post(
            f"/workouts/{w['id']}/sets", json={"exercise_name": "Bench", "weight": 60}
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"/workouts/{w['id']}/sets", json={"exercise_name": "Bench", "reps": 5}
        ).status_code
        == 201
    )
