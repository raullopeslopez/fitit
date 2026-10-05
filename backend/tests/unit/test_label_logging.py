"""Que se pueda saber, después, si se llamó a Gemini y qué pasó.

Escrito porque no se podía. El 2026-09-04 una lectura falló en producción y la
única forma de averiguar por qué fue preguntárselo a alguien con acceso a la
API de Render: los logs sólo tenían la línea de acceso de uvicorn —`POST
/api/foods/label 503`— y el motivo real se quedaba dentro de una excepción que
nadie escribía.

Un fallo callado en la única parte de la app que llama a un tercero, se paga en
sesiones de depuración. Estas pruebas fijan la línea que lo evita.

Lo que **no** puede aparecer en ella también está fijado aquí: ni la clave, ni
un byte de la foto. Un log es el sitio más fácil de olvidar que existe.
"""

import logging

import pytest

from app.gemini import LabelUnreadable
from app.main import app
from app.routers.foods import get_label_reader

CLEAN = {
    "name": "Yogur natural",
    "brand": "Hacendado",
    "column_header": "por 100 g",
    "rows": ["Valor energético 61 kcal", "Proteínas 3,8 g"],
    "nutrients": {"kcal": 61, "protein": 3.8},
}


@pytest.fixture(autouse=True)
def _clear():
    yield
    app.dependency_overrides.pop(get_label_reader, None)


def _reader(payload=None, *, raises=None):
    async def reader(image: bytes, mime_type: str) -> dict:
        if raises:
            raise raises
        return payload

    app.dependency_overrides[get_label_reader] = lambda: reader


def _photograph(client):
    return client.post(
        "/foods/label",
        files={"photo": ("e.jpg", b"\xff\xd8\xff\xe0 bytes", "image/jpeg")},
    )


def _line(caplog):
    lines = [r.message for r in caplog.records if r.message.startswith("label read")]
    assert lines, f"ninguna línea de lectura en {[r.message for r in caplog.records]}"
    return lines[-1]


def test_a_good_read_says_so(client, caplog):
    _reader(CLEAN)
    with caplog.at_level(logging.INFO, logger="app.label"):
        assert _photograph(client).status_code == 200
    line = _line(caplog)
    assert "outcome=ok" in line
    assert "ms=" in line


def test_a_dropped_figure_is_named_in_the_log(client, caplog):
    """El caso que más importa poder revisar después: el backend tiró una cifra
    que el modelo mandó, y quieres poder mirar cuántas veces pasa."""
    _reader({**CLEAN, "nutrients": {**CLEAN["nutrients"], "fiber": 0}})
    with caplog.at_level(logging.INFO, logger="app.label"):
        _photograph(client)
    assert "dropped=fiber" in _line(caplog)


def test_a_refused_column_says_which(client, caplog):
    _reader({**CLEAN, "column_header": "por ración (125 g)"})
    with caplog.at_level(logging.INFO, logger="app.label"):
        _photograph(client)
    line = _line(caplog)
    assert "outcome=column" in line
    assert "ración" in line


def test_an_exhausted_quota_is_told_apart(client, caplog):
    _reader(raises=LabelUnreadable("429", quota="day"))
    with caplog.at_level(logging.INFO, logger="app.label"):
        _photograph(client)
    line = _line(caplog)
    assert "outcome=quota" in line
    assert "scope=day" in line


def test_a_failure_records_what_kind_it_was(client, caplog):
    """«No se pudo leer» no es un diagnóstico. La clase del error de debajo sí:
    distingue un timeout de una respuesta que no era JSON."""
    cause = TimeoutError("se acabó el tiempo")
    failure = LabelUnreadable("timeout")
    failure.__cause__ = cause
    _reader(raises=failure)
    with caplog.at_level(logging.INFO, logger="app.label"):
        _photograph(client)
    line = _line(caplog)
    assert "outcome=unreadable" in line
    assert "TimeoutError" in line


def test_a_reader_that_is_off_is_not_a_mystery(client, caplog):
    """El fallo real de producción: 503 porque no había clave, indistinguible en
    los logs de cualquier otro 503."""
    app.dependency_overrides[get_label_reader] = lambda: None
    with caplog.at_level(logging.INFO, logger="app.label"):
        assert _photograph(client).status_code == 503
    assert "outcome=not_configured" in _line(caplog)


def test_the_log_never_carries_the_key_or_the_photo(client, caplog):
    """Un log es el sitio más fácil de olvidar que existe."""
    _reader(CLEAN)
    with caplog.at_level(logging.INFO, logger="app.label"):
        _photograph(client)
    line = _line(caplog)
    assert "bytes" not in line
    assert "AIza" not in line and "AQ." not in line
    # Ni el nombre del alimento: lo que se registra es qué pasó, no qué comes.
    assert "Yogur" not in line


def test_a_failure_carries_the_api_status(client, caplog):
    """El fallo del 2026-10-05 dejó `error=ModelUnavailable` en el log, que es el
    nombre del envoltorio y no dice nada. Lo que hacía falta era el `503`."""
    _reader(raises=LabelUnreadable("...", detail="503"))
    with caplog.at_level(logging.INFO, logger="app.label"):
        _photograph(client)
    line = _line(caplog)
    assert "outcome=unreadable" in line
    assert "error=503" in line
