from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import settings

# Lazy: does not open a connection until a session is actually used.
#
# Neon hangs up on an idle connection after about five minutes, and a rest that
# long between two sets is ordinary training, not an edge case. Without these
# the pool hands out the dead socket and the request 500s on its first query,
# losing a set the user actually performed. See tests/test_db_engine.py.
engine = create_async_engine(
    settings.database_url,
    future=True,
    pool_pre_ping=True,  # cheap liveness check; swaps a dead connection for a fresh one
    pool_recycle=240,  # retire under Neon's cutoff, so the pre-ping rarely has to fire
)
SessionMaker = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:  # pragma: no cover
    # The real Postgres session. Every test overrides this dependency with an
    # in-memory SQLite session (see tests/conftest.py), so this body only runs
    # against a live database.
    async with SessionMaker() as session:
        yield session
