from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bodyweight_set.feature")


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
    parsers.parse('I log a set of {reps:d} reps with no weight for "{name}"'),
    target_fixture="log_response",
)
def when_log_bodyweight_set(client, workout, name, reps):
    return client.post(
        f"/workouts/{workout['id']}/sets",
        json={"exercise_name": name, "reps": reps},
    )


@when(
    parsers.parse('I log a set with neither reps nor weight for "{name}"'),
    target_fixture="log_response",
)
def when_log_empty_set(client, workout, name):
    return client.post(f"/workouts/{workout['id']}/sets", json={"exercise_name": name})


@then(parsers.parse('the workout contains {count:d} set for "{name}"'))
def then_set_count(log_response, count, name):
    assert log_response.status_code == 201, log_response.text
    matching = [s for s in log_response.json()["sets"] if s["exercise_name"] == name]
    assert len(matching) == count


@then(parsers.parse("that set records {reps:d} reps and no weight"))
def then_set_values(log_response, reps):
    last_set = log_response.json()["sets"][-1]
    assert last_set["reps"] == reps
    assert last_set["weight"] is None


@then(parsers.parse('"{name}" has no best mark'))
def then_no_best_mark(client, log_response, name):
    assert log_response.status_code == 201, log_response.text
    records = client.get("/exercises/records").json()
    assert [r for r in records if r["exercise_name"] == name] == []


@then("the set is refused")
def then_refused(log_response):
    assert log_response.status_code == 422, log_response.text
