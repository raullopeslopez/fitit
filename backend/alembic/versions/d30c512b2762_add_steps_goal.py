"""add steps_goal to users

Revision ID: d30c512b2762
Revises: a3f7c91e2d64
Create Date: 2026-09-26 09:00:00.000000

El widget de Android enseña los pasos de hoy contra una meta diaria
(«8.432 / 10.000»). Health Connect se lee en el teléfono; aquí sólo se
guarda el número contra el que comparar. Nullable, sin valor por defecto:
`NULL` es «todavía no la has fijado», no cero — misma regla que el resto
del perfil derivado.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d30c512b2762"
down_revision: str | None = "a3f7c91e2d64"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("steps_goal", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "steps_goal")
