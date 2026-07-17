"""GET /workouts lists past workouts (newest first) with their sets, for history."""


def _log(client, workout_id, name):
    r = client.post(
        f"/workouts/{workout_id}/sets",
        json={"exercise_name": name, "reps": 5, "weight": 50, "unit": "kg"},
    )
    assert r.status_code == 201, r.text


def test_lists_workouts_newest_first_with_sets(client):
    w1 = client.post("/workouts", json={"name": "Day A"}).json()
    _log(client, w1["id"], "Squat")
    w2 = client.post("/workouts", json={"name": "Day B"}).json()

    resp = client.get("/workouts")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert [w["id"] for w in body] == [w2["id"], w1["id"]]
    day_a = next(w for w in body if w["id"] == w1["id"])
    assert [s["exercise_name"] for s in day_a["sets"]] == ["Squat"]
