"""GET /exercises/history returns best estimated 1RM per training day, for charts."""


def _log(client, workout_id, reps, weight):
    r = client.post(
        f"/workouts/{workout_id}/sets",
        json={"exercise_name": "Bench", "reps": reps, "weight": weight},
    )
    assert r.status_code == 201, r.text


def test_history_best_1rm_per_day_ordered(client):
    w1 = client.post("/workouts", json={"date": "2026-07-10"}).json()
    _log(client, w1["id"], 8, 60)  # 76.0
    _log(client, w1["id"], 5, 60)  # 70.0 -> day best 76.0
    w2 = client.post("/workouts", json={"date": "2026-07-12"}).json()
    _log(client, w2["id"], 3, 80)  # 88.0

    resp = client.get("/exercises/history", params={"name": "Bench"})

    assert resp.status_code == 200, resp.text
    assert resp.json() == [
        {"date": "2026-07-10", "one_rm": 76.0},
        {"date": "2026-07-12", "one_rm": 88.0},
    ]


def test_history_empty_for_unknown_exercise(client):
    resp = client.get("/exercises/history", params={"name": "Deadlift"})
    assert resp.status_code == 200, resp.text
    assert resp.json() == []
