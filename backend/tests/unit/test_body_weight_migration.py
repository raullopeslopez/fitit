"""La migración del peso tiene que construir la tabla que describe el modelo.

conftest levanta el esquema de los tests con `Base.metadata.create_all`, así que
la suite entera puede pasar contra un modelo que la migración nunca crea: el
desajuste sale en el deploy, contra la base real, con la pantalla devolviendo
500 la primera vez que alguien se pesa. Mismo motivo y misma forma que
`test_food_migration.py`.

Lo que se fija aquí es la nulabilidad, y en esta tabla va al revés que en
comida: `kg` es **NOT NULL** a propósito. Una fila sin peso no es «una pesada
que no se midió», es una fila que no debería existir — cuando no te pesas no hay
fila. Permitir NULL abriría la puerta a filas fantasma que la tendencia tendría
que aprender a ignorar.
"""

import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text

from app.models import Base

BACKEND = Path(__file__).resolve().parents[2]
VERSIONS = BACKEND / "alembic" / "versions"

MIGRATION = "a7c2e84b1d59_add_body_weights.py"
TABLE = "body_weights"


def _migrated():
    spec = importlib.util.spec_from_file_location("migration_body_weights", VERSIONS / MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        context = MigrationContext.configure(conn)
        with Operations.context(context):
            module.upgrade()
        inspector = inspect(conn)
        schema = {c["name"]: c["nullable"] for c in inspector.get_columns(TABLE)}
        indexes = {i["name"]: list(i["column_names"]) for i in inspector.get_indexes(TABLE)}
    engine.dispose()
    return schema, indexes


def test_columns_match_the_model():
    schema, _ = _migrated()
    assert set(schema) == set(Base.metadata.tables[TABLE].columns.keys())


def test_nullability_matches_the_model():
    schema, _ = _migrated()
    model = {c.name: c.nullable for c in Base.metadata.tables[TABLE].columns}
    assert schema == model


def test_a_weigh_in_always_has_a_weight():
    """El caso que no puede fallar: una fila sin `kg` no es una pesada."""
    schema, _ = _migrated()
    assert schema["kg"] is False
    assert schema["measured_on"] is False


def test_one_weigh_in_per_day():
    """La restricción que hace que pesarse dos veces corrija en vez de sumar."""
    constraints = {
        c.name for c in Base.metadata.tables[TABLE].constraints if c.name is not None
    }
    assert "uq_body_weights_user_day" in constraints


def test_the_chain_reaches_this_migration():
    """Encadenada al head que había, no colgando de la nada."""
    spec = importlib.util.spec_from_file_location("migration_chain_check", VERSIONS / MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.down_revision == "f4a1c6e29b83"
