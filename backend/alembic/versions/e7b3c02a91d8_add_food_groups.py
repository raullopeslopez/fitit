"""add group codes to foods

Revision ID: e7b3c02a91d8
Revises: d5f1a09c3e42
Create Date: 2026-09-23 11:00:00.000000

Para que «verdura en la comida» o «legumbres tres veces por semana» signifiquen
algo, la app tiene que saber qué es una verdura. CIQUAL lo sabe y lo trae en las
seis primeras columnas de su hoja; el import las leía y las tiraba.

Se guardan **los códigos**, no los nombres: `0201` es estable y no habla ningún
idioma, mientras que `légumes` habría que traducirlo y mantenerlo traducido. El
mapa a familias vive en `app/food_groups.py`.

Nullable, y sin relleno hacia atrás: 45 filas de CIQUAL no tienen grupo y
ningún alimento dado de alta a mano lo trae. Eso es **sin clasificar**, nunca
«no es verdura» — y una regla que cuente verduras tiene que contarlos aparte.

Los alimentos ya cargados se quedan sin código hasta que se vuelva a pasar
`scripts/import_ciqual.py`, que es idempotente y actualiza en vez de duplicar.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e7b3c02a91d8"
down_revision: str | None = "d5f1a09c3e42"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("foods", sa.Column("group_code", sa.String(length=8), nullable=True))
    op.add_column("foods", sa.Column("subgroup_code", sa.String(length=8), nullable=True))
    op.create_index("ix_foods_subgroup_code", "foods", ["subgroup_code"])


def downgrade() -> None:
    op.drop_index("ix_foods_subgroup_code", table_name="foods")
    op.drop_column("foods", "subgroup_code")
    op.drop_column("foods", "group_code")
