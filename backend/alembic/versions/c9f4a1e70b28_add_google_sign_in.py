"""add google sign-in columns

Revision ID: c9f4a1e70b28
Revises: e1a3b7c05d22
Create Date: 2026-08-18 10:00:00.000000

Signing in with Google needs two new facts about a user and one old one
relaxed: Google's immutable account id (`google_sub`), the verified address it
comes with (`email`), and a `password_hash` that is allowed to be absent —
somebody who only ever taps the Google button never sets a password, and a
placeholder hash would be a password nobody chose sitting in the column that
decides whether a password is right.

The backfill at the end is the point of the whole migration. Without it the
first Google sign-in from the account this app was seeded for would match no
`google_sub` and no `email`, and would therefore create a *second*, empty
account — the existing training history still there, and unreachable from the
button the user just pressed. Setting AUTH_EMAIL in the environment before this
deploy links the two; leaving it blank is a no-op, which is the right answer
for any deployment where the seeded account is not a real person's.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.config import settings

# revision identifiers, used by Alembic.
revision: str = "c9f4a1e70b28"
down_revision: str | None = "e1a3b7c05d22"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("google_sub", sa.String(length=255), nullable=True))
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_google_sub"), "users", ["google_sub"], unique=True)
    op.alter_column("users", "password_hash", existing_type=sa.String(length=255), nullable=True)

    if settings.auth_email:
        conn = op.get_bind()
        conn.execute(
            sa.text("UPDATE users SET email = :email WHERE username = :username"),
            {"email": settings.auth_email.lower(), "username": settings.auth_username},
        )


def downgrade() -> None:
    # Any account created through Google has no password, so it cannot survive
    # the column going back to NOT NULL — and there is nothing to put there.
    op.execute("DELETE FROM users WHERE password_hash IS NULL")
    op.alter_column("users", "password_hash", existing_type=sa.String(length=255), nullable=False)
    op.drop_index(op.f("ix_users_google_sub"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_column("users", "google_sub")
    op.drop_column("users", "email")
