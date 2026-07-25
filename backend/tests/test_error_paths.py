"""The 404 / 422 contracts on the workout, set, day and exercise routes.

The happy paths are covered by the feature specs; these lock the error shapes
the frontend relies on (a missing resource is a 404, a mismatched metric a 422)
so they can't silently regress into a 500 or a wrong status.
"""


def _make_workout(client):
    return client.post("/workouts", json={}).json()


def _log_squat(client, workout_id):
    r = client.post(
        f"/workouts/{workout_id}/sets",
        json={"exercise_name": "Squat", "reps": 5, "weight": 50},
    )
    assert r.status_code == 201, r.text
    return r.json()["sets"][0]


# --- workouts -------------------------------------------------------------

def test_rename_unknown_workout_is_404(client):
    r = client.patch("/workouts/999", json={"name": "Nope"})
    assert r.status_code == 404, r.text


def test_delete_unknown_workout_is_404(client):
    r = client.delete("/workouts/999")
    assert r.status_code == 404, r.text


def test_log_set_on_unknown_workout_is_404(client):
    r = client.post(
        "/workouts/999/sets",
        json={"exercise_name": "Squat", "reps": 5, "weight": 50},
    )
    assert r.status_code == 404, r.text


# --- sets -----------------------------------------------------------------

def test_edit_unknown_set_is_404(client):
    r = client.patch(
        "/workouts/sets/999",
        json={"exercise_name": "Squat", "reps": 5, "weight": 50},
    )
    assert r.status_code == 404, r.text


def test_delete_unknown_set_is_404(client):
    r = client.delete("/workouts/sets/999")
    assert r.status_code == 404, r.text


# --- days -----------------------------------------------------------------

def test_delete_unknown_day_is_404(client):
    r = client.delete("/days/999")
    assert r.status_code == 404, r.text


# --- metric validation ----------------------------------------------------

def test_cardio_set_rejects_reps_and_weight(client):
    """A cardio exercise's set must not carry reps/weight (workouts._validate_metrics)."""
    client.post("/exercises", json={"name": "Correr", "kind": "cardio"})
    w = _make_workout(client)

    r = client.post(
        f"/workouts/{w['id']}/sets",
        json={"exercise_name": "Correr", "duration_seconds": 600, "reps": 5, "weight": 20},
    )
    assert r.status_code == 422, r.text


# The two unit-relabel error paths that used to live here are gone with the
# endpoint. Left in place they would have kept passing — FastAPI answers 404 for
# a route that doesn't exist, which is exactly what they asserted — so they'd
# have been green for the wrong reason.
