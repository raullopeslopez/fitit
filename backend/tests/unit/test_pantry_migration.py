"""La migración de la despensa tiene que construir lo que describe el modelo.

Mismo motivo que `test_dish_migration.py`: conftest levanta el esquema con
`Base.metadata.create_all`, así que la suite puede pasar contra un modelo que la
migración nunca crea, y el desajuste sale en el deploy.
"""

import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text

from app.models import Base

VERSIONS = Path(__file__).resolve().parents[2] / "alembic" / "versions"
MIGRATION = "c5d9e27b4a31_add_pantry.py"


def _cargar():
    spec = importlib.util.spec_from_file_location("migration_pantry", VERSIONS / MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _migrated():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE foods (id INTEGER PRIMARY KEY)"))
        with Operations.context(MigrationContext.configure(conn)):
            _cargar().upgrade()
        columnas = {c["name"]: c["nullable"] for c in inspect(conn).get_columns("pantry_items")}
    engine.dispose()
    return columnas


def test_columns_and_nullability_match_the_model():
    model = {c.name: c.nullable for c in Base.metadata.tables["pantry_items"].columns}
    assert _migrated() == model


def test_nothing_in_the_pantry_is_left_unsaid():
    assert not any(_migrated().values())


def test_the_chain_reaches_this_migration():
    assert _cargar().down_revision == "a3f8d51c7e20"
