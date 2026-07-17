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
