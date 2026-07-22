"""Edge branches on the exercise routes that the happy-path specs skip:
creating a name that already exists, and the 1RM history ignoring cardio sets
(which have no weight/reps to estimate from)."""


def test_create_existing_exercise_returns_the_existing_row(client):
    first = client.post("/exercises", json={"name": "Bench"})
    assert first.status_code == 201, first.text

    again = client.post("/exercises", json={"name": "Bench", "muscle_group": "Espalda"})

    # Idempotent on name: same row, the second call does not overwrite it.
    assert again.status_code == 201, again.text
    assert again.json()["id"] == first.json()["id"]
    assert again.json()["muscle_group"] == first.json()["muscle_group"]


def test_history_ignores_cardio_sets(client):
    """A cardio set has no weight_kg/reps, so it contributes no 1RM point."""
    client.post("/exercises", json={"name": "Correr", "kind": "cardio"})
    w = client.post("/workouts", json={"date": "2026-07-10"}).json()
    r = client.post(
        f"/workouts/{w['id']}/sets",
        json={"exercise_name": "Correr", "duration_seconds": 600},
    )
    assert r.status_code == 201, r.text

    resp = client.get("/exercises/history", params={"name": "Correr"})

    assert resp.status_code == 200, resp.text
    assert resp.json() == []
