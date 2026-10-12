"""dish kind fuera

Revision ID: e7b3c94a2f18
Revises: b5d2e8f41a67
Create Date: 2026-10-12 18:00:00.000000

Tus sitios (registro sin huecos, fase 3). Un sitio donde comes fuera es un
plato tuyo más, con sus líneas y su cifra por ración, para que la segunda vez se
apunte de un toque. Dos columnas, las dos NOT NULL con valor por defecto, así
que todo plato que ya existe queda como lo que era:

- `dishes.kind`: 'casa' | 'fuera'. Un sitio no es algo que cocines, así que ni
  sale en tus platos ni lo pone el generador en una semana.
- `dishes.estimated`: sus gramos los puso un modelo y no los has corregido. Lo
  que se apunta desde él lleva `entry_source = 'estimated'` hasta que lo
  corrijas; lo ya apuntado queda congelado como estaba.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e7b3c94a2f18"
down_revision: str | None = "b5d2e8f41a67"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "dishes",
        sa.Column("kind", sa.String(length=8), nullable=False, server_default="casa"),
    )
    op.add_column(
        "dishes",
        sa.Column("estimated", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    with op.batch_alter_table("dishes") as batch:
        batch.drop_column("estimated")
        batch.drop_column("kind")
