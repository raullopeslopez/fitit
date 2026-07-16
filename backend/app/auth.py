import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from .config import settings

# tokenUrl is only used by the docs "Authorize" button; login is a JSON endpoint.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def verify_credentials(username: str, password: str) -> bool:
    """Constant-time check against the single user configured in the env."""
    username_ok = secrets.compare_digest(username, settings.auth_username)
    password_ok = secrets.compare_digest(password, settings.auth_password)
    return username_ok and password_ok


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode(
        {"sub": subject, "exp": expire},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
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
    if not subject:
        raise error
    return subject
