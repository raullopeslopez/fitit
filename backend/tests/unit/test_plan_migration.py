"""La migración del plan, contra el modelo.

Lo que se fija además de la paridad son las tres nulabilidades que llevan una
decisión dentro: `dishes.slots` (no dicho = vale para cualquier hueco), la banda
de `dish_ingredients` (sin banda = no se ajusta) y `plan_entries.status` (NULL
es «no dicho», nunca «saltado»).
"""

import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text

from app.models import Base

VERSIONS = Path(__file__).resolve().parents[2] / "alembic" / "versions"
MIGRATION = "a9e4f27b0c15_add_plans.py"

# Lo justo para que las columnas y las claves ajenas tengan dónde agarrarse.
PREVIAS = (
    "CREATE TABLE users (id INTEGER PRIMARY KEY)",
    "CREATE TABLE log_entries (id INTEGER PRIMARY KEY)",
    "CREATE TABLE dishes (id INTEGER PRIMARY KEY, name VARCHAR(160))",
    "CREATE TABLE dish_ingredients (id INTEGER PRIMARY KEY, grams FLOAT)",
)


def _migrated():
    spec = importlib.util.spec_from_file_location("migration_plans", VERSIONS / MIGRATION)
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
            for tabla in ("plans", "plan_entries", "dishes", "dish_ingredients")
        }
    engine.dispose()
    return schema, module


def test_columns_match_the_model():
    schema, _ = _migrated()
    for tabla in ("plans", "plan_entries"):
        assert set(schema[tabla]) == set(Base.metadata.tables[tabla].columns.keys()), tabla


def test_nullability_matches_the_model():
    schema, _ = _migrated()
    for tabla in ("plans", "plan_entries"):
        model = {c.name: c.nullable for c in Base.metadata.tables[tabla].columns}
        assert schema[tabla] == model, tabla


def test_a_plan_always_remembers_its_seed():
    """Sin semilla no se puede volver a obtener el plan, y no hay con qué comparar."""
    schema, _ = _migrated()
    assert schema["plans"]["seed"] is False
    assert schema["plans"]["week_start"] is False


def test_status_is_nullable_because_null_is_not_skipped():
    """Un plan no puede dar por incumplido lo que todavía no ha pasado."""
    schema, _ = _migrated()
    assert schema["plan_entries"]["status"] is True
    assert schema["plan_entries"]["log_entry_id"] is True


def test_a_dish_may_say_nothing_about_its_slots():
    """No haberlo dicho no puede dejar al plato fuera del plan entero."""
    schema, _ = _migrated()
    assert schema["dishes"]["slots"] is True


def test_a_block_dish_is_a_yes_or_no_and_defaults_to_no():
    schema, _ = _migrated()
    assert schema["dishes"]["is_block"] is False


def test_the_band_is_optional_because_no_band_means_fixed():
    schema, _ = _migrated()
    assert schema["dish_ingredients"]["min_grams"] is True
    assert schema["dish_ingredients"]["max_grams"] is True


def test_the_chain_reaches_this_migration():
    _, module = _migrated()
    assert module.down_revision == "f2c9d81e405b"
