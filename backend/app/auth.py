from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from .config import settings

# tokenUrl is only used by the docs "Authorize" button; login is a JSON endpoint.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


# bcrypt raises on anything longer, rather than truncating it itself.
BCRYPT_MAX_BYTES = 72


def _for_bcrypt(password: str) -> bytes:
    """Clamp to what bcrypt accepts, in bytes rather than characters.

    The app is in Spanish and an accented character costs two bytes in UTF-8,
    so an ordinary-looking passphrase crosses the limit sooner than its length
    suggests. Registration rejects those outright (see RegisterIn) so nobody's
    password is silently shortened; this clamp is the floor under everything
    else — above all the migration that seeds the first account straight from
    AUTH_PASSWORD, which runs as the container's start command, where a raised
    exception isn't a failed request but an app that never boots.

    Slicing bytes can cut a character in half. bcrypt hashes bytes and never
    decodes them, and hashing and verifying slice identically, so the halves
    match each other — which is all that has to hold.
    """
    return password.encode()[:BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_for_bcrypt(password), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(_for_bcrypt(password), password_hash.encode())


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def get_current_user(token: str = Depends(oauth2_scheme)) -> int:
    error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise error from exc
    subject = payload.get("sub")
    if subject is None:
        raise error
    try:
        return int(subject)
    except ValueError as exc:
        # Covers tokens signed before the switch from username to user id.
        raise error from exc
