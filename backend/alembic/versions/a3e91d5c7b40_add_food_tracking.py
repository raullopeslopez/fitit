"""add food tracking tables

Revision ID: a3e91d5c7b40
Revises: c9f4a1e70b28
Create Date: 2026-08-31 12:00:00.000000

Phase 1 of food tracking: the catalogue (`foods`, `food_aliases`, `portions`)
and the diary (`log_entries`). Same database as the training log, deliberately —
the point of the whole feature is being able to read the two against each other,
and a second database would make that a join nobody can write.

Two shapes here are decisions, not defaults:

* **Every nutrient column is nullable.** NULL means nobody measured it, which is
  not the same claim as zero. A NOT NULL DEFAULT 0 would turn every unmeasured
  micronutrient in CIQUAL into a measurement of none.
* **`log_entries` carries its own copies of the macros.** It is not a join onto
  `foods`, and that is the point: correcting a food next March must not restate
  what last September's totals said. `log_entries.food_id` is ON DELETE SET NULL
  and `food_name_snapshot` is NOT NULL for the same reason — deleting a food you
  stopped buying must not delete the fortnight you ate it.

`foods.user_id` is nullable: NULL is the shared catalogue (CIQUAL, later Open
Food Facts), which is reference data rather than anybody's belongings. A row
with a user_id is a food that user typed, and the only kind they may correct.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3e91d5c7b40"
down_revision: str | None = "c9f4a1e70b28"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "foods",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("name_folded", sa.String(length=160), nullable=False),
        sa.Column("brand", sa.String(length=120), nullable=True),
        sa.Column("source", sa.String(length=16), nullable=False, server_default="manual"),
        sa.Column("source_ref", sa.String(length=64), nullable=True),
        sa.Column(
            "carb_convention", sa.String(length=16), nullable=False, server_default="available"
        ),
        # Nullable on purpose, all five. See the module docstring.
        sa.Column("kcal_100g", sa.Float(), nullable=True),
        sa.Column("protein_100g", sa.Float(), nullable=True),
        sa.Column("fat_100g", sa.Float(), nullable=True),
        sa.Column("carbs_100g", sa.Float(), nullable=True),
        sa.Column("fiber_100g", sa.Float(), nullable=True),
        sa.Column("nutrients_json", sa.Text(), nullable=True),
        sa.Column("is_recipe", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index(op.f("ix_foods_user_id"), "foods", ["user_id"])
    op.create_index(op.f("ix_foods_name_folded"), "foods", ["name_folded"])

    op.create_table(
        "food_aliases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "food_id",
            sa.Integer(),
            sa.ForeignKey("foods.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("alias", sa.String(length=160), nullable=False),
        sa.Column("alias_folded", sa.String(length=160), nullable=False),
    )
    op.create_index(op.f("ix_food_aliases_food_id"), "food_aliases", ["food_id"])
    op.create_index(op.f("ix_food_aliases_alias_folded"), "food_aliases", ["alias_folded"])

    op.create_table(
        "portions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "food_id",
            sa.Integer(),
            sa.ForeignKey("foods.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("label", sa.String(length=60), nullable=False),
        sa.Column("grams", sa.Float(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index(op.f("ix_portions_food_id"), "portions", ["food_id"])

    op.create_table(
        "log_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("logged_at", sa.DateTime(timezone=True), nullable=False),
        # The food day, 04:00 → 04:00 on the clock the client sent. Derived on
        # write because the offset that decided it is gone from a UTC timestamp.
        sa.Column("log_date", sa.Date(), nullable=False),
        sa.Column("meal_slot", sa.String(length=16), nullable=True),
        sa.Column(
            "food_id",
            sa.Integer(),
            sa.ForeignKey("foods.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("food_name_snapshot", sa.String(length=160), nullable=False),
        sa.Column("grams", sa.Float(), nullable=False),
        # FROZEN at the moment of writing. Never recomputed from `foods`.
        sa.Column("kcal", sa.Float(), nullable=True),
        sa.Column("protein", sa.Float(), nullable=True),
        sa.Column("fat", sa.Float(), nullable=True),
        sa.Column("carbs", sa.Float(), nullable=True),
        sa.Column("fiber", sa.Float(), nullable=True),
        sa.Column("nutrients_json", sa.Text(), nullable=True),
        sa.Column("entry_source", sa.String(length=16), nullable=False, server_default="manual"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index(op.f("ix_log_entries_user_id"), "log_entries", ["user_id"])
    op.create_index(op.f("ix_log_entries_food_id"), "log_entries", ["food_id"])
    # Every read of the diary is "this user, this day".
    op.create_index("idx_log_entries_user_date", "log_entries", ["user_id", "log_date"])


def downgrade() -> None:
    op.drop_table("log_entries")
    op.drop_table("portions")
    op.drop_table("food_aliases")
    op.drop_table("foods")
