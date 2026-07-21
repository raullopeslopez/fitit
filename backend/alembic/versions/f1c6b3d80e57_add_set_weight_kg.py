"""add canonical weight_kg to sets

Revision ID: f1c6b3d80e57
Revises: d9a4b7e31c62
Create Date: 2026-07-21 12:00:00.000000

`weight` + `unit` stay as they are — they record what the user typed and which
unit was selected, and a unit correction rewrites only the label. The new column
carries the same weight in kilos so records, volume and 1RM stop comparing
pounds against kilos.

Stays nullable: cardio sets have no weight at all, so NOT NULL is wrong here.
Existing rows are backfilled from their own unit; the multiplier is the exact
international pound so a backfilled lb row converts identically to a new one.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1c6b3d80e57"
down_revision: str | None = "d9a4b7e31c62"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sets", sa.Column("weight_kg", sa.Float(), nullable=True))
    op.execute(
        """
        UPDATE sets
           SET weight_kg = CASE WHEN unit = 'lb' THEN weight * 0.45359237 ELSE weight END
         WHERE weight IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column("sets", "weight_kg")
