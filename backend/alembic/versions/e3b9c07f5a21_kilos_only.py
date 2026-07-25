"""collapse weights to kilos and drop the unit columns

Revision ID: e3b9c07f5a21
Revises: f1c6b3d80e57
Create Date: 2026-07-25 12:00:00.000000

The kg/lb and km/mi toggles are gone (see DESIGN.md, 2026-07-25): a sticky unit
you can flip mid-session is a way to corrupt your own log, and one flip did —
a 90 lb pulldown stored as 90 kg, inventing a record. With one unit there is
nothing for `unit` to say and nothing for `weight_kg` to disambiguate.

`weight` becomes the canonical kilo value, taken from `weight_kg` rather than
recomputed, so a row that was already relabelled keeps the number its records
were built on. Distances in miles are converted before `distance_unit` goes;
the multiplier is the international mile.

Irreversible in the strict sense: `downgrade` puts the columns back and marks
everything kg, which is true of every row it will ever see again but cannot
resurrect the provenance of the handful of pounds rows that existed. That is
accepted — the columns exist to support a feature that no longer does.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e3b9c07f5a21"
down_revision: str | None = "f1c6b3d80e57"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MI_TO_KM = 1.609344


def upgrade() -> None:
    # Kilos into `weight`, from the canonical column: `weight_kg` is what every
    # record and 1RM was computed from, so copying it (rather than converting
    # `weight` again) is what keeps the numbers you have already seen.
    op.execute("UPDATE sets SET weight = weight_kg WHERE weight_kg IS NOT NULL")
    op.execute(
        f"UPDATE sets SET distance = distance * {MI_TO_KM} "
        "WHERE distance_unit = 'mi' AND distance IS NOT NULL"
    )
    # batch_alter_table so the drops are portable to SQLite, which the test
    # suite runs on and which cannot DROP COLUMN in place on older versions.
    with op.batch_alter_table("sets") as batch:
        batch.drop_column("weight_kg")
        batch.drop_column("unit")
        batch.drop_column("distance_unit")


def downgrade() -> None:
    with op.batch_alter_table("sets") as batch:
        batch.add_column(sa.Column("unit", sa.String(length=4), nullable=True))
        batch.add_column(sa.Column("weight_kg", sa.Float(), nullable=True))
        batch.add_column(sa.Column("distance_unit", sa.String(length=4), nullable=True))
    # Everything is kilos and kilometres now, so that is what goes back.
    op.execute("UPDATE sets SET unit = 'kg', weight_kg = weight")
    op.execute("UPDATE sets SET distance_unit = 'km' WHERE distance IS NOT NULL")
    with op.batch_alter_table("sets") as batch:
        batch.alter_column("unit", existing_type=sa.String(length=4), nullable=False)
