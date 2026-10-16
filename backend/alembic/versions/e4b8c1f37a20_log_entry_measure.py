"""add log_entries.measure and measure_count

Revision ID: e4b8c1f37a20
Revises: d7e3a91f2b04
Create Date: 2026-10-16 18:00:00.000000

Medidas caseras (docs/medidas-caseras.md): «2 cdas» apuntadas guardan la
medida junto a los gramos que pesan. Anulables y sin backfill: todo lo que hay
se pesó en gramos, y eso es exactamente lo que dice `NULL`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e4b8c1f37a20"
down_revision: str | None = "d7e3a91f2b04"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("log_entries", sa.Column("measure", sa.String(length=8), nullable=True))
    op.add_column("log_entries", sa.Column("measure_count", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("log_entries", "measure_count")
    op.drop_column("log_entries", "measure")
