"""add dishes.not_slots

Revision ID: c5d9a27e81f4
Revises: b3c7e19d4a62
Create Date: 2026-10-18 22:30:00.000000

«Aquí no» (épica de cuatro comidas, fase 5): las comidas en las que dijiste que
un plato no va. Se guarda aparte de `slots` porque dicen cosas distintas: un
plato sin `slots` vale para todo porque no lo has dicho, y uno con `not_slots`
no va en esa comida porque lo has dicho. Anulable y sin backfill: nadie lo dijo.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c5d9a27e81f4"
down_revision: str | None = "b3c7e19d4a62"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("dishes", sa.Column("not_slots", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("dishes", "not_slots")
