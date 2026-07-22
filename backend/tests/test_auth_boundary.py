"""The token side of auth. auth.feature covers login and the no-token case;
these cover how a *presented* token is refused — malformed, forged, expired, or
carrying no subject. That refusal (get_current_user -> 401) is the guard on
every protected route, so it earns direct tests.
"""

from datetime import datetime, timedelta, timezone

import jwt

from app.config import settings


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(claims: dict, *, secret: str | None = None) -> str:
    return jwt.encode(
        claims, secret or settings.jwt_secret, algorithm=settings.jwt_algorithm
    )


def test_a_malformed_token_is_refused(unauthed_client):
    resp = unauthed_client.get("/days", headers=_bearer("not-a-jwt"))
    assert resp.status_code == 401, resp.text


def test_a_token_signed_with_the_wrong_secret_is_refused(unauthed_client):
    forged = _token(
        {"sub": "raul", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
        secret="not-the-real-secret",
    )
    resp = unauthed_client.get("/days", headers=_bearer(forged))
    assert resp.status_code == 401, resp.text


def test_an_expired_token_is_refused(unauthed_client):
    expired = _token(
        {"sub": "raul", "exp": datetime.now(timezone.utc) - timedelta(minutes=1)}
    )
    resp = unauthed_client.get("/days", headers=_bearer(expired))
    assert resp.status_code == 401, resp.text


def test_a_token_without_a_subject_is_refused(unauthed_client):
    # Correctly signed and unexpired, but carries no "sub": there is no user to
    # act as, so it is not a usable session.
    subjectless = _token({"exp": datetime.now(timezone.utc) + timedelta(minutes=5)})
    resp = unauthed_client.get("/days", headers=_bearer(subjectless))
    assert resp.status_code == 401, resp.text
