"""El vocabulario que hablan las reglas."""

from app.food_groups import FAMILIAS, familia, nombre_de_subgrupo


def test_las_tres_familias_que_pidio_raul_se_distinguen():
    """Verdura, tubérculo y legumbre son tres cosas, no una."""
    assert familia("0201") == "verdura"
    assert familia("0202") == "tuberculo"
    assert familia("0203") == "legumbre"


def test_el_pescado_es_pescado_aunque_cambie_el_subgrupo():
    """A una regla de «pescado dos veces» no le importa si estaba crudo."""
    assert familia("0405") == familia("0406") == familia("0409") == "pescado"


# La regla del `NULL`, sobre el objeto nuevo.
def test_sin_grupo_es_sin_clasificar_y_no_es_no_es_verdura():
    assert familia(None) is None
    assert familia("") is None
    assert familia("9999") is None


def test_ninguna_familia_comparte_subgrupo_con_otra():
    """Si un subgrupo cayera en dos familias, contar sería ambiguo."""
    vistos = [code for codes in FAMILIAS.values() for code in codes]
    assert len(vistos) == len(set(vistos))


def test_cada_subgrupo_de_una_familia_tiene_nombre_en_espanol():
    for codes in FAMILIAS.values():
        for code in codes:
            assert nombre_de_subgrupo(code), code
