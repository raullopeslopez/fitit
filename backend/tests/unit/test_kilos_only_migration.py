"""e3b9c07f5a21 is the one migration that can't be undone by re-running it.

It moves `weight_kg` into `weight` and then drops the columns that would let you
tell what happened. If the copy is wrong, every weight in the log is wrong and
there is nothing left to recompute it from — the provenance is gone in the same
transaction. So the data half is tested here, directly, the same way the
weight_kg backfill is.

conftest builds the schema with Base.metadata.create_all, so no other test runs
a migration at all. This drives `upgrade` against a table in its down_revision
shape (f1c6b3d80e57).
"""

import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text

BACKEND = Path(__file__).resolve().parents[2]
MIGRATION = BACKEND / "alembic" / "versions" / "e3b9c07f5a21_kilos_only.py"

MI_TO_KM = 1.609344

# The `sets` table as of f1c6b3d80e57, trimmed to the columns this migration
# touches.
PRIOR_SCHEMA = """
CREATE TABLE sets (
    id INTEGER PRIMARY KEY,
    weight FLOAT,
    unit VARCHAR(4) NOT NULL,
    weight_kg FLOAT,
    distance FLOAT,
    distance_unit VARCHAR(4)
)
"""


def _load_migration():
    spec = importlib.util.spec_from_file_location("migration_e3b9c07f5a21", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def migrated():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text(PRIOR_SCHEMA))
        conn.execute(
            text(
                "INSERT INTO sets (id, weight, unit, weight_kg, distance, distance_unit)"
                " VALUES (:i, :w, :u, :kg, :d, :du)"
            ),
            [
                # Logged in kilos: weight already equals its canonical value.
                {"i": 1, "w": 100.0, "u": "kg", "kg": 100.0, "d": None, "du": None},
                # Logged in pounds: `weight` says 135, the truth is in weight_kg.
                {"i": 2, "w": 135.0, "u": "lb", "kg": 61.235, "d": None, "du": None},
                # Bodyweight: zero is a real value, not an absence.
                {"i": 3, "w": 0.0, "u": "lb", "kg": 0.0, "d": None, "du": None},
                # Cardio in km: no weight, distance stands as-is.
                {"i": 4, "w": None, "u": "kg", "kg": None, "d": 5.0, "du": "km"},
                # Cardio in miles: the distance itself has to be converted.
                {"i": 5, "w": None, "u": "kg", "kg": None, "d": 3.0, "du": "mi"},
            ],
        )
        context = MigrationContext.configure(conn)
        with Operations.context(context):
            _load_migration().upgrade()

        rows = conn.execute(text("SELECT id, weight, distance FROM sets")).all()
        columns = {c["name"] for c in inspect(conn).get_columns("sets")}
    engine.dispose()
    return {row.id: row for row in rows}, columns


def test_kilo_rows_keep_their_number(migrated):
    rows, _ = migrated
    assert rows[1].weight == 100.0


def test_pound_rows_become_their_canonical_kilos(migrated):
    # Not 135. The number that was typed is not the number that was lifted, and
    # after this migration only one of them can survive.
    rows, _ = migrated
    assert rows[2].weight == pytest.approx(61.235)


def test_the_copy_comes_from_weight_kg_not_a_fresh_conversion(migrated):
    # weight_kg is what every record and 1RM in the app was computed from. A
    # re-conversion here could disagree with it by a rounding step and silently
    # move marks the user has already seen.
    rows, _ = migrated
    assert rows[2].weight != 135.0


def test_bodyweight_zero_stays_zero(migrated):
    rows, _ = migrated
    assert rows[3].weight == 0.0


def test_weightless_cardio_rows_stay_null(migrated):
    rows, _ = migrated
    assert rows[4].weight is None


def test_kilometre_distances_are_left_alone(migrated):
    rows, _ = migrated
    assert rows[4].distance == 5.0


def test_mile_distances_are_converted(migrated):
    rows, _ = migrated
    assert rows[5].distance == pytest.approx(3.0 * MI_TO_KM)


def test_the_unit_columns_are_gone(migrated):
    _, columns = migrated
    assert {"unit", "weight_kg", "distance_unit"}.isdisjoint(columns)
    assert {"weight", "distance"} <= columns
