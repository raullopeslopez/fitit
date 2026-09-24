"""La búsqueda de recetas va con `google_search` y sin forzar JSON.

No está comprobado que Gemini acepte la herramienta de búsqueda junto con
`responseMimeType: application/json`. Así que no se le pide: el JSON va en el
prompt y la respuesta vuelve como texto, para que `app/ideas.py` la lea.
"""

import json

import httpx

from app.gemini import find_ideas


async def test_it_searches_the_web_and_returns_the_text(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": "```json\n{\"ideas\": "}, {"text": "[]}\n```"}]}}]},
        )

    original = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda *a, **kw: original(*a, **kw, transport=httpx.MockTransport(handler)),
    )
    text = await find_ideas(food="Acelga, cruda", avoid=["Acelgas a la vasca"], api_key="k", model="m", backoff=0)

    assert text == '```json\n{"ideas": []}\n```'
    assert seen["body"]["tools"] == [{"google_search": {}}]
    assert "responseMimeType" not in seen["body"]["generationConfig"]
    prompt = seen["body"]["contents"][0]["parts"][0]["text"]
    assert "Acelga, cruda" in prompt
    assert "Acelgas a la vasca" in prompt
