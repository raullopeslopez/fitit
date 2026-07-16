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
