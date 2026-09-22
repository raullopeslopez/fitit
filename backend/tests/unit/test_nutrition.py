"""The one place nutritional arithmetic happens."""

from datetime import UTC, date, datetime, timedelta, timezone

import pytest

from app.nutrition import (
    NUTRIENTS,
    calcular_nutrientes,
    escalar_nutrientes,
    food_log_date,
    restante,
    sumar_nutrientes,
)


class FakeFood:
    def __init__(self, **per_100g):
        for field in NUTRIENTS:
            setattr(self, f"{field}_100g", per_100g.get(field))
        self.nutrients_json = per_100g.get("nutrients_json")


def test_scales_by_grams():
    result = calcular_nutrientes(FakeFood(kcal=130, protein=2.7), 200)
    assert result["kcal"] == 260
    assert result["protein"] == 5.4


def test_unknown_stays_unknown():
    result = calcular_nutrientes(FakeFood(kcal=130), 200)
    assert result["fiber"] is None, "a nutrient nobody recorded is not zero grams of it"


def test_zero_is_not_unknown():
    result = calcular_nutrientes(FakeFood(kcal=0, fat=0), 200)
    assert result["kcal"] == 0
    assert result["fat"] == 0


def test_micronutrients_scale_too():
    result = calcular_nutrientes(FakeFood(kcal=100, nutrients_json='{"sodium_mg": 10}'), 250)
    assert result["nutrients"]["sodium_mg"] == 25


def test_micronutrient_null_survives_the_round_trip():
    result = calcular_nutrientes(FakeFood(nutrients_json='{"iron_mg": null}'), 250)
    assert result["nutrients"]["iron_mg"] is None


def test_grams_must_be_positive():
    with pytest.raises(ValueError):
        calcular_nutrientes(FakeFood(kcal=100), 0)


def test_sum_treats_unknown_as_unknown_not_zero():
    totals, unknown = sumar_nutrientes([{"kcal": 100, "fiber": None}, {"kcal": 50, "fiber": 2}])
    assert totals["kcal"] == 150
    # One entry knew its fibre and one didn't: 2 g would be a lie by omission.
    assert totals["fiber"] is None
    assert unknown["fiber"] == 1
    assert unknown["kcal"] == 0


def test_sum_of_nothing_is_unknown_not_zero():
    totals, unknown = sumar_nutrientes([])
    assert totals["kcal"] is None
    assert unknown["kcal"] == 0


def test_rescaling_an_entry_does_not_consult_the_food():
    entry = {"kcal": 250.0, "protein": 8.0, "fiber": None}
    rescaled = escalar_nutrientes(entry, old_grams=100, new_grams=150)
    assert rescaled["kcal"] == 375
    assert rescaled["protein"] == 12
    assert rescaled["fiber"] is None


# The food day runs 04:00 → 04:00 local, so a supper at 01:30 belongs to the day
# you have been awake for, not to the calendar's.
@pytest.mark.parametrize(
    ("moment", "expected"),
    [
        (datetime(2026, 9, 1, 1, 30, tzinfo=UTC), date(2026, 8, 31)),
        (datetime(2026, 9, 1, 3, 59, tzinfo=UTC), date(2026, 8, 31)),
        (datetime(2026, 9, 1, 4, 0, tzinfo=UTC), date(2026, 9, 1)),
        (datetime(2026, 9, 1, 23, 59, tzinfo=UTC), date(2026, 9, 1)),
    ],
)
def test_food_day_cut_off(moment, expected):
    assert food_log_date(moment) == expected


def test_the_cut_off_reads_the_offset_the_client_sent():
    madrid = datetime(2026, 9, 1, 1, 30, tzinfo=timezone(timedelta(hours=2)))
    # 01:30 in Madrid is 23:30 UTC the day before; either way the food day is
    # the 31st, and it is the local clock that decides.
    assert food_log_date(madrid) == date(2026, 8, 31)


def test_a_naive_moment_is_read_as_utc():
    assert food_log_date(datetime(2026, 9, 1, 2, 0)) == date(2026, 8, 31)


def test_no_target_no_remaining():
    assert restante(None, 1200) is None
    assert restante(None, None) is None


def test_remaining_is_target_minus_eaten():
    assert restante(2800, 1811) == 989


def test_an_empty_or_unknown_total_counts_as_zero_eaten():
    # Distinto de `sumar_nutrientes`, a propósito: aquí la cifra tiene que
    # responder "cuánto me queda", y la única respuesta con sentido para un
    # día que todavía no cuadra es el objetivo entero.
    assert restante(2800, None) == 2800


def test_overeating_goes_negative():
    assert restante(1800, 2100) == -300


# --- Platos -------------------------------------------------------------------
class _Food:
    """Lo mínimo que `calcular_nutrientes` mira de un alimento."""

    def __init__(self, **per100):
        for field in ("kcal", "protein", "fat", "carbs", "fiber"):
            setattr(self, f"{field}_100g", per100.get(field))
        self.nutrients_json = None


def test_macros_de_plato_suma_los_ingredientes():
    from app.nutrition import macros_de_plato

    totales, unknown = macros_de_plato(
        [(_Food(kcal=116, protein=9), 400), (_Food(kcal=455, protein=24), 100)]
    )
    assert totales["kcal"] == 919
    assert totales["protein"] == 60
    assert unknown["kcal"] == 0


def test_un_ingrediente_sin_medir_deja_el_plato_sin_medir():
    """La regla del `NULL`, sobre el objeto nuevo: un plato que declarase la
    fibra contando como cero la que nadie midió mentiría justo en eso."""
    from app.nutrition import macros_de_plato

    totales, unknown = macros_de_plato([(_Food(kcal=116, fiber=8), 100), (_Food(kcal=90), 100)])
    assert totales["kcal"] == 206
    assert totales["fiber"] is None
    assert unknown["fiber"] == 1


def test_por_racion_divide_y_conserva_lo_desconocido():
    from app.nutrition import macros_por_racion

    per = macros_por_racion({"kcal": 919, "protein": 60, "fat": None, "carbs": 0, "fiber": None}, 4)
    assert per["kcal"] == 229.75
    assert per["protein"] == 15
    assert per["fat"] is None
    assert per["fiber"] is None


def test_por_racion_se_niega_a_dividir_entre_cero():
    import pytest as _pytest

    from app.nutrition import macros_por_racion

    with _pytest.raises(ValueError):
        macros_por_racion({"kcal": 100}, 0)
