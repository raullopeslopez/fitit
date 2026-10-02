"""Separa Glúteo de Femoral.

Femoral llevaba isquios y glúteo juntos. Con Glúteo como décimo grupo, todo
ejercicio guardado como «Femoral» cuyo nombre es trabajo de glúteo —hip thrust,
puente, patada, abductor— pasa a «Glúteo». La bisagra (curl femoral, rumano,
banco romano, aductor) se queda: el glúteo la cobra como secundario, al leer.

Sólo se tocan filas guardadas como Femoral. Lo que esté en otro grupo lo decidió
alguien y se respeta; y NULL significa «que lo diga el clasificador», que ya lee
el nombre al servir la fila.

Las keywords están congeladas aquí a propósito, en vez de importar `classify`:
una migración que lee el clasificador vivo cambia de resultado cada vez que
alguien toca una keyword, y deja de describir lo que hizo.

Revision ID: a7c2e9f41d36
Revises: c3f1a7e2b940
Create Date: 2026-10-02
"""

import unicodedata
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a7c2e9f41d36"
down_revision: str | None = "c3f1a7e2b940"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FEMORAL = "Femoral"
GLUTEO = "Glúteo"

# La lista de GLUTEO en `app/muscles.py` el día de la separación.
GLUTE_KEYWORDS = (
    "hip thrust", "hipthrust", "hip-thrust", "empuje de cadera", "gluteo",
    "glute", "patada de gluteo",
    "puente de gluteo", "rear kick", "abductor", "abduccion", "abduction",
)


def _fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, name FROM exercises WHERE muscle_group = :femoral"),
        {"femoral": FEMORAL},
    ).all()
    for row in rows:
        if any(k in _fold(row.name) for k in GLUTE_KEYWORDS):
            conn.execute(
                sa.text("UPDATE exercises SET muscle_group = :group WHERE id = :id"),
                {"group": GLUTEO, "id": row.id},
            )


def downgrade() -> None:
    """De vuelta a un solo grupo. Sin pérdida para lo que movió la subida; lo que
    se etiquetó Glúteo después también vuelve a Femoral, que era su único sitio."""
    conn = op.get_bind()
    conn.execute(
        sa.text("UPDATE exercises SET muscle_group = :femoral WHERE muscle_group = :gluteo"),
        {"femoral": FEMORAL, "gluteo": GLUTEO},
    )
