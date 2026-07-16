import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db import get_session
from app.main import app
from app.models import Base


@pytest.fixture()
def client():
    """A TestClient backed by a throwaway in-memory SQLite database.

    Tests run with zero infrastructure (no Docker, no Postgres). Production and
    local `docker compose` use Postgres; the schema is generic enough to run on
    both.
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
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    asyncio.run(engine.dispose())
