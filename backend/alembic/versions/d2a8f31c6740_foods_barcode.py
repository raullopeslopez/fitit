"""foods: el código de barras del envase

Revision ID: d2a8f31c6740
Revises: c1e7b04a9d33
Create Date: 2026-09-04 01:00:00.000000

Lo que hace que escanear el mismo yogur dos veces sólo pregunte una. La primera
vez se resuelve contra Open Food Facts; a partir de ahí el código está aquí, y
la consulta es local — sin red, sin clave y sin gastar la cuota de fotos.

**Único por usuario, no global.** Aquí este esquema se separa del que el plan
original escribió: aquel daba por hecho un solo usuario y ponía el EAN como
clave primaria de una tabla `food_barcodes`. Con cuentas, esa clave global hace
que el segundo en escanear un Actimel choque contra la fila del primero — un
EAN nombra el mismo producto para todos, pero el alimento que lo lleva es de
quien lo dio de alta.

Columna y no tabla aparte porque un alimento es un producto y un producto lleva
un código. El caso que una tabla resolvería —dos EAN apuntando al mismo
alimento, el mismo yogur en pack de 4 y de 8— no ha aparecido todavía, y
promoverla el día que aparezca no pierde nada.

Nullable, y sin relleno: hoy ningún alimento tiene código. Los NULL no chocan
entre sí en ninguno de los dos motores, así que CIQUAL entero cabe debajo de la
restricción sin estorbar.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d2a8f31c6740"
down_revision: str | None = "c1e7b04a9d33"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("foods", sa.Column("barcode", sa.String(length=14), nullable=True))
    op.create_index("ix_foods_barcode", "foods", ["barcode"])
    # `batch_alter_table` y no `create_unique_constraint` a secas porque SQLite
    # no sabe añadir una restricción a una tabla ya creada: el modo batch la
    # reconstruye. En Postgres, que es producción, sale el mismo ALTER de
    # siempre. Sin esto la migración sólo se podría probar contra Postgres, y
    # `test_food_migration.py` —el fichero que comprueba que migración y
    # modelos dicen lo mismo— corre sobre SQLite.
    with op.batch_alter_table("foods") as batch:
        batch.create_unique_constraint("uq_foods_user_barcode", ["user_id", "barcode"])


def downgrade() -> None:
    with op.batch_alter_table("foods") as batch:
        batch.drop_constraint("uq_foods_user_barcode", type_="unique")
    op.drop_index("ix_foods_barcode", table_name="foods")
    op.drop_column("foods", "barcode")
