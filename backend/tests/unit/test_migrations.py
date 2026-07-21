"""The migration history must stay linear.

conftest builds the test schema with Base.metadata.create_all, so nothing in
the suite otherwise walks the alembic chain — a migration that branches off a
stale parent passes every test here and only fails in CI, at
`alembic upgrade head`, with "Multiple head revisions are present".

This reads the scripts offline; no database required.
"""

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

BACKEND = Path(__file__).resolve().parents[2]


def _scripts() -> ScriptDirectory:
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "alembic"))
    return ScriptDirectory.from_config(config)


def test_migrations_have_exactly_one_head():
    heads = _scripts().get_heads()
    assert len(heads) == 1, (
        f"branched migration history: {heads}. A new migration must set "
        "down_revision to the current head, not to whichever revision you "
        "happened to open."
    )


def test_every_migration_is_reachable_from_base():
    scripts = _scripts()
    (head,) = scripts.get_heads()
    walked = {script.revision for script in scripts.walk_revisions("base", head)}
    on_disk = {script.revision for script in scripts.walk_revisions()}
    assert walked == on_disk, f"orphaned migrations: {sorted(on_disk - walked)}"
