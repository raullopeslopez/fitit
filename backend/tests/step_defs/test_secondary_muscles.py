from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/secondary_muscles.feature")


@given(parsers.parse('I logged "{name}" in a workout'))
def given_logged(client, name):
    workout = client.post("/workouts", json={})
    assert workout.status_code == 201, workout.text
    # Cardio is the one kind the classifier treats differently, and the metrics
    # the router accepts depend on it, so it has to be logged as cardio rather
    # than guessed from the name.
    cardio = name.lower() in {"cinta", "bici", "remo ergómetro"}
    body = (
        {"exercise_name": name, "kind": "cardio", "duration_seconds": 1800}
        if cardio
        else {"exercise_name": name, "reps": 8, "weight": 60}
    )
    logged = client.post(f"/workouts/{workout.json()['id']}/sets", json=body)
    assert logged.status_code == 201, logged.text


@when("I ask for my days", target_fixture="days_response")
def when_ask_days(client):
    return client.get("/days")


def _set_named(days_response, name):
    assert days_response.status_code == 200, days_response.text
    for day in days_response.json():
        for workout in day["workouts"]:
            for entry in workout["sets"]:
                if entry["exercise_name"].lower() == name.lower():
                    return entry
    raise AssertionError(f"no set for {name!r} in {days_response.json()}")


@then(parsers.parse('the set for "{name}" is primarily "{group}"'))
def then_primary_is(days_response, name, group):
    assert _set_named(days_response, name)["muscle_group"] == group


@then(parsers.parse('the set for "{name}" has no muscle group'))
def then_no_primary(days_response, name):
    assert _set_named(days_response, name)["muscle_group"] is None


@then(parsers.parse('it trains exactly "{first}" plus "{second}"'))
def then_also_trains_two(days_response, first, second):
    secondaries = _last_set(days_response)["secondary_groups"]
    assert sorted(secondaries) == sorted([first, second]), secondaries


@then(parsers.parse('it also trains "{group}"'))
def then_also_trains(days_response, group):
    secondaries = _last_set(days_response)["secondary_groups"]
    assert group in secondaries, secondaries


@then(parsers.parse('it does not also train "{group}"'))
def then_not_also_trains(days_response, group):
    secondaries = _last_set(days_response)["secondary_groups"]
    assert group not in secondaries, secondaries


@then("it trains nothing else")
def then_trains_nothing_else(days_response):
    assert _last_set(days_response)["secondary_groups"] == []


def _last_set(days_response):
    """The only set in the log — every scenario here logs exactly one."""
    assert days_response.status_code == 200, days_response.text
    entries = [
        entry
        for day in days_response.json()
        for workout in day["workouts"]
        for entry in workout["sets"]
    ]
    assert len(entries) == 1, entries
    return entries[0]
