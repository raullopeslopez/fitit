"""add users table

Revision ID: a1b2c3d4e5f6
Revises: e3b9c07f5a21
Create Date: 2026-07-27 12:00:00.000000

Fitit moves from one hardcoded username/password pair (AUTH_USERNAME/
AUTH_PASSWORD env vars) to a real users table, so a second person can have
their own account. This migration only creates the table and seeds exactly
one row — the account this app already ran as — from those same env vars, so
the existing login keeps working with zero manual steps. The env vars
themselves become unused after this deploy.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.auth import hash_password
from app.config import settings

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "e3b9c07f5a21"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(length=80), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)

    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO users (username, password_hash) VALUES (:username, :password_hash)"
        ),
        {
            "username": settings.auth_username,
            "password_hash": hash_password(settings.auth_password),
        },
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_table("users")
