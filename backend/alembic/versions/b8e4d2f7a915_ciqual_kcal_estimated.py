"""estimate missing CIQUAL kcal by Atwater, and say so

Revision ID: b8e4d2f7a915
Revises: d30c512b2762
Create Date: 2026-09-28 20:00:00.000000

887 de los 3185 alimentos de CIQUAL no traen energía, y una sola entrada sin kcal
deja el total del día entero sin número: un plátano macho en la merienda y la
cabecera de Comida pinta una raya. 794 de ellos sí traen proteína, grasa e
hidratos, así que las kcal se estiman con los factores de la UE —los mismos de
`app/nutrition.atwater_kcal`— y `kcal_estimated` lo deja escrito.

La misma regla que `scripts/ciqual.py:estimate_kcal`, repetida aquí en SQL a
propósito: una migración no importa código de la app, que mañana puede decir
otra cosa. La fibra desconocida cuenta como 0; los otros tres son obligatorios.

Sólo toca `foods`. Las entradas del diario están congeladas
(`app/nutrition.py`) y no se recalculan desde el alimento.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b8e4d2f7a915"
down_revision: str | None = "d30c512b2762"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "foods",
        sa.Column("kcal_estimated", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute(
        """
        UPDATE foods
        SET kcal_100g = ROUND(CAST(
                4 * protein_100g + 9 * fat_100g + 4 * carbs_100g
                + 2 * COALESCE(fiber_100g, 0)
            AS NUMERIC), 2),
            kcal_estimated = TRUE
        WHERE source = 'ciqual'
          AND kcal_100g IS NULL
          AND protein_100g IS NOT NULL
          AND fat_100g IS NOT NULL
          AND carbs_100g IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute("UPDATE foods SET kcal_100g = NULL WHERE kcal_estimated")
    op.drop_column("foods", "kcal_estimated")
