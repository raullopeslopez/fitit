"""add batches

Revision ID: a3f8d51c7e20
Revises: e7b3c94a2f18
Create Date: 2026-10-12 21:00:00.000000

Pesar una vez, al cocinar (registro sin huecos, fase 5). Una tanda es la olla
de un plato pesada al sacarla del fuego: cada comida es una fracción de ella, y
lo que se congela en el diario es esa fracción de la receta entera. Sin columnas
nulables: una olla sin peso o sin día no es una tanda.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3f8d51c7e20"
down_revision: str | None = "e7b3c94a2f18"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "batches",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("dish_id", sa.Integer(), nullable=False),
        sa.Column("cooked_grams", sa.Float(), nullable=False),
        sa.Column("cooked_on", sa.Date(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["dish_id"], ["dishes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_batches_user_id", "batches", ["user_id"])
    op.create_index("ix_batches_dish_id", "batches", ["dish_id"])


def downgrade() -> None:
    op.drop_index("ix_batches_dish_id", table_name="batches")
    op.drop_index("ix_batches_user_id", table_name="batches")
    op.drop_table("batches")
