import pytest

from app.units import from_kg, to_kg


def test_kilos_pass_through_untouched():
    assert to_kg(60.0, "kg") == 60.0
    assert from_kg(60.0, "kg") == 60.0


def test_pounds_convert_to_kilos():
    assert to_kg(135.0, "lb") == pytest.approx(61.235, abs=0.001)


def test_conversion_round_trips_exactly():
    # A relabel must not erode the number the user typed, however many times
    # they flip the toggle.
    assert from_kg(to_kg(135.0, "lb"), "lb") == pytest.approx(135.0)


def test_missing_weight_stays_missing():
    # Cardio sets carry no weight at all.
    assert to_kg(None, "kg") is None
    assert from_kg(None, "lb") is None


def test_bodyweight_zero_is_preserved():
    # 0 is a real logged value, not an absence.
    assert to_kg(0.0, "lb") == 0.0
