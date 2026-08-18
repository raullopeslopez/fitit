import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth import get_current_user, hash_password
from app.db import get_session
from app.main import app
from app.models import Base, User


def _install_overrides(*, bypass_auth: bool):
    """Point the app at a throwaway in-memory SQLite DB (and optionally bypass
    auth). Returns the engine so the caller can dispose it.

    Tests run with zero infrastructure (no Docker, no Postgres). Production and
    local `docker compose` use Postgres; the schema is generic enough for both.
    """
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async def _create_tables() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(_create_tables())
    test_sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async def _override_session():
        async with test_sessionmaker() as session:
            yield session

    app.dependency_overrides[get_session] = _override_session
    if bypass_auth:
        # Routers filter by a real user_id FK now, so the bypass needs a real
        # row behind it — not just a placeholder subject string.
        async def _seed_user() -> int:
            async with test_sessionmaker() as session:
                user = User(username="test-user", password_hash=hash_password("test-pass"))
                session.add(user)
                await session.commit()
                await session.refresh(user)
                return user.id

        user_id = asyncio.run(_seed_user())
        app.dependency_overrides[get_current_user] = lambda: user_id
    return engine, test_sessionmaker


@pytest.fixture()
def client():
    """Authenticated client — auth is bypassed so business-logic specs don't
    need to carry tokens."""
    engine, _ = _install_overrides(bypass_auth=True)
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    asyncio.run(engine.dispose())


@pytest.fixture()
def unauthed_stack():
    """Client with real auth enforced, plus a session factory onto the same
    throwaway DB.

    The factory exists for the handful of specs that need a row the API has no
    way to write — a user's email, which is deliberately not settable over HTTP
    (see the Google sign-in router for why linking only trusts emails put there
    out of band)."""
    engine, sessionmaker = _install_overrides(bypass_auth=False)
    with TestClient(app) as test_client:
        yield test_client, sessionmaker
    app.dependency_overrides.clear()
    asyncio.run(engine.dispose())


@pytest.fixture()
def unauthed_client(unauthed_stack):
    """Client with real auth enforced — for exercising login and route protection."""
    return unauthed_stack[0]


@pytest.fixture()
def db_sessionmaker(unauthed_stack):
    """Session factory onto the same DB `unauthed_client` talks to."""
    return unauthed_stack[1]
