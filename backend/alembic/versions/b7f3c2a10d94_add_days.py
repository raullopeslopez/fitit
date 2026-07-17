"""add days table and move workout date onto it

Revision ID: b7f3c2a10d94
Revises: 5e1ad7ca1081
Create Date: 2026-07-17 21:30:00.000000

A "day" groups one or more workouts. The date moves from workouts onto a new
`days` table; existing workouts are backfilled into one day per distinct date.

Postgres DDL is transactional, so a failure here rolls back atomically — the
`date` column is only dropped after every workout has been linked to a day.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7f3c2a10d94"
down_revision: str | None = "5e1ad7ca1081"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "days",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_days_date"), "days", ["date"], unique=True)

    op.add_column("workouts", sa.Column("day_id", sa.Integer(), nullable=True))

    # Backfill: one day per distinct existing workout date, then link each workout.
    op.execute("INSERT INTO days (date) SELECT DISTINCT date FROM workouts")
    op.execute(
        "UPDATE workouts SET day_id = days.id FROM days WHERE days.date = workouts.date"
    )

    # Every workout is now linked; enforce it before dropping the old column.
    op.alter_column("workouts", "day_id", nullable=False)
    op.create_index(op.f("ix_workouts_day_id"), "workouts", ["day_id"], unique=False)
    op.create_foreign_key(
        "fk_workouts_day_id_days",
        "workouts",
        "days",
        ["day_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_index("ix_workouts_date", table_name="workouts")
    op.drop_column("workouts", "date")


def downgrade() -> None:
    op.add_column("workouts", sa.Column("date", sa.Date(), nullable=True))
    op.execute(
        "UPDATE workouts SET date = days.date FROM days WHERE days.id = workouts.day_id"
    )
    op.alter_column("workouts", "date", nullable=False)
    op.create_index("ix_workouts_date", "workouts", ["date"], unique=False)

    op.drop_constraint("fk_workouts_day_id_days", "workouts", type_="foreignkey")
    op.drop_index(op.f("ix_workouts_day_id"), table_name="workouts")
    op.drop_column("workouts", "day_id")

    op.drop_index(op.f("ix_days_date"), table_name="days")
    op.drop_table("days")
