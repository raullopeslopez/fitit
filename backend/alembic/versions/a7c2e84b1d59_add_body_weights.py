"""add body_weights

Revision ID: a7c2e84b1d59
Revises: f4a1c6e29b83
Create Date: 2026-09-21 12:00:00.000000

La primera pieza de la dieta planificada: sin kilos no hay «1,5 g/kg» ni forma
de medir el gasto real. Tabla aparte y no columna en `users` porque lo que hace
falta no es cuánto pesas, es cómo se ha movido — una sola cifra no distingue
bajar dos kilos de haber cenado pronto.

`UNIQUE (user_id, measured_on)`: una pesada por día. Las dos de un mismo día son
medidas del mismo hecho, así que la segunda corrige a la primera en vez de
sumarse a ella; el router escribe encima. `kg` es NOT NULL porque una fila sin
peso no es una pesada — cuando no te pesas no hay fila, y esa ausencia la trata
`app/weight.py` como desconocida y nunca como un cero.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7c2e84b1d59"
down_revision: str | None = "f4a1c6e29b83"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "body_weights",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("measured_on", sa.Date(), nullable=False),
        sa.Column("kg", sa.Float(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "measured_on", name="uq_body_weights_user_day"),
    )
    op.create_index("ix_body_weights_user_id", "body_weights", ["user_id"])
    op.create_index("ix_body_weights_measured_on", "body_weights", ["measured_on"])


def downgrade() -> None:
    op.drop_index("ix_body_weights_measured_on", table_name="body_weights")
    op.drop_index("ix_body_weights_user_id", table_name="body_weights")
    op.drop_table("body_weights")
