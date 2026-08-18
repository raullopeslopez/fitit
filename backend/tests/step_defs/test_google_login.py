"""Google sign-in, driven by tokens this test signs itself.

Nothing here reaches Google. A test keypair stands in for Google's, the router's
key lookup is pointed at its public half, and every scenario builds the ID token
it wants — including the malformed ones, which is the only way to spec a
rejection at all.
"""

import asyncio
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from pytest_bdd import given, parsers, scenarios, then, when
from sqlalchemy import select

from app import google
from app.config import settings
from app.models import User

scenarios("../features/google_login.feature")

CLIENT_ID = "fitit-test.apps.googleusercontent.com"

# One keypair for the whole module: RSA generation is the slowest thing in this
# file by an order of magnitude, and every scenario wants the same "Google".
_GOOGLE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_IMPOSTOR_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _id_token(email, *, audience=CLIENT_ID, verified=True, key=_GOOGLE_KEY):
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "iss": "https://accounts.google.com",
            "aud": audience,
            # Google's stable per-user id. Deriving it from the email keeps the
            # same person coming back as the same person across scenarios.
            "sub": f"google-uid-{email}",
            "email": email,
            "email_verified": verified,
            "iat": now,
            "exp": now + timedelta(hours=1),
        },
        key,
        algorithm="RS256",
    )


@pytest.fixture(autouse=True)
def _google_stands_in(monkeypatch):
    """Point the verifier at the test keypair and give it a client id to expect."""
    monkeypatch.setattr(settings, "google_client_id", CLIENT_ID)
    monkeypatch.setattr(google, "signing_key", lambda token: _GOOGLE_KEY.public_key())


@pytest.fixture()
def ctx():
    return {}


def _sign_in(client, token):
    return client.post("/auth/google", json={"credential": token})


def _log_workout(client, token):
    resp = client.post("/workouts", json={}, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 201, resp.text


@when(parsers.parse('I sign in with Google as "{email}"'))
def when_sign_in(unauthed_client, ctx, email):
    ctx["response"] = _sign_in(unauthed_client, _id_token(email))


@when(parsers.parse('I sign in with Google as "{email}" without verifying the email'))
def when_sign_in_unverified(unauthed_client, ctx, email):
    ctx["response"] = _sign_in(unauthed_client, _id_token(email, verified=False))


@when("I sign in with a Google token signed by somebody else")
def when_sign_in_forged(unauthed_client, ctx):
    ctx["response"] = _sign_in(unauthed_client, _id_token("ladrona@gmail.com", key=_IMPOSTOR_KEY))


@when("I sign in with a Google token issued for another app")
def when_sign_in_wrong_audience(unauthed_client, ctx):
    ctx["response"] = _sign_in(
        unauthed_client,
        _id_token("amiga@gmail.com", audience="otra-app.apps.googleusercontent.com"),
    )


@when(parsers.parse('I log in as "{username}" with password "{password}"'))
def when_login(unauthed_client, ctx, username, password):
    ctx["response"] = unauthed_client.post(
        "/auth/login", json={"username": username, "password": password}
    )


@given(parsers.parse('I signed in with Google as "{email}" and logged a workout'))
def given_signed_in_with_workout(unauthed_client, email):
    resp = _sign_in(unauthed_client, _id_token(email))
    assert resp.status_code in (200, 201), resp.text
    _log_workout(unauthed_client, resp.json()["access_token"])


@given(parsers.parse('an account "{username}" with email "{email}" that logged a workout'))
def given_password_account_with_email(unauthed_client, db_sessionmaker, username, email):
    resp = unauthed_client.post(
        "/auth/register", json={"username": username, "password": "s3cretpass"}
    )
    assert resp.status_code == 201, resp.text
    _log_workout(unauthed_client, resp.json()["access_token"])

    # No HTTP route writes this, on purpose: an email nobody checked is not
    # something a Google sign-in may adopt an account by.
    async def _set_email():
        async with db_sessionmaker() as session:
            user = await session.scalar(select(User).where(User.username == username))
            user.email = email
            await session.commit()

    asyncio.run(_set_email())


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
    _log_workout(unauthed_client, ctx["token"])


@then(parsers.parse("that token sees {count:d} workout"))
def then_token_sees(unauthed_client, ctx, count):
    resp = unauthed_client.get("/workouts", headers={"Authorization": f"Bearer {ctx['token']}"})
    assert resp.status_code == 200, resp.text
    assert len(resp.json()) == count, resp.json()
