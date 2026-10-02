"""La derivación del objetivo, sin base de datos de por medio.

Los escenarios fijan lo que se ve desde fuera; esto fija los bordes, que es
donde una estimación se convierte en una cifra que nadie puede desmentir.
"""

import pytest

from app.targets import (
    KCAL_PER_KG,
    MIN_KCAL,
    Gasto,
    factor_actividad,
    gasto_medido,
    gasto_por_formula,
    mifflin,
    proponer,
)


def test_mifflin_hombre_y_mujer_no_dan_lo_mismo():
    hombre = mifflin(sex="male", kg=78, cm=178, age=35)
    mujer = mifflin(sex="female", kg=78, cm=178, age=35)
    assert hombre - mujer == pytest.approx(166)


def test_el_factor_sale_de_lo_que_la_app_ya_sabe():
    """Los días que entrenas, no un «nivel de actividad» que rellena el usuario."""
    assert factor_actividad(0) < factor_actividad(2) < factor_actividad(4) < factor_actividad(6)


def test_sin_los_datos_del_cuerpo_se_dice_que_falta_en_vez_de_estimar():
    gasto = gasto_por_formula(sex=None, kg=78, cm=None, age=35, dias_entreno=3)
    assert gasto.kcal is None
    assert set(gasto.missing) == {"altura", "sexo"}


def test_medir_necesita_ventana_suficiente():
    """Menos de dos semanas mide el agua de la semana, no el gasto."""
    assert gasto_medido(kcal_por_dia=[2500] * 5, dias=5, delta_kg=0) is None


def test_sin_pesadas_no_hay_medicion():
    assert gasto_medido(kcal_por_dia=[2500] * 20, dias=20, delta_kg=None) is None


def test_comer_lo_mismo_sin_moverse_es_tu_mantenimiento():
    gasto = gasto_medido(kcal_por_dia=[2600] * 21, dias=21, delta_kg=0)
    assert gasto.kcal == 2600
    assert gasto.source == "measured"


def test_bajar_de_peso_significa_que_gastas_mas_de_lo_que_comias():
    gasto = gasto_medido(kcal_por_dia=[2000] * 21, dias=21, delta_kg=-1)
    assert gasto.kcal == round(2000 + KCAL_PER_KG / 21, 0)


def test_subir_significa_lo_contrario():
    gasto = gasto_medido(kcal_por_dia=[3000] * 21, dias=21, delta_kg=1)
    assert gasto.kcal < 3000


def test_mantener_no_toca_el_gasto():
    propuesta = proponer(Gasto(kcal=2600, source="measured"), goal="maintain", rate_kg_week=0.5)
    assert propuesta.kcal == 2600


def test_bajar_medio_kilo_a_la_semana_son_550_kcal_menos_al_dia():
    propuesta = proponer(Gasto(kcal=2600, source="measured"), goal="cut", rate_kg_week=0.5)
    assert propuesta.kcal == round(2600 - (0.5 * KCAL_PER_KG) / 7, 0)


def test_un_ritmo_imposible_toca_suelo_y_lo_dice():
    """Recortar en silencio sería devolver otra cosa de la que se pidió."""
    propuesta = proponer(Gasto(kcal=1800, source="formula"), goal="cut", rate_kg_week=2)
    assert propuesta.kcal == MIN_KCAL
    assert propuesta.floored is True


def test_sin_gasto_no_hay_propuesta_y_viaja_lo_que_falta():
    propuesta = proponer(Gasto(kcal=None, missing=["altura"]), goal="cut", rate_kg_week=0.5)
    assert propuesta.kcal is None
    assert propuesta.missing == ["altura"]


def test_la_propuesta_lleva_el_gasto_del_que_sale_sin_el_ritmo():
    propuesta = proponer(Gasto(kcal=2600, source="measured"), goal="cut", rate_kg_week=0.5)
    assert propuesta.expenditure == 2600
    assert propuesta.kcal == 2050


def test_el_suelo_recorta_las_kcal_pero_no_el_gasto():
    propuesta = proponer(Gasto(kcal=1800, source="formula"), goal="cut", rate_kg_week=2)
    assert propuesta.expenditure == 1800


def test_sin_gasto_la_propuesta_no_trae_gasto():
    propuesta = proponer(Gasto(kcal=None, missing=["altura"]), goal="cut", rate_kg_week=0.5)
    assert propuesta.expenditure is None
