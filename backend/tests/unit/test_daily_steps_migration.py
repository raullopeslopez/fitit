"""La migración de los pasos tiene que construir la tabla que describe el modelo.

conftest levanta el esquema de los tests con `Base.metadata.create_all`, así que
la suite entera puede pasar contra un modelo que la migración nunca crea: el
desajuste saldría en el deploy, con el móvil recibiendo un 500 la primera vez
que sube sus pasos. Mismo motivo y misma forma que
`test_body_weight_migration.py`.

Lo que se fija es la nulabilidad, y aquí todo es **NOT NULL**: una fila sin
`steps` no es «un día que no se midió», es una fila que no debería existir. Un
día sin pasos subidos no tiene fila, y esa ausencia es lo desconocido — nunca un
cero ni un NULL que alguien tenga que aprender a saltarse.
"""

import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text

from app.models import Base

BACKEND = Path(__file__).resolve().parents[2]
VERSIONS = BACKEND / "alembic" / "versions"

MIGRATION = "b5e8d13f7a42_add_daily_steps.py"
TABLE = "daily_steps"


def _module(name):
    spec = importlib.util.spec_from_file_location(name, VERSIONS / MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _migrated():
    module = _module("migration_daily_steps")
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        context = MigrationContext.configure(conn)
        with Operations.context(context):
            module.upgrade()
        inspector = inspect(conn)
        schema = {c["name"]: c["nullable"] for c in inspector.get_columns(TABLE)}
        indexes = {i["name"]: list(i["column_names"]) for i in inspector.get_indexes(TABLE)}
        uniques = {
            u["name"]: list(u["column_names"]) for u in inspector.get_unique_constraints(TABLE)
        }
    engine.dispose()
    return schema, indexes, uniques


def test_columns_match_the_model():
    schema, _, _ = _migrated()
    assert set(schema) == set(Base.metadata.tables[TABLE].columns.keys())


def test_nullability_matches_the_model():
    schema, _, _ = _migrated()
    model = {c.name: c.nullable for c in Base.metadata.tables[TABLE].columns}
    assert schema == model


def test_a_row_always_has_its_steps():
    """El caso que no puede fallar: una fila sin `steps` no es un día medido."""
    schema, _, _ = _migrated()
    assert schema["steps"] is False
    assert schema["date"] is False
    assert schema["user_id"] is False


def test_user_id_is_indexed():
    _, indexes, _ = _migrated()
    assert ["user_id"] in indexes.values()


def test_one_row_per_user_and_day():
    """La restricción que hace que una lectura posterior escriba encima."""
    _, _, uniques = _migrated()
    assert uniques.get("uq_daily_steps_user_day") == ["user_id", "date"]
    constraints = {c.name for c in Base.metadata.tables[TABLE].constraints if c.name is not None}
    assert "uq_daily_steps_user_day" in constraints


def test_the_chain_reaches_this_migration():
    """Encadenada al head que había, no colgando de la nada."""
    assert _module("migration_daily_steps_chain").down_revision == "d6a2f84c19e3"
