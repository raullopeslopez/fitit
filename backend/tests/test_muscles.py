"""The muscle-group classifier: guess a group from an exercise name."""

import pytest

from app.muscles import (
    BICEPS,
    CORE,
    CUADRICEPS,
    ESPALDA,
    FEMORAL,
    GEMELO,
    HOMBRO,
    MUSCLE_GROUPS,
    PECHO,
    TRICEPS,
    classify,
    group_for,
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


@pytest.mark.parametrize(
    "name,expected",
    [
        # Knee-dominant work is quads.
        ("Sentadilla", CUADRICEPS),
        ("Squat", CUADRICEPS),
        ("Prensa de pierna", CUADRICEPS),
        ("Extensión de pierna", CUADRICEPS),
        ("Zancadas con mancuernas", CUADRICEPS),
        ("Hack squat", CUADRICEPS),
        ("Búlgara", CUADRICEPS),
        # Hip-dominant and knee-flexion work is the posterior chain.
        ("Peso muerto rumano", FEMORAL),  # an RDL is a hinge, not a back lift
        ("RDL", FEMORAL),
        ("Curl femoral", FEMORAL),  # a leg curl, not a biceps curl
        ("Curl de pierna tumbado", FEMORAL),
        ("Hip thrust", FEMORAL),
        ("Patada de glúteo", FEMORAL),
        ("Buenos días", FEMORAL),
        # Calves are their own group: many sets, one small muscle. Folding them
        # in with squats is exactly what made a "Pierna" total meaningless.
        ("Elevación de talones", GEMELO),
        ("Gemelo en máquina", GEMELO),
        ("Standing calf raise", GEMELO),
        ("Sóleo sentado", GEMELO),
    ],
)
def test_splits_the_leg_groups(name, expected):
    assert classify(name) == expected


def test_plain_deadlift_is_still_back():
    """Only the *rumano* qualifier moves a deadlift to the posterior chain."""
    assert classify("Peso muerto") == ESPALDA
    assert classify("Deadlift") == ESPALDA


def test_leg_raises_are_core_not_legs():
    """'Elevación de piernas' is an ab move that happens to say 'piernas'."""
    assert classify("Elevación de piernas") == CORE
    assert classify("Elevaciones de piernas colgado") == CORE


def test_returns_none_for_unknown():
    assert classify("Malabares") is None
    assert classify("") is None


def test_every_result_is_a_canonical_group():
    for name in ["Press banca", "Sentadilla", "Curl femoral", "Gemelo", "Curl martillo"]:
        assert classify(name) in MUSCLE_GROUPS


def test_canonical_order_keeps_the_leg_groups_together():
    """The chip row and the legend render in this sequence, so it is the palette's
    order too — and the three leg groups sit adjacent, which is what the
    colorblind validation was run against."""
    assert MUSCLE_GROUPS == [
        "Pecho",
        "Espalda",
        "Cuádriceps",
        "Femoral",
        "Gemelo",
        "Hombro",
        "Bíceps",
        "Tríceps",
        "Core",
    ]


def test_pierna_is_no_longer_a_group():
    assert "Pierna" not in MUSCLE_GROUPS


def test_cardio_is_never_auto_classified():
    # "Remo" reads as a back row to the keyword classifier, but a cardio
    # rowing machine isn't training a muscle group the way the strength move
    # named "Remo" is.
    assert classify("Remo") == ESPALDA
    assert group_for("Remo", "cardio") is None


def test_strength_still_gets_the_name_based_guess():
    assert group_for("Press banca", "strength") == PECHO
