from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Config comes from the environment, never the code (12-factor).

    Local reads `.env`; Render injects its own env vars. Same image, different
    environment.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "local"
    database_url: str = "postgresql+asyncpg://fitit:fitit@localhost:5432/fitit"
    jwt_secret: str = "dev-secret-change-me"


settings = Settings()
