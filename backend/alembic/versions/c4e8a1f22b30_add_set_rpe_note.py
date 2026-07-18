"""add rpe and note to sets

Revision ID: c4e8a1f22b30
Revises: b7f3c2a10d94
Create Date: 2026-07-18 09:00:00.000000

Both columns are nullable — no backfill needed, existing sets keep NULL.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4e8a1f22b30"
down_revision: str | None = "b7f3c2a10d94"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sets", sa.Column("rpe", sa.Float(), nullable=True))
    op.add_column("sets", sa.Column("note", sa.String(length=280), nullable=True))


def downgrade() -> None:
    op.drop_column("sets", "note")
    op.drop_column("sets", "rpe")
