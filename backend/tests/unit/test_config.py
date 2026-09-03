from app.config import Settings


def test_postgres_url_coerced_to_asyncpg():
    assert (
        Settings(database_url="postgres://u:p@h:5432/db").database_url
        == "postgresql+asyncpg://u:p@h:5432/db"
    )


def test_postgresql_url_coerced_to_asyncpg():
    assert (
        Settings(database_url="postgresql://u:p@h/db").database_url
        == "postgresql+asyncpg://u:p@h/db"
    )


def test_already_asyncpg_url_left_alone():
    url = "postgresql+asyncpg://u:p@h/db"
    assert Settings(database_url=url).database_url == url


def test_neon_url_translates_sslmode_and_drops_channel_binding():
    # Neon's pooled connection string, verbatim from its dashboard.
    url = (
        "postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/fitit"
        "?sslmode=require&channel_binding=require"
    )
    result = Settings(database_url=url).database_url
    assert result.startswith(
        "postgresql+asyncpg://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/fitit?"
    )
    # sslmode -> ssl (asyncpg's dialect param); channel_binding is not asyncpg's.
    assert "ssl=require" in result
    assert "sslmode" not in result
    assert "channel_binding" not in result


def test_the_gemini_key_does_not_print_itself():
    """Un traceback que imprima la configuración no puede llevarse la clave
    dentro. `SecretStr` la tapa en cualquier repr; para usarla hay que pedirla
    a propósito con `.get_secret_value()`, que es un sitio fácil de auditar."""
    settings = Settings(gemini_api_key="AIzaSy-no-deberia-salir")
    assert "AIzaSy-no-deberia-salir" not in repr(settings)
    assert "AIzaSy-no-deberia-salir" not in str(settings.gemini_api_key)
    assert settings.gemini_api_key.get_secret_value() == "AIzaSy-no-deberia-salir"


def test_no_key_means_the_feature_is_off():
    """Sin clave no hay lectura de etiquetas, igual que sin `google_client_id`
    no hay Google. Apagado, no roto.

    Comprobado sobre el valor por defecto del campo y no instanciando
    `Settings()`, porque instanciarlo lee el `.env` de esta máquina — que en la
    del autor sí tiene clave. Un test que dependa de eso falla en un sitio y
    pasa en otro, y además arrastraría la clave a la salida al fallar.
    """
    assert Settings.model_fields["gemini_api_key"].default.get_secret_value() == ""
