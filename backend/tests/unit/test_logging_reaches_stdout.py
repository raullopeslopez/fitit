"""Que las líneas que escribimos salgan de verdad.

Escrito después de comprobarlo en producción y ver que no salían. `app/label.py`
llevaba un `log.info(...)` por cada lectura, con siete pruebas verdes detrás, y
en los logs de Render no aparecía ni una: sólo la línea de acceso de uvicorn.

La causa es de manual, y por eso conviene tener el test. Un logger sin handler
no imprime nada por debajo de `WARNING` —el `lastResort` de Python empieza
ahí—, y uvicorn configura sus propios loggers, no el raíz. Así que todo INFO
nuestro se tiraba en silencio.

Y las pruebas no lo veían porque `caplog` engancha su propio handler: probaban
que la llamada se hace, no que la línea aparezca. Es la diferencia exacta entre
un test verde y una feature que funciona, y aquí costó una verificación en
producción descubrirla.

Este fichero comprueba lo otro: que el mensaje encuentra un handler.
"""

import logging

from app.main import app  # noqa: F401  — importarlo es lo que configura el logging


def test_our_loggers_are_allowed_to_speak():
    assert logging.getLogger("app.label").isEnabledFor(logging.INFO)


def test_our_loggers_have_somewhere_to_write():
    """Un logger sin handler en toda su cadena no imprime un INFO: lo descarta
    sin decirlo. Es lo que pasaba, y no lo veía ninguna prueba."""
    logger = logging.getLogger("app.label")
    node, handlers = logger, []
    while node:
        handlers.extend(node.handlers)
        node = node.parent if node.propagate else None
    assert handlers, "ningún handler en la cadena: el INFO se tira en silencio"


def test_a_line_actually_reaches_the_stream():
    """La prueba de verdad: que el mensaje llega **escrito** al sitio donde el
    handler escribe, con su formato puesto.

    Se le cambia el destino al handler por un buffer en vez de capturar la
    salida del proceso: `capsys` no lo ve —el handler se queda con la
    referencia a `sys.stdout` del momento en que se configura— y `capfd` se
    pelea con la captura global de pytest. Ninguna de las dos cosas dice nada
    sobre la aplicación; ésta sí.

    Y sin `caplog`, que engancha un handler él solo y taparía el fallo entero:
    era exactamente lo que hacía que siete pruebas verdes convivieran con unos
    logs de producción vacíos.
    """
    import io as _io

    logger = logging.getLogger("app")
    handler = logger.handlers[0]
    original, buffer = handler.stream, _io.StringIO()
    handler.setStream(buffer)
    try:
        logging.getLogger("app.label").info("label read: outcome=probe ms=1")
    finally:
        handler.setStream(original)
    assert "label read: outcome=probe ms=1" in buffer.getvalue()
    # Con el prefijo de uvicorn, para que las dos clases de línea se lean como
    # una sola columna en el panel de Render.
    assert buffer.getvalue().startswith("INFO:")
