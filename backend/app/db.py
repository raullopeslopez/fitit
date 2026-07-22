from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import settings

# Lazy: does not open a connection until a session is actually used.
engine = create_async_engine(settings.database_url, future=True)
SessionMaker = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:  # pragma: no cover
    # The real Postgres session. Every test overrides this dependency with an
    # in-memory SQLite session (see tests/conftest.py), so this body only runs
    # against a live database.
    async with SessionMaker() as session:
        yield session
