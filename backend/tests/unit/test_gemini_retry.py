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
