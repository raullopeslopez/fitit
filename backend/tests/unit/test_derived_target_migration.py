"""La migración del objetivo derivado, contra los modelos.

Lo que se fija, además de la paridad: **`daily_targets.kcal` es NOT NULL** —una
fila sin cifra no es un objetivo congelado, es ruido— y **todo lo que entra en
`users` es nullable**, porque una app que no sabe tu altura no puede inventarse
una media y tiene que poder decir que le falta.
"""

import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text

from app.models import Base

VERSIONS = Path(__file__).resolve().parents[2] / "alembic" / "versions"
MIGRATION = "d5f1a09c3e42_add_derived_targets.py"
STEPS_GOAL_MIGRATION = "d30c512b2762_add_steps_goal.py"
PLAN_MIGRATION = "b8e3d51a7c20_add_goal_plan.py"
REVIEW_MIGRATION = "c9a4f6e2b183_add_weekly_review.py"
PERFIL = ("goal", "goal_rate", "height_cm", "birth_year", "sex", "steps_goal")
# El plan con peso meta: sin meta ni inicio no hay plan, y eso es un estado normal.
PLAN = ("goal_weight_kg", "plan_started_on", "plan_start_kg")


def _load(filename):
    spec = importlib.util.spec_from_file_location(f"migration_{filename}", VERSIONS / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _migrated():
    module = _load(MIGRATION)
    steps_module = _load(STEPS_GOAL_MIGRATION)
    plan_module = _load(PLAN_MIGRATION)
    review_module = _load(REVIEW_MIGRATION)

    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        context = MigrationContext.configure(conn)
        with Operations.context(context):
            module.upgrade()
            steps_module.upgrade()
            plan_module.upgrade()
            review_module.upgrade()
        inspector = inspect(conn)
        schema = {
            table: {c["name"]: c["nullable"] for c in inspector.get_columns(table)}
            for table in ("users", "daily_targets", "weekly_reviews")
        }
    engine.dispose()
    return schema, module


def test_columns_match_the_model():
    schema, _ = _migrated()
    assert set(schema["daily_targets"]) == set(
        Base.metadata.tables["daily_targets"].columns.keys()
    )


def test_nullability_matches_the_model():
    schema, _ = _migrated()
    model = {c.name: c.nullable for c in Base.metadata.tables["daily_targets"].columns}
    assert schema["daily_targets"] == model


def test_a_frozen_target_always_has_a_number():
    schema, _ = _migrated()
    assert schema["daily_targets"]["kcal"] is False
    assert schema["daily_targets"]["log_date"] is False


def test_the_profile_is_all_optional():
    """Lo que no sabes de tu cuerpo se dice, no se rellena con una media."""
    schema, _ = _migrated()
    for column in PERFIL:
        assert schema["users"][column] is True, column


def test_one_target_per_day():
    constraints = {
        c.name for c in Base.metadata.tables["daily_targets"].constraints if c.name is not None
    }
    assert "uq_daily_targets_user_day" in constraints


def test_the_chain_reaches_this_migration():
    _, module = _migrated()
    assert module.down_revision == "c4e8b21d7f09"


def test_the_goal_plan_is_all_optional():
    """Sin peso meta no hay plan; y un plan sin inicio es uno que aún no se aceptó."""
    schema, _ = _migrated()
    for column in PLAN:
        assert schema["users"][column] is True, column
    model = {c.name: c.nullable for c in Base.metadata.tables["users"].columns}
    for column in PLAN:
        assert model[column] is True, column


def test_the_weekly_review_matches_the_model():
    """Una revisión siempre tiene día y respuesta; lo único que puede faltar es
    lo que la app proponía (sin datos no propone nada)."""
    schema, _ = _migrated()
    table = Base.metadata.tables["weekly_reviews"]
    assert set(schema["weekly_reviews"]) == set(table.columns.keys())
    assert schema["weekly_reviews"] == {c.name: c.nullable for c in table.columns}
    assert schema["weekly_reviews"]["proposed_kcal"] is True
    for column in ("review_date", "answer", "accepted"):
        assert schema["weekly_reviews"][column] is False, column


def test_the_review_weekday_is_never_null():
    """No es un dato del cuerpo que pueda faltar: es una preferencia, y las
    cuentas de siempre reciben el domingo."""
    schema, _ = _migrated()
    assert schema["users"]["review_weekday"] is False
    assert Base.metadata.tables["users"].columns["review_weekday"].nullable is False


def test_one_review_per_user_and_day():
    constraints = {
        c.name for c in Base.metadata.tables["weekly_reviews"].constraints if c.name is not None
    }
    assert "uq_weekly_reviews_user_date" in constraints
