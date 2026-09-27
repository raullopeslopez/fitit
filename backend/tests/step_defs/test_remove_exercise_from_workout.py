from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/remove_exercise_from_workout.feature")


def _workout_with(client, *names):
    workout = client.post("/workouts", json={})
    assert workout.status_code == 201, workout.text
    workout_id = workout.json()["id"]
    exercise_ids = {}
    for name in names:
        for reps in (8, 6):
            logged = client.post(
                f"/workouts/{workout_id}/sets",
                json={"exercise_name": name, "reps": reps, "weight": 60},
            )
            assert logged.status_code == 201, logged.text
            exercise_ids[name] = logged.json()["sets"][-1]["exercise_id"]
    return workout_id, exercise_ids


def _sets_for(client, workout_id, name):
    workout = client.get(f"/workouts/{workout_id}")
    assert workout.status_code == 200, workout.text
    return [s for s in workout.json()["sets"] if s["exercise_name"] == name]


@given(parsers.parse('"{name}" logged in two workouts'), target_fixture="ctx")
def given_two_workouts(client, name):
    first, ids = _workout_with(client, name)
    second, _ = _workout_with(client, name)
    return {"first": first, "second": second, "ids": ids}


@given(
    parsers.parse('a workout with sets for "{a}" and "{b}"'),
    target_fixture="ctx",
)
def given_workout_with_two(client, a, b):
    workout_id, ids = _workout_with(client, a, b)
    return {"first": workout_id, "ids": ids}


def _remove(client, ctx, workout_id, exercise_id):
    ctx["response"] = client.delete(f"/workouts/{workout_id}/exercises/{exercise_id}")


@when(parsers.parse('I remove "{name}" from the first workout'))
@when(parsers.parse('I remove "{name}" from that workout'))
def when_remove(client, ctx, name):
    _remove(client, ctx, ctx["first"], ctx["ids"][name])


@when(parsers.parse('I remove "{name}" from workout {workout_id:d}'))
def when_remove_from_missing(client, ctx, name, workout_id):
    _remove(client, ctx, workout_id, ctx["ids"][name])


@when(parsers.parse("I remove exercise {exercise_id:d} from the first workout"))
def when_remove_missing_exercise(client, ctx, exercise_id):
    _remove(client, ctx, ctx["first"], exercise_id)


@then(parsers.parse('the first workout contains no sets for "{name}"'))
def then_first_empty(client, ctx, name):
    assert ctx["response"].status_code == 204, ctx["response"].text
    assert _sets_for(client, ctx["first"], name) == []


@then(parsers.parse('the second workout still has its sets for "{name}"'))
def then_second_kept(client, ctx, name):
    assert len(_sets_for(client, ctx["second"], name)) == 2


@then(parsers.parse('that workout still has its sets for "{name}"'))
def then_same_workout_kept(client, ctx, name):
    assert ctx["response"].status_code == 204, ctx["response"].text
    kept = _sets_for(client, ctx["first"], name)
    assert len(kept) == 2
    # No holes left where the removed sets were: the next set logged takes its
    # index from the count, and a hole would make it collide.
    workout = client.get(f"/workouts/{ctx['first']}").json()
    assert sorted(s["set_index"] for s in workout["sets"]) == [0, 1]


@then(parsers.parse('"{name}" is still an exercise'))
def then_exercise_kept(client, name):
    names = [e["name"] for e in client.get("/exercises").json()]
    assert name in names


@then(parsers.parse("the answer is {code:d}"))
def then_status(ctx, code):
    assert ctx["response"].status_code == code, ctx["response"].text
