from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Config comes from the environment, never the code (12-factor).

    Local reads `.env`; Render injects its own env vars. Same image, different
    environment.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "local"
    database_url: str = "postgresql+asyncpg://fitit:fitit@localhost:5432/fitit"

    # Auth: single user, credentials from the environment. No users table.
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days — it's a personal app
    auth_username: str = "fitit"
    auth_password: str = "changeme"

    @field_validator("database_url")
    @classmethod
    def _normalize_database_url(cls, value: str) -> str:
        """Make any hosted Postgres URL something SQLAlchemy's async engine accepts.

        Render/Neon hand out ``postgres://`` / ``postgresql://`` URLs; the async
        engine needs the ``+asyncpg`` driver. Neon also appends libpq query params
        (``sslmode``, ``channel_binding``) that asyncpg rejects, so we translate
        ``sslmode`` to the asyncpg dialect's ``ssl`` parameter and drop
        ``channel_binding`` (asyncpg negotiates channel binding itself).
        """
        for prefix in ("postgresql://", "postgres://"):
            if value.startswith(prefix):
                value = "postgresql+asyncpg://" + value[len(prefix) :]
                break

        parts = urlsplit(value)
        if parts.query:
            params = dict(parse_qsl(parts.query, keep_blank_values=True))
            sslmode = params.pop("sslmode", None)
            params.pop("channel_binding", None)
            # libpq sslmode values (disable/allow/prefer/require/verify-ca/
            # verify-full) map 1:1 onto the asyncpg dialect's `ssl` values.
            if sslmode and "ssl" not in params:
                params["ssl"] = sslmode
            value = urlunsplit(parts._replace(query=urlencode(params)))
        return value


settings = Settings()
