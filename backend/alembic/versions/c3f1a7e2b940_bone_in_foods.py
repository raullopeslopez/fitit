"""bone-in foods: refuse %, what the kcal refer to, and edible grams

Revision ID: c3f1a7e2b940
Revises: b8e4d2f7a915
Create Date: 2026-09-28 22:00:00.000000

Una bandeja de muslos pesa un kilo y un tercio es hueso. `foods.refuse_pct` es
cuánto; `foods.kcal_basis`, si las kcal son de la carne o de la bandeja; y
`log_entries.edible_grams`, los gramos que de verdad se comieron cuando la
entrada se pesó con hueso.

Las tres nullable y sin rellenar: NULL es «nadie lo ha dicho», y lo que valga
mientras tanto lo decide `app/refuse.py` al leer, no una migración al escribir.
Las entradas ya registradas no cambian: se pesaron sin hueso.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3f1a7e2b940"
down_revision: str | None = "b8e4d2f7a915"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("foods", sa.Column("refuse_pct", sa.Float(), nullable=True))
    op.add_column("foods", sa.Column("kcal_basis", sa.String(length=8), nullable=True))
    op.add_column("log_entries", sa.Column("edible_grams", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("log_entries", "edible_grams")
    op.drop_column("foods", "kcal_basis")
    op.drop_column("foods", "refuse_pct")
