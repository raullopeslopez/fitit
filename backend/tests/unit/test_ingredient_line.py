"""Una línea de ingredientes en español → cantidad, unidad, gramos, nombre.

`grams` sólo existe cuando la unidad es de masa o de volumen. «2 huevos» tiene
cantidad y no tiene gramos: `None`, no 0.
"""

import pytest

from app.ingredient_line import ParsedLine, parse_line


@pytest.mark.parametrize(
    ("line", "quantity", "unit", "grams", "name"),
    [
        # Las nueve líneas que publica okdiario para las acelgas a la crema.
        ("500 gr de acelgas", 500, "g", 500, "acelgas"),
        ("200 ml de crema de leche", 200, "ml", 200, "crema de leche"),
        ("2 huevos", 2, None, None, "huevos"),
        ("½ cebolla", 0.5, None, None, "cebolla"),
        ("70 gr de piñones tostados", 70, "g", 70, "piñones tostados"),
        ("2 cucharadas de harina", 2, "cucharada", None, "harina"),
        ("80 gr de atún al natural (opcional)", 80, "g", 80, "atún al natural"),
        ("Queso parmesano", None, None, None, "Queso parmesano"),
        ("Sal y pimienta", None, None, None, "Sal y pimienta"),
        # Masa y volumen: las únicas unidades con gramos.
        ("1/2 kg de patatas", 0.5, "kg", 500, "patatas"),
        ("1 kg. de patatas", 1, "kg", 1000, "patatas"),
        ("1,5 kg de patatas", 1.5, "kg", 1500, "patatas"),
        ("500g de harina", 500, "g", 500, "harina"),
        ("250 gramos de arroz", 250, "g", 250, "arroz"),
        ("300 g. de patatas", 300, "g", 300, "patatas"),
        ("500 mg de sal", 500, "mg", 0.5, "sal"),
        ("1 l de leche", 1, "l", 1000, "leche"),
        ("1 litro de caldo de pollo", 1, "l", 1000, "caldo de pollo"),
        ("2 dl de nata", 2, "dl", 200, "nata"),
        ("5 cl de brandy", 5, "cl", 50, "brandy"),
        ("100 mililitros de vino blanco", 100, "ml", 100, "vino blanco"),
        ("1 ½ kg de patatas", 1.5, "kg", 1500, "patatas"),
        ("1/3 kg de carne picada", pytest.approx(1 / 3), "kg", 333.33, "carne picada"),
        # Sin un peso fiable: cantidad sí, gramos no.
        ("2 dientes de ajo", 2, "diente", None, "ajo"),
        ("1 diente de ajo", 1, "diente", None, "ajo"),
        ("1 cucharadita de comino", 1, "cucharadita", None, "comino"),
        ("1 taza de arroz", 1, "taza", None, "arroz"),
        ("1 vaso de leche", 1, "vaso", None, "leche"),
        ("Una pizca de sal", 1, "pizca", None, "sal"),
        ("un chorrito de aceite de oliva", 1, "chorrito", None, "aceite de oliva"),
        ("1 lata de atún", 1, "lata", None, "atún"),
        ("3 unidades de tomate", 3, "unidad", None, "tomate"),
        ("medio limón", 0.5, None, None, "limón"),
        ("2-3 dientes de ajo", 2, "diente", None, "ajo"),
        ("2 a 3 tomates", 2, None, None, "tomates"),
        ("2 alcachofas", 2, None, None, "alcachofas"),
        ("1 o 2 guindillas", 1, None, None, "guindillas"),
        # Relleno que no es el alimento.
        ("Sal al gusto", None, None, None, "Sal"),
        ("Pimienta negra (al gusto)", None, None, None, "Pimienta negra"),
        ("Perejil, opcional", None, None, None, "Perejil"),
        ("  Aceite   de oliva  ", None, None, None, "Aceite de oliva"),
        ("Aceite de oliva virgen extra", None, None, None, "Aceite de oliva virgen extra"),
    ],
)
def test_parse_line(line, quantity, unit, grams, name):
    parsed = parse_line(line)
    assert parsed.quantity == quantity
    assert parsed.unit == unit
    assert parsed.grams == grams
    assert parsed.name == name


def test_no_weight_is_none_not_zero():
    """NULL no es 0: «2 huevos» pesa algo, sólo que la línea no dice cuánto."""
    assert parse_line("2 huevos").grams is None


def test_the_result_is_a_plain_value():
    assert parse_line("2 huevos") == ParsedLine(quantity=2, unit=None, grams=None, name="huevos")


def test_an_empty_line_has_an_empty_name():
    assert parse_line("   ") == ParsedLine(quantity=None, unit=None, grams=None, name="")


def test_a_bare_number_is_a_quantity_with_no_name():
    assert parse_line("4") == ParsedLine(quantity=4, unit=None, grams=None, name="")


def test_a_word_that_starts_like_a_unit_is_not_one():
    """«l» es litro sólo como palabra: «limón» no es 1 l de «imón»."""
    assert parse_line("2 limones") == ParsedLine(quantity=2, unit=None, grams=None, name="limones")
    assert parse_line("2 granadas").unit is None
