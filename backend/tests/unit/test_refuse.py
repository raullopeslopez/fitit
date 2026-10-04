"""El hueso: cuánto de lo que pesas no se come, y a qué se refieren las kcal.

La aritmética (`gramos_comestibles`, `desperdicio_de_sobras`)
vive en `nutrition.py`; la tabla de referencia y el emparejado por nombre, en
`refuse.py`. Aquí se fijan las dos.
"""

from types import SimpleNamespace

import pytest

from app.nutrition import (
    desperdicio_de_sobras,
    gramos_comestibles,
    nutrientes_con_hueso,
)
from app.refuse import REFERENCIAS, hueso_de, referencia


def _food(name, *, source="manual", kcal=None, refuse_pct=None, kcal_basis=None, protein=None):
    return SimpleNamespace(
        name=name,
        source=source,
        kcal_100g=kcal,
        protein_100g=protein,
        fat_100g=None,
        carbs_100g=None,
        fiber_100g=None,
        nutrients_json=None,
        refuse_pct=refuse_pct,
        kcal_basis=kcal_basis,
    )


# --- Aritmética ----------------------------------------------------------------


def test_edible_grams_take_the_bone_away():
    assert gramos_comestibles(300, 30) == 210
    assert gramos_comestibles(1000, 25) == 750


def test_edible_grams_reject_a_food_that_is_all_bone():
    with pytest.raises(ValueError):
        gramos_comestibles(300, 100)


def test_leftover_bone_is_a_share_of_what_was_weighed():
    assert desperdicio_de_sobras(1000, 250) == 25
    assert desperdicio_de_sobras(300, 60) == 20


@pytest.mark.parametrize("bone", [0, -1, 300, 400])
def test_leftover_bone_must_be_less_than_what_was_weighed(bone):
    with pytest.raises(ValueError):
        desperdicio_de_sobras(300, bone)


def test_with_bone_and_edible_basis_macros_scale_with_the_meat():
    food = _food("x", kcal=192, protein=18)
    computed, edible = nutrientes_con_hueso(food, 300, refuse_pct=30, basis="edible")
    assert edible == 210
    assert computed["kcal"] == 403.2
    assert computed["protein"] == 37.8
    # Lo que nadie midió sigue sin medir.
    assert computed["fat"] is None


def test_with_bone_and_as_sold_basis_the_label_already_counts_it():
    food = _food("x", kcal=135)
    computed, edible = nutrientes_con_hueso(food, 1000, refuse_pct=30, basis="as_sold")
    assert edible is None
    assert computed["kcal"] == 1350


def test_with_bone_and_unknown_basis_there_is_no_honest_number():
    with pytest.raises(ValueError):
        nutrientes_con_hueso(_food("x", kcal=165), 1000, refuse_pct=30, basis="unknown")


# --- La tabla de referencia ---------------------------------------------------


@pytest.mark.parametrize(
    "name,pct",
    [
        ("Pollo, muslo, carne y piel, crudo", 30),
        ("Muslos de pollo", 30),
        ("Contramuslos de pollo", 20),
        ("Alitas de pollo", 45),
        ("Pollo entero", 30),
        ("Chuletas de cerdo", 20),
        ("Costillas de cerdo", 45),
        ("Cordero, chuleta, cruda", 25),
        ("Chuletón de vaca", 15),
        ("Dorada entera", 45),
        ("Conejo troceado", 30),
    ],
)
def test_common_bone_in_foods_have_a_reference(name, pct):
    ref = referencia(name)
    assert ref is not None, name
    assert ref.refuse_pct == pct


@pytest.mark.parametrize(
    "name",
    [
        "Pechuga de pollo",
        "Contramuslo de pollo sin hueso",
        "Muslo de pato deshuesado",
        "Filetes de merluza",
        "Hamburguesa de pollo",
        "Atún en aceite de girasol, entero, en conserva",
        "Hígado de conejo, crudo",
        "Tomate, entero, crudo",
        "Cerdo, costillar, crudo",  # el costillar de CIQUAL es la cinta, sin hueso a la vista
        "Yogur natural",
    ],
)
def test_boneless_foods_have_none(name):
    assert referencia(name) is None


def test_every_reference_cites_where_it_comes_from():
    for ref in REFERENCIAS:
        assert 0 < ref.refuse_pct < 100
        assert ref.fuente


# --- Lo que vale para un alimento concreto --------------------------------------


def test_catalogue_kcal_are_for_the_edible_part():
    h = hueso_de(_food("Pollo, muslo, carne y piel, crudo", source="ciqual", kcal=192))
    assert (h.refuse_pct, h.origen, h.basis) == (30, "referencia", "edible")


@pytest.mark.parametrize("kcal", [135, 190, 165])
def test_nothing_is_guessed_from_my_label(kcal):
    # Antes una etiqueta cerca de la cifra de la carne se leía como «de la
    # carne», y cerca de la cifra rebajada, como «con hueso». Ya no: el número
    # no dice a qué se refiere, lo dice quien lo dio de alta.
    assert hueso_de(_food("Muslos de pollo", kcal=kcal)).basis == "unknown"


def test_what_i_said_is_what_counts():
    h = hueso_de(_food("Muslos de pollo", kcal=135, kcal_basis="edible"))
    assert h.basis == "edible"


def test_what_i_measured_beats_the_reference():
    h = hueso_de(_food("Muslos de pollo", kcal=190, refuse_pct=25))
    assert (h.refuse_pct, h.origen) == (25, "tuyo")


def test_zero_bone_means_no_bone():
    """Poner 0 % es la salida a un emparejado equivocado: «esto no lleva hueso»."""
    assert hueso_de(_food("Muslos de pollo", kcal=190, refuse_pct=0)) is None


def test_a_boneless_food_has_no_bone_at_all():
    assert hueso_de(_food("Yogur natural", kcal=60)) is None


def test_a_food_i_say_has_bone_without_a_reference_is_unknown_until_i_say_more():
    h = hueso_de(_food("Cabrito al horno de mi madre", kcal=200, refuse_pct=35))
    assert (h.refuse_pct, h.basis) == (35, "unknown")
