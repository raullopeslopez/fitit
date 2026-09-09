"""add fat and carb daily targets to users

Revision ID: f4a1c6e29b83
Revises: d2a8f31c6740
Create Date: 2026-09-09 10:00:00.000000

Nullable y sin backfill, igual que `eec6fc05a66d` hizo con kcal y proteína: una
cuenta que nunca ha fijado un objetivo no tiene objetivo, no tiene un objetivo
de cero. La diferencia importa en pantalla — la cabecera de Comida pinta lo que
**falta** de cada macro, y un objetivo de cero diría que ya has terminado.

Entran ahora porque el contrato de color de la pantalla necesita un tramo
pendiente que pintar: sin meta, una barra no mide nada. Fibra no entra: la
cabecera no la pinta, y una columna que nada lee se llena de cifras que nadie
mira.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f4a1c6e29b83"
down_revision: str | None = "d2a8f31c6740"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("objetivo_grasa", sa.Float(), nullable=True))
    op.add_column("users", sa.Column("objetivo_hidratos", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "objetivo_hidratos")
    op.drop_column("users", "objetivo_grasa")
