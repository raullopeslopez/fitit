"""Weight units: what you typed, and what everything is compared in.

Every cross-set comparison — estimated 1RM, session volume, records — has to
happen in one unit, or a 135 lb set outranks a 100 kg one. So a set keeps both:
the number and unit as entered (provenance, and what a unit correction rewrites)
plus a canonical kilo value that all the arithmetic reads.

Nothing here rounds. The stored kilos are the full float so a set can be
relabelled kg → lb → kg without eroding the number the user typed; rounding is
a display decision and belongs at the edge.
"""

LB_TO_KG = 0.45359237


def to_kg(weight: float | None, unit: str | None) -> float | None:
    """The canonical kilo value of a weight entered in `unit`."""
    if weight is None:
        return None
    return weight * LB_TO_KG if unit == "lb" else float(weight)


def from_kg(kg: float | None, unit: str | None) -> float | None:
    """A canonical kilo value expressed back in `unit`."""
    if kg is None:
        return None
    return kg / LB_TO_KG if unit == "lb" else float(kg)
