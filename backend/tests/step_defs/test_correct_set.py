from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/correct_set.feature")


@given(
    parsers.parse('a logged set of {reps:d} reps at {weight:g} kg for "{name}"'),
    target_fixture="logged_set",
)
def given_logged_set(client, reps, weight, name):
    workout = client.post("/workouts", json={})
    assert workout.status_code == 201, workout.text
    workout_id = workout.json()["id"]
    logged = client.post(
        f"/workouts/{workout_id}/sets",
        json={"exercise_name": name, "reps": reps, "weight": weight},
    )
    assert logged.status_code == 201, logged.text
    return {
        "workout_id": workout_id,
        "set_id": logged.json()["sets"][-1]["id"],
        "exercise_name": name,
        "reps": reps,
    }


@when(parsers.parse("I change that set to {weight:g} kg"))
def when_change_weight(client, logged_set, weight):
    logged_set["response"] = client.patch(
        f"/workouts/sets/{logged_set['set_id']}",
        json={
            "exercise_name": logged_set["exercise_name"],
            "reps": logged_set["reps"],
            "weight": weight,
            "unit": "kg",
        },
    )


@when("I delete that set")
def when_delete_set(client, logged_set):
    logged_set["response"] = client.delete(f"/workouts/sets/{logged_set['set_id']}")


@then(parsers.parse("that set records {reps:d} reps at {weight:g} kg"))
def then_set_records(logged_set, reps, weight):
    resp = logged_set["response"]
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["reps"] == reps
    assert body["weight"] == weight


@then(parsers.parse('the workout contains no sets for "{name}"'))
def then_no_sets(client, logged_set, name):
    assert logged_set["response"].status_code == 204, logged_set["response"].text
    workout = client.get(f"/workouts/{logged_set['workout_id']}")
    assert workout.status_code == 200, workout.text
    assert [s for s in workout.json()["sets"] if s["exercise_name"] == name] == []
