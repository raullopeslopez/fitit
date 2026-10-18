"""El objetivo del día, repartido entre las cuatro comidas.

Cuadrar sólo el día deja que un desayuno se lleve mil kcal si así sale la
cuenta. Cada comida tiene su parte, sacada de la estructura acordada: proteína
en todas, el hidrato más en las principales.
"""

import pytest

from app.nutrition import REPARTO_POR_HUECO, repartir_por_hueco

HUECOS = ("desayuno", "comida", "snack", "cena")
DIA = {"kcal": 2569.0, "protein": 202.0, "fat": 71.0, "carbs": 280.0}


def test_cada_parte_suma_cien():
    for campo in ("kcal", "protein", "fat", "carbs"):
        assert sum(REPARTO_POR_HUECO[h][campo] for h in HUECOS) == pytest.approx(1.0)


def test_el_dia_se_reparte_entre_las_cuatro():
    partes = repartir_por_hueco(DIA, HUECOS)
    assert partes["desayuno"]["protein"] == pytest.approx(44.4, abs=0.1)
    assert partes["comida"]["carbs"] == pytest.approx(89.6, abs=0.1)
    assert partes["snack"]["carbs"] == pytest.approx(39.2, abs=0.1)
    assert partes["cena"]["fat"] == pytest.approx(22.0, abs=0.1)


def test_las_partes_suman_el_dia():
    partes = repartir_por_hueco(DIA, HUECOS)
    for campo, total in DIA.items():
        assert sum(p[campo] for p in partes.values()) == pytest.approx(total)


def test_un_macro_sin_decir_no_se_reparte_como_cero():
    """`None` es «no lo he dicho»: sin clave, no dirige el ajuste de nadie."""
    partes = repartir_por_hueco({"kcal": 2000.0, "protein": 150.0}, HUECOS)
    assert all("carbs" not in p and "fat" not in p for p in partes.values())


def test_con_menos_comidas_las_que_hay_se_quedan_el_dia():
    partes = repartir_por_hueco(DIA, ("desayuno", "comida", "cena"))
    assert set(partes) == {"desayuno", "comida", "cena"}
    assert sum(p["kcal"] for p in partes.values()) == pytest.approx(DIA["kcal"])
