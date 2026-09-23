"""add rules

Revision ID: f2c9d81e405b
Revises: e7b3c02a91d8
Create Date: 2026-09-23 14:00:00.000000

Las preferencias dejan de ser números sueltos. Una regla lleva **ámbito**
(`day`, `week`, `slot`), **condición** (`training`, `rest` o ninguna) y
**dureza** (`hard`, `soft`); sin las tres no se pueden expresar ni «verdura en
la comida» ni «más hidratos los días que entreno».

`params_json` y no columnas: los seis tipos piden cosas distintas y seis juegos
de columnas mayormente nulas describirían peor lo que hay. La garantía la dan
el validador de `app/rules.py` y sus tests, no el esquema.

`active_from` NOT NULL y `active_to` nullable: una regla **se retira**, no se
borra. Cambiar de opinión en octubre no puede reescribir cómo se juzgó
septiembre, igual que una entrada del diario no se recalcula desde el alimento.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2c9d81e405b"
down_revision: str | None = "e7b3c02a91d8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", sa.String(length=24), nullable=False),
        sa.Column("scope", sa.String(length=8), nullable=False),
        sa.Column("slot", sa.String(length=16), nullable=True),
        sa.Column("day_condition", sa.String(length=12), nullable=True),
        sa.Column("hardness", sa.String(length=4), nullable=False, server_default="soft"),
        sa.Column("params_json", sa.Text(), nullable=False),
        sa.Column("active_from", sa.Date(), nullable=False),
        sa.Column("active_to", sa.Date(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_rules_user_id", "rules", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_rules_user_id", table_name="rules")
    op.drop_table("rules")
