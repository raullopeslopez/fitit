"""dish from idea

Revision ID: d6a2f84c19e3
Revises: b3d7e19a4c62
Create Date: 2026-09-24 18:00:00.000000

Convertir una idea en plato (fase 2). Dos columnas, las dos nullable:

- `dish_ideas.recipe_json`: lo que la página publica (líneas de ingredientes y
  raciones), leído **una vez**. Una idea es de todos —se guarda por alimento y
  sin usuario—, y lo que dice una página también. NULL es «todavía no se ha
  leído», no «no tiene ingredientes»: una página sin JSON-LD se guarda como
  leída y vacía, para no volver a pedirla.
- `dishes.idea_id`: de qué idea salió el plato. Va en el plato y no en la idea
  porque la idea es compartida y el plato es tuyo: un `dish_id` en la idea
  marcaría como «Guardado» tu plato en la pantalla de otra persona, y el
  segundo en guardarla pisaría al primero. NULL en todo plato dado de alta a
  mano, que son todos los anteriores.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d6a2f84c19e3"
down_revision: str | None = "b3d7e19a4c62"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("dish_ideas", sa.Column("recipe_json", sa.Text(), nullable=True))
    # En lote: SQLite no sabe añadir una clave ajena con ALTER, y en Postgres
    # el lote son las dos sentencias de siempre.
    with op.batch_alter_table("dishes") as batch:
        batch.add_column(sa.Column("idea_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_dishes_idea_id", "dish_ideas", ["idea_id"], ["id"])
    op.create_index("ix_dishes_idea_id", "dishes", ["idea_id"])


def downgrade() -> None:
    op.drop_index("ix_dishes_idea_id", table_name="dishes")
    with op.batch_alter_table("dishes") as batch:
        batch.drop_constraint("fk_dishes_idea_id", type_="foreignkey")
        batch.drop_column("idea_id")
    with op.batch_alter_table("dish_ideas") as batch:
        batch.drop_column("recipe_json")
