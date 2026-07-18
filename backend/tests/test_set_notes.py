"""A set can carry an optional RPE (rate of perceived exertion) and a note."""


def _log(client, workout_id, extra):
    return client.post(
        f"/workouts/{workout_id}/sets",
        json={"exercise_name": "Squat", "reps": 5, "weight": 100, "unit": "kg", **extra},
    )


def test_logs_a_set_with_rpe_and_note(client):
    workout = client.post("/workouts", json={}).json()
    resp = _log(client, workout["id"], {"rpe": 8.5, "note": "felt heavy"})

    assert resp.status_code == 201, resp.text
    s = resp.json()["sets"][-1]
    assert s["rpe"] == 8.5
    assert s["note"] == "felt heavy"


def test_rpe_and_note_are_optional(client):
    workout = client.post("/workouts", json={}).json()
    resp = _log(client, workout["id"], {})

    assert resp.status_code == 201, resp.text
    s = resp.json()["sets"][-1]
    assert s["rpe"] is None
    assert s["note"] is None


def test_editing_a_set_preserves_when_omitted_is_not_required(client):
    # RPE outside 1..10 is rejected.
    workout = client.post("/workouts", json={}).json()
    resp = _log(client, workout["id"], {"rpe": 11})
    assert resp.status_code == 422, resp.text
