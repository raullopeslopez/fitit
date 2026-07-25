import pytest
from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/newest_first.feature")


@pytest.fixture()
def ctx():
    return {}


def _create(client, *, name=None, date=None):
    created = client.post("/workouts", json={"name": name, "date": date})
    assert created.status_code == 201, created.text
    return created.json()


@given(parsers.parse("a workout on {date}"))
def given_workout_on(client, date):
    _create(client, date=date)


@given(parsers.parse('a training day with workouts "{first}" then "{second}"'))
def given_day_with_two_workouts(client, first, second):
    # Same date, so both land on one day and only their own order is in play.
    _create(client, name=first, date="2026-07-20")
    _create(client, name=second, date="2026-07-20")


@given(parsers.parse('a workout with sets logged for "{first}" then "{second}"'))
def given_workout_with_sets(client, ctx, first, second):
    workout = _create(client, date="2026-07-20")
    for name in (first, second):
        logged = client.post(
            f"/workouts/{workout['id']}/sets",
            json={"exercise_name": name, "reps": 5, "weight": 60},
        )
        assert logged.status_code == 201, logged.text
    ctx["workout_id"] = workout["id"]


@when("I list my training days")
def when_list_days(client, ctx):
    response = client.get("/days")
    assert response.status_code == 200, response.text
    ctx["days"] = response.json()


@when("I open that workout")
def when_open_workout(client, ctx):
    response = client.get(f"/workouts/{ctx['workout_id']}")
    assert response.status_code == 200, response.text
    ctx["workout"] = response.json()


@then(parsers.parse("the days read {first}, {second}"))
def then_days_read(ctx, first, second):
    assert [day["date"] for day in ctx["days"]] == [first, second]


@then(parsers.parse('that day\'s workouts read "{first}", "{second}"'))
def then_workouts_read(ctx, first, second):
    (day,) = ctx["days"]
    assert [w["name"] for w in day["workouts"]] == [first, second]


@then(parsers.parse('its sets read "{first}", "{second}"'))
def then_sets_read(ctx, first, second):
    assert [s["exercise_name"] for s in ctx["workout"]["sets"]] == [first, second]
