from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/log_set.feature")


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


@when(
    parsers.parse('I log a set of {reps:d} reps at {weight:g} kg for "{name}"'),
    target_fixture="log_response",
)
def when_log_set(client, workout, name, reps, weight):
    return client.post(
        f"/workouts/{workout['id']}/sets",
        json={"exercise_name": name, "reps": reps, "weight": weight, "unit": "kg"},
    )


@then(parsers.parse('the workout contains {count:d} set for "{name}"'))
def then_set_count(log_response, count, name):
    assert log_response.status_code == 201, log_response.text
    body = log_response.json()
    matching = [s for s in body["sets"] if s["exercise_name"] == name]
    assert len(matching) == count


@then(parsers.parse("that set records {reps:d} reps at {weight:g} kg"))
def then_set_values(log_response, reps, weight):
    last_set = log_response.json()["sets"][-1]
    assert last_set["reps"] == reps
    assert last_set["weight"] == weight
