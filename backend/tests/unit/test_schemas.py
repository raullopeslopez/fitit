"""Unit tests for request-schema validation.

Fast and isolated: they exercise the Pydantic models directly, no app, no DB,
no HTTP. This is the unit tier; the Gherkin specs in tests/features are the
integration tier.
"""

import pytest
from pydantic import ValidationError

from app.schemas import ExerciseIn, SetIn, WorkoutIn


def test_valid_set_parses():
    s = SetIn(exercise_name="Bench Press", reps=8, weight=60)
    assert s.reps == 8
    assert s.weight == 60


def test_exercise_name_is_trimmed():
    assert SetIn(exercise_name="  Deadlift  ", reps=3, weight=140).exercise_name == "Deadlift"


@pytest.mark.parametrize("reps", [0, -1])
def test_reps_must_be_at_least_one(reps):
    with pytest.raises(ValidationError):
        SetIn(exercise_name="Row", reps=reps, weight=40)


def test_reps_upper_bound():
    with pytest.raises(ValidationError):
        SetIn(exercise_name="Row", reps=10_000, weight=40)


def test_weight_cannot_be_negative():
    with pytest.raises(ValidationError):
        SetIn(exercise_name="Row", reps=8, weight=-5)


def test_weight_zero_is_allowed_for_bodyweight():
    assert SetIn(exercise_name="Pull Up", reps=10, weight=0).weight == 0


def test_weight_upper_bound():
    with pytest.raises(ValidationError):
        SetIn(exercise_name="Row", reps=8, weight=5000)


# Weights are kilos with no unit field to get wrong, so an extra `unit` key is
# just noise a client shouldn't be able to smuggle meaning through.
def test_a_unit_field_is_not_accepted():
    s = SetIn(exercise_name="Row", reps=8, weight=40, unit="lb")
    assert not hasattr(s, "unit")


@pytest.mark.parametrize("name", ["", "   "])
def test_blank_exercise_name_rejected(name):
    with pytest.raises(ValidationError):
        SetIn(exercise_name=name, reps=8, weight=40)


def test_exercise_in_requires_name():
    with pytest.raises(ValidationError):
        ExerciseIn(name="")


def test_workout_name_optional():
    assert WorkoutIn().name is None
    assert WorkoutIn(name="Push day").name == "Push day"


def test_la_busqueda_de_alimentos_no_pide_los_micronutrientes():
    """Una fila de CIQUAL guarda 1,7 KB de vitaminas y ácidos grasos, y la lista
    de resultados no enseña ninguno: `FoodOut` no los lleva. Sin diferirlos, una
    búsqueda de una sola letra (2.822 coincidencias sobre el catálogo entero)
    arrastra 4,7 MB desde Postgres para pintar treinta nombres.

    Comprobado sobre el SQL compilado y no sobre la respuesta HTTP: el JSON sale
    idéntico con la optimización y sin ella, así que un test de endpoint aquí no
    podría fallar nunca.
    """
    from app.routers.foods import search_stmt

    sql = str(search_stmt(user_id=1, needle="arroz").compile())
    assert "foods.name_folded" in sql, "el SELECT tiene que seguir trayendo lo que sí se enseña"
    assert "nutrients_json" not in sql
