"""The weight_kg backfill must convert the rows that are already in the database.

conftest builds the schema with Base.metadata.create_all, so no other test runs
a migration at all — f1c6b3d80e57 first executed against real data on deploy.
The arithmetic in that backfill is the one thing in this change that can't be
re-run: get it wrong and every historical pound-logged set is silently wrong by
a factor of 2.2, with no error anywhere.

The full chain can't be replayed here (b7f3c2a10d94 uses `ALTER COLUMN ... SET
NOT NULL`, which SQLite rejects), so this drives the one migration's `upgrade`
directly against a table built in its `down_revision` shape. That covers the
column and the backfill SQL — the parts that touch data.
"""

import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text

from app.units import to_kg

BACKEND = Path(__file__).resolve().parents[2]
MIGRATION = BACKEND / "alembic" / "versions" / "f1c6b3d80e57_add_set_weight_kg.py"

# The `sets` table as of d9a4b7e31c62, trimmed to the columns the migration
# reads. Anything else is irrelevant to the backfill.
PRIOR_SCHEMA = """
CREATE TABLE sets (
    id INTEGER PRIMARY KEY,
    weight FLOAT,
    unit VARCHAR(4)
)
"""


def _load_migration():
    spec = importlib.util.spec_from_file_location("migration_f1c6b3d80e57", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def migrated():
    """Rows as they'd sit in the database before the migration, then upgraded."""
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text(PRIOR_SCHEMA))
        conn.execute(
            text("INSERT INTO sets (id, weight, unit) VALUES (:i, :w, :u)"),
            [
                {"i": 1, "w": 100.0, "u": "kg"},  # already canonical
                {"i": 2, "w": 135.0, "u": "lb"},  # needs converting
                {"i": 3, "w": 0.0, "u": "lb"},  # bodyweight: real value, not absence
                {"i": 4, "w": None, "u": "kg"},  # cardio: no weight at all
            ],
        )
        context = MigrationContext.configure(conn)
        with Operations.context(context):
            _load_migration().upgrade()

        rows = conn.execute(text("SELECT id, weight, unit, weight_kg FROM sets")).all()
    engine.dispose()
    return {row.id: row for row in rows}


def test_kilo_rows_carry_across_unchanged(migrated):
    assert migrated[1].weight_kg == 100.0


def test_pound_rows_are_converted(migrated):
    assert migrated[2].weight_kg == pytest.approx(61.235, abs=0.001)


def test_the_backfill_matches_what_the_app_writes_for_new_sets(migrated):
    # The migration hardcodes its multiplier in SQL and the app computes one in
    # Python. If those ever drift, a set logged before the migration and the
    # identical set logged after it stop comparing equal.
    assert migrated[2].weight_kg == pytest.approx(to_kg(135.0, "lb"))


def test_bodyweight_zero_stays_zero_rather_than_null(migrated):
    assert migrated[3].weight_kg == 0.0


def test_weightless_cardio_rows_stay_null(migrated):
    assert migrated[4].weight_kg is None


def test_the_typed_number_is_never_rewritten(migrated):
    # The whole design rests on `weight`/`unit` being untouched provenance —
    # a relabel reads them back, so a migration that "helpfully" normalised
    # them would break corrections for every pre-existing set.
    assert (migrated[2].weight, migrated[2].unit) == (135.0, "lb")
