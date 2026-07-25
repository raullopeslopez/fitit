"""Exercise names match regardless of case and surrounding whitespace, so
"Bench Press", "bench press" and " Bench  Press " are the same exercise."""


def _log(client, workout_id, name, reps, weight):
    r = client.post(
        f"/workouts/{workout_id}/sets",
        json={"exercise_name": name, "reps": reps, "weight": weight},
    )
    assert r.status_code == 201, r.text
    return r


def test_previous_marks_match_name_case_insensitively(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], "Bench Press", 8, 60)

    resp = client.get("/exercises/previous", params={"name": "  bench press "})

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["found"] is True
    assert len(body["sets"]) == 1
    assert body["sets"][0]["weight"] == 60


def test_logging_a_name_variant_reuses_the_same_exercise(client):
    w1 = client.post("/workouts", json={}).json()
    _log(client, w1["id"], "Bench Press", 8, 60)
    w2 = client.post("/workouts", json={}).json()
    _log(client, w2["id"], "bench press", 5, 70)

    # Previous marks resolve to the most recent (w2) set — proving the variant
    # reused the same exercise instead of creating a second one.
    resp = client.get("/exercises/previous", params={"name": "BENCH PRESS"})

    body = resp.json()
    assert body["found"] is True
    assert len(body["sets"]) == 1
    assert body["sets"][0]["weight"] == 70
