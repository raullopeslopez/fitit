"""foods: la marca, buscable

Revision ID: c1e7b04a9d33
Revises: eec6fc05a66d
Create Date: 2026-09-03 10:00:00.000000

`brand` se guardaba desde el primer día y no se buscaba: la consulta de
`/foods` filtra por `name_folded` y por alias, y la marca no entraba. Un yogur
dado de alta como «Yogur natural» de «Hacendado» era invisible escribiendo
«hacendado», que es justo como se busca un producto envasado — del nombre
comercial no te acuerdas, del súper sí.

Columna aparte y plegada en vez de plegar al vuelo por lo mismo que
`name_folded` (ver `app/naming.py`): quitar acentos no tiene forma portable en
SQL — Postgres necesitaría `unaccent` y SQLite no tiene nada.

Nullable, y sin relleno que hacer: el catálogo CIQUAL no trae marcas, así que
hoy todas las filas la tienen a NULL.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c1e7b04a9d33"
down_revision: str | None = "eec6fc05a66d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("foods", sa.Column("brand_folded", sa.String(length=120), nullable=True))
    op.create_index("ix_foods_brand_folded", "foods", ["brand_folded"])


def downgrade() -> None:
    op.drop_index("ix_foods_brand_folded", table_name="foods")
    op.drop_column("foods", "brand_folded")
