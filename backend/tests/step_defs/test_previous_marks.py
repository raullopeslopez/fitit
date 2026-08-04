from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/previous_marks.feature")


@given(parsers.parse('I logged "{name}" at {weight:g} kg x {reps:d} in a previous workout'))
def given_logged_previously(client, name, weight, reps):
    workout = client.post("/workouts", json={})
    assert workout.status_code == 201, workout.text
    logged = client.post(
        f"/workouts/{workout.json()['id']}/sets",
        json={"exercise_name": name, "reps": reps, "weight": weight},
    )
    assert logged.status_code == 201, logged.text


@given(
    parsers.parse('I logged "{name}" at {weight:g} kg x {reps:d} in the workout I am in now'),
    target_fixture="current_workout_id",
)
def given_logged_in_current_workout(client, name, weight, reps):
    workout = client.post("/workouts", json={})
    assert workout.status_code == 201, workout.text
    workout_id = workout.json()["id"]
    logged = client.post(
        f"/workouts/{workout_id}/sets",
        json={"exercise_name": name, "reps": reps, "weight": weight},
    )
    assert logged.status_code == 201, logged.text
    return workout_id


@given(parsers.parse('I have never logged "{name}"'))
def given_never_logged(name):
    pass  # nothing to set up — the point is the absence of data


@when(
    parsers.parse('I ask for the previous marks of "{name}"'),
    target_fixture="marks_response",
)
def when_ask_previous_marks(client, name):
    return client.get("/exercises/previous", params={"name": name})


@when(
    parsers.parse('I ask for the previous marks of "{name}" excluding the workout I am in'),
    target_fixture="marks_response",
)
def when_ask_previous_marks_excluding(client, name, current_workout_id):
    return client.get(
        "/exercises/previous",
        params={"name": name, "exclude_workout_id": current_workout_id},
    )


@then(parsers.parse("I see previous marks of {reps:d} reps at {weight:g} kg"))
def then_see_previous_marks(marks_response, reps, weight):
    assert marks_response.status_code == 200, marks_response.text
    body = marks_response.json()
    assert body["found"] is True
    assert any(s["reps"] == reps and s["weight"] == weight for s in body["sets"])


@then(parsers.parse("the best estimated 1RM is {one_rm:g}"))
def then_best_one_rm_is(marks_response, one_rm):
    assert marks_response.status_code == 200, marks_response.text
    assert marks_response.json()["best_one_rm"] == one_rm


@then(parsers.parse("the bar to beat at {reps:d} reps is {weight:g} kg"))
def then_bar_to_beat_is(marks_response, reps, weight):
    assert marks_response.status_code == 200, marks_response.text
    bars = marks_response.json()["best_by_reps"]
    assert any(b["reps"] == reps and b["weight"] == weight for b in bars), bars


@then("there is no bar to beat")
def then_no_bar_to_beat(marks_response):
    assert marks_response.status_code == 200, marks_response.text
    assert marks_response.json()["best_by_reps"] == []


@then("I see no previous marks")
def then_no_previous_marks(marks_response):
    assert marks_response.status_code == 200, marks_response.text
    body = marks_response.json()
    assert body["found"] is False
    assert body["sets"] == []


@given(parsers.parse('I logged "{name}" at {weight:g} kg x {reps:d} on "{day}"'))
def given_logged_on_day(client, name, weight, reps, day):
    workout = client.post("/workouts", json={"date": day})
    assert workout.status_code == 201, workout.text
    logged = client.post(
        f"/workouts/{workout.json()['id']}/sets",
        json={"exercise_name": name, "reps": reps, "weight": weight},
    )
    assert logged.status_code == 201, logged.text


@then(parsers.parse('the previous marks are dated "{day}"'))
def then_marks_dated(marks_response, day):
    assert marks_response.status_code == 200, marks_response.text
    assert marks_response.json()["last_date"] == day


@then("the previous marks have no date")
def then_marks_have_no_date(marks_response):
    assert marks_response.status_code == 200, marks_response.text
    assert marks_response.json()["last_date"] is None
