"""The muscle-group classifier: guess a group from an exercise name."""

import pytest

from app.muscles import (
    BICEPS,
    CORE,
    ESPALDA,
    HOMBRO,
    MUSCLE_GROUPS,
    PECHO,
    PIERNA,
    TRICEPS,
    classify,
)


@pytest.mark.parametrize(
    "name,expected",
    [
        ("Press banca", PECHO),
        ("press de banca inclinado", PECHO),
        ("Bench Press", PECHO),
        ("Aperturas con mancuernas", PECHO),
        ("Dominadas", ESPALDA),
        ("Remo con barra", ESPALDA),
        ("Jalón al pecho", ESPALDA),
        ("Peso muerto", ESPALDA),
        ("Sentadilla", PIERNA),
        ("Squat", PIERNA),
        ("Prensa de pierna", PIERNA),
        ("Peso muerto rumano", PIERNA),  # RDL is legs, not back
        ("Curl femoral", PIERNA),  # a leg curl, not a biceps curl
        ("Press militar", HOMBRO),
        ("Elevaciones laterales", HOMBRO),
        ("Curl de bíceps", BICEPS),
        ("Curl martillo", BICEPS),
        ("Extensión de tríceps en polea", TRICEPS),
        ("Press francés", TRICEPS),
        ("Plancha abdominal", CORE),
        ("Crunch", CORE),
    ],
)
def test_classifies_common_lifts(name, expected):
    assert classify(name) == expected


def test_returns_none_for_unknown():
    assert classify("Malabares") is None
    assert classify("") is None


def test_every_result_is_a_canonical_group():
    for name in ["Press banca", "Sentadilla", "Curl martillo"]:
        assert classify(name) in MUSCLE_GROUPS
