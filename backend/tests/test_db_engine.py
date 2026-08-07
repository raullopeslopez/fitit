"""The connection pool has to survive a long rest between sets.

Neon closes an idle connection after roughly five minutes. SQLAlchemy's pool
does not notice, so the next request gets a dead connection and dies on its
first query with `asyncpg InterfaceError: connection is closed` — a 500, and a
set the user performed that never reaches the database.

Seen in production on 2026-08-07: two logged sets lost that way, each after a
rest of a little over six minutes (15:09:51 and 15:31:51 UTC).

These assertions read private pool attributes because SQLAlchemy exposes no
public getter for them. They are checking configuration, not behaviour: the
suite runs on in-memory SQLite and can never reproduce a dropped Neon socket.
"""

from app.db import engine

pool = engine.sync_engine.pool


def test_the_pool_checks_a_connection_is_alive_before_handing_it_out():
    assert pool._pre_ping is True


def test_the_pool_retires_a_connection_before_neon_drops_it():
    # Under Neon's ~5 min idle cutoff, so the pre-ping almost never has to fire.
    assert pool._recycle == 240
