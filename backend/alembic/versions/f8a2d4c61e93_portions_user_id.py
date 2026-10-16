"""add portions.user_id

Revision ID: f8a2d4c61e93
Revises: e4b8c1f37a20
Create Date: 2026-10-16 20:00:00.000000

Raciones tuyas sobre cualquier alimento, también del catálogo
(docs/registro-por-voz.md). Anulable y sin backfill: las que hay son del
alimento, y eso es exactamente lo que dice `NULL`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f8a2d4c61e93"
down_revision: str | None = "e4b8c1f37a20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _postgres() -> bool:
    # La clave ajena, sólo donde se puede añadir a una tabla hecha: SQLite (el de
    # test_food_migration, que mira columnas y nulabilidad) no sabe sin modo
    # batch, y en producción no hay SQLite.
    return op.get_bind().dialect.name != "sqlite"


def upgrade() -> None:
    op.add_column("portions", sa.Column("user_id", sa.Integer(), nullable=True))
    op.create_index("ix_portions_user_id", "portions", ["user_id"])
    if _postgres():
        op.create_foreign_key(
            "fk_portions_user_id", "portions", "users", ["user_id"], ["id"], ondelete="CASCADE"
        )


def downgrade() -> None:
    if _postgres():
        op.drop_constraint("fk_portions_user_id", "portions", type_="foreignkey")
    op.drop_index("ix_portions_user_id", table_name="portions")
    op.drop_column("portions", "user_id")
