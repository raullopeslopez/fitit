"""add created_at to sets

Revision ID: d9a4b7e31c62
Revises: c4e8a1f22b30
Create Date: 2026-07-20 12:00:00.000000

Added in two steps rather than one NOT NULL column: existing rows have no
recorded moment, so they're backfilled from their workout's created_at (the
closest true value available) before the constraint goes on. Backfilling to
now() would claim every historical set was logged at deploy time.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d9a4b7e31c62"
down_revision: str | None = "c4e8a1f22b30"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sets",
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        """
        UPDATE sets
           SET created_at = (
               SELECT workouts.created_at
                 FROM workouts
                WHERE workouts.id = sets.workout_id
           )
         WHERE created_at IS NULL
        """
    )
    op.alter_column(
        "sets",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
    )


def downgrade() -> None:
    op.drop_column("sets", "created_at")
