"""add dish ideas

Revision ID: b3d7e19a4c62
Revises: a9e4f27b0c15
Create Date: 2026-09-24 12:00:00.000000

Recetas de la web con un alimento dentro, guardadas **por alimento y sin
usuario**: una receta de acelgas no es un dato tuyo, y lo que buscó otra
persona es cuota que nadie vuelve a gastar. Lo que identifica una idea es su
enlace, de ahí la restricción única `(food_id, url)`.

`method` y `minutes` nullable: una receta que no dice cuánto tarda no tarda
cero minutos.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3d7e19a4c62"
down_revision: str | None = "a9e4f27b0c15"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "dish_ideas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("food_id", sa.Integer(), sa.ForeignKey("foods.id"), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("url", sa.String(length=1000), nullable=False),
        sa.Column("method", sa.String(length=32), nullable=True),
        sa.Column("minutes", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("food_id", "url", name="uq_dish_ideas_food_url"),
    )
    op.create_index("ix_dish_ideas_food_id", "dish_ideas", ["food_id"])


def downgrade() -> None:
    op.drop_index("ix_dish_ideas_food_id", table_name="dish_ideas")
    op.drop_table("dish_ideas")
