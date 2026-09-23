"""La migración de reglas, contra el modelo.

Lo que se fija además de la paridad: **`active_from` es NOT NULL y `active_to`
nullable**. Una regla se retira poniéndole fecha de fin, no borrando la fila —
cambiar de opinión en octubre no puede reescribir cómo se juzgó septiembre.
"""

import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text

from app.models import Base

VERSIONS = Path(__file__).resolve().parents[2] / "alembic" / "versions"
MIGRATION = "f2c9d81e405b_add_rules.py"


def _migrated():
    spec = importlib.util.spec_from_file_location("migration_rules", VERSIONS / MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        context = MigrationContext.configure(conn)
        with Operations.context(context):
            module.upgrade()
        schema = {c["name"]: c["nullable"] for c in inspect(conn).get_columns("rules")}
    engine.dispose()
    return schema, module


def test_columns_match_the_model():
    schema, _ = _migrated()
    assert set(schema) == set(Base.metadata.tables["rules"].columns.keys())


def test_nullability_matches_the_model():
    schema, _ = _migrated()
    model = {c.name: c.nullable for c in Base.metadata.tables["rules"].columns}
    assert schema == model


def test_a_rule_is_retired_not_deleted():
    schema, _ = _migrated()
    assert schema["active_from"] is False
    assert schema["active_to"] is True


def test_a_rule_always_says_what_it_is_and_what_it_covers():
    schema, _ = _migrated()
    for column in ("type", "scope", "hardness", "params_json"):
        assert schema[column] is False, column


def test_a_condition_is_optional_and_null_means_every_day():
    schema, _ = _migrated()
    assert schema["day_condition"] is True


def test_the_chain_reaches_this_migration():
    _, module = _migrated()
    assert module.down_revision == "e7b3c02a91d8"
