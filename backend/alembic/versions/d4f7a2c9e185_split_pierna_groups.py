"""Split the "Pierna" muscle group into Cuádriceps / Femoral / Gemelo.

A single leg bucket made the new weekly-set reference meaningless: twenty sets of
"Pierna" could be twenty sets of squats with the calves untouched. The group is
stored on the exercise, so this is a pure data rewrite — every exercise tagged
"Pierna" is re-read by the same keyword classifier the app uses and re-filed.

A name the classifier can't read stays in leg work rather than losing its tag:
"Pierna" was information the user entered by hand, and Cuádriceps is both the
largest bucket and one tap from being corrected.

Revision ID: d4f7a2c9e185
Revises: b2c3d4e5f6a7
Create Date: 2026-08-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.muscles import CUADRICEPS, FEMORAL, GEMELO, GLUTEO, classify

revision: str = "d4f7a2c9e185"
down_revision: str | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

LEGACY = "Pierna"
LEG_GROUPS = (CUADRICEPS, FEMORAL, GEMELO)


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, name FROM exercises WHERE muscle_group = :legacy"),
        {"legacy": LEGACY},
    ).all()
    for row in rows:
        guess = classify(row.name)
        # Glúteo did not exist yet: the classifier now files hip thrusts there,
        # but at this revision they were Femoral, and a7c2e9f41d36 is what moves
        # them on. Without this they would fall through to Cuádriceps.
        if guess == GLUTEO:
            guess = FEMORAL
        group = guess if guess in LEG_GROUPS else CUADRICEPS
        conn.execute(
            sa.text("UPDATE exercises SET muscle_group = :group WHERE id = :id"),
            {"group": group, "id": row.id},
        )


def downgrade() -> None:
    """Back to one bucket. Lossy by nature — the split can be redone from the
    names, which is where it came from in the first place."""
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE exercises SET muscle_group = :legacy WHERE muscle_group IN "
            "(:quads, :hams, :calves)"
        ),
        {"legacy": LEGACY, "quads": CUADRICEPS, "hams": FEMORAL, "calves": GEMELO},
    )
