"""Previous marks carry the best estimated 1RM (Epley) for the exercise, so the
UI can flag a new personal record."""


def _log(client, workout_id, reps, weight):
    r = client.post(
        f"/workouts/{workout_id}/sets",
        json={"exercise_name": "Bench", "reps": reps, "weight": weight, "unit": "kg"},
    )
    assert r.status_code == 201, r.text


def test_previous_marks_include_best_estimated_1rm(client):
    w = client.post("/workouts", json={}).json()
    _log(client, w["id"], 8, 60)  # 60 * (1 + 8/30)  = 76.0
    _log(client, w["id"], 3, 80)  # 80 * (1 + 3/30)  = 88.0  (best)

    body = client.get("/exercises/previous", params={"name": "Bench"}).json()

    assert body["best_one_rm"] == 88.0


def test_best_one_rm_is_null_for_a_new_exercise(client):
    body = client.get("/exercises/previous", params={"name": "Deadlift"}).json()
    assert body["found"] is False
    assert body["best_one_rm"] is None
