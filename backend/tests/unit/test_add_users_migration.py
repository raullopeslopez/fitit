"""a1b2c3d4e5f6 and b2c3d4e5f6a7 turn the single hardcoded login into a real
`users` table and scope every exercise/day to one. Both run for real against
Raul's live data the moment they're deployed (no dry run), so the backfill
and the seeded account are tested directly here, the same way the kilos-only
migration's data rewrite is.

conftest builds the schema with Base.metadata.create_all, so no other test
runs these migrations at all.
"""

import importlib.util
from pathlib import Path

import bcrypt
import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text

BACKEND = Path(__file__).resolve().parents[2]
ADD_USERS = BACKEND / "alembic" / "versions" / "a1b2c3d4e5f6_add_users_table.py"
SCOPE_DATA = BACKEND / "alembic" / "versions" / "b2c3d4e5f6a7_scope_data_by_user.py"

# The `users`/`exercises`/`days` tables as of a1b2c3d4e5f6 (global, pre-scoping).
PRIOR_SCHEMA = """
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username VARCHAR(80) NOT NULL,
    password_hash VARCHAR(255) NOT NULL
);
CREATE TABLE exercises (
    id INTEGER PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    muscle_group VARCHAR(60),
    kind VARCHAR(16) NOT NULL DEFAULT 'strength'
);
CREATE UNIQUE INDEX ix_exercises_name ON exercises (name);
CREATE TABLE days (
    id INTEGER PRIMARY KEY,
    date DATE NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX ix_days_date ON days (date);
"""


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def users_migration(monkeypatch):
    monkeypatch.setattr("app.config.settings.auth_username", "fitit")
    monkeypatch.setattr("app.config.settings.auth_password", "s3cret-pass")
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        context = MigrationContext.configure(conn)
        with Operations.context(context):
            _load(ADD_USERS, "migration_add_users_table").upgrade()
        rows = conn.execute(text("SELECT id, username, password_hash FROM users")).all()
    engine.dispose()
    return rows


def test_seeds_exactly_one_user_from_env(users_migration):
    assert len(users_migration) == 1
    assert users_migration[0].username == "fitit"


def test_seeded_password_is_hashed_not_plaintext(users_migration):
    row = users_migration[0]
    assert row.password_hash != "s3cret-pass"
    assert bcrypt.checkpw(b"s3cret-pass", row.password_hash.encode())


@pytest.fixture()
def scoped():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        for statement in PRIOR_SCHEMA.strip().split(";"):
            if statement.strip():
                conn.execute(text(statement))
        conn.execute(
            text("INSERT INTO users (id, username, password_hash) VALUES (1, 'fitit', 'x')")
        )
        conn.execute(
            text("INSERT INTO exercises (id, name, kind) VALUES (1, 'Press banca', 'strength')")
        )
        conn.execute(text("INSERT INTO days (id, date) VALUES (1, '2026-07-01')"))

        context = MigrationContext.configure(conn)
        with Operations.context(context):
            _load(SCOPE_DATA, "migration_scope_data_by_user").upgrade()

        exercise = conn.execute(text("SELECT * FROM exercises WHERE id = 1")).one()
        day = conn.execute(text("SELECT * FROM days WHERE id = 1")).one()
        exercise_columns = {c["name"] for c in inspect(conn).get_columns("exercises")}
        day_columns = {c["name"] for c in inspect(conn).get_columns("days")}
    engine.dispose()
    return exercise, day, exercise_columns, day_columns


def test_existing_exercise_backfills_to_the_seeded_user(scoped):
    exercise, _, _, _ = scoped
    assert exercise.user_id == 1


def test_existing_day_backfills_to_the_seeded_user(scoped):
    _, day, _, _ = scoped
    assert day.user_id == 1


def test_user_id_columns_exist(scoped):
    _, _, exercise_columns, day_columns = scoped
    assert "user_id" in exercise_columns
    assert "user_id" in day_columns


def test_a_second_user_can_reuse_the_same_exercise_name(scoped):
    """Global uniqueness on `name`/`date` must have become per-user."""
    _, _, _, _ = scoped
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        for statement in PRIOR_SCHEMA.strip().split(";"):
            if statement.strip():
                conn.execute(text(statement))
        conn.execute(
            text("INSERT INTO users (id, username, password_hash) VALUES (1, 'fitit', 'x')")
        )
        conn.execute(
            text("INSERT INTO exercises (id, name, kind) VALUES (1, 'Press banca', 'strength')")
        )
        conn.execute(text("INSERT INTO days (id, date) VALUES (1, '2026-07-01')"))
        context = MigrationContext.configure(conn)
        with Operations.context(context):
            _load(SCOPE_DATA, "migration_scope_data_by_user").upgrade()
        conn.execute(
            text("INSERT INTO users (id, username, password_hash) VALUES (2, 'amigo', 'y')")
        )
        # Same exercise name, same date, different user — must not collide now.
        conn.execute(
            text(
                "INSERT INTO exercises (id, user_id, name, kind) "
                "VALUES (2, 2, 'Press banca', 'strength')"
            )
        )
        conn.execute(text("INSERT INTO days (id, user_id, date) VALUES (2, 2, '2026-07-01')"))
    engine.dispose()
