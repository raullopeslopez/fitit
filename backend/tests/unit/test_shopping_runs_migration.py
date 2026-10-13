"""La migración de la compra de la semana tiene que construir lo que describe el modelo.

Mismo motivo que `test_pantry_migration.py`: conftest levanta el esquema con
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
MIGRATION = "d7e3a91f2b04_add_shopping_runs.py"


def _cargar():
    spec = importlib.util.spec_from_file_location("migration_shopping_runs", VERSIONS / MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _migrated():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        with Operations.context(MigrationContext.configure(conn)):
            _cargar().upgrade()
        columnas = {c["name"]: c["nullable"] for c in inspect(conn).get_columns("shopping_runs")}
        unicas = [u["column_names"] for u in inspect(conn).get_unique_constraints("shopping_runs")]
    engine.dispose()
    return columnas, unicas


def test_columns_and_nullability_match_the_model():
    model = {c.name: c.nullable for c in Base.metadata.tables["shopping_runs"].columns}
    assert _migrated()[0] == model


def test_only_the_ticket_can_be_missing():
    """Una compra sin ticket es una compra a medias; sin envío no es una compra."""
    nulables = {nombre for nombre, nula in _migrated()[0].items() if nula}
    assert nulables == {"ticket_at"}


def test_one_shopping_per_week():
    assert ["user_id", "week_start"] in _migrated()[1]


def test_the_chain_reaches_this_migration():
    assert _cargar().down_revision == "c5d9e27b4a31"
