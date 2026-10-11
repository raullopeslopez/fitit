"""El ajuste de gramos: cerrar el día contra su objetivo moviendo lo que se deja mover.

Es el paso 3 del generador (§39 del brainstorming). Vive en `nutrition.py` y no
en el planificador porque es aritmética de nutrientes, y de esa sólo puede haber
una en la app.
"""

import pytest

from app.nutrition import Ajustable, ajustar_gramos

# Por 100 g. Cifras redondas a propósito: lo que se comprueba es el ajuste, no
# la tabla de CIQUAL.
ARROZ = {"kcal": 350.0, "protein": 7.0, "fat": 1.0, "carbs": 78.0, "fiber": 1.0}
ACEITE = {"kcal": 900.0, "protein": 0.0, "fat": 100.0, "carbs": 0.0, "fiber": 0.0}
POLLO = {"kcal": 165.0, "protein": 31.0, "fat": 3.6, "carbs": 0.0, "fiber": 0.0}


def _ajustable(por_100g, gramos=100.0, minimo=0.0, maximo=1000.0):
    return Ajustable(por_100g=por_100g, gramos=gramos, minimo=minimo, maximo=maximo)


def test_un_ingrediente_cierra_el_hueco():
    """Faltan 350 kcal y el arroz trae 350 por 100 g: 100 g."""
    gramos, totales = ajustar_gramos(
        fijo={"kcal": 1650.0, "protein": 120.0, "fat": 50.0, "carbs": 100.0, "fiber": 10.0},
        ajustables=[_ajustable(ARROZ, gramos=10.0)],
        objetivo={"kcal": 2000.0},
    )
    assert gramos[0] == pytest.approx(100.0, abs=1.0)
    assert totales["kcal"] == pytest.approx(2000.0, abs=5.0)


def test_se_recorta_a_la_banda():
    """Cerrar el hueco pediría 900 g de arroz; el máximo son 300 y manda el máximo.

    Un plan que dijera «come 900 g de arroz» no es un plan: es el resultado de
    una ecuación al que nadie le puso un límite.
    """
    gramos, totales = ajustar_gramos(
        fijo={"kcal": 800.0},
        ajustables=[_ajustable(ARROZ, gramos=100.0, minimo=50.0, maximo=300.0)],
        objetivo={"kcal": 3950.0},
    )
    assert gramos[0] == 300.0
    assert totales["kcal"] < 3950.0


def test_un_macro_sin_objetivo_no_tira():
    """`None` en el objetivo es «no lo he dicho», no «que salga cero».

    Si la grasa sin objetivo arrastrase hacia cero, pedir sólo kcal acabaría
    recortando el aceite hasta el mínimo sin que nadie lo haya pedido.
    """
    gramos, _ = ajustar_gramos(
        fijo={"kcal": 1100.0, "fat": 40.0},
        ajustables=[_ajustable(ACEITE, gramos=20.0, minimo=0.0, maximo=60.0)],
        objetivo={"kcal": 1280.0, "fat": None},
    )
    assert gramos[0] == pytest.approx(20.0, abs=1.0)


def test_dos_ingredientes_cierran_dos_huecos():
    """El arroz carga con los hidratos y el aceite con la grasa, a la vez."""
    gramos, totales = ajustar_gramos(
        fijo={"kcal": 500.0, "protein": 100.0, "fat": 10.0, "carbs": 20.0, "fiber": 5.0},
        ajustables=[
            _ajustable(ARROZ, gramos=50.0, minimo=0.0, maximo=400.0),
            _ajustable(ACEITE, gramos=10.0, minimo=0.0, maximo=60.0),
        ],
        objetivo={"carbs": 176.0, "fat": 40.0},
    )
    assert totales["carbs"] == pytest.approx(176.0, abs=6.0)
    assert totales["fat"] == pytest.approx(40.0, abs=3.0)
    assert gramos[0] > gramos[1]


def test_no_se_ajusta_sobre_lo_que_nadie_midio():
    """Un ingrediente sin el macro que se persigue no es ajustable: es un hueco.

    Moverle los gramos para cerrar un objetivo de grasa sería inventarse la
    grasa que nadie midió, que es justo lo que `NULL` impide en el resto de
    la app.
    """
    sin_grasa = dict(ARROZ, fat=None)
    with pytest.raises(ValueError, match="midió"):
        ajustar_gramos(
            fijo={"fat": 10.0},
            ajustables=[_ajustable(sin_grasa)],
            objetivo={"fat": 60.0},
        )


def test_lo_fijo_desconocido_no_dirige():
    """Si lo fijo del día no sabe su grasa, el total tampoco, y el ajuste no persigue.

    Perseguir un objetivo de grasa contando como 0 la del guiso que no la
    midió pondría aceite de más exactamente en la cantidad que falta saber.
    """
    gramos, totales = ajustar_gramos(
        fijo={"kcal": 1000.0, "fat": None},
        ajustables=[_ajustable(ACEITE, gramos=15.0, minimo=0.0, maximo=60.0)],
        objetivo={"kcal": 1135.0, "fat": 70.0},
    )
    assert gramos[0] == pytest.approx(15.0, abs=1.0)
    assert totales["fat"] is None


def test_sin_ajustables_devuelve_lo_fijo():
    gramos, totales = ajustar_gramos(
        fijo={"kcal": 1800.0, "protein": 140.0},
        ajustables=[],
        objetivo={"kcal": 2200.0},
    )
    assert gramos == ()
    assert totales["kcal"] == 1800.0


def test_es_determinista():
    """El mismo día ajustado dos veces da los mismos gramos.

    Es lo que permite que el plan sea el mismo el martes que el jueves (§22).
    """
    argumentos = dict(
        fijo={"kcal": 900.0, "protein": 60.0, "fat": 20.0, "carbs": 40.0, "fiber": 4.0},
        ajustables=[
            _ajustable(ARROZ, gramos=80.0, minimo=40.0, maximo=300.0),
            _ajustable(POLLO, gramos=120.0, minimo=80.0, maximo=250.0),
            _ajustable(ACEITE, gramos=10.0, minimo=0.0, maximo=40.0),
        ],
        objetivo={"kcal": 2300.0, "protein": 165.0, "fat": 70.0, "carbs": 240.0},
    )
    assert ajustar_gramos(**argumentos)[0] == ajustar_gramos(**argumentos)[0]


def test_los_gramos_son_enteros():
    """Un plan se lee con una báscula de cocina, no con cuatro decimales."""
    gramos, _ = ajustar_gramos(
        fijo={"kcal": 1000.0},
        ajustables=[_ajustable(ARROZ, gramos=37.0, minimo=0.0, maximo=400.0)],
        objetivo={"kcal": 2137.0},
    )
    assert gramos[0] == int(gramos[0])


def test_las_kcal_mandan_cuando_los_macros_no_caben():
    """Arroz y aceite no dan 100 g de proteína en 1.000 kcal. Perseguir la
    proteína con el mismo peso que las kcal se pasaba de kcal para acercarse a
    una cifra imposible; con las kcal primero, el día da sus kcal y la proteína
    se queda lo más cerca que permiten esos dos ingredientes."""
    arroz = _ajustable({"kcal": 350, "protein": 7, "fat": 1, "carbs": 77}, gramos=100)
    aceite = _ajustable({"kcal": 900, "protein": 0, "fat": 100, "carbs": 0}, gramos=10)
    _, totales = ajustar_gramos(
        {}, [arroz, aceite], {"kcal": 1000, "protein": 100, "fat": 20, "carbs": 150}
    )
    assert abs(totales["kcal"] - 1000) <= 20
