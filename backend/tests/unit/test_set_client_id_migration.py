"""La migración del `client_id` tiene que construir lo que dice el modelo.

conftest levanta el esquema de los tests con `Base.metadata.create_all`, así que
los escenarios de `log_set.feature` pasan aunque la migración no cree el índice.
Y sin índice la deduplicación sigue funcionando casi siempre —la comprobación
previa del router la cubre—, salvo cuando dos reintentos llegan a la vez: el
fallo no saldría en ningún test, saldría como una serie doble de vez en cuando.
Mismo motivo y misma forma que `test_daily_steps_migration.py`.

Lo que se fija: la columna admite nulo (los clientes viejos no mandan nada) y el
índice es único sobre (entreno, client_id).
"""

import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text

from app.models import Base

BACKEND = Path(__file__).resolve().parents[2]
VERSIONS = BACKEND / "alembic" / "versions"

MIGRATION = "a3f7c91e2d64_add_set_client_id.py"
INDEX = "uq_sets_workout_client_id"


def _module(name):
    spec = importlib.util.spec_from_file_location(name, VERSIONS / MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _migrated():
    module = _module("migration_set_client_id")
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE sets (id INTEGER PRIMARY KEY, workout_id INTEGER)"))
        context = MigrationContext.configure(conn)
        with Operations.context(context):
            module.upgrade()
        inspector = inspect(conn)
        columns = {c["name"]: c for c in inspector.get_columns("sets")}
        indexes = {i["name"]: i for i in inspector.get_indexes("sets")}
    engine.dispose()
    return columns, indexes


def test_client_id_is_nullable_like_the_model():
    columns, _ = _migrated()
    assert columns["client_id"]["nullable"] is True
    assert Base.metadata.tables["sets"].columns["client_id"].nullable is True


def test_client_id_is_as_long_as_the_model_allows():
    columns, _ = _migrated()
    assert columns["client_id"]["type"].length == 64
    assert Base.metadata.tables["sets"].columns["client_id"].type.length == 64


def test_one_set_per_workout_and_client_id():
    """El índice que decide la carrera entre dos reintentos simultáneos."""
    _, indexes = _migrated()
    assert indexes[INDEX]["column_names"] == ["workout_id", "client_id"]
    assert indexes[INDEX]["unique"]
    model = {i.name: i for i in Base.metadata.tables["sets"].indexes}
    assert [c.name for c in model[INDEX].columns] == ["workout_id", "client_id"]
    assert model[INDEX].unique


def test_the_chain_reaches_this_migration():
    """Encadenada al head que había, no colgando de la nada."""
    assert _module("migration_set_client_id_chain").down_revision == "b5e8d13f7a42"
