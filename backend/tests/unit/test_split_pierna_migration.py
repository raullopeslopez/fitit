"""d4f7a2c9e185 splits the old "Pierna" group into Cuádriceps / Femoral / Gemelo.

Every exercise Raul has ever tagged "Pierna" is sitting in the live database, so
the migration has to re-read each name and re-file it — a schema-only change
would leave a group that no longer exists on rows the UI still has to render.
It runs for real against live data on deploy, so the rewrite is tested directly,
the same way the kilos-only and user-scoping migrations are.
"""

import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text

BACKEND = Path(__file__).resolve().parents[2]
SPLIT_PIERNA = BACKEND / "alembic" / "versions" / "d4f7a2c9e185_split_pierna_groups.py"

SCHEMA = """
CREATE TABLE exercises (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name VARCHAR(120) NOT NULL,
    muscle_group VARCHAR(60),
    kind VARCHAR(16) NOT NULL DEFAULT 'strength'
);
"""

# Every one of these was stored as "Pierna"; the split has to tell them apart
# from the name alone.
LEGACY = [
    (1, "Sentadilla", "Pierna"),
    (2, "Prensa", "Pierna"),
    (3, "Curl femoral tumbado", "Pierna"),
    (4, "Hip thrust", "Pierna"),
    (5, "Gemelo de pie", "Pierna"),
    (6, "Elevación de talones sentado", "Pierna"),
    (7, "Aparato raro del gimnasio", "Pierna"),  # unreadable name, still a leg day
    (8, "Press banca", "Pecho"),  # untouched
    (9, "Bici", None),  # untouched
]


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run(direction="upgrade"):
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text(SCHEMA))
        for id_, name, group in LEGACY:
            conn.execute(
                text(
                    "INSERT INTO exercises (id, user_id, name, muscle_group, kind) "
                    "VALUES (:id, 1, :name, :group, 'strength')"
                ),
                {"id": id_, "name": name, "group": group},
            )
        context = MigrationContext.configure(conn)
        with Operations.context(context):
            module = _load(SPLIT_PIERNA, "migration_split_pierna_groups")
            module.upgrade()
            if direction == "downgrade":
                module.downgrade()
        rows = conn.execute(text("SELECT id, name, muscle_group FROM exercises")).all()
    engine.dispose()
    return {row.id: row.muscle_group for row in rows}


@pytest.fixture(scope="module")
def migrated():
    return _run()


@pytest.fixture(scope="module")
def round_tripped():
    return _run("downgrade")


@pytest.mark.parametrize(
    "exercise_id,expected",
    [
        (1, "Cuádriceps"),
        (2, "Cuádriceps"),
        (3, "Femoral"),
        (4, "Femoral"),
        (5, "Gemelo"),
        (6, "Gemelo"),
    ],
)
def test_each_leg_exercise_lands_in_its_new_group(migrated, exercise_id, expected):
    assert migrated[exercise_id] == expected


def test_an_unreadable_leg_name_falls_back_to_quads_not_to_nothing(migrated):
    """Dropping it to NULL would delete the one thing the user did tell us — that
    this is leg work. Quads is the largest bucket and the tag stays editable."""
    assert migrated[7] == "Cuádriceps"


def test_other_groups_are_left_alone(migrated):
    assert migrated[8] == "Pecho"
    assert migrated[9] is None


def test_no_exercise_is_left_on_the_group_that_no_longer_exists(migrated):
    assert "Pierna" not in set(migrated.values())


def test_downgrade_puts_every_leg_group_back_under_pierna(round_tripped):
    assert [round_tripped[i] for i in (1, 2, 3, 4, 5, 6, 7)] == ["Pierna"] * 7
    assert round_tripped[8] == "Pecho"
