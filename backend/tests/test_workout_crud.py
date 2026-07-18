"""Rename and delete whole workouts, and delete a whole day (cascading)."""


def _log(client, workout_id):
    r = client.post(
        f"/workouts/{workout_id}/sets",
        json={"exercise_name": "Squat", "reps": 5, "weight": 50, "unit": "kg"},
    )
    assert r.status_code == 201, r.text


def test_rename_a_workout(client):
    w = client.post("/workouts", json={"date": "2026-07-10"}).json()

    resp = client.patch(f"/workouts/{w['id']}", json={"name": "Push Day"})

    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Push Day"
    assert client.get(f"/workouts/{w['id']}").json()["name"] == "Push Day"


def test_delete_a_workout_and_empty_day_is_removed(client):
    w = client.post("/workouts", json={"date": "2026-07-10", "name": "A"}).json()
    _log(client, w["id"])

    resp = client.delete(f"/workouts/{w['id']}")

    assert resp.status_code == 204, resp.text
    assert client.get(f"/workouts/{w['id']}").status_code == 404
    # the day held only this workout, so it should be gone from the history
    assert all(d["date"] != "2026-07-10" for d in client.get("/days").json())


def test_delete_a_day_cascades_its_workouts(client):
    w1 = client.post("/workouts", json={"date": "2026-07-11", "name": "AM"}).json()
    client.post("/workouts", json={"date": "2026-07-11", "name": "PM"})
    day_id = next(d["id"] for d in client.get("/days").json() if d["date"] == "2026-07-11")

    resp = client.delete(f"/days/{day_id}")

    assert resp.status_code == 204, resp.text
    assert all(d["date"] != "2026-07-11" for d in client.get("/days").json())
    assert client.get(f"/workouts/{w1['id']}").status_code == 404
