"""add a standing note to exercises

Revision ID: e1a3b7c05d22
Revises: d4f7a2c9e185
Create Date: 2026-08-05 10:00:00.000000

Nullable, no backfill: an exercise without a note is the normal case and NULL is
what "no note" means. The per-set note stays where it is — this one answers a
different question (how you do the lift, every time) and does not replace it.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e1a3b7c05d22"
down_revision: str | None = "d4f7a2c9e185"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("exercises", sa.Column("note", sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column("exercises", "note")
