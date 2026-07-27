import pytest
from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/register.feature")


@pytest.fixture()
def ctx():
    return {}


@given(parsers.parse('an account "{username}" with password "{password}"'))
def given_account(unauthed_client, username, password):
    resp = unauthed_client.post(
        "/auth/register", json={"username": username, "password": password}
    )
    assert resp.status_code == 201, resp.text


@when(parsers.parse('I register as "{username}" with password "{password}"'))
def when_register(unauthed_client, ctx, username, password):
    ctx["response"] = unauthed_client.post(
        "/auth/register", json={"username": username, "password": password}
    )


@when(parsers.parse('I log in as "{username}" with password "{password}"'))
def when_login(unauthed_client, ctx, username, password):
    ctx["response"] = unauthed_client.post(
        "/auth/login", json={"username": username, "password": password}
    )


@then(parsers.parse("I am refused with {code:d}"))
def then_refused(ctx, code):
    assert ctx["response"].status_code == code, ctx["response"].text


@then("I receive an access token")
def then_receive_token(ctx):
    assert ctx["response"].status_code in (200, 201), ctx["response"].text
    body = ctx["response"].json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    ctx["token"] = body["access_token"]


@then("I can create a workout with that token")
def then_create_with_token(unauthed_client, ctx):
    resp = unauthed_client.post(
        "/workouts", json={}, headers={"Authorization": f"Bearer {ctx['token']}"}
    )
    assert resp.status_code == 201, resp.text
