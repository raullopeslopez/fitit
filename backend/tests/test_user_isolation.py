"""Two people share this app now. Filtering list endpoints by the caller's
user_id is necessary but not sufficient: every endpoint keyed by a raw id
(workout_id, set_id, day_id, exercise_id) must also refuse a caller who isn't
its owner — otherwise user B reads/edits/deletes user A's rows just by
guessing/incrementing an id (IDOR). A denial here must be 404, not 403, so a
guessed id can't be used to confirm a row exists.
"""

import pytest


def _register(client, username: str, password: str = "s3cretpass") -> dict:
    resp = client.post("/auth/register", json={"username": username, "password": password})
    assert resp.status_code == 201, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def alice_and_bob(unauthed_client):
    alice = _register(unauthed_client, "alice")
    bob = _register(unauthed_client, "bob")
    return unauthed_client, alice, bob


@pytest.fixture()
def alice_owns_a_workout(alice_and_bob):
    client, alice, bob = alice_and_bob
    workout = client.post("/workouts", json={}, headers=alice).json()
    workout_with_set = client.post(
        f"/workouts/{workout['id']}/sets",
        json={"exercise_name": "Press banca", "reps": 5, "weight": 80},
        headers=alice,
    ).json()
    set_id = workout_with_set["sets"][0]["id"]
    day_id = client.get("/days", headers=alice).json()[0]["id"]
    exercise_id = client.get("/exercises", headers=alice).json()[0]["id"]
    return client, alice, bob, workout["id"], set_id, day_id, exercise_id


def test_bobs_days_do_not_include_alices(alice_owns_a_workout):
    client, alice, bob, *_ = alice_owns_a_workout
    assert client.get("/days", headers=bob).json() == []
    assert len(client.get("/days", headers=alice).json()) == 1


def test_bobs_workouts_do_not_include_alices(alice_owns_a_workout):
    client, alice, bob, *_ = alice_owns_a_workout
    assert client.get("/workouts", headers=bob).json() == []


def test_bobs_exercises_do_not_include_alices(alice_owns_a_workout):
    client, alice, bob, *_ = alice_owns_a_workout
    assert client.get("/exercises", headers=bob).json() == []


def test_bobs_records_do_not_include_alices(alice_owns_a_workout):
    client, alice, bob, *_ = alice_owns_a_workout
    assert client.get("/exercises/records", headers=bob).json() == []


def test_bob_can_reuse_the_same_exercise_name_alice_used(alice_owns_a_workout):
    """Uniqueness is per-user now — this must succeed, not 409."""
    client, alice, bob, *_ = alice_owns_a_workout
    resp = client.post(
        "/exercises", json={"name": "Press banca", "kind": "strength"}, headers=bob
    )
    assert resp.status_code == 201, resp.text


def test_bob_cannot_read_alices_workout(alice_owns_a_workout):
    client, alice, bob, workout_id, *_ = alice_owns_a_workout
    assert client.get(f"/workouts/{workout_id}", headers=bob).status_code == 404


def test_bob_cannot_rename_alices_workout(alice_owns_a_workout):
    client, alice, bob, workout_id, *_ = alice_owns_a_workout
    resp = client.patch(f"/workouts/{workout_id}", json={"name": "hijacked"}, headers=bob)
    assert resp.status_code == 404


def test_bob_cannot_delete_alices_workout(alice_owns_a_workout):
    client, alice, bob, workout_id, *_ = alice_owns_a_workout
    assert client.delete(f"/workouts/{workout_id}", headers=bob).status_code == 404


def test_bob_cannot_log_a_set_on_alices_workout(alice_owns_a_workout):
    client, alice, bob, workout_id, *_ = alice_owns_a_workout
    resp = client.post(
        f"/workouts/{workout_id}/sets",
        json={"exercise_name": "Sentadilla", "reps": 5, "weight": 60},
        headers=bob,
    )
    assert resp.status_code == 404


def test_bob_cannot_edit_alices_set(alice_owns_a_workout):
    client, alice, bob, _workout_id, set_id, *_ = alice_owns_a_workout
    resp = client.patch(
        f"/workouts/sets/{set_id}",
        json={"exercise_name": "Press banca", "reps": 1, "weight": 999},
        headers=bob,
    )
    assert resp.status_code == 404


def test_bob_cannot_delete_alices_set(alice_owns_a_workout):
    client, alice, bob, _workout_id, set_id, *_ = alice_owns_a_workout
    assert client.delete(f"/workouts/sets/{set_id}", headers=bob).status_code == 404


def test_bob_cannot_delete_alices_day(alice_owns_a_workout):
    client, alice, bob, _workout_id, _set_id, day_id, _exercise_id = alice_owns_a_workout
    assert client.delete(f"/days/{day_id}", headers=bob).status_code == 404


def test_bob_cannot_rename_alices_exercise(alice_owns_a_workout):
    client, alice, bob, _workout_id, _set_id, _day_id, exercise_id = alice_owns_a_workout
    resp = client.patch(
        f"/exercises/{exercise_id}", json={"name": "hijacked"}, headers=bob
    )
    assert resp.status_code == 404
