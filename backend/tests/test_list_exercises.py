"""GET /exercises lists known exercises (alphabetical) to drive autocomplete."""


def _log(client, workout_id, name):
    r = client.post(
        f"/workouts/{workout_id}/sets",
        json={"exercise_name": name, "reps": 5, "weight": 50},
    )
    assert r.status_code == 201, r.text


def test_lists_known_exercises_sorted(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], "Squat")
    _log(client, workout["id"], "Bench Press")

    resp = client.get("/exercises")

    assert resp.status_code == 200, resp.text
    names = [e["name"] for e in resp.json()]
    assert names == ["Bench Press", "Squat"]
