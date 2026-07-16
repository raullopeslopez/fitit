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
    def _use_asyncpg_driver(cls, value: str) -> str:
        # Render hands out postgres:// / postgresql:// URLs; SQLAlchemy's async
        # engine needs the +asyncpg driver.
        for prefix in ("postgresql://", "postgres://"):
            if value.startswith(prefix):
                return "postgresql+asyncpg://" + value[len(prefix) :]
        return value


settings = Settings()
