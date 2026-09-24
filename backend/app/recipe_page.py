"""Lo que una página de receta publica sobre sí misma.

Las recetas se publican para los buscadores como JSON-LD schema.org
(`recipeIngredient`, `recipeYield`). Leerlo no es interpretar: es lo que la
receta dice, línea a línea, y aquí no se añade ni se quita nada. Una página
sin JSON-LD devuelve `None`, y quien llama dice que la receta no publica sus
ingredientes — no se los inventa.

Dos mitades separadas a propósito:

- `read_recipe(html)` es pura: un `str` entra, un `RecipeData` sale. Sin red.
- `fetch_page(url)` es la única que sale a internet, y los tests le inyectan un
  `transport` falso. Sólo la llama el servidor sobre un enlace que él mismo
  guardó en una idea (SSRF: nunca sobre una URL que llega en la petición).
"""

from __future__ import annotations

import html as html_lib
import ipaddress
import json
import re
from dataclasses import dataclass, field
from urllib.parse import urlsplit

import httpx

# --- Leer ---------------------------------------------------------------------

# Tolerante con las comillas, las mayúsculas y otros atributos: `type='application/LD+JSON' id=x`.
_LD_JSON = re.compile(
    r"<script\b[^>]*\btype\s*=\s*[\"']?application/ld\+json[\"']?[^>]*>(.*?)</script\s*>",
    re.IGNORECASE | re.DOTALL,
)

# «4 raciones», «Para 4», «Serves 4», «4-6»: el primer número. En un rango se
# toma el menor, que es lo que da la ración más grande; sobrestimar lo que
# comes es el error menos engañoso de los dos.
_NUMBER = re.compile(r"\d+(?:[.,]\d+)?")


@dataclass
class RecipeData:
    name: str | None
    ingredients: list[str] = field(default_factory=list)
    # `None` si la página no lo dice o no se entiende. Nunca 1 por defecto:
    # dividir entre una ración que nadie publicó es inventar el tamaño del plato.
    servings: float | None = None


def read_recipe(html: str) -> RecipeData | None:
    """La receta que publica `html`, o `None` si no publica ninguna.

    Si hay varios nodos Recipe, gana el primero que trae ingredientes; si
    ninguno los trae, el primero. Un bloque JSON-LD roto se salta: una página
    real puede tener uno mal escrito y otro bueno.
    """
    recipes = [node for block in _json_ld_blocks(html) for node in _nodes(block) if _is_recipe(node)]
    if not recipes:
        return None
    chosen = next((r for r in recipes if _ingredients(r)), recipes[0])
    name = chosen.get("name")
    return RecipeData(
        name=_clean(name) if isinstance(name, str) else None,
        ingredients=_ingredients(chosen),
        servings=parse_servings(chosen.get("recipeYield")),
    )


def parse_servings(raw) -> float | None:
    """`recipeYield` en cualquiera de sus formas → raciones, o `None`.

    Viene como número, como texto («4 raciones», «Para 4», «2 personas») o
    como lista de ambos (WordPress Recipe Maker publica `["4", "4 raciones"]`).
    Un `QuantitativeValue` u otra cosa rara → `None`: no se adivina.
    """
    if isinstance(raw, bool):
        return None
    if isinstance(raw, list):
        for item in raw:
            value = parse_servings(item)
            if value is not None:
                return value
        return None
    if isinstance(raw, int | float):
        value = float(raw)
    elif isinstance(raw, str):
        match = _NUMBER.search(raw)
        if not match:
            return None
        value = float(match.group().replace(",", "."))
    else:
        return None
    if value <= 0:
        return None
    return int(value) if value.is_integer() else value


def _json_ld_blocks(html: str):
    for match in _LD_JSON.finditer(html):
        text = match.group(1).strip()
        # Algún CMS lo envuelve en un comentario o CDATA para navegadores antiguos.
        text = re.sub(r"^\s*(<!--|<!\[CDATA\[)|(-->|\]\]>)\s*$", "", text).strip()
        try:
            yield json.loads(text)
        except ValueError:
            continue


def _nodes(data):
    """Todos los objetos de un bloque: listas, `@graph` y listas de `@graph`."""
    if isinstance(data, list):
        for item in data:
            yield from _nodes(item)
    elif isinstance(data, dict):
        yield data
        graph = data.get("@graph")
        if graph is not None:
            yield from _nodes(graph)


def _is_recipe(node: dict) -> bool:
    kind = node.get("@type")
    kinds = kind if isinstance(kind, list) else [kind]
    return any(isinstance(k, str) and k.rsplit("/", 1)[-1] == "Recipe" for k in kinds)


def _ingredients(node: dict) -> list[str]:
    # `ingredients` es el nombre antiguo, y aún hay páginas que sólo publican ése.
    raw = node.get("recipeIngredient") or node.get("ingredients") or []
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, list):
        return []
    lines = (_clean(item) for item in raw if isinstance(item, str))
    return [line for line in lines if line]


def _clean(text: str) -> str:
    # `&amp;` y `&frac12;` llegan escapados dos veces en más sitios de los que parece.
    return " ".join(html_lib.unescape(text).split())


# --- Descargar ----------------------------------------------------------------

TIMEOUT_SECONDS = 8.0
# Una página de receta con todo su marcado ronda 0,2–0,9 MB. Más de 2 MB no es
# una receta, y no se lee entera para descubrirlo.
MAX_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 5

# Con el User-Agent de la librería, bastantes webs de recetas contestan 403 o
# una página de «¿eres un robot?» sin JSON-LD. Esto es lo que manda un Chrome.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)


class PageUnreachable(Exception):
    """No se pudo leer la página: esquema no permitido, red, estado, tamaño."""


async def fetch_page(
    url: str,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
    timeout: float = TIMEOUT_SECONDS,
) -> str:
    """El HTML de `url`, o `PageUnreachable`.

    `transport` existe para los tests (`httpx.MockTransport`): ningún test
    sale a la red.
    """
    _check_url(url)
    try:
        async with httpx.AsyncClient(
            transport=transport,
            timeout=timeout,
            follow_redirects=True,
            max_redirects=MAX_REDIRECTS,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "es-ES,es;q=0.9",
            },
        ) as client:
            async with client.stream("GET", url) as response:
                # Una redirección también puede llevar a un sitio interno.
                _check_url(str(response.url))
                if response.status_code != 200:
                    raise PageUnreachable(f"HTTP {response.status_code}")
                declared = response.headers.get("content-length")
                if declared and declared.isdigit() and int(declared) > MAX_BYTES:
                    raise PageUnreachable("page too large")
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_BYTES:
                        raise PageUnreachable("page too large")
                encoding = response.charset_encoding or "utf-8"
    except httpx.HTTPError as exc:
        raise PageUnreachable(str(exc)) from exc
    return bytes(body).decode(encoding, errors="replace")


def _check_url(url: str) -> None:
    """Sólo http(s), y nunca un host que sea obviamente esta misma red.

    No resuelve DNS: un nombre público que apunte a una IP privada pasa. La
    defensa de verdad es que sólo se abren enlaces guardados en una idea; esto
    es el cinturón además de los tirantes.
    """
    try:
        parts = urlsplit(url)
    except ValueError as exc:
        raise PageUnreachable("bad url") from exc
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise PageUnreachable("only http(s) urls")
    host = parts.hostname.lower()
    if host == "localhost" or host.endswith(".localhost") or host.endswith(".internal"):
        raise PageUnreachable("internal host")
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return
    if not ip.is_global:
        raise PageUnreachable("internal host")
