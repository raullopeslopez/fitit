"""La derivación del objetivo, sin base de datos de por medio.

Los escenarios fijan lo que se ve desde fuera; esto fija los bordes, que es
donde una estimación se convierte en una cifra que nadie puede desmentir.
"""

from datetime import date, timedelta

import pytest

from app.targets import (
    KCAL_PER_KG,
    MIN_KCAL,
    Gasto,
    factor_actividad,
    gasto_medido,
    gasto_por_formula,
    mifflin,
    plan,
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


# --- El plan con peso meta -----------------------------------------------------

HOY = date(2026, 10, 2)


def _plan(**cambios):
    datos = dict(
        goal="cut",
        rate_kg_week=0.5,
        goal_weight_kg=97.5,
        start_kg=102.5,
        started_on=HOY - timedelta(days=15),
        current_kg=101.0,
        today=HOY,
    )
    return plan(**{**datos, **cambios})


def test_un_plan_sabe_en_que_semana_vas_y_cuantas_son():
    p = _plan()
    assert (p.week, p.weeks) == (3, 10)
    assert p.remaining_kg == 3.5
    assert p.eta == HOY + timedelta(weeks=7)
    assert p.reached is False


def test_la_semana_no_pasa_del_total_aunque_no_llegues():
    """Ir tarde es ir en la última semana, no en la «semana 29 de 10»."""
    p = _plan(started_on=HOY - timedelta(days=200))
    assert p.week == p.weeks == 10


def test_el_primer_dia_es_la_semana_uno():
    assert _plan(started_on=HOY).week == 1


def test_el_dia_siete_ya_es_la_semana_dos():
    assert _plan(started_on=HOY - timedelta(days=7)).week == 2


def test_llegar_deja_cero_kilos_y_ninguna_fecha():
    p = _plan(current_kg=97.0)
    assert p.reached is True
    assert p.remaining_kg == 0
    assert p.eta is None


def test_en_subir_se_llega_por_arriba():
    p = plan(
        goal="gain",
        rate_kg_week=0.25,
        goal_weight_kg=80.0,
        start_kg=78.0,
        started_on=HOY - timedelta(days=30),
        current_kg=80.5,
        today=HOY,
    )
    assert p.reached is True
    assert p.weeks == 8


def test_los_kilos_que_faltan_se_redondean_a_una_decima():
    assert _plan(current_kg=100.04).remaining_kg == 2.5


def test_una_fecha_que_cae_justa_no_se_pasa_una_semana_por_flotantes():
    # 0,3 / 0,1 no da 3 en coma flotante; sin redondear antes, ceil() daría una semana de más.
    p = _plan(rate_kg_week=0.1, current_kg=97.8)
    assert p.eta == HOY + timedelta(weeks=3)


@pytest.mark.parametrize("goal", ["maintain", None])
def test_sin_objetivo_de_cambiar_no_hay_plan(goal):
    assert _plan(goal=goal) is None


@pytest.mark.parametrize(
    "campo", ["rate_kg_week", "goal_weight_kg", "start_kg", "started_on", "current_kg"]
)
def test_si_falta_un_dato_no_hay_plan(campo):
    assert _plan(**{campo: None}) is None


def test_sin_ritmo_no_hay_plan_porque_no_hay_cuantas_semanas():
    assert _plan(rate_kg_week=0) is None


def test_una_meta_en_el_sentido_contrario_no_es_un_plan():
    """Bajar hacia un peso mayor que el de partida es un perfil a medio
    teclear, no un plan: mejor ninguno que «semana 1 de 6» hacia ningún sitio."""
    assert _plan(goal_weight_kg=110.0) is None
