"""La migración del contador de llamadas al modelo construye la tabla del modelo.

Mismo motivo que `test_daily_steps_migration.py`: conftest crea el esquema con
`create_all`, así que la suite pasaría contra una tabla que la migración no
crea, y el desajuste saldría en el deploy como un 500 en cada lectura.
"""

import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text

from app.models import Base

VERSIONS = Path(__file__).resolve().parents[2] / "alembic" / "versions"
MIGRATION = "d8f2a6c41b97_add_llm_usage.py"
TABLE = "llm_usage"


def _module(name):
    spec = importlib.util.spec_from_file_location(name, VERSIONS / MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _migrated():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        with Operations.context(MigrationContext.configure(conn)):
            _module("migration_llm_usage").upgrade()
        inspector = inspect(conn)
        schema = {c["name"]: c["nullable"] for c in inspector.get_columns(TABLE)}
        pk = inspector.get_pk_constraint(TABLE)["constrained_columns"]
    engine.dispose()
    return schema, pk


def test_columns_and_nullability_match_the_model():
    schema, _ = _migrated()
    assert schema == {c.name: c.nullable for c in Base.metadata.tables[TABLE].columns}


def test_one_row_per_user_and_day():
    _, pk = _migrated()
    assert pk == ["user_id", "day"]


def test_the_chain_reaches_this_migration():
    assert _module("migration_llm_usage_chain").down_revision == "c5d9a27e81f4"
