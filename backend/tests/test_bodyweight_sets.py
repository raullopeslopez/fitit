"""Strength sets with no weight (dominadas, fondos, abs).

`weight` is optional for strength now; `reps` is not. A weightless set is a real
set — it counts as work, it shows in the log — but it is not a number, so it
stays out of every view built on kilos: 1RM history, records, the mark to beat.
Spec: tests/features/bodyweight_set.feature
"""


def _log(client, workout_id, **fields):
    return client.post(f"/workouts/{workout_id}/sets", json={"exercise_name": "Fondos", **fields})


def test_a_weightless_set_is_stored_with_a_null_weight(client):
    workout = client.post("/workouts", json={}).json()
    r = _log(client, workout["id"], reps=12)
    assert r.status_code == 201, r.text
    assert r.json()["sets"][-1]["weight"] is None


def test_zero_kilos_is_still_a_weight(client):
    """0 is a value someone typed (an empty bar, an assisted machine at zero);
    it is not the same as not having one, and both must survive the round trip."""
    workout = client.post("/workouts", json={}).json()
    r = _log(client, workout["id"], reps=12, weight=0)
    assert r.json()["sets"][-1]["weight"] == 0


def test_a_weightless_set_has_no_1rm_history(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], reps=12)
    assert client.get("/exercises/history", params={"name": "Fondos"}).json() == []


def test_weightless_sets_leave_the_mark_to_beat_empty(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], reps=12)
    prev = client.get("/exercises/previous", params={"name": "Fondos"}).json()
    assert prev["found"] is True
    assert prev["best_one_rm"] is None
    assert prev["sets"][0]["weight"] is None


def test_a_weighted_set_of_the_same_exercise_still_counts(client):
    """Weighted dips after bodyweight dips: the kilos views come back to life,
    reading only the sets that carry a number."""
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], reps=12)
    _log(client, workout["id"], reps=5, weight=20)

    assert len(client.get("/exercises/history", params={"name": "Fondos"}).json()) == 1
    records = client.get("/exercises/records").json()
    assert [r["exercise_name"] for r in records] == ["Fondos"]
    assert client.get("/exercises/previous", params={"name": "Fondos"}).json()["best_one_rm"] > 0


def test_reps_are_still_required(client):
    workout = client.post("/workouts", json={}).json()
    assert _log(client, workout["id"], weight=50).status_code == 422
    assert _log(client, workout["id"]).status_code == 422


def test_a_set_can_be_corrected_to_have_no_weight(client):
    """The other half of the fix: a bodyweight set logged as 0 back when 0 was
    the only way to say it must be correctable to no weight at all."""
    workout = client.post("/workouts", json={}).json()
    set_id = _log(client, workout["id"], reps=12, weight=0).json()["sets"][0]["id"]

    r = client.patch(
        f"/workouts/sets/{set_id}", json={"exercise_name": "Fondos", "reps": 12}
    )
    assert r.status_code == 200, r.text
    assert r.json()["weight"] is None


def test_cardio_still_refuses_strength_metrics(client):
    workout = client.post("/workouts", json={}).json()
    client.post("/exercises", json={"name": "Correr", "kind": "cardio"})
    r = client.post(
        f"/workouts/{workout['id']}/sets",
        json={"exercise_name": "Correr", "duration_seconds": 600, "reps": 10},
    )
    assert r.status_code == 422, r.text
