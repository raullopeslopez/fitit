"""add client_id to sets

Revision ID: a3f7c91e2d64
Revises: b5e8d13f7a42
Create Date: 2026-09-25 22:00:00.000000

The id a client stamps on a set when it logs it, so a retry from an offline
queue is recognised instead of logged twice. Nullable, no backfill: every set
already stored came from a client that sent none, and NULLs never collide under
the unique index, so nothing existing can trip it.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3f7c91e2d64"
down_revision: str | None = "b5e8d13f7a42"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sets", sa.Column("client_id", sa.String(length=64), nullable=True))
    op.create_index("uq_sets_workout_client_id", "sets", ["workout_id", "client_id"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_sets_workout_client_id", table_name="sets")
    op.drop_column("sets", "client_id")
