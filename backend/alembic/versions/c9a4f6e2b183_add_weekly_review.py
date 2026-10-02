"""add weekly review: users.review_weekday and weekly_reviews

Revision ID: c9a4f6e2b183
Revises: b8e3d51a7c20
Create Date: 2026-10-02 12:00:00.000000

`review_weekday` es NOT NULL con default 6 (domingo): las cuentas que ya existen
reciben el domingo en la propia migración, sin backfill aparte. La tabla guarda
una respuesta por usuario y día de revisión; contestar otra vez la sobrescribe.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9a4f6e2b183"
down_revision: str | None = "b8e3d51a7c20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("review_weekday", sa.Integer(), nullable=False, server_default="6"),
    )
    op.create_table(
        "weekly_reviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("review_date", sa.Date(), nullable=False),
        sa.Column("answer", sa.String(8), nullable=False),
        sa.Column("proposed_kcal", sa.Float(), nullable=True),
        sa.Column("accepted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("user_id", "review_date", name="uq_weekly_reviews_user_date"),
    )
    op.create_index("ix_weekly_reviews_user_id", "weekly_reviews", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_weekly_reviews_user_id", table_name="weekly_reviews")
    op.drop_table("weekly_reviews")
    op.drop_column("users", "review_weekday")
