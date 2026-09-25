"""Lo que dice haber encontrado el buscador, convertido en algo que se guarda.

Mismo papel que `repertoire.py` para los platos propuestos: la salida de un
modelo no entra en la base sin pasar por aquí. Y aquí el riesgo es **el enlace**.
Una idea es un escaparate de una receta que existe en otra parte; sin un enlace
a una página web no hay nada que abrir ni que comprobar, que es justo lo que la
búsqueda venía a evitar. Así que una idea sin `http(s)://` se tira entera.

La lectura es a la defensiva porque tiene que serlo: la búsqueda va con la
herramienta `google_search`, y no está comprobado que Gemini acepte a la vez esa
herramienta y una respuesta forzada a JSON. El JSON se pide en el prompt, y lo
que vuelve puede traer vallas de markdown o una frase delante.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from urllib.parse import urlsplit

MAX_NAME = 160
MAX_URL = 1000
SEARCH_REDIRECT_HOST = "vertexaisearch.cloud.google.com"
MAX_METHOD = 32
# Minutos creíbles para una receta. Fuera de aquí es ruido, y se guarda como
# «no lo sé» — nunca como 0, que sería una cifra.
MIN_MINUTES = 1
MAX_MINUTES = 24 * 60


class IdeasRefused(Exception):
    """La respuesta no tiene forma de lista de recetas, y no se adivina."""


@dataclass(frozen=True)
class FoundIdea:
    name: str
    url: str
    method: str | None
    minutes: int | None


_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)


def _parse(text: str):
    """Saca el JSON de un texto que puede traer vallas o frases alrededor."""
    text = text.strip()
    fenced = _FENCE.search(text)
    if fenced:
        text = fenced.group(1).strip()
    try:
        return json.loads(text)
    except ValueError:
        pass
    # Lo que haya entre la primera llave (o corchete) y la última.
    for open_, close in (("{", "}"), ("[", "]")):
        start, end = text.find(open_), text.rfind(close)
        if start != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except ValueError:
                continue
    raise IdeasRefused("la respuesta no es JSON")


def _url(raw) -> str | None:
    if not isinstance(raw, str):
        return None
    url = raw.strip()
    if len(url) > MAX_URL:
        return None
    parts = urlsplit(url)
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
        return None
    # Los enlaces con los que el buscador cita sus fuentes son redirecciones
    # suyas, no la receta: distintas en cada búsqueda y con caducidad.
    if (parts.hostname or "").endswith(SEARCH_REDIRECT_HOST):
        return None
    return url


def _minutes(raw) -> int | None:
    if isinstance(raw, bool):
        return None
    if isinstance(raw, str):
        match = re.search(r"\d+", raw)
        raw = int(match.group()) if match else None
    if isinstance(raw, float):
        raw = round(raw)
    if isinstance(raw, int) and MIN_MINUTES <= raw <= MAX_MINUTES:
        return raw
    return None


def _method(raw) -> str | None:
    if not isinstance(raw, str):
        return None
    method = raw.strip().lower()[:MAX_METHOD]
    return method or None


def _one(raw) -> FoundIdea | None:
    if not isinstance(raw, dict):
        return None
    name = raw.get("name")
    if not isinstance(name, str) or not name.strip():
        return None
    url = _url(raw.get("url"))
    if url is None:
        return None
    return FoundIdea(
        name=name.strip()[:MAX_NAME],
        url=url,
        method=_method(raw.get("method")),
        minutes=_minutes(raw.get("minutes")),
    )


def read_ideas(payload) -> list[FoundIdea]:
    """Valida lo que devolvió el buscador. Lanza `IdeasRefused` si no hay forma.

    Acepta el texto tal cual llega, un objeto `{"ideas": [...]}` o la lista
    suelta. Una idea a la que le falte algo se descarta en silencio; las demás
    se quedan. La misma receta dos veces —mismo enlace— es una.
    """
    if isinstance(payload, str):
        payload = _parse(payload)
    if isinstance(payload, dict):
        payload = payload.get("ideas")
    if not isinstance(payload, list):
        raise IdeasRefused("la respuesta no trae una lista de recetas")

    vistas: set[str] = set()
    ideas: list[FoundIdea] = []
    for raw in payload:
        idea = _one(raw)
        if idea is None or idea.url in vistas:
            continue
        vistas.add(idea.url)
        ideas.append(idea)
    return ideas
