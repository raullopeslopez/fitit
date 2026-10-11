"""add pautas

Revision ID: b5d2e8f41a67
Revises: d3f7a1c9e254
Create Date: 2026-10-11 10:30:00.000000

La pauta: el plan del nutricionista, leído de un PDF. Qué plato va en cada
comida de cada día de la semana, vigente desde un lunes hasta que llega otra.
Sin columnas nulables: una casilla de la pauta sin plato no se guarda, la deja
al generador.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b5d2e8f41a67"
down_revision: str | None = "d3f7a1c9e254"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pautas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("active_from", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_pautas_user_id"), "pautas", ["user_id"], unique=False)
    op.create_table(
        "pauta_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pauta_id", sa.Integer(), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("slot", sa.String(length=16), nullable=False),
        sa.Column("dish_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["dish_id"], ["dishes.id"]),
        sa.ForeignKeyConstraint(["pauta_id"], ["pautas.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("pauta_id", "weekday", "slot", name="uq_pauta_entries_slot"),
    )
    op.create_index(
        op.f("ix_pauta_entries_pauta_id"), "pauta_entries", ["pauta_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_pauta_entries_pauta_id"), table_name="pauta_entries")
    op.drop_table("pauta_entries")
    op.drop_index(op.f("ix_pautas_user_id"), table_name="pautas")
    op.drop_table("pautas")
