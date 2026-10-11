"""La migración de la pauta, contra el modelo."""

import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text

from app.models import Base

VERSIONS = Path(__file__).resolve().parents[2] / "alembic" / "versions"
MIGRATION = "b5d2e8f41a67_add_pautas.py"
TABLAS = ("pautas", "pauta_entries")

PREVIAS = (
    "CREATE TABLE users (id INTEGER PRIMARY KEY)",
    "CREATE TABLE dishes (id INTEGER PRIMARY KEY)",
)


def _migrated():
    spec = importlib.util.spec_from_file_location("migration_pautas", VERSIONS / MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        for sentencia in PREVIAS:
            conn.execute(text(sentencia))
        context = MigrationContext.configure(conn)
        with Operations.context(context):
            module.upgrade()
        inspector = inspect(conn)
        schema = {
            tabla: {c["name"]: c["nullable"] for c in inspector.get_columns(tabla)}
            for tabla in TABLAS
        }
    engine.dispose()
    return schema, module


def test_columns_and_nullability_match_the_model():
    schema, _ = _migrated()
    for tabla in TABLAS:
        model = {c.name: c.nullable for c in Base.metadata.tables[tabla].columns}
        assert schema[tabla] == model, tabla


def test_a_slot_of_the_pauta_always_has_its_dish():
    """Una casilla sin plato no se guarda: la elige el generador."""
    schema, _ = _migrated()
    assert schema["pauta_entries"]["dish_id"] is False


def test_the_chain_reaches_this_migration():
    _, module = _migrated()
    assert module.down_revision == "d3f7a1c9e254"
