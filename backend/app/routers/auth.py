from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import create_access_token, hash_password, verify_password
from ..db import get_session
from ..models import User
from ..schemas import LoginIn, RegisterIn, TokenOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterIn, session: AsyncSession = Depends(get_session)
) -> TokenOut:
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
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials"
        )
    return TokenOut(access_token=create_access_token(user.id))
