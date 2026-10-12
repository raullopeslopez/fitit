"""add pantry

Revision ID: c5d9e27b4a31
Revises: a3f8d51c7e20
Create Date: 2026-10-12 23:00:00.000000

Lo que hay en casa (registro sin huecos, fase 6.1): las líneas revisadas de un
ticket de la compra, un alimento y sus gramos por fila, con el día de la compra.
Sin columnas nulables: una línea sin alimento o sin gramos no se guarda.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c5d9e27b4a31"
down_revision: str | None = "a3f8d51c7e20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pantry_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("food_id", sa.Integer(), nullable=False),
        sa.Column("grams", sa.Float(), nullable=False),
        sa.Column("bought_on", sa.Date(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["food_id"], ["foods.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pantry_items_user_id", "pantry_items", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_pantry_items_user_id", table_name="pantry_items")
    op.drop_table("pantry_items")
