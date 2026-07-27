"""scope exercises and days by user

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-27 12:05:00.000000

Exercises and days were global tables — one training log shared by whoever
held a valid token. Every row here backfills to the single user the previous
migration just seeded, which is safe because that migration is the only way
a `users` row can exist before this one runs (there is no register endpoint
yet at this point in the chain).

Workouts and sets don't get their own `user_id`: ownership already flows
through `Workout.day_id` and `SetEntry.workout_id`, and every query that
needs it already joins through `days` or `exercises`.

Uniqueness moves from global (one "Press banca" ever, one training day ever)
to per-user (one each per person).
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    seed_user_id = conn.execute(sa.text("SELECT id FROM users LIMIT 1")).scalar()

    op.drop_index(op.f("ix_exercises_name"), table_name="exercises")
    with op.batch_alter_table("exercises") as batch:
        batch.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
    if seed_user_id is not None:
        op.execute(f"UPDATE exercises SET user_id = {seed_user_id}")
    with op.batch_alter_table("exercises") as batch:
        batch.alter_column("user_id", existing_type=sa.Integer(), nullable=False)
        batch.create_foreign_key(
            "fk_exercises_user_id_users", "users", ["user_id"], ["id"], ondelete="CASCADE"
        )
        batch.create_unique_constraint("uq_exercises_user_id_name", ["user_id", "name"])
    op.create_index(op.f("ix_exercises_user_id"), "exercises", ["user_id"], unique=False)
    op.create_index(op.f("ix_exercises_name"), "exercises", ["name"], unique=False)

    op.drop_index(op.f("ix_days_date"), table_name="days")
    with op.batch_alter_table("days") as batch:
        batch.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
    if seed_user_id is not None:
        op.execute(f"UPDATE days SET user_id = {seed_user_id}")
    with op.batch_alter_table("days") as batch:
        batch.alter_column("user_id", existing_type=sa.Integer(), nullable=False)
        batch.create_foreign_key(
            "fk_days_user_id_users", "users", ["user_id"], ["id"], ondelete="CASCADE"
        )
        batch.create_unique_constraint("uq_days_user_id_date", ["user_id", "date"])
    op.create_index(op.f("ix_days_user_id"), "days", ["user_id"], unique=False)
    op.create_index(op.f("ix_days_date"), "days", ["date"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_days_date"), table_name="days")
    op.drop_index(op.f("ix_days_user_id"), table_name="days")
    with op.batch_alter_table("days") as batch:
        batch.drop_constraint("uq_days_user_id_date", type_="unique")
        batch.drop_constraint("fk_days_user_id_users", type_="foreignkey")
        batch.drop_column("user_id")
    op.create_index(op.f("ix_days_date"), "days", ["date"], unique=True)

    op.drop_index(op.f("ix_exercises_name"), table_name="exercises")
    op.drop_index(op.f("ix_exercises_user_id"), table_name="exercises")
    with op.batch_alter_table("exercises") as batch:
        batch.drop_constraint("uq_exercises_user_id_name", type_="unique")
        batch.drop_constraint("fk_exercises_user_id_users", type_="foreignkey")
        batch.drop_column("user_id")
    op.create_index(op.f("ix_exercises_name"), "exercises", ["name"], unique=True)
