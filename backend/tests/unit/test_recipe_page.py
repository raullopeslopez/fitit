"""Leer una receta de su página: el JSON-LD schema.org, y nada más.

Las páginas de `tests/fixtures/recipes/` son reales y están recortadas a sus
`<script>` JSON-LD, tal cual se publicaron. Ningún test aquí toca la red.
"""

import json
from pathlib import Path

import httpx
import pytest

from app.recipe_page import (
    MAX_BYTES,
    PageUnreachable,
    RecipeData,
    fetch_page,
    parse_servings,
    read_recipe,
)

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "recipes"


def _page(*blocks, raw: str | None = None) -> str:
    scripts = "".join(
        f'<script type="application/ld+json">{json.dumps(b)}</script>' for b in blocks
    )
    return f"<html><head>{scripts}{raw or ''}</head><body></body></html>"


# --- Páginas reales -----------------------------------------------------------


def test_okdiario_publishes_its_ingredients_and_no_yield():
    html = (FIXTURES / "okdiario-acelgas-crema-huevo.html").read_text(encoding="utf-8")
    recipe = read_recipe(html)
    assert recipe.ingredients == [
        "500 gr de acelgas",
        "200 ml de crema de leche",
        "2 huevos",
        "½ cebolla",
        "70 gr de piñones tostados",
        "2 cucharadas de harina",
        "80 gr de atún al natural (opcional)",
        "Queso parmesano",
        "Sal y pimienta Aceite de oliva virgen",
    ]
    # okdiario no publica `recipeYield`: las raciones son desconocidas, no 1.
    assert recipe.servings is None
    assert recipe.name == "Receta de Acelgas a la crema con huevo al horno"


def test_a_yoast_graph_page_finds_the_recipe_node():
    html = (FIXTURES / "recipetineats-chicken-chasseur-graph.html").read_text(encoding="utf-8")
    recipe = read_recipe(html)
    assert recipe.servings == 4
    assert len(recipe.ingredients) == 19
    assert recipe.ingredients[0].startswith("4 chicken thighs, bone-in")


# --- Formas del JSON-LD -------------------------------------------------------


def test_no_json_ld_is_none():
    assert read_recipe("<html><body>Una receta sin datos</body></html>") is None


def test_json_ld_without_a_recipe_is_none():
    assert read_recipe(_page({"@type": "Article", "headline": "x"})) is None


def test_type_as_a_list():
    html = _page({"@type": ["Recipe", "NewsArticle"], "recipeIngredient": ["1 kg de patatas"]})
    assert read_recipe(html).ingredients == ["1 kg de patatas"]


def test_a_top_level_list_of_objects():
    html = _page([{"@type": "Organization"}, {"@type": "Recipe", "recipeIngredient": ["sal"]}])
    assert read_recipe(html).ingredients == ["sal"]


def test_graph_inside_a_list():
    html = _page(
        [{"@graph": [{"@type": "WebPage"}, {"@type": "Recipe", "recipeIngredient": ["a"]}]}]
    )
    assert read_recipe(html).ingredients == ["a"]


def test_malformed_block_is_skipped_and_the_next_one_read():
    html = _page(
        {"@type": "Recipe", "recipeIngredient": ["2 huevos"]},
        raw='<script type="application/ld+json">{"@type": "Recipe", ,}</script>',
    )
    assert read_recipe(html).ingredients == ["2 huevos"]


def test_the_older_ingredients_property_is_read_too():
    html = _page({"@type": "Recipe", "ingredients": ["2 huevos"]})
    assert read_recipe(html).ingredients == ["2 huevos"]


def test_blank_and_non_string_lines_are_dropped_and_whitespace_collapsed():
    html = _page({"@type": "Recipe", "recipeIngredient": ["  500 gr\n de acelgas ", "", None, 3]})
    assert read_recipe(html).ingredients == ["500 gr de acelgas"]


def test_html_entities_are_decoded():
    html = _page(
        {"@type": "Recipe", "recipeIngredient": ["Sal &amp; pimienta", "&frac12; cebolla"]}
    )
    assert read_recipe(html).ingredients == ["Sal & pimienta", "½ cebolla"]


def test_a_recipe_with_no_ingredients_is_still_a_recipe():
    """Distinto de «no hay receta»: la página dice que es una y no los publica."""
    recipe = read_recipe(_page({"@type": "Recipe", "name": "x"}))
    assert recipe == RecipeData(name="x", ingredients=[], servings=None)


