"""add foods.package_grams

Revision ID: d3f7a1c9e254
Revises: c9a4f6e2b183
Create Date: 2026-10-07 18:00:00.000000

Nullable y sin backfill: lo rellena `scripts/import_off.py` desde el `quantity`
de Open Food Facts. Un alimento sin envase conocido se compra al peso.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d3f7a1c9e254"
down_revision: str | None = "c9a4f6e2b183"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("foods", sa.Column("package_grams", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("foods", "package_grams")
