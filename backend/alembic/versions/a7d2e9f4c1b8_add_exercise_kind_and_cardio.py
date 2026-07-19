"""add exercise kind and cardio metrics

Revision ID: a7d2e9f4c1b8
Revises: c4e8a1f22b30
Create Date: 2026-07-19 12:00:00.000000

Exercises gain a `kind` (defaults to "strength", so existing rows stay strength).
Sets gain cardio metrics (duration_seconds, distance, distance_unit) and their
strength metrics (reps, weight) become nullable — a set is one kind or the other.
batch_alter_table keeps the reps/weight nullability change portable to SQLite.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7d2e9f4c1b8"
down_revision: str | None = "c4e8a1f22b30"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "exercises",
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="strength"),
    )
    with op.batch_alter_table("sets") as batch:
        batch.add_column(sa.Column("duration_seconds", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("distance", sa.Float(), nullable=True))
        batch.add_column(sa.Column("distance_unit", sa.String(length=4), nullable=True))
        batch.alter_column("reps", existing_type=sa.Integer(), nullable=True)
        batch.alter_column("weight", existing_type=sa.Float(), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("sets") as batch:
        batch.alter_column("weight", existing_type=sa.Float(), nullable=False)
        batch.alter_column("reps", existing_type=sa.Integer(), nullable=False)
        batch.drop_column("distance_unit")
        batch.drop_column("distance")
        batch.drop_column("duration_seconds")
    op.drop_column("exercises", "kind")
