import pytest
from pytest_bdd import given, parsers, scenarios, then

scenarios("../features/weight_units.feature")


@pytest.fixture()
def ctx():
    """Carries the workout under test between steps."""
    return {}


def _workout_id(client, ctx):
    if "workout_id" not in ctx:
        created = client.post("/workouts", json={})
        assert created.status_code == 201, created.text
        ctx["workout_id"] = created.json()["id"]
    return ctx["workout_id"]


def _log(client, ctx, *, name, reps, weight, unit):
    workout_id = _workout_id(client, ctx)
    logged = client.post(
        f"/workouts/{workout_id}/sets",
        json={"exercise_name": name, "reps": reps, "weight": weight, "unit": unit},
    )
    assert logged.status_code == 201, logged.text
    return logged.json()


def _sets_for(client, ctx, name):
    workout = client.get(f"/workouts/{ctx['workout_id']}")
    assert workout.status_code == 200, workout.text
    return [s for s in workout.json()["sets"] if s["exercise_name"] == name]


@given(parsers.parse('a logged set of {reps:d} reps at {weight:g} {unit} for "{name}"'))
def given_logged_set(client, ctx, reps, weight, unit, name):
    _log(client, ctx, name=name, reps=reps, weight=weight, unit=unit)
    ctx["exercise_name"] = name


@then(parsers.parse("that set reports {kg:g} kg"))
def then_set_reports_kg(client, ctx, kg):
    sets = _sets_for(client, ctx, ctx["exercise_name"])
    assert round(sets[-1]["weight_kg"], 1) == kg


@then(parsers.parse('the best mark for "{name}" is {kg:g} kg'))
def then_best_mark(client, name, kg):
    marks = client.get("/exercises/records")
    assert marks.status_code == 200, marks.text
    mark = next(m for m in marks.json() if m["exercise_name"] == name)
    assert round(mark["weight_kg"], 1) == kg
