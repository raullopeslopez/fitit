"""El nombre de una línea contra los alimentos: elegido, «¿Cuál?» o «Falta».

Dos catálogos. Uno pequeño, el mismo que pone el Background de
`dish_from_idea.feature`. Y el de verdad: las 3.185 traducciones de
`data/ciqual_es.json`, que es lo que habrá en la base de datos, con sus alias.
"""

import json
from functools import cache
from pathlib import Path

import pytest

from app.ingredient_match import FoodCandidate, IngredientMatch, match_ingredient

CIQUAL_ES = Path(__file__).resolve().parents[2] / "data" / "ciqual_es.json"


def _small():
    names = [
        "Acelga, cruda",
        "Huevo, crudo",
        "Patata, cocida (alimento medio)",
        "Patata, cruda",
    ]
    return [FoodCandidate(id=i, name=n) for i, n in enumerate(names, start=1)]


@cache
def _ciqual() -> tuple[FoodCandidate, ...]:
    data = json.loads(CIQUAL_ES.read_text(encoding="utf-8"))
    return tuple(
        FoodCandidate(id=int(code), name=row["es"], aliases=tuple(row.get("alias") or ()))
        for code, row in data.items()
    )


def _name(food_id, foods) -> str:
    return next(f.name for f in foods if f.id == food_id)


def _names(match, foods) -> list[str]:
    return [_name(i, foods) for i in match.candidates]


# --- El catálogo del Background ----------------------------------------------


def test_one_food_is_chosen():
    foods = _small()
    match = match_ingredient("acelgas", foods)
    assert match.status == "chosen"
    assert _name(match.food_id, foods) == "Acelga, cruda"


def test_plural_reaches_the_singular():
    foods = _small()
    assert _name(match_ingredient("huevos", foods).food_id, foods) == "Huevo, crudo"


def test_several_foods_ask_which_one():
    """El escenario de las patatas: cocida y cruda, y nadie ha dicho cuál."""
    foods = _small()
    match = match_ingredient("patatas", foods)
    assert match.status == "ambiguous"
    assert match.food_id is None
    assert set(_names(match, foods)) == {"Patata, cocida (alimento medio)", "Patata, cruda"}


def test_nothing_is_missing():
    match = match_ingredient("tahini", _small())
    assert match == IngredientMatch(status="missing", food_id=None, candidates=[])


def test_an_empty_name_is_missing():
    assert match_ingredient("", _small()).status == "missing"


def test_accents_and_case_do_not_matter():
    foods = _small()
    assert match_ingredient("ACELGAS", foods).status == "chosen"


def test_candidates_are_capped_at_three():
    foods = [FoodCandidate(id=i, name=f"Patata, variedad {i}") for i in range(10)]
    match = match_ingredient("patatas", foods)
    assert match.status == "ambiguous"
    assert len(match.candidates) == 3


def test_foods_can_be_any_object_with_id_name_and_aliases():
    """Lo que pasará la consulta: filas `Food` con `aliases` de `FoodAlias`."""

    class Alias:
        def __init__(self, alias):
            self.alias = alias

    class Row:
        def __init__(self, id, name, aliases):
            self.id, self.name, self.aliases = id, name, aliases

    rows = [Row(7, "Tahini (puré de sésamo)", [Alias("tahini")])]
    assert match_ingredient("tahini", rows).food_id == 7


def test_a_raw_entry_breaks_a_tie_only_when_an_alias_vouches_for_it():
    """«Patata, cruda» no gana a «Patata, cocida» por ser cruda: eso es decidir
    por la persona. Sí gana «Ajo, crudo» cuando el catálogo dice que «ajo» es
    un nombre de los tres, y de los tres sólo uno es el crudo."""
    foods = [
        FoodCandidate(id=1, name="Ajo, crudo", aliases=("ajo", "ajos")),
        FoodCandidate(id=2, name="Ajo, asado al horno", aliases=("ajo asado", "ajo")),
        FoodCandidate(id=3, name="Ajo, salteado sin grasa", aliases=("ajo salteado", "ajo")),
    ]
    assert match_ingredient("ajo", foods).food_id == 1


