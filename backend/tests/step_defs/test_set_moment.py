from datetime import UTC, datetime, timedelta

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/set_moment.feature")


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


def _log(client, workout, name, performed_at):
    body = {"exercise_name": name, "reps": 8, "weight": 60}
    if performed_at is not None:
        body["performed_at"] = performed_at.isoformat()
    resp = client.post(f"/workouts/{workout['id']}/sets", json=body)
    assert resp.status_code == 201, resp.text
    return resp


@when(
    parsers.parse('I log a set for "{name}" performed {minutes:d} minutes ago'),
    target_fixture="log_response",
)
def when_log_minutes_ago(client, workout, name, minutes):
    return _log(client, workout, name, datetime.now(UTC) - timedelta(minutes=minutes))


@when(
    parsers.parse('I log a set for "{name}" performed {days:d} days ago'),
    target_fixture="log_response",
)
def when_log_days_ago(client, workout, name, days):
    return _log(client, workout, name, datetime.now(UTC) - timedelta(days=days))


@when(
    parsers.parse('I log a set for "{name}" performed {minutes:d} minutes from now'),
    target_fixture="log_response",
)
def when_log_minutes_ahead(client, workout, name, minutes):
    return _log(client, workout, name, datetime.now(UTC) + timedelta(minutes=minutes))


@when(
    parsers.parse('I log a set for "{name}" with no moment'),
    target_fixture="log_response",
)
def when_log_no_moment(client, workout, name):
    return _log(client, workout, name, None)


def _recorded_at(log_response):
    stamped = log_response.json()["sets"][-1]["created_at"]
    moment = datetime.fromisoformat(stamped)
    # SQLite hands timestamps back naive; the value is UTC either way.
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


@then(parsers.parse("that set is recorded as performed {minutes:d} minutes ago"))
def then_recorded_minutes_ago(log_response, minutes):
    delta = datetime.now(UTC) - _recorded_at(log_response)
    assert timedelta(minutes=minutes - 1) < delta < timedelta(minutes=minutes + 1)


@then("that set is recorded as performed just now")
def then_recorded_now(log_response):
    delta = datetime.now(UTC) - _recorded_at(log_response)
    assert timedelta(seconds=-5) < delta < timedelta(seconds=30)
