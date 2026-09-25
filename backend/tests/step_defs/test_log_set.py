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
        json={"exercise_name": name, "reps": reps, "weight": weight},
    )


@when(
    parsers.parse(
        'I log a set of {reps:d} reps at {weight:g} kg for "{name}" with client id "{client_id}"'
    ),
    target_fixture="log_response",
)
def when_log_set_with_client_id(client, workout, name, reps, weight, client_id, request):
    resp = client.post(
        f"/workouts/{workout['id']}/sets",
        json={"exercise_name": name, "reps": reps, "weight": weight, "client_id": client_id},
    )
    # Every response in order, so a scenario can tell the first answer from the retry's.
    request.node.__dict__.setdefault("log_responses", []).append(resp)
    return resp


@then("the retry is answered as already logged")
def then_retry_answered(request):
    first, retry = request.node.log_responses
    assert first.status_code == 201, first.text
    # 200, not 201: nothing was created. Still a success, so the queue drops it.
    assert retry.status_code == 200, retry.text
    assert retry.json() == first.json()


@then(parsers.re(r'the workout contains (?P<count>\d+) sets? for "(?P<name>[^"]+)"'))
def then_set_count(log_response, count, name):
    count = int(count)
    assert log_response.status_code in (200, 201), log_response.text
    body = log_response.json()
    matching = [s for s in body["sets"] if s["exercise_name"] == name]
    assert len(matching) == count


@then(parsers.parse("that set records {reps:d} reps at {weight:g} kg"))
def then_set_values(log_response, reps, weight):
    last_set = log_response.json()["sets"][-1]
    assert last_set["reps"] == reps
    assert last_set["weight"] == weight
