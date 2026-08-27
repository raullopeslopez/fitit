from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/manage_exercises.feature")


def _exercise(client, name):
    return next((e for e in client.get("/exercises").json() if e["name"] == name), None)


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


@when(parsers.parse('I log a set of {reps:d} reps at {weight:g} kg for "{name}"'))
def when_log_set(client, workout, name, reps, weight):
    resp = client.post(
        f"/workouts/{workout['id']}/sets",
        json={"exercise_name": name, "reps": reps, "weight": weight},
    )
    assert resp.status_code == 201, resp.text


@when(parsers.parse('I delete the exercise "{name}"'))
def when_delete_exercise(client, name):
    resp = client.delete(f"/exercises/{_exercise(client, name)['id']}")
    assert resp.status_code == 204, resp.text


@when(parsers.parse('I merge "{source}" into "{target}"'))
def when_merge_exercise(client, source, target):
    resp = client.post(
        f"/exercises/{_exercise(client, source)['id']}/merge",
        json={"into_id": _exercise(client, target)["id"]},
    )
    assert resp.status_code == 200, resp.text


@when(parsers.parse('I try to rename "{name}" to "{new_name}"'), target_fixture="refusal")
def when_try_rename(client, name, new_name):
    """Kept as a fixture rather than asserted here: the point of these scenarios
    is what the refusal carries, not that it happened."""
    return client.patch(f"/exercises/{_exercise(client, name)['id']}", json={"name": new_name})


@then(parsers.parse('the rename is refused, pointing at "{name}"'))
def then_refusal_points_at(client, refusal, name):
    assert refusal.status_code == 409, refusal.text
    clash = refusal.json()["detail"]["exercise"]
    assert clash["name"] == name
    # The id is the whole point: it is what a merge would be aimed at.
    assert clash["id"] == _exercise(client, name)["id"]


@then(parsers.parse("merging there would move {count:d} sets"))
def then_refusal_counts_sets(refusal, count):
    assert refusal.json()["detail"]["exercise"]["set_count"] == count


@then(parsers.parse('"{name}" is not in my exercises'))
def then_exercise_gone(client, name):
    assert _exercise(client, name) is None


@then("the workout has no sets left")
def then_workout_empty(client, workout):
    assert client.get(f"/workouts/{workout['id']}").json()["sets"] == []


@then(parsers.parse('"{name}" has {count:d} sets'))
@then(parsers.parse('"{name}" has {count:d} set'))
def then_set_count(client, workout, name, count):
    sets = client.get(f"/workouts/{workout['id']}").json()["sets"]
    assert len([s for s in sets if s["exercise_name"] == name]) == count
