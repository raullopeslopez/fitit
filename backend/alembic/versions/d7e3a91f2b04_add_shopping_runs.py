"""add shopping runs

Revision ID: d7e3a91f2b04
Revises: c5d9e27b4a31
Create Date: 2026-10-13 21:00:00.000000

La compra de cada semana (plan v2): cuándo se mandó su lista a Taski y cuándo se
subió el ticket que la cierra. Aparte de `plans`, porque regenerar la semana
borra el plan y la compra ya ha pasado. Sólo `ticket_at` es nulable: una compra
sin ticket está a medias; sin envío no es una compra.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d7e3a91f2b04"
down_revision: str | None = "c5d9e27b4a31"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "shopping_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ticket_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "week_start", name="uq_shopping_runs_user_week"),
    )


def downgrade() -> None:
    op.drop_table("shopping_runs")