def test_the_recipe_with_ingredients_wins_over_an_empty_one():
    html = _page({"@type": "Recipe"}, {"@type": "Recipe", "recipeIngredient": ["a"]})
    assert read_recipe(html).ingredients == ["a"]


def test_script_type_attribute_is_case_and_quote_tolerant():
    html = '<script type=\'application/LD+JSON\' id=x>{"@type":"Recipe","recipeIngredient":["a"]}</script>'
    assert read_recipe(html).ingredients == ["a"]


# --- Raciones -----------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "servings"),
    [
        (4, 4),
        ("4", 4),
        (["4"], 4),
        (["4", "4 raciones"], 4),
        ("4 raciones", 4),
        ("2 personas", 2),
        ("Para 4", 4),
        ("para 6 personas", 6),
        ("Serves 4", 4),
        ("4-6", 4),
        ("2.5", 2.5),
        (0, None),
        ("-", None),
        ("unas cuantas", None),
        (None, None),
        ([], None),
        (True, None),
        ({"@type": "QuantitativeValue", "value": 3}, None),
    ],
)
def test_parse_servings(raw, servings):
    assert parse_servings(raw) == servings




# --- La descarga --------------------------------------------------------------
#
# Ningún test resuelve DNS de verdad: `resolve` se inyecta igual que el
# `transport`. `_public` hace de DNS que contesta con una dirección de internet.

PUBLIC_IP = "93.184.216.34"
_PROXY_VARS = ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy")


@pytest.fixture(autouse=True)
def _sin_proxy(monkeypatch):
    """Como en Render: sin proxy. Donde corre la suite puede haber uno."""
    for var in _PROXY_VARS:
        monkeypatch.delenv(var, raising=False)


async def _public(host, port):
    return [PUBLIC_IP]


def _dns(table):
    """Un DNS de mentira: host → direcciones."""

    async def resolve(host, port):
        return list(table[host])

    return resolve


def _transport(handler):
    return httpx.MockTransport(handler)


def _never(request):  # pragma: no cover - no debe llegar
    raise AssertionError(f"fetched {request.url}")


async def _fetch(url, handler, resolve=_public):
    return await fetch_page(url, transport=_transport(handler), resolve=resolve)


async def test_fetch_returns_the_text_and_sends_a_browser_user_agent():
    seen = {}

    def handler(request):
        seen["ua"] = request.headers["user-agent"]
        return httpx.Response(200, text="<html>ok</html>")

    assert await _fetch("https://example.com/r", handler) == "<html>ok</html>"
    assert "Mozilla/5.0" in seen["ua"]


async def test_fetch_connects_to_the_address_it_checked_and_keeps_the_name():
    """Se conecta a la IP que se comprobó, no a la que devuelva un segundo DNS:
    si no, un nombre que cambia de respuesta entre las dos (DNS rebinding)
    pasaría el control con una IP pública y conectaría a una interna. El
    nombre viaja en `Host` y en el SNI, que es lo que valida el certificado."""
    seen = {}

    def handler(request):
        seen["host"] = request.url.host
        seen["header"] = request.headers["host"]
        seen["sni"] = request.extensions.get("sni_hostname")
        return httpx.Response(200, text="ok")

    await _fetch("https://example.com/r", handler)
    assert seen == {"host": PUBLIC_IP, "header": "example.com", "sni": "example.com"}


@pytest.mark.parametrize(
    "url", ["file:///etc/passwd", "ftp://example.com/x", "javascript:alert(1)", "example.com", ""]
)
async def test_fetch_only_opens_http_and_https(url):
    with pytest.raises(PageUnreachable):
        await _fetch(url, _never)


async def test_fetch_refuses_a_page_larger_than_the_cap():
    def handler(request):
        return httpx.Response(200, content=b"x" * (MAX_BYTES + 1))

    with pytest.raises(PageUnreachable):
        await _fetch("https://example.com/big", handler)


async def test_fetch_error_status_is_unreachable():
    with pytest.raises(PageUnreachable):
        await _fetch("https://example.com/404", lambda r: httpx.Response(404))


async def test_fetch_network_error_is_unreachable():
    def handler(request):
        raise httpx.ConnectError("boom", request=request)

    with pytest.raises(PageUnreachable):
        await _fetch("https://example.com/", handler)


