import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import create_access_token, hash_password, verify_password
from ..db import get_session
from ..google import InvalidGoogleToken, verify_id_token
from ..models import User
from ..schemas import GoogleCredentialIn, LoginIn, RegisterIn, TokenOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterIn, session: AsyncSession = Depends(get_session)) -> TokenOut:
    """Create an account and log straight in — one form, immediately in."""
    existing = await session.scalar(
        select(User).where(func.lower(User.username) == payload.username.lower())
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="username already taken")
    user = User(username=payload.username, password_hash=hash_password(payload.password))
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return TokenOut(access_token=create_access_token(user.id))


@router.post("/login", response_model=TokenOut)
async def login(payload: LoginIn, session: AsyncSession = Depends(get_session)) -> TokenOut:
    user = await session.scalar(
        select(User).where(func.lower(User.username) == payload.username.lower())
    )
    # `password_hash` is null for an account that only ever came in through
    # Google. There is no password to be wrong, so this is a miss, not a crash.
    if (
        user is None
        or user.password_hash is None
        or not verify_password(payload.password, user.password_hash)
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")
    return TokenOut(access_token=create_access_token(user.id))


async def _free_username(session: AsyncSession, email: str) -> str:
    """A first username for someone who never chose one.

    Google gives an email and a display name, neither of which is a username.
    The local part is the closest thing to what the person would have typed,
    and it is only a starting point: it shows in the app and they can be told
    to change it, but it has to be unique on the first try or the sign-in they
    were promised takes one tap fails on a stranger's name.
    """
    stem = re.sub(r"[^a-z0-9._-]", "", email.split("@")[0].lower())[:70] or "atleta"
    candidate = stem
    suffix = 1
    while await session.scalar(select(User.id).where(func.lower(User.username) == candidate)):
        suffix += 1
        candidate = f"{stem}{suffix}"
    return candidate


@router.post("/google", response_model=TokenOut)
async def google_sign_in(
    payload: GoogleCredentialIn, session: AsyncSession = Depends(get_session)
) -> TokenOut:
    """Trade a Google ID token for one of ours — registering on first sight.

    There is no separate "sign up with Google": the first tap creates the
    account and every tap after it opens the same one. What the tap must never
    do is open a *different* one, so the lookup goes in order of how much the
    identity is worth: Google's immutable `sub` first, then the email, which is
    how an account that predates all this gets adopted rather than shadowed by
    an empty twin.
    """
    try:
        identity = verify_id_token(payload.credential)
    except InvalidGoogleToken as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid google credential",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user = await session.scalar(select(User).where(User.google_sub == identity.subject))
    if user is None:
        user = await session.scalar(select(User).where(func.lower(User.email) == identity.email))
        if user is not None:
            # Known account, first time through Google: bind the `sub` so a
            # later Gmail address change still lands here.
            user.google_sub = identity.subject
        else:
            user = User(
                username=await _free_username(session, identity.email),
                email=identity.email,
                google_sub=identity.subject,
                password_hash=None,
            )
            session.add(user)
        await session.commit()
        await session.refresh(user)

    return TokenOut(access_token=create_access_token(user.id))
