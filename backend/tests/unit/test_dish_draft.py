"""El borrador de una idea: lo tuyo delante, y la receta leída se guarda tal cual."""

from dataclasses import dataclass

from app.dish_draft import dish_method, draft_lines, dump_recipe, load_recipe, match_line
from app.recipe_page import RecipeData

ME = 7


@dataclass(frozen=True)
class F:
    id: int
    name: str
    user_id: int | None = None
    aliases: tuple[str, ...] = ()


CATALOGO = [
    F(1, "Acelga, cruda", aliases=("acelga", "acelgas")),
    F(2, "Patata, cruda"),
    F(3, "Patata, cocida (alimento medio)"),
    F(4, "Huevo, crudo"),
]


def test_your_own_food_wins_when_it_matches_clearly():
    mine = F(10, "Acelga, del huerto", user_id=ME, aliases=("acelgas",))
    match = match_line("acelgas", [*CATALOGO, mine], ME)
    assert match.status == "chosen"
    assert match.food_id == 10


def test_someone_elses_food_is_not_yours():
    """`visible_foods` ya no la trae; y si la trajese, no va delante."""
    theirs = F(11, "Acelga, del huerto", user_id=99, aliases=("acelgas",))
    match = match_line("acelgas", [*CATALOGO, theirs], ME)
    assert match.food_id != 11


def test_one_of_yours_breaks_a_tie_the_catalogue_would_ask_about():
    """Entre «Patata, cruda» y «Patata, cocida» se pregunta; si tú tienes una
    patata, es la tuya."""
    mine = F(12, "Patata, de mi pueblo", user_id=ME)
    match = match_line("patatas", [*CATALOGO, mine], ME)
    assert match.status == "chosen"
    assert match.food_id == 12


def test_when_it_asks_your_foods_come_first():
    mine = [F(12, "Patata, de mi pueblo", user_id=ME), F(13, "Patata, nueva", user_id=ME)]
    match = match_line("patatas", [*CATALOGO, *mine], ME)
    assert match.status == "ambiguous"
    assert set(match.candidates[:2]) == {12, 13}
    assert len(match.candidates) == 3


def test_without_your_foods_it_is_just_match_ingredient():
    match = match_line("patatas", CATALOGO, ME)
    assert match.status == "ambiguous"
    assert set(match.candidates) == {2, 3}


def test_lines_keep_the_text_and_scale_to_one_serving():
    (line,) = draft_lines(["500 gr de acelgas"], 2, CATALOGO, ME)
    assert line.text == "500 gr de acelgas"
    assert (line.quantity, line.unit, line.recipe_grams, line.grams) == (500, "g", 500, 250)
    assert line.food.name == "Acelga, cruda"


def test_unknown_servings_leave_the_grams_per_serving_unknown():
    (line,) = draft_lines(["500 gr de acelgas"], None, CATALOGO, ME)
    assert line.recipe_grams == 500
    assert line.grams is None


def test_a_line_with_no_weight_has_no_grams_whatever_the_servings():
    (line,) = draft_lines(["2 huevos"], 2, CATALOGO, ME)
    assert line.quantity == 2
    assert line.recipe_grams is None
    assert line.grams is None
    assert line.food.name == "Huevo, crudo"


def test_the_stored_recipe_round_trips():
    stored = load_recipe(dump_recipe(RecipeData(name="x", ingredients=["a", "b"], servings=4)))
    assert (stored.found, stored.ingredients, stored.servings) == (True, ["a", "b"], 4)


def test_a_page_without_a_recipe_is_stored_as_read_and_empty():
    stored = load_recipe(dump_recipe(None))
    assert (stored.found, stored.ingredients, stored.servings) == (False, [], None)


def test_the_method_carries_over_only_when_it_is_one_of_the_repertoire():
    assert dish_method("Horno") == "horno"
    assert dish_method("sartén") == "sarten"
    assert dish_method("Air fryer") == "air_fryer"
    assert dish_method("olla") is None
    assert dish_method(None) is None
