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
    html = _page([{"@graph": [{"@type": "WebPage"}, {"@type": "Recipe", "recipeIngredient": ["a"]}]}])
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
    html = _page({"@type": "Recipe", "recipeIngredient": ["Sal &amp; pimienta", "&frac12; cebolla"]})
    assert read_recipe(html).ingredients == ["Sal & pimienta", "½ cebolla"]


def test_a_recipe_with_no_ingredients_is_still_a_recipe():
    """Distinto de «no hay receta»: la página dice que es una y no los publica."""
    recipe = read_recipe(_page({"@type": "Recipe", "name": "x"}))
    assert recipe == RecipeData(name="x", ingredients=[], servings=None)


def test_the_recipe_with_ingredients_wins_over_an_empty_one():
    html = _page({"@type": "Recipe"}, {"@type": "Recipe", "recipeIngredient": ["a"]})
    assert read_recipe(html).ingredients == ["a"]


def test_script_type_attribute_is_case_and_quote_tolerant():
    html = "<script type='application/LD+JSON' id=x>{\"@type\":\"Recipe\",\"recipeIngredient\":[\"a\"]}</script>"
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


def _transport(handler):
    return httpx.MockTransport(handler)


async def test_fetch_returns_the_text_and_sends_a_browser_user_agent():
    seen = {}

    def handler(request):
        seen["ua"] = request.headers["user-agent"]
        return httpx.Response(200, text="<html>ok</html>")

    assert await fetch_page("https://example.com/r", transport=_transport(handler)) == "<html>ok</html>"
    assert "Mozilla/5.0" in seen["ua"]


@pytest.mark.parametrize(
    "url", ["file:///etc/passwd", "ftp://example.com/x", "javascript:alert(1)", "example.com", ""]
)
async def test_fetch_only_opens_http_and_https(url):
    def handler(request):  # pragma: no cover - no debe llegar
        raise AssertionError("fetched")

    with pytest.raises(PageUnreachable):
        await fetch_page(url, transport=_transport(handler))


async def test_fetch_refuses_a_page_larger_than_the_cap():
    def handler(request):
        return httpx.Response(200, content=b"x" * (MAX_BYTES + 1))

    with pytest.raises(PageUnreachable):
        await fetch_page("https://example.com/big", transport=_transport(handler))


async def test_fetch_error_status_is_unreachable():
    with pytest.raises(PageUnreachable):
        await fetch_page("https://example.com/404", transport=_transport(lambda r: httpx.Response(404)))


async def test_fetch_network_error_is_unreachable():
    def handler(request):
        raise httpx.ConnectError("boom", request=request)

    with pytest.raises(PageUnreachable):
        await fetch_page("https://example.com/", transport=_transport(handler))


async def test_fetch_follows_redirects_but_not_off_http():
    def handler(request):
        if request.url.path == "/a":
            return httpx.Response(302, headers={"location": "https://example.com/b"})
        return httpx.Response(200, text="final")

    assert await fetch_page("https://example.com/a", transport=_transport(handler)) == "final"


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:8000/admin",
        "http://127.0.0.1/",
        "http://10.0.0.5/",
        "http://192.168.1.1/",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/",
    ],
)
async def test_fetch_refuses_obvious_internal_hosts(url):
    def handler(request):  # pragma: no cover - no debe llegar
        raise AssertionError("fetched")

    with pytest.raises(PageUnreachable):
        await fetch_page(url, transport=_transport(handler))
