import pytest
from pytest_bdd import given, parsers, scenarios, then, when

from app.config import settings

scenarios("../features/auth.feature")


@pytest.fixture()
def ctx():
    return {}


@given(
    parsers.parse('the app is configured with username "{username}" and password "{password}"')
)
def given_configured(monkeypatch, username, password):
    monkeypatch.setattr(settings, "auth_username", username)
    monkeypatch.setattr(settings, "auth_password", password)


@when("I create a workout without logging in")
def when_create_no_login(unauthed_client, ctx):
    ctx["response"] = unauthed_client.post("/workouts", json={})


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
    assert ctx["response"].status_code == 200, ctx["response"].text
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
