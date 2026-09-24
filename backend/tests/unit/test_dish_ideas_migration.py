"""La migración de ideas tiene que construir lo que describe el modelo.

Mismo motivo que `test_dish_migration.py`: la suite levanta el esquema con
`Base.metadata.create_all`, así que un desajuste entre migración y modelo sólo
saldría en el deploy.

Lo que se fija además de la paridad:

- **`method` y `minutes` son nullable.** Una receta que no dice cuánto tarda
  no tarda cero minutos.
- **Un enlace por alimento.** La misma receta encontrada dos veces es una idea.
"""

import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text

from app.models import Base

VERSIONS = Path(__file__).resolve().parents[2] / "alembic" / "versions"
MIGRATION = "b3d7e19a4c62_add_dish_ideas.py"


def _cargar():
    spec = importlib.util.spec_from_file_location("migration_dish_ideas", VERSIONS / MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _migrated():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE foods (id INTEGER PRIMARY KEY)"))
        with Operations.context(MigrationContext.configure(conn)):
            _cargar().upgrade()
        inspector = inspect(conn)
        columns = {c["name"]: c["nullable"] for c in inspector.get_columns("dish_ideas")}
        uniques = {u["name"] for u in inspector.get_unique_constraints("dish_ideas")}
    engine.dispose()
    return columns, uniques


def test_nullability_matches_the_model():
    columns, _ = _migrated()
    model = {c.name: c.nullable for c in Base.metadata.tables["dish_ideas"].columns}
    assert columns == model


def test_minutes_and_method_can_be_unknown():
    columns, _ = _migrated()
    assert columns["minutes"] is True
    assert columns["method"] is True
    assert columns["url"] is False


def test_one_link_per_food():
    _, uniques = _migrated()
    assert "uq_dish_ideas_food_url" in uniques


def test_it_chains_to_the_plans_migration():
    assert _cargar().down_revision == "a9e4f27b0c15"
