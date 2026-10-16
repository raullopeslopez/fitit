"""Un 503 no puede costarte la foto.

Medido contra la API de verdad el 2026-09-03: de tres llamadas seguidas a
`gemini-3.8-flash`, dos volvieron con `503 Service Unavailable` — el modelo
saturado, no la clave ni la cuota. Sin reintento, el botón funcionaría una vez
de cada tres y parecería roto las otras dos.

Lo que **no** se reintenta es tan importante como lo que sí: una clave mala o
una cuota agotada contestan 4xx, y volver a preguntar no las va a arreglar.
Reintentarlas sólo alarga la espera antes del mismo formulario en blanco, y en
el caso de la cuota gasta más de lo que ya no hay.
"""

import httpx
import pytest

from app.gemini import LabelUnreadable, read_label

ANSWER = {
    "candidates": [
        {"content": {"parts": [{"text": '{"name": "Yogur", "column_header": "por 100 g"}'}]}}
    ]
}


def _transport(*statuses):
    """Un transporte que contesta lo que se le diga, en orden, y cuenta visitas."""
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        status = statuses[min(calls["n"], len(statuses) - 1)]
        calls["n"] += 1
        if status == 200:
            return httpx.Response(200, json=ANSWER)
        return httpx.Response(status, json={"error": {"message": "..."}})

    return handler, calls


async def _read(monkeypatch, handler, **kwargs):
    original = httpx.AsyncClient

    def fake_client(*args, **client_kwargs):
        return original(*args, **client_kwargs, transport=httpx.MockTransport(handler))

    monkeypatch.setattr(httpx, "AsyncClient", fake_client)
    return await read_label(b"foto", api_key="k", model="m", **kwargs)


async def test_a_503_is_retried_and_the_photo_survives(monkeypatch):
    handler, calls = _transport(503, 200)
    read = await _read(monkeypatch, handler, backoff=0)
    assert read["name"] == "Yogur"
    assert calls["n"] == 2


async def test_it_gives_up_rather_than_hammering(monkeypatch):
    """Dos intentos, no más. El tier gratuito da 5 peticiones por minuto: con
    tres, una sola foto desafortunada se lleva 4 del mismo minuto — que es el
    pico que quedó registrado en el panel la primera noche."""
    handler, calls = _transport(503)
    with pytest.raises(LabelUnreadable):
        await _read(monkeypatch, handler, backoff=0)
    assert calls["n"] == 2


async def test_a_bad_key_is_not_retried(monkeypatch):
    """403 no mejora preguntando otra vez."""
    handler, calls = _transport(403)
    with pytest.raises(LabelUnreadable):
        await _read(monkeypatch, handler, backoff=0)
    assert calls["n"] == 1


async def test_an_exhausted_quota_is_not_retried(monkeypatch):
    """429 tampoco, y encima reintentarlo gasta de lo que ya no queda."""
    handler, calls = _transport(429)
    with pytest.raises(LabelUnreadable):
        await _read(monkeypatch, handler, backoff=0)
    assert calls["n"] == 1


async def test_an_exhausted_quota_says_so(monkeypatch):
    """«Sin cuota» y «no se lee» piden cosas distintas a quien está delante.

    Confundirlas te deja reintentando una foto que nunca va a salir, porque lo
    que falla no es la foto. El 429 llega hasta la pantalla con su propio
    nombre.
    """
    handler, _ = _transport(429)
    with pytest.raises(LabelUnreadable) as raised:
        await _read(monkeypatch, handler, backoff=0)
    assert raised.value.quota == "minute"


async def test_a_server_error_is_not_a_quota_problem(monkeypatch):
    handler, _ = _transport(503)
    with pytest.raises(LabelUnreadable) as raised:
        await _read(monkeypatch, handler, backoff=0)
    assert raised.value.quota is None


async def test_a_daily_quota_is_told_apart_from_a_per_minute_one(monkeypatch):
    """Esperar un minuto arregla una y no arregla la otra."""

    def handler(request):
        return httpx.Response(
            429,
            json={
                "error": {
                    "details": [
                        {
                            "quotaMetric": "generate_content_free_tier_requests",
                            "quotaId": "GenerateRequestsPerDayPerProjectPerModel",
                        }
                    ]
                }
            },
        )

    with pytest.raises(LabelUnreadable) as raised:
        await _read(monkeypatch, handler, backoff=0)
    assert raised.value.quota == "day"


