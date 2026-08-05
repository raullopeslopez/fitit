from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/exercise_note.feature")


def _exercise(client, name):
    return next((e for e in client.get("/exercises").json() if e["name"] == name), None)


@given(parsers.parse('an exercise "{name}"'), target_fixture="exercise")
def given_exercise(client, name):
    resp = client.post("/exercises", json={"name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _patch(client, name, body):
    resp = client.patch(f"/exercises/{_exercise(client, name)['id']}", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()


@when(parsers.parse('I note "{note}" on "{name}"'))
def when_note(client, name, note):
    _patch(client, name, {"note": note})


@when(parsers.parse('I clear the note on "{name}"'))
def when_clear_note(client, name):
    _patch(client, name, {"note": None})


@when(parsers.parse('I re-tag "{name}" as "{group}"'))
def when_retag(client, name, group):
    _patch(client, name, {"muscle_group": group})


@then(parsers.parse('"{name}" carries the note "{note}"'))
def then_note(client, name, note):
    assert _exercise(client, name)["note"] == note


@then(parsers.parse('"{name}" carries no note'))
def then_no_note(client, name):
    assert _exercise(client, name)["note"] is None
