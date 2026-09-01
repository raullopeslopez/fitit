"""foods: source + source_ref únicos

Revision ID: b8d0f42a6e17
Revises: a3e91d5c7b40
Create Date: 2026-08-31 13:00:00.000000

Lo que hace idempotente el import de CIQUAL. `alim_code` identifica un alimento
en la tabla de ANSES, así que `('ciqual', '9621')` sólo puede haber uno: volver
a ejecutar el import actualiza la fila en vez de plantar un segundo `Son de blé`
al lado del primero. Sin esta restricción, «idempotente» dependería de que el
script se acordara de mirar antes de insertar, que es exactamente la clase de
garantía que la base de datos debería estar dando.

No estorba a los alimentos manuales: llevan `source_ref` a NULL, y tanto
Postgres como SQLite consideran distintos dos NULL a efectos de unicidad — así
que puedes dar de alta a mano tantos como quieras.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b8d0f42a6e17"
down_revision: str | None = "a3e91d5c7b40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint("uq_foods_source_source_ref", "foods", ["source", "source_ref"])


def downgrade() -> None:
    op.drop_constraint("uq_foods_source_source_ref", "foods", type_="unique")
