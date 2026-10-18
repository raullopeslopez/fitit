"""add plan_entries.carbs_shift

Revision ID: b3c7e19d4a62
Revises: f8a2d4c61e93
Create Date: 2026-10-18 21:00:00.000000

El hidrato sigue al entreno: cuántos gramos ganó (+) o cedió (−) esta comida
al entrenar ese día. Anulable y sin backfill: `NULL` es «ese día no se movió
nada», que es exactamente lo que pasó en todo lo anterior.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3c7e19d4a62"
down_revision: str | None = "f8a2d4c61e93"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("plan_entries", sa.Column("carbs_shift", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("plan_entries", "carbs_shift")
