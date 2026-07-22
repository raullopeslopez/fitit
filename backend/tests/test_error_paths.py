"""The routers' refusal paths: 404 when a workout, set, or day is missing, and
422 when a set's metric fields don't match its exercise kind. The happy paths
live in the feature specs and the CRUD tests; these lock in what happens when
the request names something that isn't there or sends metrics that don't fit.
"""


# --- workouts: 404 on a missing workout or set ---------------------------------


def test_rename_missing_workout_404(client):
    assert client.patch("/workouts/999", json={"name": "x"}).status_code == 404


def test_delete_missing_workout_404(client):
    assert client.delete("/workouts/999").status_code == 404


def test_log_set_to_missing_workout_404(client):
    resp = client.post(
        "/workouts/999/sets",
        json={"exercise_name": "Squat", "reps": 5, "weight": 50, "unit": "kg"},
    )
    assert resp.status_code == 404, resp.text


def test_edit_missing_set_404(client):
    resp = client.patch(
        "/workouts/sets/999",
        json={"exercise_name": "Squat", "reps": 5, "weight": 50, "unit": "kg"},
    )
    assert resp.status_code == 404, resp.text


def test_delete_missing_set_404(client):
    assert client.delete("/workouts/sets/999").status_code == 404


def test_correct_unit_on_missing_workout_404(client):
    resp = client.patch("/workouts/999/exercises/1/unit", json={"unit": "lb"})
    assert resp.status_code == 404, resp.text


def test_correct_unit_with_no_weighted_sets_404(client):
    # The workout exists, but that exercise has no weighted sets in it — there is
    # nothing to relabel, so it's a 404 rather than a silent success.
    w = client.post("/workouts", json={}).json()
    resp = client.patch(f"/workouts/{w['id']}/exercises/999/unit", json={"unit": "lb"})
    assert resp.status_code == 404, resp.text


# --- days: 404 on a missing day ------------------------------------------------


def test_delete_missing_day_404(client):
    assert client.delete("/days/999").status_code == 404


# --- sets: metric fields must match the exercise kind (422) --------------------


def test_cardio_set_rejects_reps_and_weight_422(client):
    # A cardio exercise carries duration, not reps/weight. Sending reps+weight
    # (even alongside a valid duration) is a category error, not a light warning.
    client.post("/exercises", json={"name": "Correr", "kind": "cardio"})
    w = client.post("/workouts", json={}).json()
    resp = client.post(
        f"/workouts/{w['id']}/sets",
        json={
            "exercise_name": "Correr",
            "duration_seconds": 600,
            "reps": 5,
            "weight": 50,
        },
    )
    assert resp.status_code == 422, resp.text


# --- exercises: creating a duplicate returns the existing one (idempotent) ------


def test_create_duplicate_exercise_returns_existing(client):
    first = client.post("/exercises", json={"name": "Squat"})
    assert first.status_code == 201, first.text
    again = client.post("/exercises", json={"name": "Squat"})
    assert again.status_code == 201, again.text
    assert again.json()["id"] == first.json()["id"]


# --- exercises/history: cardio sets have no 1RM and are skipped -----------------


def test_history_skips_cardio_sets(client):
    # A cardio exercise has no weight/reps, so its sets can't yield an est. 1RM.
    # History leaves them out entirely rather than charting a zero.
    client.post("/exercises", json={"name": "Correr", "kind": "cardio"})
    w = client.post("/workouts", json={}).json()
    client.post(
        f"/workouts/{w['id']}/sets",
        json={"exercise_name": "Correr", "duration_seconds": 600},
    )
    resp = client.get("/exercises/history", params={"name": "Correr"})
    assert resp.status_code == 200, resp.text
    assert resp.json() == []
