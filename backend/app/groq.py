"""Whisper en Groq: una nota de voz → su texto (docs/registro-por-voz.md).

Existe porque el 2026-10-16 la voz falló tres veces seguidas con Gemini oyendo el
audio: `gemini-3.8-flash` y su respaldo daban 503 «high demand» a la vez. Groq
sirve Whisper gratis (unas 2.000 peticiones al día), rápido y sin la carga de
Flash; con esto, oír deja de depender de Gemini, que sólo lee el texto.

Los fallos se cuentan como en `gemini.py` (`LabelUnreadable`), porque río arriba
la pantalla los cuenta igual: la cuota aparte y un 5xx con su código.
"""

from __future__ import annotations

import httpx

from app.gemini import LabelUnreadable

API = "https://api.groq.com/openai/v1/audio/transcriptions"
TIMEOUT = 30.0
# Una pista de vocabulario: Whisper la usa como contexto previo. Palabras de
# cocina y de cantidades, que es lo que se le va a dictar.
PROMPT = "Lo que he comido: gramos, cucharadas, cucharaditas, un vaso, una taza, huevos, pan."
DAY_MARKERS = ("per day", "rpd", "daily")


async def transcribe(
    audio: bytes,
    *,
    mime_type: str,
    api_key: str,
    model: str,
    timeout: float = TIMEOUT,
) -> str:
    """El texto de la nota, sin espacios sobrantes. `""` si no se oyó nada."""
    # Groq mira la extensión del nombre para saber el formato.
    ext = "ogg" if "ogg" in mime_type else "mp4" if "mp4" in mime_type else "webm"
    files = {"file": (f"nota.{ext}", audio, mime_type.split(";")[0])}
    data = {
        "model": model,
        "language": "es",
        "temperature": "0",
        "response_format": "json",
        "prompt": PROMPT,
    }
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                API, files=files, data=data, headers={"Authorization": f"Bearer {api_key}"}
            )
            response.raise_for_status()
            text = response.json().get("text") or ""
    except httpx.HTTPStatusError as exc:
        code = exc.response.status_code
        if code == 429:
            body = exc.response.text.lower()
            scope = "day" if any(m in body for m in DAY_MARKERS) else "minute"
            raise LabelUnreadable("429", quota=scope, detail="429") from exc
        raise LabelUnreadable(str(code), detail=str(code)) from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise LabelUnreadable(type(exc).__name__, detail=type(exc).__name__) from exc
    return text.strip()
