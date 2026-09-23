"""add plans

Revision ID: a9e4f27b0c15
Revises: f2c9d81e405b
Create Date: 2026-09-23 22:00:00.000000

La semana generada, y las dos cosas que al repertorio le faltaban para poder
generarla.

`dishes.slots` es una lista corta separada por comas, y **NULL es «no lo has
dicho»**, que aquí se lee como «vale para cualquier hueco». Lo permisivo es lo
correcto: el repertorio que ya existe no lo declaró, y negárselo lo dejaría
fuera del plan entero. `dishes.is_block` es la precisión de §39 — un guiso es lo
que es, 450 kcal y punto, y no aporta ajuste.

`dish_ingredients.min_grams`/`max_grams` son la banda de lo que se deja mover.
Las dos nulables, y **NULL significa que ese ingrediente no se ajusta**: no es
un número desconocido, es que nadie ha dicho que se pueda tocar, y un
ingrediente sin banda se queda donde la receta lo puso.

`plan_entries.status` nullable a propósito: **NULL es «no dicho», no
«saltado»**. Un plan que diera por incumplido lo que todavía no ha pasado
contaría mal la adherencia desde el lunes por la mañana.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a9e4f27b0c15"
down_revision: str | None = "f2c9d81e405b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("dishes", sa.Column("slots", sa.String(length=64), nullable=True))
    op.add_column(
        "dishes",
        sa.Column("is_block", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("dish_ingredients", sa.Column("min_grams", sa.Float(), nullable=True))
    op.add_column("dish_ingredients", sa.Column("max_grams", sa.Float(), nullable=True))

    op.create_table(
        "plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("week_start", sa.Date(), nullable=False),
        # La semilla se guarda porque sin ella el plan no se puede volver a
        # obtener, y entonces «regenerar con una regla nueva y comparar» no
        # existe: sólo habría una semana nueva sin nada con que medirla.
        sa.Column("seed", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "week_start", name="uq_plans_user_week"),
    )
    op.create_index("ix_plans_user_id", "plans", ["user_id"])

    op.create_table(
        "plan_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "plan_id",
            sa.Integer(),
            sa.ForeignKey("plans.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("log_date", sa.Date(), nullable=False),
        sa.Column("slot", sa.String(length=16), nullable=False),
        # Sin `ondelete`: un plato no se borra en esta app, se corrige.
        sa.Column("dish_id", sa.Integer(), sa.ForeignKey("dishes.id"), nullable=False),
        # Los gramos resueltos de lo ajustable, en el orden de los ingredientes.
        # El plan **congela** lo que dijo: volver a resolverlo mañana daría otra
        # cifra y habrías comido la de hoy.
        sa.Column("grams_json", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=12), nullable=True),
        sa.Column(
            "log_entry_id",
            sa.Integer(),
            sa.ForeignKey("log_entries.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_plan_entries_plan_id", "plan_entries", ["plan_id"])


def downgrade() -> None:
    op.drop_index("ix_plan_entries_plan_id", table_name="plan_entries")
    op.drop_table("plan_entries")
    op.drop_index("ix_plans_user_id", table_name="plans")
    op.drop_table("plans")
    op.drop_column("dish_ingredients", "max_grams")
    op.drop_column("dish_ingredients", "min_grams")
    op.drop_column("dishes", "is_block")
    op.drop_column("dishes", "slots")
