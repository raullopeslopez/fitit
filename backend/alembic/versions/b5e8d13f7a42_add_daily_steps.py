"""add daily_steps

Revision ID: b5e8d13f7a42
Revises: d6a2f84c19e3
Create Date: 2026-09-25 12:00:00.000000

Los pasos de cada día, tal como los cuenta el móvil (Health Connect) y los sube
la app de Android. Tabla aparte con una fila por persona y día.

`UNIQUE (user_id, date)`: el recuento de un día crece mientras el día dura, así
que una lectura posterior del mismo día es la más completa y el router escribe
encima en vez de sumar. `steps` es NOT NULL porque una fila sin pasos no es un
día medido — un día que no se subió no tiene fila, y esa ausencia se lee como
desconocida y nunca como un cero.

`date` es un día civil, el del teléfono: no pasa por el corte de las 04:00 del
diario de comida (ver `BodyWeight.measured_on`).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b5e8d13f7a42"
down_revision: str | None = "d6a2f84c19e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "daily_steps",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("steps", sa.Integer(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "date", name="uq_daily_steps_user_day"),
        sa.CheckConstraint("steps >= 0", name="ck_daily_steps_non_negative"),
    )
    op.create_index("ix_daily_steps_user_id", "daily_steps", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_daily_steps_user_id", table_name="daily_steps")
    op.drop_table("daily_steps")
