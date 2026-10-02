"""add goal weight and plan start to users

Revision ID: b8e3d51a7c20
Revises: a7c2e9f41d36
Create Date: 2026-10-02 10:00:00.000000

Las tres, nullable y sin backfill: una cuenta que nunca ha dicho a qué peso
quiere llegar no tiene meta, no tiene una meta de cero. Y el inicio del plan
sólo existe desde que se acepta una cifra con meta puesta; antes no hubo plan
que empezar, y inventarse una fecha hacia atrás sería contar semanas que no
ocurrieron.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b8e3d51a7c20"
down_revision: str | None = "a7c2e9f41d36"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("goal_weight_kg", sa.Float(), nullable=True))
    op.add_column("users", sa.Column("plan_started_on", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("plan_start_kg", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "plan_start_kg")
    op.drop_column("users", "plan_started_on")
    op.drop_column("users", "goal_weight_kg")
