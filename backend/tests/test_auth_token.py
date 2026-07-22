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
