"""bcrypt refuses anything over 72 bytes, and the app is in Spanish.

An accented character costs two bytes in UTF-8, so "contraseña" x 8 is 80
characters but 88 bytes — a passphrase a Spanish speaker would consider
ordinary lands past the limit well before it looks long. Neither path may
answer that with a 500: registering says so (422), logging in just fails
(401), and the seeding migration must never crash the container it boots.
"""

import pytest

from app.auth import hash_password, verify_password

# 80 characters, 88 bytes.
ACCENTED_OVER_LIMIT = "contraseña" * 8
ASCII_OVER_LIMIT = "a" * 100


def test_registering_with_an_over_long_password_is_rejected_not_a_crash(unauthed_client):
    r = unauthed_client.post(
        "/auth/register", json={"username": "bob", "password": ASCII_OVER_LIMIT}
    )
    assert r.status_code == 422, r.text


def test_an_accented_passphrase_over_the_byte_limit_is_rejected_too(unauthed_client):
    # 80 characters — short enough to look fine, long enough in bytes to break bcrypt.
    r = unauthed_client.post(
        "/auth/register", json={"username": "ana", "password": ACCENTED_OVER_LIMIT}
    )
    assert r.status_code == 422, r.text


def test_an_accented_passphrase_within_the_limit_still_works(unauthed_client):
    # 30 characters, 60 bytes — comfortably under, and must not be rejected.
    r = unauthed_client.post(
        "/auth/register", json={"username": "ana", "password": "contraseña" * 3}
    )
    assert r.status_code == 201, r.text


def test_logging_in_with_an_over_long_password_is_a_refusal_not_a_crash(unauthed_client):
    created = unauthed_client.post(
        "/auth/register", json={"username": "raul", "password": "s3cretpass"}
    )
    assert created.status_code == 201, created.text

    r = unauthed_client.post(
        "/auth/login", json={"username": "raul", "password": ASCII_OVER_LIMIT}
    )
    assert r.status_code == 401, r.text


@pytest.mark.parametrize("password", [ASCII_OVER_LIMIT, ACCENTED_OVER_LIMIT])
def test_hashing_an_over_long_password_never_raises(password):
    """The seeding migration hashes AUTH_PASSWORD straight from the env. It runs
    as the container's start command, so an exception here isn't a failed
    request — it's an app that won't boot."""
    assert hash_password(password)


def test_verifying_an_over_long_password_never_raises():
    assert verify_password(ASCII_OVER_LIMIT, hash_password("s3cretpass")) is False
