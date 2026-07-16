"""Unit tests for request-schema validation.

Fast and isolated: they exercise the Pydantic models directly, no app, no DB,
no HTTP. This is the unit tier; the Gherkin specs in tests/features are the
integration tier.
"""

import pytest
from pydantic import ValidationError

from app.schemas import ExerciseIn, SetIn, WorkoutIn


def test_valid_set_parses():
    s = SetIn(exercise_name="Bench Press", reps=8, weight=60, unit="kg")
    assert s.reps == 8
    assert s.weight == 60
    assert s.unit == "kg"


def test_set_unit_defaults_to_kg():
    assert SetIn(exercise_name="Squat", reps=5, weight=100).unit == "kg"


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


def test_unit_must_be_kg_or_lb():
    with pytest.raises(ValidationError):
        SetIn(exercise_name="Row", reps=8, weight=40, unit="stone")


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
