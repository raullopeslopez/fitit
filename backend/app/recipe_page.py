"""Lo que una página de receta publica sobre sí misma.

Las recetas se publican para los buscadores como JSON-LD schema.org
(`recipeIngredient`, `recipeYield`). Leerlo no es interpretar: es lo que la
receta dice, línea a línea, y aquí no se añade ni se quita nada. Una página
sin JSON-LD devuelve `None`, y quien llama dice que la receta no publica sus
ingredientes — no se los inventa.

Dos mitades separadas a propósito:

- `read_recipe(html)` es pura: un `str` entra, un `RecipeData` sale. Sin red.
- `fetch_page(url)` es la única que sale a internet, y los tests le inyectan un
  `transport` y un `resolve` (DNS) falsos. Sólo la llama el servidor sobre un enlace que él mismo
  guardó en una idea (SSRF: nunca sobre una URL que llega en la petición).
"""

from __future__ import annotations

import asyncio
import html as html_lib
import ipaddress
import json
import re
import socket
import urllib.request
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlsplit

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
    recipes = [
        node for block in _json_ld_blocks(html) for node in _nodes(block) if _is_recipe(node)
    ]
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

# host, puerto → direcciones IP en texto. Inyectable por lo mismo que el
# `transport`: ningún test resuelve DNS de verdad.
Resolver = Callable[[str, int], Awaitable[list[str]]]


class PageUnreachable(Exception):
    """No se pudo leer la página: esquema no permitido, dirección interna, red,
    estado, tamaño."""


async def fetch_page(
    url: str,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
    timeout: float = TIMEOUT_SECONDS,
    resolve: Resolver | None = None,
) -> str:
    """El HTML de `url`, o `PageUnreachable`.

    SSRF. Quien llama sólo pasa enlaces guardados en una idea, pero el enlace
    lo escribió un modelo leyendo la web, así que aquí se comprueba adónde
    lleva **de verdad**:

    - el nombre se resuelve y **todas** sus direcciones tienen que ser de
      internet (`is_global`); una sola interna y no se abre;
    - se conecta a la IP que se comprobó, con el nombre en `Host` y en el SNI
      (que es contra lo que se valida el certificado). Si se dejase resolver
      otra vez al cliente, un DNS que cambia de respuesta entre las dos
      preguntas pasaría el control con una IP y conectaría a otra;
    - las redirecciones se siguen a mano, y cada salto pasa el mismo control
      **antes** de pedirse.

    `transport` y `resolve` existen para los tests: ninguno sale a la red.
    """
    resolve = resolve or _resolve
    current = url
    try:
        async with httpx.AsyncClient(
            transport=transport,
            timeout=timeout,
            follow_redirects=False,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "es-ES,es;q=0.9",
            },
        ) as client:
            for _hop in range(MAX_REDIRECTS + 1):
                request = await _pinned_request(client, current, resolve)
                response = await client.send(request, stream=True)
                try:
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location:
                            raise PageUnreachable("redirect without location")
                        current = urljoin(current, location)
                        continue
                    if response.status_code != 200:
                        raise PageUnreachable(f"HTTP {response.status_code}")
                    return await _read_body(response)
                finally:
                    await response.aclose()
    except httpx.HTTPError as exc:
        raise PageUnreachable(str(exc)) from exc
    raise PageUnreachable("too many redirects")


async def _read_body(response: httpx.Response) -> str:
    declared = response.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_BYTES:
        raise PageUnreachable("page too large")
    body = bytearray()
    async for chunk in response.aiter_bytes():
        body.extend(chunk)
        if len(body) > MAX_BYTES:
            raise PageUnreachable("page too large")
    encoding = response.charset_encoding or "utf-8"
    return bytes(body).decode(encoding, errors="replace")


async def _pinned_request(client: httpx.AsyncClient, url: str, resolve: Resolver) -> httpx.Request:
    """La petición a `url`, dirigida a una IP ya comprobada.

    Detrás de un proxy (`HTTPS_PROXY`) no se fija la IP: quien resuelve es el
    proxy, y httpx no pasa el SNI por el túnel, así que el certificado se
    validaría contra la IP y fallaría siempre. La comprobación del DNS se hace
    igual; lo que se pierde ahí es sólo la defensa contra el rebinding. En
    Render no hay proxy.
    """
    host, port = _check_url(url)
    address = await _checked_address(host, port, resolve)
    parsed = httpx.URL(url)
    if _behind_proxy(url):
        return client.build_request("GET", parsed)
    extensions = {"sni_hostname": host} if parsed.scheme == "https" else {}
    return client.build_request(
        "GET",
        parsed.copy_with(host=address),
        # `netloc` y no `host`: si el enlace llevaba puerto, el `Host` también.
        headers={"Host": parsed.netloc.decode("ascii")},
        extensions=extensions,
    )


async def _checked_address(host: str, port: int, resolve: Resolver) -> str:
    """Una IP de `host` si **todas** son de internet; si no, `PageUnreachable`."""
    literal = _ip(host)
    if literal is not None:
        addresses = [host]
    else:
        try:
            addresses = await resolve(host, port)
        except OSError as exc:
            raise PageUnreachable("name does not resolve") from exc
    if not addresses:
        raise PageUnreachable("name does not resolve")
    for address in addresses:
        ip = _ip(address)
        if ip is None or not ip.is_global:
            raise PageUnreachable("internal host")
    return addresses[0].split("%", 1)[0]


def _ip(text: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    """`text` como IP, o `None` si es un nombre.

    Una IPv4 dentro de una IPv6 (`::ffff:10.0.0.1`) se juzga como la IPv4 que
    es: el sistema la conecta a esa dirección.
    """
    try:
        ip = ipaddress.ip_address(text.split("%", 1)[0])
    except ValueError:
        return None
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        return ip.ipv4_mapped
    # Una IPv6 con zona («fe80::1%eth0») es de enlace local por definición.
    if "%" in text:
        return ipaddress.ip_address("fe80::1")
    return ip


def _behind_proxy(url: str) -> bool:
    """Si httpx mandaría `url` por un proxy del entorno (lo mismo que lee él)."""
    parts = urlsplit(url)
    proxies = urllib.request.getproxies()
    if not (proxies.get(parts.scheme) or proxies.get("all")):
        return False
    return not urllib.request.proxy_bypass(parts.hostname or "")


async def _resolve(host: str, port: int) -> list[str]:
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    # Sin repetir y en el orden del sistema, que es el que usaría un cliente.
    return list(dict.fromkeys(info[4][0] for info in infos))


def _check_url(url: str) -> tuple[str, int]:
    """Sólo http(s) con host. Devuelve host y puerto.

    Los nombres obviamente locales se rechazan sin preguntar al DNS; el resto
    lo decide lo que el DNS conteste (`_checked_address`).
    """
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError as exc:
        raise PageUnreachable("bad url") from exc
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise PageUnreachable("only http(s) urls")
    host = parts.hostname.lower()
    if host == "localhost" or host.endswith(".localhost") or host.endswith(".internal"):
        raise PageUnreachable("internal host")
    return host, port or (443 if parts.scheme == "https" else 80)
