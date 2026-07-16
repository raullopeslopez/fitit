import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth import get_current_user
from app.db import get_session
from app.main import app
from app.models import Base


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
        app.dependency_overrides[get_current_user] = lambda: "test-user"
    return engine


@pytest.fixture()
def client():
    """Authenticated client — auth is bypassed so business-logic specs don't
    need to carry tokens."""
    engine = _install_overrides(bypass_auth=True)
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    asyncio.run(engine.dispose())


@pytest.fixture()
def unauthed_client():
    """Client with real auth enforced — for exercising login and route protection."""
    engine = _install_overrides(bypass_auth=False)
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    asyncio.run(engine.dispose())
