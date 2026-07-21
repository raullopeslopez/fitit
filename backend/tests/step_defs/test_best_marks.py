from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/best_marks.feature")


def _log(client, payload):
    workout = client.post("/workouts", json={})
    assert workout.status_code == 201, workout.text
    logged = client.post(f"/workouts/{workout.json()['id']}/sets", json=payload)
    assert logged.status_code == 201, logged.text


@given(parsers.parse('I logged "{name}" at {weight:g} kg x {reps:d} in a previous workout'))
def given_logged_previously(client, name, weight, reps):
    _log(client, {"exercise_name": name, "reps": reps, "weight": weight, "unit": "kg"})


@given(parsers.parse('I ran "{name}" for {seconds:d} seconds in a previous workout'))
def given_ran_previously(client, name, seconds):
    _log(client, {"exercise_name": name, "kind": "cardio", "duration_seconds": seconds})


@given(parsers.parse('I have never logged "{name}"'))
def given_never_logged(name):
    pass  # nothing to set up — the point is the absence of data


@when("I ask for my best marks", target_fixture="marks_response")
def when_ask_best_marks(client):
    return client.get("/exercises/records")


def _marks(response):
    assert response.status_code == 200, response.text
    return response.json()


def _mark_for(response, name):
    match = [m for m in _marks(response) if m["exercise_name"] == name]
    assert match, f"{name} not in {[m['exercise_name'] for m in _marks(response)]}"
    return match[0]


@then(parsers.parse('I see "{first}" listed before "{second}"'))
def then_listed_before(marks_response, first, second):
    names = [m["exercise_name"] for m in _marks(marks_response)]
    assert names.index(first) < names.index(second)


@then(parsers.parse('the best mark for "{name}" is {reps:d} reps at {weight:g} kg'))
def then_best_mark_is(marks_response, name, reps, weight):
    mark = _mark_for(marks_response, name)
    assert mark["reps"] == reps
    assert mark["weight_kg"] == weight


@then(parsers.parse('the best mark for "{name}" improved'))
def then_mark_improved(marks_response, name):
    mark = _mark_for(marks_response, name)
    assert mark["delta_one_rm"] is not None
    assert mark["delta_one_rm"] > 0


@then(parsers.parse('the best mark for "{name}" has no improvement'))
def then_mark_flat(marks_response, name):
    assert _mark_for(marks_response, name)["delta_one_rm"] is None


@then(parsers.parse('"{name}" is not listed'))
def then_not_listed(marks_response, name):
    assert all(m["exercise_name"] != name for m in _marks(marks_response))


@then("I see no best marks")
def then_no_best_marks(marks_response):
    assert _marks(marks_response) == []
