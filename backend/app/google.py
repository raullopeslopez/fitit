"""Verifying the ID token Google hands the browser.

The browser does the whole OAuth dance with Google and comes back holding a
signed JWT. Nothing in it can be trusted until the signature is checked against
Google's own keys, so this module is the only place the token is believed, and
it refuses on anything short of a full match.
"""

from dataclasses import dataclass

import jwt

from .config import settings

# Google publishes both spellings in `iss` and has never committed to one.
ISSUERS = frozenset({"https://accounts.google.com", "accounts.google.com"})
JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"


class InvalidGoogleToken(Exception):
    """The token is not a live, unmodified Google token issued for this app."""


@dataclass(frozen=True)
class GoogleIdentity:
    """The two claims we act on, once the signature has earned them."""

    subject: str
    email: str


# Google rotates its signing keys every few days and the client caches them
# between rotations, so this is one network round trip a week, not one a login.
_jwks_client = jwt.PyJWKClient(JWKS_URL, cache_keys=True)


def signing_key(token: str):
    """The public key Google signed this token with.

    Split out as a module-level name so tests can stand a keypair of their own
    in front of it — reaching Google's servers from a test suite that runs on
    in-memory SQLite would be the only network call in it.
    """
    return _jwks_client.get_signing_key_from_jwt(token).key


def verify_id_token(credential: str) -> GoogleIdentity:
    if not settings.google_client_id:
        raise InvalidGoogleToken("google sign-in is not configured")
    try:
        payload = jwt.decode(
            credential,
            signing_key(credential),
            algorithms=["RS256"],
            # Audience is what stops a token minted for somebody else's app from
            # opening an account here: Google signs theirs with the same keys.
            audience=settings.google_client_id,
            options={"require": ["exp", "aud", "iss", "sub"]},
        )
    except (jwt.PyJWTError, jwt.PyJWKClientError) as exc:
        raise InvalidGoogleToken(str(exc)) from exc

    if payload.get("iss") not in ISSUERS:
        raise InvalidGoogleToken("issuer is not Google")

    email = payload.get("email")
    # An unverified email is a claim, not a fact — Google says so itself — and
    # this app links accounts by email. Adopting somebody's training history on
    # the strength of an address they merely typed is the one failure that
    # would matter, so it never gets that far.
    if not email or not payload.get("email_verified"):
        raise InvalidGoogleToken("email missing or unverified")

    return GoogleIdentity(subject=str(payload["sub"]), email=email.lower())
