"""Qué se hace con una ficha de Open Food Facts.

OFF la rellena cualquiera, así que sus fichas vienen a medias con normalidad:
campos ausentes, cifras absurdas, valores por ración. Este fichero fija que
nada de eso entra en la base de datos disfrazado de medición — las mismas dos
reglas que ya rigen la lectura de una etiqueta, aplicadas a una fuente
distinta.

Ninguna de estas pruebas toca la red: la ficha se pasa a mano, porque lo que
hay que fijar no es que OFF conteste, sino qué hacemos con lo que conteste.
"""

import pytest

from app.openfoodfacts import (
    NotFound,
    Unusable,
    looks_like_a_barcode,
    read_product,
)

EAN = "8410128750121"


def ficha(**overrides):
    product = {
        "product_name": "Yogur natural",
        "brands": "Hacendado",
        "nutrition_data_per": "100g",
        "quantity": "500 g",
        "product_quantity_unit": "g",
        "nutriments": {
            "energy-kcal_100g": 61,
            "proteins_100g": 3.8,
            "fat_100g": 3.2,
            "carbohydrates_100g": 4.5,
            "fiber_100g": 0.3,
        },
    }
    product.update(overrides)
    return {"status": 1, "product": product}


def test_a_complete_product_comes_through():
    read = read_product(EAN, ficha())
    assert read.name == "Yogur natural"
    assert read.brand == "Hacendado"
    assert read.barcode == EAN
    assert read.nutrients["kcal"] == 61
    assert read.nutrients["fiber"] == 0.3


def test_a_code_off_does_not_know_is_not_an_error():
    """Es un alimento que das de alta a mano, con su código ya puesto."""
    with pytest.raises(NotFound):
        read_product(EAN, {"status": 0})


def test_a_nutrient_off_does_not_carry_stays_unknown():
    """La mitad de las fichas de OFF no traen fibra. Raya, no cero."""
    nutriments = {k: v for k, v in ficha()["product"]["nutriments"].items() if "fiber" not in k}
    read = read_product(EAN, ficha(nutriments=nutriments))
    assert read.nutrients["fiber"] is None
    assert read.nutrients["kcal"] == 61


def test_a_product_with_no_calories_is_refused():
    """Sin kcal la ficha no contesta a la pregunta por la que escaneas."""
    nutriments = {k: v for k, v in ficha()["product"]["nutriments"].items() if "energy" not in k}
    with pytest.raises(Unusable) as refused:
        read_product(EAN, ficha(nutriments=nutriments))
    assert refused.value.reason == "sin kcal"


def test_values_per_serving_are_refused_not_rescaled():
    with pytest.raises(Unusable) as refused:
        read_product(EAN, ficha(nutrition_data_per="serving"))
    assert refused.value.reason == "por ración"


@pytest.mark.parametrize(
    "product",
    [
        {"product_quantity_unit": "ml", "quantity": "1 l"},
        {"quantity": "330 ml"},
        {"quantity": "1,5 L"},
    ],
)
def test_a_drink_is_read_and_flagged(product):
    """`_100g` es el nombre del campo, no una promesa: en una bebida esas cifras
    son por 100 ml.

    Se aceptan y se marcan, como la columna equivalente de una etiqueta:
    rechazarlas dejaba fuera media nevera —leche, bebidas vegetales, zumos,
    caldos— y en un líquido acuoso la diferencia con los gramos es del 3%. Lo
    que la regla prohíbe es **convertir a escondidas**, y aquí no se convierte
    nada: los números se guardan tal cual y la pantalla dice de qué unidad
    salen antes de que nadie pulse guardar.
    """
    read = read_product(EAN, ficha(**product))
    assert read.per == "100ml"
    assert read.nutrients["kcal"] == 61


def test_a_solid_says_it_is_grams():
    assert read_product(EAN, ficha()).per == "100g"


def test_an_absurd_figure_is_dropped_rather_than_stored():
    nutriments = {**ficha()["product"]["nutriments"], "proteins_100g": 4000}
    read = read_product(EAN, ficha(nutriments=nutriments))
    assert read.nutrients["protein"] is None
    assert read.nutrients["kcal"] == 61


def test_only_the_first_brand_is_kept():
    """OFF encadena marcas separadas por comas; en el campo cabe una."""
    assert read_product(EAN, ficha(brands="Hacendado, Mercadona")).brand == "Hacendado"


def test_a_nameless_product_is_still_scannable():
    """Sin nombre se teclea el nombre, que es un campo. Lo caro son las cifras."""
    read = read_product(EAN, ficha(product_name=""))
    assert read.name is None
    assert read.nutrients["kcal"] == 61


@pytest.mark.parametrize("code", ["8410128750121", "12345678", "012345678905"])
def test_a_real_barcode_is_recognised(code):
    assert looks_like_a_barcode(code)


@pytest.mark.parametrize("code", ["", "841012", "pollo", "8410-12875", "841012875012123"])
def test_something_that_is_not_a_barcode_is_not(code):
    assert not looks_like_a_barcode(code)
