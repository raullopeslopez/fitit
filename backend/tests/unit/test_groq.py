"""Whisper en Groq: el audio pasa a texto sin depender de Gemini (2026-10-16).

Mismo reparto de fallos que `gemini.py`, porque río arriba se cuentan igual: la
cuota viaja aparte (`quota`), y un 5xx deja su código en `detail` para que la
voz diga «saturado» y no «no he entendido nada».
"""

import httpx
import pytest

from app.gemini import LabelUnreadable
from app.groq import transcribe


async def _send(monkeypatch, handler):
    original = httpx.AsyncClient

    def fake_client(*args, **kwargs):
        return original(*args, **kwargs, transport=httpx.MockTransport(handler))

    monkeypatch.setattr(httpx, "AsyncClient", fake_client)
    return await transcribe(b"audio", mime_type="audio/webm;codecs=opus", api_key="k", model="whisper-large-v3")


async def test_devuelve_el_texto_y_pide_espanol(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers["authorization"]
        seen["body"] = request.content
        return httpx.Response(200, json={"text": " Dos huevos y un café con leche. "})

    assert await _send(monkeypatch, handler) == "Dos huevos y un café con leche."
    assert seen["auth"] == "Bearer k"
    assert b'name="language"' in seen["body"] and b"es" in seen["body"]
    assert b"whisper-large-v3" in seen["body"]


async def test_sin_cuota_lo_dice_aparte(monkeypatch):
    def handler(request):
        return httpx.Response(429, json={"error": {"message": "Rate limit reached ... requests per day (RPD)"}})

    with pytest.raises(LabelUnreadable) as exc:
        await _send(monkeypatch, handler)
    assert exc.value.quota == "day"


async def test_un_5xx_deja_su_codigo(monkeypatch):
    def handler(request):
        return httpx.Response(503, json={"error": {"message": "over capacity"}})

    with pytest.raises(LabelUnreadable) as exc:
        await _send(monkeypatch, handler)
    assert exc.value.detail == "503"
    assert exc.value.quota is None
