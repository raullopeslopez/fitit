from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import SecretStr, field_validator
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
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days — it's a personal app
    # Only read once, by the add_users_table migration, to seed the first
    # account (the user this app originally ran as) from the credentials that
    # used to be the whole auth system. Unused at runtime after that.
    auth_username: str = "fitit"
    auth_password: str = "changeme"
    # Also read once, by the google_sign_in migration, to stamp an email on
    # that same seeded account so the first Google sign-in adopts it instead of
    # opening an empty twin. Blank means skip — nothing to link.
    auth_email: str = ""
    # The OAuth web client from the Google Cloud console. Empty means the
    # feature is simply off: /auth/google refuses everything rather than
    # accepting tokens minted for whoever else's app.
    google_client_id: str = ""
    # Lee la etiqueta de una foto. Vacía significa que la feature está apagada
    # —igual que `google_client_id`—: el botón de la cámara no aparece y nadie
    # llama a nadie. `SecretStr` y no `str` para que un traceback que imprima
    # la configuración saque asteriscos y no la clave.
    gemini_api_key: SecretStr = SecretStr("")
    # Configurable porque qué modelos sirve el tier gratuito depende del
    # proyecto y no está publicado: se mira en AI Studio y se pone aquí, sin
    # tocar código.
    gemini_model: str = "gemini-3.8-flash"
    # A quién va el reintento de una etiqueta cuando el principal falla. Vacío,
    # el reintento vuelve al mismo. El 2026-10-05 `gemini-3.8-flash` contestó
    # `503 high demand` dos veces seguidas a una foto que `gemini-3.5-flash`
    # leyó entera: otro modelo, otra carga y otra cuota del tier gratuito.
    # Vacío desde el 2026-10-11: Google deprecó la 3.5 y la 3.7, y un reintento
    # a un modelo retirado falla seguro. Cuando haya otro Flash vivo que no sea
    # el principal, va aquí (o en GEMINI_FALLBACK_MODEL, sin tocar código).
    gemini_fallback_model: str = ""
    # Envía la lista de la compra a Taski (`app/taski.py`). El identificador es
    # el de un miembro del hogar —Taski no tiene otra autenticación—, así que es
    # un secreto. Vacío, la función está apagada y el botón contesta 503.
    taski_device_id: SecretStr = SecretStr("")
    taski_api_url: str = "https://taski-api-g8ai.onrender.com"
    # Orígenes a los que se abre CORS, separados por comas. La app nativa lleva
    # la interfaz dentro del APK y llama desde su propio origen: `https://localhost`
    # en Android y `capacitor://localhost` en iOS (los de Capacitor por defecto).
    # La web se sirve desde el mismo origen que la API y no los necesita.
    cors_origins: str = "https://localhost,capacitor://localhost"
    # Versión más baja de la app que la API sigue atendiendo (`X-Client-Version`).
    # Vacía significa sin corte. Quien no manda la cabecera, o manda algo que no
    # es una versión, pasa: la web cacheada, un curl o el health check no se
    # rompen por esto.
    min_client_version: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

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
