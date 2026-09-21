"""La tendencia, sin base de datos de por medio.

Los escenarios de `body_weight.feature` fijan lo que se ve desde fuera; esto
fija los bordes, que es donde una media se estropea sin que nadie lo note.
"""

from datetime import date, timedelta

from app.weight import MAX_PESADAS, tendencia


def d(day: int) -> date:
    return date(2026, 9, day)


def test_sin_pesadas_no_hay_nada_que_promediar():
    t = tendencia([])
    assert t.kg is None
    assert t.pesadas == 0
    assert t.hasta is None


def test_una_pesada_no_es_una_tendencia():
    """Y la fecha sí se devuelve: la pantalla puede decir «una sola pesada»."""
    t = tendencia([(d(1), 78.4)])
    assert t.kg is None
    assert t.pesadas == 1
    assert t.hasta == d(1)


def test_la_media_de_las_recientes():
    t = tendencia([(d(1), 78.2), (d(2), 79.0), (d(3), 78.6)])
    assert t.kg == 78.6
    assert t.pesadas == 3


def test_el_orden_de_entrada_da_igual():
    desordenadas = [(d(3), 78.6), (d(1), 78.2), (d(2), 79.0)]
    assert tendencia(desordenadas).kg == tendencia(sorted(desordenadas)).kg


def test_se_queda_con_las_ultimas_y_no_con_todas():
    pesadas = [(d(i), 70.0) for i in range(1, 6)] + [(d(i), 80.0) for i in range(6, 12)]
    t = tendencia(pesadas)
    assert t.pesadas == MAX_PESADAS
    # Las seis de 80 son las recientes: ninguna de las de 70 entra.
    assert t.kg == 80.0


def test_lo_viejo_no_arrastra():
    """Una pesada de hace meses habla de otro cuerpo."""
    t = tendencia([(date(2026, 1, 1), 70.0), (d(1), 79.0), (d(2), 79.2)])
    assert t.kg == 79.1
    assert t.pesadas == 2


def test_el_borde_de_la_ventana_entra():
    ventana = timedelta(days=30)
    t = tendencia([(d(30) - ventana, 70.0), (d(30), 80.0)], ventana=ventana)
    assert t.pesadas == 2
    assert t.kg == 75.0


def test_justo_fuera_de_la_ventana_no_entra():
    ventana = timedelta(days=30)
    t = tendencia([(d(30) - ventana - timedelta(days=1), 70.0), (d(30), 80.0)], ventana=ventana)
    assert t.pesadas == 1
    assert t.kg is None


def test_la_media_se_redondea_a_un_decimal():
    """Un peso corporal con tres decimales finge una precisión que la báscula
    no tiene."""
    assert tendencia([(d(1), 78.0), (d(2), 78.1), (d(3), 78.3)]).kg == 78.1
