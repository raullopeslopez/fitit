from datetime import date, timedelta

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/recently_trained.feature")


@pytest.fixture()
def logged_workouts():
    """Workout ids in the order the scenario logged them."""
    return []


def _log(client, name, day, workout_ids):
    workout = client.post("/workouts", json={"date": day.isoformat()})
    assert workout.status_code == 201, workout.text
    workout_id = workout.json()["id"]
    logged = client.post(
        f"/workouts/{workout_id}/sets",
        json={"exercise_name": name, "reps": 8, "weight": 60},
    )
    assert logged.status_code == 201, logged.text
    workout_ids.append(workout_id)
    return workout_id


@given(parsers.parse('I trained "{name}" today'))
def given_trained_today(client, name, logged_workouts):
    _log(client, name, date.today(), logged_workouts)


@given(parsers.parse('I trained "{name}" yesterday'))
def given_trained_yesterday(client, name, logged_workouts):
    _log(client, name, date.today() - timedelta(days=1), logged_workouts)


@given(parsers.parse('I trained "{name}" {days:d} days ago'))
def given_trained_days_ago(client, name, days, logged_workouts):
    _log(client, name, date.today() - timedelta(days=days), logged_workouts)


@given("I have logged nothing")
def given_logged_nothing():
    pass  # the point is the absence of data


@when("I ask what I trained recently", target_fixture="recent_response")
def when_ask_recent(client):
    return client.get("/exercises/recently-trained")


@when(
    "I ask what I trained recently excluding that workout",
    target_fixture="recent_response",
)
def when_ask_recent_excluding(client, logged_workouts):
    return client.get(
        "/exercises/recently-trained",
        params={"exclude_workout_id": logged_workouts[-1]},
    )


def _groups(response):
    assert response.status_code == 200, response.text
    return [row["group"] for row in response.json()]


@then(parsers.parse('"{group}" is listed'))
def then_group_listed(recent_response, group):
    assert group in _groups(recent_response), _groups(recent_response)


@then(parsers.parse('"{group}" is not listed'))
def then_group_not_listed(recent_response, group):
    assert group not in _groups(recent_response), _groups(recent_response)


@then("nothing is listed")
def then_nothing_listed(recent_response):
    assert _groups(recent_response) == []


@then(parsers.parse('the groups are "{first}" then "{second}"'))
def then_groups_in_order(recent_response, first, second):
    assert _groups(recent_response) == [first, second]


@then(parsers.parse('"{group}" is listed once, dated today'))
def then_group_listed_once_today(recent_response, group):
    rows = [r for r in recent_response.json() if r["group"] == group]
    assert len(rows) == 1, rows
    assert rows[0]["last_date"] == date.today().isoformat()
