"""Token rejection paths in app.auth.get_current_user.

The auth feature covers login and the no-token case; these cover a malformed
token and a validly-signed token that carries no subject — both must be a 401,
never a 500.
"""

import jwt

from app.config import settings


def test_a_malformed_token_is_rejected(unauthed_client):
    r = unauthed_client.post(
        "/workouts", json={}, headers={"Authorization": "Bearer not-a-real-jwt"}
    )
    assert r.status_code == 401, r.text
    assert r.headers.get("WWW-Authenticate") == "Bearer"


def test_a_token_without_a_subject_is_rejected(unauthed_client):
    # Correctly signed, but no `sub` claim -> no user to authenticate as.
    token = jwt.encode(
        {"foo": "bar"}, settings.jwt_secret, algorithm=settings.jwt_algorithm
    )
    r = unauthed_client.post(
        "/workouts", json={}, headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 401, r.text


def test_a_token_carrying_a_username_instead_of_a_user_id_is_rejected(unauthed_client):
    """The subject used to be the username; it is the user's id now.

    Every token issued before that switch is still validly signed and still
    within its week-long expiry, so it arrives looking legitimate and is only
    caught by what `sub` holds. This is the deploy itself: the session open on
    a phone the moment this ships lands here. It has to be a clean 401 — the
    app drops to the login screen and one sign-in fixes it — and never a 500,
    which is `int("raul")` crashing the request instead.
    """
    token = jwt.encode(
        {"sub": "raul"}, settings.jwt_secret, algorithm=settings.jwt_algorithm
    )
    r = unauthed_client.post(
        "/workouts", json={}, headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 401, r.text
    assert r.headers.get("WWW-Authenticate") == "Bearer"


def test_logging_in_as_a_user_who_does_not_exist_is_refused(unauthed_client):
    r = unauthed_client.post(
        "/auth/login", json={"username": "nobody", "password": "s3cretpass"}
    )
    assert r.status_code == 401, r.text
