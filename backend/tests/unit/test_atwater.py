"""Las cifras de una etiqueta tienen que cuadrar entre sí.

Escrito contra el hueco real de la lectura por foto. Lo que ya había comprobaba
**coherencia**: que ninguna cifra viniera sin una fila que la respalde, que la
columna fuera la buena, que ningún macro fuera absurdo. Nada de eso caza el
fallo que de verdad da miedo — `Proteínas 3,8 g` leído como `8,8 g`, con una
foto movida o una cámara mala. La fila existe, el número es plausible, la
columna es la correcta: pasa todos los filtros y se congela en el diario.

La defensa no está en mirar cada cifra, está en que **no son independientes**:
una etiqueta declara las kilocalorías *y* los macros que las producen, y las
dos afirmaciones tienen que dar lo mismo. Un dígito mal leído en cualquiera de
las cuatro rompe la igualdad, y se ve sin tener el envase delante.

Factores de la UE (Reglamento 1169/2011): 4 kcal/g proteína, 9 grasa, 4
hidratos disponibles, 2 fibra.

Es una red, no una demostración: no caza un error que mueva varias cifras a la
vez de forma consistente, y avisa de más en productos con polioles o alcohol.
Por eso avisa y no rechaza — la decisión sigue siendo de quien mira la etiqueta.
"""

import pytest

from app.nutrition import atwater_kcal, kcal_disagreement

# El yogur de las pruebas, tal y como viene en el bote.
YOGUR = {"protein": 3.8, "fat": 3.2, "carbs": 4.5, "fiber": 0.3}


def test_it_adds_the_macros_up_the_way_a_label_does():
    # 15.2 + 28.8 + 18 + 0.6
    assert atwater_kcal(**YOGUR) == pytest.approx(62.6)


def test_fibre_counts_at_two_not_at_four():
    """La UE cuenta la fibra a 2 kcal/g. A 4 saldrían 0,6 kcal de más por cada
    0,3 g, que en un pan integral ya es un aviso falso."""
    con = atwater_kcal(protein=0, fat=0, carbs=0, fiber=10)
    assert con == pytest.approx(20)


def test_a_label_that_adds_up_raises_nothing():
    assert kcal_disagreement(61, **YOGUR) is None


def test_rounding_on_the_label_is_not_a_disagreement():
    """Las etiquetas redondean. 61 contra 62,6 no es un error de lectura."""
    assert kcal_disagreement(60, **YOGUR) is None
    assert kcal_disagreement(65, **YOGUR) is None


def test_a_misread_digit_in_a_macro_is_caught():
    """El caso que motiva el fichero: 3,8 g de proteína leídos como 8,8."""
    off = kcal_disagreement(61, protein=8.8, fat=3.2, carbs=4.5, fiber=0.3)
    assert off is not None
    declared, computed = off
    assert declared == 61
    assert computed == pytest.approx(82.6)


def test_a_misread_digit_in_the_calories_is_caught_too():
    """Da igual cuál de las dos afirmaciones se leyera mal: lo que falla es que
    no coinciden, y eso ya es motivo para mirar el bote."""
    off = kcal_disagreement(81, **YOGUR)
    assert off is not None


def test_it_says_nothing_when_it_cannot_know(caplog):
    """Sin los tres macros principales no hay con qué comparar. Callar es la
    única respuesta honesta: un aviso aquí sería ruido en todos los alimentos
    que se dan de alta a medias, que son la mayoría."""
    assert kcal_disagreement(61, protein=None, fat=3.2, carbs=4.5, fiber=0.3) is None
    assert kcal_disagreement(None, **YOGUR) is None


def test_unknown_fibre_does_not_raise_a_false_alarm():
    """La fibra falta en media base de datos. Se cuenta como 0 para la
    estimación —aporta poco— y el margen absorbe el resto."""
    assert kcal_disagreement(61, protein=3.8, fat=3.2, carbs=4.5, fiber=None) is None


def test_a_food_with_almost_no_calories_is_not_flagged_by_a_rounding(caplog):
    """En cifras pequeñas un porcentaje se dispara: 4 kcal declaradas contra 6
    calculadas es un 50% y no es un error de lectura. Por eso el margen tiene
    un suelo absoluto además del relativo."""
    assert kcal_disagreement(4, protein=0.4, fat=0.1, carbs=0.6, fiber=0.2) is None


def test_a_wildly_wrong_reading_is_still_caught_in_small_numbers():
    assert kcal_disagreement(4, protein=9.0, fat=0.1, carbs=0.6, fiber=0.2) is not None