# El segundo intento, a otro modelo.
#
# Medido el 2026-10-05: una etiqueta perfectamente legible volvió en blanco
# porque `gemini-3.8-flash` contestó `503 high demand` a los dos intentos. La
# misma foto, a `gemini-3.5-flash`, se leyó entera. Insistir al mismo modelo
# saturado es pedirle lo mismo a quien acaba de decir que no puede; otro modelo
# tiene su propia carga y, en el tier gratuito, su propia cuota.


def _models_seen(*statuses):
    seen = []
    handler, _ = _transport(*statuses)

    def recording(request):
        seen.append(request.url.path.rsplit("/", 1)[-1].split(":")[0])
        return handler(request)

    return recording, seen


async def test_the_retry_goes_to_the_fallback_model(monkeypatch):
    handler, seen = _models_seen(503, 200)
    read = await _read(monkeypatch, handler, backoff=0, fallback="f")
    assert read["name"] == "Yogur"
    assert seen == ["m", "f"]


async def test_without_a_fallback_it_retries_the_same_model(monkeypatch):
    handler, seen = _models_seen(503, 200)
    await _read(monkeypatch, handler, backoff=0)
    assert seen == ["m", "m"]


async def test_a_fallback_does_not_add_attempts(monkeypatch):
    """Sigue siendo dos peticiones por foto: el respaldo ocupa el sitio del
    reintento, no se suma a él."""
    handler, seen = _models_seen(503)
    with pytest.raises(LabelUnreadable):
        await _read(monkeypatch, handler, backoff=0, fallback="f")
    assert seen == ["m", "f"]


async def test_a_good_first_answer_never_touches_the_fallback(monkeypatch):
    handler, seen = _models_seen(200)
    await _read(monkeypatch, handler, backoff=0, fallback="f")
    assert seen == ["m"]


async def test_the_failure_says_what_the_api_answered(monkeypatch):
    """El código, no el mensaje: «503» distingue un modelo saturado de una clave
    mala sin arrastrar trozos de la petición."""
    handler, _ = _transport(503)
    with pytest.raises(LabelUnreadable) as raised:
        await _read(monkeypatch, handler, backoff=0)
    assert raised.value.detail == "503"


async def test_a_timeout_is_named_as_one(monkeypatch):
    def handler(request):
        raise httpx.ReadTimeout("lento", request=request)

    with pytest.raises(LabelUnreadable) as raised:
        await _read(monkeypatch, handler, backoff=0)
    assert raised.value.detail == "ReadTimeout"


async def test_the_switch_leaves_a_line_in_the_log(monkeypatch, caplog):
    """Que se pueda ver en Render cuántas lecturas salva el respaldo."""
    import logging

    handler, _ = _models_seen(503, 200)
    with caplog.at_level(logging.INFO, logger="app.label"):
        await _read(monkeypatch, handler, backoff=0, fallback="f")
    lines = [r.message for r in caplog.records if r.message.startswith("gemini fallback")]
    assert lines == ["gemini fallback: from=m to=f after=503"]


async def test_a_chain_of_fallbacks_tries_each_model_once(monkeypatch):
    """Con varios respaldos (`a,b`), un intento por modelo: cada uno tiene su
    carga y su cuota, así que tres intentos no martillean ninguno. El
    2026-10-16 la 3.8 y la 3.5 dieron 503 a la vez; con un solo respaldo, la
    voz se rendía."""
    asked = []

    def handler(request: httpx.Request) -> httpx.Response:
        asked.append(request.url.path.split("/")[-1].split(":")[0])
        if len(asked) < 3:
            return httpx.Response(503, json={"error": {"message": "..."}})
        return httpx.Response(200, json=ANSWER)

    read = await _read(monkeypatch, handler, backoff=0, fallback="b, c")
    assert read["name"] == "Yogur"
    assert asked == ["m", "b", "c"]
