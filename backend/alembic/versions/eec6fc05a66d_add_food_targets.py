"""add daily food targets to users

Revision ID: eec6fc05a66d
Revises: b8d0f42a6e17
Create Date: 2026-09-03 09:00:00.000000

Nullable, no backfill: an account that has never set a goal has no goal, not a
goal of zero — the hero on Comida falls back to plain totals until one is set,
exactly like a nutrient nobody has measured falls back to a dash. Fixed per
user, not per day: `objetivo_kcal`/`objetivo_proteina` live on `users`, not on
`log_entries` or a per-day row, so changing your goal today does not rewrite
what yesterday's screen showed.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "eec6fc05a66d"
down_revision: str | None = "b8d0f42a6e17"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("objetivo_kcal", sa.Float(), nullable=True))
    op.add_column("users", sa.Column("objetivo_proteina", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "objetivo_proteina")
    op.drop_column("users", "objetivo_kcal")
