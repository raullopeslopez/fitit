"""El hidrato sigue al entreno: quién gana y quién cede.

Las mismas kcal cada día; la comida de después del entreno gana hasta 50 g de
hidrato y los ceden la merienda y la cena. Sólo se mueve lo que aún no ha
pasado y no está dicho: lo comido no se puede quitar.
"""

from app.nutrition import hidrato_del_entreno

TODO = [("desayuno", 75.0), ("comida", 90.0), ("snack", 40.0), ("cena", 75.0)]


def test_antes_de_desayunar_gana_el_desayuno():
    assert hidrato_del_entreno(TODO, hora=7.0) == {"desayuno": 50.0, "snack": -25.0, "cena": -25.0}


def test_a_mediodia_gana_la_comida():
    assert hidrato_del_entreno(TODO[1:], hora=13.0) == {"comida": 50.0, "snack": -25.0, "cena": -25.0}


def test_por_la_tarde_gana_la_merienda_y_cede_la_cena():
    assert hidrato_del_entreno(TODO[2:], hora=17.5) == {"snack": 50.0, "cena": -50.0}


def test_lo_que_ya_paso_no_cede_ni_gana():
    """A las 13:00 el desayuno sin decir ya pasó: no se le quita nada."""
    assert hidrato_del_entreno(TODO, hora=13.0) == {"comida": 50.0, "snack": -25.0, "cena": -25.0}


def test_quien_no_llega_cede_lo_que_tiene_y_el_resto_lo_pone_otro():
    pendientes = [("comida", 90.0), ("snack", 10.0), ("cena", 75.0)]
    assert hidrato_del_entreno(pendientes, hora=13.0) == {"comida": 50.0, "snack": -10.0, "cena": -40.0}


def test_sin_de_donde_sacar_se_mueve_lo_que_hay():
    assert hidrato_del_entreno([("snack", 40.0), ("cena", 10.0)], hora=17.5) == {"snack": 10.0, "cena": -10.0}


def test_entrenar_de_noche_no_mueve_nada():
    assert hidrato_del_entreno([("cena", 75.0)], hora=21.5) == {}


def test_pasada_la_medianoche_sigue_siendo_el_mismo_dia():
    """La 01:00 es el final del día alimentario, no el principio del siguiente."""
    assert hidrato_del_entreno(TODO, hora=1.0) == {}


def test_un_hidrato_sin_medir_no_cede():
    """`None` no es 0 ni «todo lo que haga falta»: no se le puede quitar nada."""
    assert hidrato_del_entreno([("comida", 90.0), ("snack", None), ("cena", 75.0)], hora=13.0) == {
        "comida": 50.0,
        "cena": -50.0,
    }