def test_a_partial_name_only_chooses_when_what_was_dropped_is_a_description():
    """«piñones tostados» → Piñón: «tostados» describe. «caldo de pollo» no es
    pollo: se ofrece, no se elige."""
    foods = [
        FoodCandidate(id=1, name="Piñón", aliases=("piñon", "piñones")),
        FoodCandidate(id=2, name="Pollo, carne, cruda", aliases=("pollo",)),
    ]
    assert match_ingredient("piñones tostados", foods) == IngredientMatch(
        status="chosen", food_id=1, candidates=[1]
    )
    caldo = match_ingredient("caldo de pollo", foods)
    assert caldo.status == "ambiguous"
    assert caldo.candidates == [2]


# --- El catálogo de verdad ----------------------------------------------------


def test_real_acelgas_is_the_raw_chard():
    foods = _ciqual()
    match = match_ingredient("acelgas", foods)
    assert match.status == "chosen"
    assert _name(match.food_id, foods) == "Acelga, cruda"


def test_real_huevos_is_the_raw_egg():
    """El alias «huevos» es de «Huevo, crudo» y de nadie más: la clara y la
    yema también empiezan por «Huevo», pero no son lo que dice la línea."""
    foods = _ciqual()
    match = match_ingredient("huevos", foods)
    assert match.status == "chosen"
    assert _name(match.food_id, foods) == "Huevo, crudo"


def test_real_patatas_asks_and_never_chooses_the_crisps():
    foods = _ciqual()
    match = match_ingredient("patatas", foods)
    assert match.status == "ambiguous"
    names = _names(match, foods)
    assert names[0] == "Patata, sin piel, cruda"
    assert "Patata, cocida (alimento medio)" in names
    assert not any("fritas" in n for n in names)


@pytest.mark.parametrize("line_name", ["ajo", "diente de ajo", "dientes de ajo"])
def test_real_garlic_reaches_the_raw_clove(line_name):
    foods = _ciqual()
    match = match_ingredient(line_name, foods)
    assert match.status == "chosen"
    assert _name(match.food_id, foods) == "Ajo, crudo"


def test_real_toasted_pine_nuts_are_pine_nuts():
    foods = _ciqual()
    assert _name(match_ingredient("piñones tostados", foods).food_id, foods) == "Piñón"


def test_real_tahini_is_in_ciqual():
    """En el Background de la feature, tahini falta; en CIQUAL, no."""
    foods = _ciqual()
    match = match_ingredient("tahini", foods)
    assert match.status == "chosen"
    assert _name(match.food_id, foods) == "Tahini (puré de sésamo)"


def test_real_made_up_food_is_missing():
    assert match_ingredient("polvo de unicornio", _ciqual()).status == "missing"


@pytest.mark.parametrize(
    ("line_name", "status", "food"),
    [
        # El resto de la receta de okdiario, tal como la parte `parse_line`.
        ("crema de leche", "chosen", "Nata o especialidad a base de nata ligera, contenido en grasa desconocido (alimento medio)"),
        ("cebolla", "chosen", "Cebolla, cruda"),
        ("atún al natural", "chosen", "Atún, al natural, en conserva, escurrido"),
        ("Queso parmesano", "chosen", "Parmesano"),
        ("Aceite de oliva virgen extra", "chosen", "Aceite de oliva virgen extra"),
        ("harina", "ambiguous", None),
        ("Sal y pimienta", "ambiguous", None),
    ],
)
def test_real_okdiario_lines(line_name, status, food):
    foods = _ciqual()
    match = match_ingredient(line_name, foods)
    assert match.status == status
    if food:
        assert _name(match.food_id, foods) == food
