"""add goal profile and daily_targets

Revision ID: d5f1a09c3e42
Revises: c4e8b21d7f09
Create Date: 2026-09-23 09:00:00.000000

Las kcal dejan de teclearse. En `users` entra qué quieres que le pase a tu
cuerpo (`goal`, `goal_rate`) y lo mínimo sobre él para poder estimar el gasto
mientras no haya historial con el que medirlo. Todo nullable: una app que no
sabe tu altura no debe inventarse una media — sin estos datos la propuesta dice
qué le falta en vez de estimar a ciegas.

`daily_targets` congela el objetivo del día. En cuanto la cifra se deriva —y se
mueve sola porque bajas de peso o porque hay más historial—, leerla del perfil
reescribiría el pasado: la racha de septiembre medida contra el objetivo de
diciembre. Una fila por día, escrita la primera vez que ese día se lee y nunca
reescrita sola.

Sólo `kcal`. El reparto en macros es de las reglas, que es otra capa.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d5f1a09c3e42"
down_revision: str | None = "c4e8b21d7f09"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("goal", sa.String(length=12), nullable=True))
    op.add_column("users", sa.Column("goal_rate", sa.Float(), nullable=True))
    op.add_column("users", sa.Column("height_cm", sa.Float(), nullable=True))
    op.add_column("users", sa.Column("birth_year", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("sex", sa.String(length=8), nullable=True))

    op.create_table(
        "daily_targets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("log_date", sa.Date(), nullable=False),
        sa.Column("kcal", sa.Float(), nullable=False),
        sa.Column("source", sa.String(length=10), nullable=False, server_default="manual"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "log_date", name="uq_daily_targets_user_day"),
    )
    op.create_index("ix_daily_targets_user_id", "daily_targets", ["user_id"])
    op.create_index("ix_daily_targets_log_date", "daily_targets", ["log_date"])


def downgrade() -> None:
    op.drop_index("ix_daily_targets_log_date", table_name="daily_targets")
    op.drop_index("ix_daily_targets_user_id", table_name="daily_targets")
    op.drop_table("daily_targets")
    for column in ("sex", "birth_year", "height_cm", "goal_rate", "goal"):
        op.drop_column("users", column)
