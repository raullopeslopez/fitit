from datetime import UTC, date, datetime, timedelta

from pytest_bdd import given, parsers, scenarios, then

scenarios("../features/session_length.feature")


@given(parsers.parse('an exercise "{name}"'), target_fixture="exercise")
def given_exercise(client, name):
    resp = client.post("/exercises", json={"name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()


@given("a workout started today", target_fixture="workout")
def given_workout(client):
    resp = client.post("/workouts", json={})
    assert resp.status_code == 201, resp.text
    return resp.json()


@given("a workout on a day three days ago", target_fixture="workout")
def given_old_workout(client):
    day = (date.today() - timedelta(days=3)).isoformat()
    resp = client.post("/workouts", json={"date": day})
    assert resp.status_code == 201, resp.text
    return resp.json()


@given(parsers.parse("a set performed {minutes:d} minutes ago"))
def given_set_at(client, workout, minutes):
    performed = (datetime.now(UTC) - timedelta(minutes=minutes)).isoformat()
    resp = client.post(
        f"/workouts/{workout['id']}/sets",
        json={
            "exercise_name": "Bench Press",
            "reps": 8,
            "weight": 60,
            "performed_at": performed,
        },
    )
    assert resp.status_code == 201, resp.text


def _fetch(client, workout):
    resp = client.get(f"/workouts/{workout['id']}")
    assert resp.status_code == 200, resp.text
    return resp.json()


@then(parsers.parse("the workout took {minutes:d} minutes"))
def then_took(client, workout, minutes):
    took = _fetch(client, workout)["duration_seconds"]
    assert took is not None, "the workout reports no length"
    # The clock runs while the test does; a minute of slack covers it.
    assert abs(took - minutes * 60) < 60, f"{took}s is not about {minutes} minutes"


@then("the workout has no length")
def then_no_length(client, workout):
    assert _fetch(client, workout)["duration_seconds"] is None


@then(parsers.parse("the day feed reports a workout that took {minutes:d} minutes"))
def then_day_feed(client, workout, minutes):
    resp = client.get("/days")
    assert resp.status_code == 200, resp.text
    found = [
        w for day in resp.json() for w in day["workouts"] if w["id"] == workout["id"]
    ]
    assert found, "the workout is missing from the day feed"
    assert abs(found[0]["duration_seconds"] - minutes * 60) < 60
