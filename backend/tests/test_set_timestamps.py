"""Every set records when it was logged, so the log can show the clock time.

The workout carries the date; the set carries the moment. Without this a
session reads as an ordered list with no sense of pacing — you can't tell a
tight five-set block from one spread over an hour.
"""

from datetime import datetime


def _log(client, workout_id, **extra):
    return client.post(
        f"/workouts/{workout_id}/sets",
        json={"exercise_name": "Squat", "reps": 5, "weight": 100, "unit": "kg", **extra},
    )


def test_a_logged_set_reports_when_it_was_created(client):
    workout = client.post("/workouts", json={}).json()
    resp = _log(client, workout["id"])

    assert resp.status_code == 201, resp.text
    created = resp.json()["sets"][-1]["created_at"]
    assert created is not None
    # Parseable as a real timestamp, not an opaque string.
    assert isinstance(datetime.fromisoformat(created), datetime)


def test_sets_carry_their_own_timestamps_in_order(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"])
    resp = _log(client, workout["id"])

    sets = resp.json()["sets"]
    assert len(sets) == 2
    stamps = [datetime.fromisoformat(s["created_at"]) for s in sets]
    # Later sets are never stamped earlier than the ones before them.
    assert stamps == sorted(stamps)


def test_editing_a_set_keeps_its_original_timestamp(client):
    workout = client.post("/workouts", json={}).json()
    logged = _log(client, workout["id"]).json()["sets"][-1]

    resp = client.patch(
        f"/workouts/sets/{logged['id']}",
        json={"exercise_name": "Squat", "reps": 6, "weight": 100, "unit": "kg"},
    )

    assert resp.status_code == 200, resp.text
    # Correcting a typo doesn't move when the set happened.
    assert resp.json()["created_at"] == logged["created_at"]
