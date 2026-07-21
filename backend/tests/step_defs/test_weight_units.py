import pytest
from pytest_bdd import given, parsers, scenarios, then, when

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


def _log(client, ctx, *, name, reps, weight, unit, times=1):
    workout_id = _workout_id(client, ctx)
    for _ in range(times):
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


@given(
    parsers.parse(
        'a workout with {count:d} sets of {reps:d} reps at {weight:g} {unit} for "{name}"'
    )
)
def given_workout_with_sets(client, ctx, count, reps, weight, unit, name):
    _log(client, ctx, name=name, reps=reps, weight=weight, unit=unit, times=count)
    ctx["exercise_name"] = name
    ctx["typed_weight"] = weight


@given(parsers.parse('that workout also has a set of {reps:d} reps at {weight:g} {unit} for "{name}"'))
def given_also_has_set(client, ctx, reps, weight, unit, name):
    _log(client, ctx, name=name, reps=reps, weight=weight, unit=unit)


@when(parsers.parse('I relabel "{name}" in that workout as {unit}'))
def when_relabel(client, ctx, name, unit):
    exercise_id = _sets_for(client, ctx, name)[0]["exercise_id"]
    ctx["response"] = client.patch(
        f"/workouts/{ctx['workout_id']}/exercises/{exercise_id}/unit",
        json={"unit": unit},
    )
    assert ctx["response"].status_code == 200, ctx["response"].text


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


@then(parsers.parse("those sets still read {weight:g}"))
def then_sets_still_read(client, ctx, weight):
    sets = _sets_for(client, ctx, ctx["exercise_name"])
    assert [s["weight"] for s in sets] == [weight] * len(sets)


@then(parsers.parse("those sets report {kg:g} kg"))
def then_sets_report_kg(client, ctx, kg):
    sets = _sets_for(client, ctx, ctx["exercise_name"])
    assert [round(s["weight_kg"], 1) for s in sets] == [kg] * len(sets)


@then(parsers.parse('the "{name}" set still reports {kg:g} kg'))
def then_other_set_untouched(client, ctx, name, kg):
    sets = _sets_for(client, ctx, name)
    assert [round(s["weight_kg"], 1) for s in sets] == [kg] * len(sets)
