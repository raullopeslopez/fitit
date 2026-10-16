"""Quién oye la voz: con clave de Groq, Whisper transcribe y Gemini sólo lee el
texto; sin ella, el audio va entero a Gemini como antes."""

import pytest

from app.gemini import LabelUnreadable, VoiceUnavailable
from app.routers import food_log


@pytest.fixture()
def keys(monkeypatch):
    from app.config import settings

    def set_keys(gemini="g", groq=""):
        monkeypatch.setattr(settings, "gemini_api_key", type(settings.gemini_api_key)(gemini))
        monkeypatch.setattr(settings, "groq_api_key", type(settings.groq_api_key)(groq))

    return set_keys


async def test_con_groq_transcribe_whisper_y_gemini_lee_el_texto(monkeypatch, keys):
    keys(groq="q")
    calls = []

    async def transcribe(audio, **kw):
        calls.append(("whisper", kw["api_key"]))
        return "dos huevos"

    async def read_voice_text(text, **kw):
        calls.append(("gemini", text))
        return {"transcript": "otra cosa", "lines": [{"name": "huevo"}]}

    monkeypatch.setattr(food_log, "transcribe", transcribe)
    monkeypatch.setattr(food_log, "read_voice_text", read_voice_text)
    reader = await food_log.get_voice_reader()
    out = await reader(b"audio", "audio/webm")
    assert calls == [("whisper", "q"), ("gemini", "dos huevos")]
    # Lo oído es lo de Whisper: Gemini no lo reescribe.
    assert out["transcript"] == "dos huevos"


async def test_si_gemini_falla_tras_oir_se_queda_lo_oido(monkeypatch, keys):
    keys(groq="q")

    async def transcribe(audio, **kw):
        return "dos huevos"

    async def read_voice_text(text, **kw):
        raise LabelUnreadable("503", detail="503")

    monkeypatch.setattr(food_log, "transcribe", transcribe)
    monkeypatch.setattr(food_log, "read_voice_text", read_voice_text)
    reader = await food_log.get_voice_reader()
    with pytest.raises(VoiceUnavailable) as exc:
        await reader(b"audio", "audio/webm")
    assert exc.value.transcript == "dos huevos"
    assert exc.value.detail == "503"


async def test_whisper_sin_oir_nada_no_gasta_gemini(monkeypatch, keys):
    keys(groq="q")

    async def transcribe(audio, **kw):
        return ""

    async def read_voice_text(text, **kw):
        raise AssertionError("no debería llegar a Gemini")

    monkeypatch.setattr(food_log, "transcribe", transcribe)
    monkeypatch.setattr(food_log, "read_voice_text", read_voice_text)
    reader = await food_log.get_voice_reader()
    assert await reader(b"audio", "audio/webm") == {"transcript": "", "lines": []}


async def test_sin_groq_el_audio_va_a_gemini(monkeypatch, keys):
    keys(groq="")

    async def read_voice(audio, **kw):
        return {"transcript": "x", "lines": []}

    monkeypatch.setattr(food_log, "read_voice", read_voice)
    reader = await food_log.get_voice_reader()
    assert (await reader(b"audio", "audio/webm"))["transcript"] == "x"
