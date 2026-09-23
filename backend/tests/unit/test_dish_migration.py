"""La migración de platos tiene que construir lo que describen los modelos.

Mismo motivo y misma forma que `test_food_migration.py`: conftest levanta el
esquema de los tests con `Base.metadata.create_all`, así que la suite entera
puede pasar contra modelos que la migración nunca crea, y el desajuste sale en
el deploy.

Lo que se fija aquí, además de la paridad:

- **`basis` es NOT NULL.** Un plato que no dice si se pesa en crudo o en
  cocinado es un plato que miente a medias, y la diferencia entre las dos es de
  un cuarto del peso en una carne.
- **`dish_id` en `log_entries` es nullable y no cascadea.** Los macros de la
  entrada ya están congelados: perder el puntero no puede perder la fila.
"""

import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text

from app.models import Base

BACKEND = Path(__file__).resolve().parents[2]
VERSIONS = BACKEND / "alembic" / "versions"

MIGRATION = "c4e8b21d7f09_add_dishes.py"
# Las que tocan después una columna de estas tablas, en orden. Mismo criterio
# que `COLUMN_MIGRATIONS` en `test_food_migration.py`: sin ellas la paridad se
# compara contra unos modelos que ya no son los que la cadena construye.
POSTERIORES = (
    # `dishes.slots` / `is_block` y la banda de `dish_ingredients`, que es lo
    # que el generador necesita para saber qué se deja mover.
    "a9e4f27b0c15_add_plans.py",
)
TABLES = ("dishes", "dish_ingredients")


def _migrated():
    def _cargar(filename):
        spec = importlib.util.spec_from_file_location(f"migration_{filename}", VERSIONS / filename)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        # Sólo lo que la migración referencia; el resto del esquema no pinta.
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE foods (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE log_entries (id INTEGER PRIMARY KEY)"))
        context = MigrationContext.configure(conn)
        with Operations.context(context):
            for filename in (MIGRATION, *POSTERIORES):
                _cargar(filename).upgrade()
        inspector = inspect(conn)
        schema = {
            table: {c["name"]: c["nullable"] for c in inspector.get_columns(table)}
            for table in (*TABLES, "log_entries")
        }
    engine.dispose()
    return schema


def test_it_creates_both_tables():
    schema = _migrated()
    for table in TABLES:
        assert table in schema


def test_columns_match_the_models():
    schema = _migrated()
    for table in TABLES:
        assert set(schema[table]) == set(Base.metadata.tables[table].columns.keys())


def test_nullability_matches_the_models():
    schema = _migrated()
    for table in TABLES:
        model = {c.name: c.nullable for c in Base.metadata.tables[table].columns}
        assert schema[table] == model, table


def test_a_dish_always_says_how_it_is_weighed():
    schema = _migrated()
    assert schema["dishes"]["basis"] is False
    assert schema["dishes"]["user_id"] is False


def test_an_entry_survives_losing_its_dish():
    schema = _migrated()
    assert schema["log_entries"]["dish_id"] is True
    columns = Base.metadata.tables["log_entries"].columns
    (fk,) = columns["dish_id"].foreign_keys
    assert fk.ondelete == "SET NULL"


def test_one_name_per_user():
    """La restricción que impide tener dos «Lentejas de mi madre»."""
    constraints = {
        c.name for c in Base.metadata.tables["dishes"].constraints if c.name is not None
    }
    assert "uq_dishes_user_name" in constraints


def test_the_chain_reaches_this_migration():
    spec = importlib.util.spec_from_file_location("migration_chain_dishes", VERSIONS / MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.down_revision == "a7c2e84b1d59"
