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
# Fase 2: la receta leída de la página, y el plato que apunta a su idea.
FASE_2 = "d6a2f84c19e3_dish_from_idea.py"


def _cargar(filename=MIGRATION):
    spec = importlib.util.spec_from_file_location(f"migration_{filename}", VERSIONS / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _migrated():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE foods (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE dishes (id INTEGER PRIMARY KEY)"))
        with Operations.context(MigrationContext.configure(conn)):
            _cargar().upgrade()
            _cargar(FASE_2).upgrade()
        inspector = inspect(conn)
        columns = {c["name"]: c["nullable"] for c in inspector.get_columns("dish_ideas")}
        uniques = {u["name"] for u in inspector.get_unique_constraints("dish_ideas")}
        dishes = {c["name"]: c["nullable"] for c in inspector.get_columns("dishes")}
        dish_fks = {
            (fk["constrained_columns"][0], fk["referred_table"])
            for fk in inspector.get_foreign_keys("dishes")
        }
    engine.dispose()
    return columns, uniques, dishes, dish_fks


def test_nullability_matches_the_model():
    columns, *_ = _migrated()
    model = {c.name: c.nullable for c in Base.metadata.tables["dish_ideas"].columns}
    assert columns == model


def test_minutes_and_method_can_be_unknown():
    columns, *_ = _migrated()
    assert columns["minutes"] is True
    assert columns["method"] is True
    assert columns["url"] is False


def test_one_link_per_food():
    _, uniques, *_ = _migrated()
    assert "uq_dish_ideas_food_url" in uniques


def test_it_chains_to_the_plans_migration():
    assert _cargar().down_revision == "a9e4f27b0c15"


def test_the_recipe_read_from_the_page_can_be_not_read_yet():
    """NULL es «todavía no se ha leído», no «no tiene ingredientes»."""
    columns, *_ = _migrated()
    assert columns["recipe_json"] is True


def test_a_dish_may_come_from_an_idea_and_most_do_not():
    """El plato apunta a su idea, no al revés: la idea es de todos."""
    _, _, dishes, dish_fks = _migrated()
    assert dishes["idea_id"] is True
    assert ("idea_id", "dish_ideas") in dish_fks
    assert Base.metadata.tables["dishes"].columns["idea_id"].nullable is True


def test_phase_2_chains_to_the_ideas_migration():
    assert _cargar(FASE_2).down_revision == "b3d7e19a4c62"
