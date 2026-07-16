from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/previous_marks.feature")


@given(parsers.parse('I logged "{name}" at {weight:g} kg x {reps:d} in a previous workout'))
def given_logged_previously(client, name, weight, reps):
    workout = client.post("/workouts", json={})
    assert workout.status_code == 201, workout.text
    logged = client.post(
        f"/workouts/{workout.json()['id']}/sets",
        json={"exercise_name": name, "reps": reps, "weight": weight, "unit": "kg"},
    )
    assert logged.status_code == 201, logged.text


@given(parsers.parse('I have never logged "{name}"'))
def given_never_logged(name):
    pass  # nothing to set up — the point is the absence of data


@when(
    parsers.parse('I ask for the previous marks of "{name}"'),
    target_fixture="marks_response",
)
def when_ask_previous_marks(client, name):
    return client.get("/exercises/previous", params={"name": name})


@then(parsers.parse("I see previous marks of {reps:d} reps at {weight:g} kg"))
def then_see_previous_marks(marks_response, reps, weight):
    assert marks_response.status_code == 200, marks_response.text
    body = marks_response.json()
    assert body["found"] is True
    assert any(s["reps"] == reps and s["weight"] == weight for s in body["sets"])


@then("I see no previous marks")
def then_no_previous_marks(marks_response):
    assert marks_response.status_code == 200, marks_response.text
    body = marks_response.json()
    assert body["found"] is False
    assert body["sets"] == []
