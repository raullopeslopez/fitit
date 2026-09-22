"""add dishes and dish_ingredients

Revision ID: c4e8b21d7f09
Revises: a7c2e84b1d59
Create Date: 2026-09-22 09:00:00.000000

Un plato no es un alimento y por eso no es una fila de `foods`: un alimento es
una medida —CIQUAL, una etiqueta, un código— y un plato es una combinación tuya
de medidas. Mezclarlos llenaría la búsqueda de cosas que no son alimentos y
dejaría a `POST /foods` de ser la única puerta del catálogo.

`dishes.user_id` es NOT NULL, al revés que en `foods`: no hay catálogo
compartido de platos. `basis` también, porque un plato que no dice si se pesa
en crudo o en cocinado miente a medias — un filete pierde en torno a un cuarto
de su peso al cocinarse.

`log_entries.dish_id` es nullable y `ON DELETE SET NULL` por la misma razón que
`food_id`: los macros de la entrada ya están congelados y la fila se lee igual
sin el puntero. Sirve para agrupar en pantalla, no para calcular.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4e8b21d7f09"
down_revision: str | None = "a7c2e84b1d59"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "dishes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("name_folded", sa.String(length=160), nullable=False),
        sa.Column("method", sa.String(length=24), nullable=True),
        sa.Column("basis", sa.String(length=8), nullable=False, server_default="raw"),
        sa.Column("servings", sa.Float(), nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "name_folded", name="uq_dishes_user_name"),
    )
    op.create_index("ix_dishes_user_id", "dishes", ["user_id"])
    op.create_index("ix_dishes_name_folded", "dishes", ["name_folded"])

    op.create_table(
        "dish_ingredients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "dish_id",
            sa.Integer(),
            sa.ForeignKey("dishes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("food_id", sa.Integer(), sa.ForeignKey("foods.id"), nullable=False),
        sa.Column("grams", sa.Float(), nullable=False),
    )
    op.create_index("ix_dish_ingredients_dish_id", "dish_ingredients", ["dish_id"])
    op.create_index("ix_dish_ingredients_food_id", "dish_ingredients", ["food_id"])

    # Modo batch y no `add_column` a secas: SQLite no sabe añadir una clave
    # ajena con ALTER TABLE, y los tests corren sobre SQLite. Batch la recrea
    # copiando; en Postgres se traduce a un ALTER normal. La alternativa era
    # dejar la columna sin FK, que en producción es donde sí sirve.
    with op.batch_alter_table("log_entries") as batch:
        batch.add_column(sa.Column("dish_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_log_entries_dish_id", "dishes", ["dish_id"], ["id"], ondelete="SET NULL"
        )
    op.create_index("ix_log_entries_dish_id", "log_entries", ["dish_id"])


def downgrade() -> None:
    op.drop_index("ix_log_entries_dish_id", table_name="log_entries")
    with op.batch_alter_table("log_entries") as batch:
        batch.drop_constraint("fk_log_entries_dish_id", type_="foreignkey")
        batch.drop_column("dish_id")
    op.drop_index("ix_dish_ingredients_food_id", table_name="dish_ingredients")
    op.drop_index("ix_dish_ingredients_dish_id", table_name="dish_ingredients")
    op.drop_table("dish_ingredients")
    op.drop_index("ix_dishes_name_folded", table_name="dishes")
    op.drop_index("ix_dishes_user_id", table_name="dishes")
    op.drop_table("dishes")
