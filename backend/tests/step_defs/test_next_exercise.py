from datetime import date, timedelta

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/next_exercise.feature")


@pytest.fixture()
def logged_workouts():
    """Workout ids in the order the scenario logged them."""
    return []


def _names(text):
    return [part.strip().strip('"') for part in text.split(",")]


def _session(client, day, names, workout_ids):
    workout = client.post("/workouts", json={"date": day.isoformat()})
    assert workout.status_code == 201, workout.text
    workout_id = workout.json()["id"]
    for name in names:
        logged = client.post(
            f"/workouts/{workout_id}/sets",
            json={"exercise_name": name, "reps": 8, "weight": 60},
        )
        assert logged.status_code == 201, logged.text
    workout_ids.append(workout_id)
    return workout_id


@given(parsers.parse("a session {days:d} days ago with {names}"))
def given_session_days_ago(client, days, names, logged_workouts):
    if ", then one more set of " in names:
        first, again = names.split(", then one more set of ")
        _session(
            client,
            date.today() - timedelta(days=days),
            _names(first) + _names(again),
            logged_workouts,
        )
        return
    _session(client, date.today() - timedelta(days=days), _names(names), logged_workouts)


@given(parsers.parse("a session today with {names}"))
def given_session_today(client, names, logged_workouts):
    _session(client, date.today(), _names(names), logged_workouts)


@given(parsers.parse("1 session long ago with {names}"))
def given_session_long_ago(client, names, logged_workouts):
    _session(client, date.today() - timedelta(days=100), _names(names), logged_workouts)


@given(parsers.parse("{count:d} sessions after that with {names}"))
def given_sessions_after(client, count, names, logged_workouts):
    for i in range(count):
        _session(client, date.today() - timedelta(days=90 - 10 * i), _names(names), logged_workouts)


@given("I have logged nothing")
def given_logged_nothing():
    pass  # the point is the absence of data


@when(
    parsers.parse('I ask what I usually do after "{name}" excluding that session'),
    target_fixture="next_response",
)
def when_ask_next_excluding(client, name, logged_workouts):
    return client.get(
        "/exercises/next",
        params={"after": name, "exclude_workout_id": logged_workouts[-1]},
    )


@when(parsers.parse('I ask what I usually do after "{name}"'), target_fixture="next_response")
def when_ask_next(client, name):
    return client.get("/exercises/next", params={"after": name})


def _suggested(response):
    assert response.status_code == 200, response.text
    return [row["name"] for row in response.json()]


@then(parsers.parse('the suggestions are "{first}" then "{second}"'))
def then_two(next_response, first, second):
    assert _suggested(next_response) == [first, second]


@then(parsers.re(r'the suggestions are "(?P<only>[^"]+)"$'))
def then_one(next_response, only):
    assert _suggested(next_response) == [only]


@then("nothing is suggested")
def then_nothing(next_response):
    assert _suggested(next_response) == []


@then(parsers.parse("there are {count:d} suggestions"))
def then_count(next_response, count):
    assert len(_suggested(next_response)) == count