async def test_fetch_follows_redirects_but_not_off_http():
    def handler(request):
        if request.url.path == "/a":
            return httpx.Response(302, headers={"location": "https://example.com/b"})
        return httpx.Response(200, text="final")

    assert await _fetch("https://example.com/a", handler) == "final"


async def test_fetch_follows_a_relative_redirect():
    def handler(request):
        if request.url.path == "/a":
            return httpx.Response(301, headers={"location": "/b"})
        return httpx.Response(200, text="final")

    assert await _fetch("https://example.com/a", handler) == "final"


async def test_fetch_gives_up_after_too_many_redirects():
    def handler(request):
        return httpx.Response(302, headers={"location": "https://example.com/loop"})

    with pytest.raises(PageUnreachable):
        await _fetch("https://example.com/loop", handler)


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:8000/admin",
        "http://127.0.0.1/",
        "http://10.0.0.5/",
        "http://192.168.1.1/",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/",
        "http://[::ffff:10.0.0.1]/",
    ],
)
async def test_fetch_refuses_obvious_internal_hosts(url):
    with pytest.raises(PageUnreachable):
        await _fetch(url, _never)


# --- SSRF: lo que dice el DNS, no lo que parece el nombre ----------------------


@pytest.mark.parametrize(
    "address",
    ["10.0.0.5", "127.0.0.1", "169.254.169.254", "172.16.3.4", "100.64.0.1", "::1", "fd00::1",
     "fe80::1%eth0", "::ffff:192.168.0.1", "0.0.0.0"],
)
async def test_fetch_refuses_a_public_looking_name_that_resolves_inside(address):
    """`recetas.example` parece de internet; lo que cuenta es adónde lleva."""
    with pytest.raises(PageUnreachable):
        await _fetch("https://recetas.example/r", _never, _dns({"recetas.example": [address]}))


async def test_fetch_refuses_when_any_address_is_internal():
    """Con varias direcciones, el cliente puede acabar en cualquiera."""
    resolve = _dns({"recetas.example": [PUBLIC_IP, "10.0.0.5"]})
    with pytest.raises(PageUnreachable):
        await _fetch("https://recetas.example/r", _never, resolve)


async def test_fetch_refuses_a_redirect_to_a_name_that_resolves_inside():
    """La redirección se comprueba **antes** de seguirla: la petición al sitio
    interno no llega a salir."""
    asked = []

    def handler(request):
        asked.append(request.headers["host"])
        return httpx.Response(302, headers={"location": "http://interno.example/admin"})

    resolve = _dns({"recetas.example": [PUBLIC_IP], "interno.example": ["10.1.2.3"]})
    with pytest.raises(PageUnreachable):
        await _fetch("https://recetas.example/r", handler, resolve)
    assert asked == ["recetas.example"]


async def test_fetch_refuses_a_redirect_to_a_literal_internal_address():
    asked = []

    def handler(request):
        asked.append(str(request.url))
        return httpx.Response(302, headers={"location": "http://169.254.169.254/latest/"})

    with pytest.raises(PageUnreachable):
        await _fetch("https://example.com/r", handler)
    assert len(asked) == 1


async def test_fetch_a_name_that_does_not_resolve_is_unreachable():
    async def resolve(host, port):
        raise OSError("Name or service not known")

    with pytest.raises(PageUnreachable):
        await _fetch("https://no-existe.example/", _never, resolve)


async def test_fetch_a_name_with_no_addresses_is_unreachable():
    with pytest.raises(PageUnreachable):
        await _fetch("https://vacio.example/", _never, _dns({"vacio.example": []}))


async def test_behind_a_proxy_the_address_is_still_checked_but_not_pinned(monkeypatch):
    """Detrás de un proxy resuelve el proxy: fijar la IP rompería el TLS (httpx
    no pasa el SNI por el túnel). El DNS se comprueba igual."""
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:3128")
    monkeypatch.delenv("NO_PROXY", raising=False)
    monkeypatch.delenv("no_proxy", raising=False)
    seen = {}

    def handler(request):
        seen["host"] = request.url.host
        return httpx.Response(200, text="ok")

    await _fetch("https://example.com/r", handler)
    assert seen["host"] == "example.com"
    with pytest.raises(PageUnreachable):
        await _fetch("https://recetas.example/r", _never, _dns({"recetas.example": ["10.0.0.5"]}))
