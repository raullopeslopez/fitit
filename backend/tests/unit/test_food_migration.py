"""Las migraciones de comida tienen que construir las tablas que describen los modelos.

conftest builds the test schema with `Base.metadata.create_all`, so the whole
suite could pass against models that the migration never actually creates —
the mismatch would only show up on deploy, against the real database, with a
diary that 500s on its first read.

The invariant worth pinning down here is nullability. Every nutrient column is
nullable on purpose: NULL means nobody measured it, and a NOT NULL DEFAULT 0
would restate every unmeasured value in CIQUAL as a measurement of none — the
one error in this feature that no later fix can undo, because the information
it destroys was never written down.

The full chain can't be replayed on SQLite (b7f3c2a10d94 uses `ALTER COLUMN ...
SET NOT NULL`, which SQLite rejects), so this drives just the migrations that
shape these tables' columns, against a database holding only what they
reference.
"""

import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text

from app.models import Base
from app.nutrition import NUTRIENTS

BACKEND = Path(__file__).resolve().parents[2]
VERSIONS = BACKEND / "alembic" / "versions"

# Las migraciones que dan forma a las **columnas** de estas tablas, en orden.
# Cuando una migración nueva añada o quite una, va aquí — si no, este fichero
# deja de comprobar lo que dice comprobar y el desajuste sale en el deploy.
#
# `b8d0f42a6e17` no está a propósito: sólo añade una restricción de unicidad, y
# SQLite no sabe añadirla a una tabla ya creada (haría falta modo batch). No
# toca ninguna columna, así que no tiene nada que decir aquí.
COLUMN_MIGRATIONS = (
    "a3e91d5c7b40_add_food_tracking.py",
    "c1e7b04a9d33_foods_brand_folded.py",
    "d2a8f31c6740_foods_barcode.py",
    # Añade `log_entries.dish_id`. Está aquí porque toca una columna de estas
    # tablas, que es el criterio de la lista — aunque lo que la migración
    # *crea* (platos) se comprueba aparte, en `test_dish_migration.py`.
    "c4e8b21d7f09_add_dishes.py",
    # Añade los códigos de grupo a `foods`, que es lo que deja a una regla
    # nombrar «verdura» o «legumbre».
    "e7b3c02a91d8_add_food_groups.py",
    # Añade `foods.kcal_estimated`: las kcal de CIQUAL que salen de Atwater.
    "b8e4d2f7a915_ciqual_kcal_estimated.py",
    # Añade el hueso: `foods.refuse_pct`, `foods.kcal_basis` y
    # `log_entries.edible_grams`.
    "c3f1a7e2b940_bone_in_foods.py",
    # Añade `foods.package_grams`: el envase con el que se vende, para que la
    # lista de la compra hable en envases.
    "d3f7a1c9e254_add_food_package_grams.py",
    # Añade `log_entries.measure` y `measure_count`: lo apuntado con cucharadas.
    "e4b8c1f37a20_log_entry_measure.py",
)

FOOD_TABLES = ("foods", "food_aliases", "portions", "log_entries")


def _load_migration(filename):
    spec = importlib.util.spec_from_file_location(f"migration_{filename}", VERSIONS / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def migrated():
    """The schema this migration leaves behind, as {table: {column: nullable}}."""
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        # Only what the new tables point at; everything else is irrelevant here.
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        context = MigrationContext.configure(conn)
        with Operations.context(context):
            for filename in COLUMN_MIGRATIONS:
                _load_migration(filename).upgrade()
        inspector = inspect(conn)
        schema = {
            table: {c["name"]: c["nullable"] for c in inspector.get_columns(table)}
            for table in FOOD_TABLES
        }
    engine.dispose()
    return schema


def test_it_creates_every_table_the_models_declare(migrated):
    assert set(migrated) == set(FOOD_TABLES)


@pytest.mark.parametrize("table", FOOD_TABLES)
def test_columns_match_the_models(migrated, table):
    assert set(migrated[table]) == set(Base.metadata.tables[table].columns.keys())


@pytest.mark.parametrize("table", FOOD_TABLES)
def test_nullability_matches_the_models(migrated, table):
    model = {c.name: c.nullable for c in Base.metadata.tables[table].columns}
    assert migrated[table] == model


def test_every_nutrient_column_is_nullable(migrated):
    for field in NUTRIENTS:
        assert migrated["foods"][f"{field}_100g"] is True, f"foods.{field}_100g must allow NULL"
        assert migrated["log_entries"][field] is True, f"log_entries.{field} must allow NULL"


def test_an_entry_keeps_its_name_when_its_food_is_deleted(migrated):
    """`food_id` is ON DELETE SET NULL and the name is a copy, so the fortnight
    you ate something survives you deleting the something."""
    columns = Base.metadata.tables["log_entries"].columns
    assert columns["food_name_snapshot"].nullable is False
    (fk,) = columns["food_id"].foreign_keys
    assert fk.ondelete == "SET NULL"
