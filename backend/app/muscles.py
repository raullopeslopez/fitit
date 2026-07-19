"""Muscle-group taxonomy + a keyword classifier.

Exercises carry an optional ``muscle_group``. Rather than make the user tag every
lift by hand, we guess the group from the name (Spanish and common English terms),
accent- and case-insensitively. A stored value always wins — this is only the
auto-assignment/fallback, and the guess is editable via the API.

The set is deliberately small (7 groups): the whole point downstream is a legible
per-muscle colour, and a colour per individual muscle would be an unreadable
rainbow.
"""

import unicodedata

PECHO = "Pecho"
ESPALDA = "Espalda"
PIERNA = "Pierna"
HOMBRO = "Hombro"
BICEPS = "Bíceps"
TRICEPS = "Tríceps"
CORE = "Core"

# Canonical order — the UI renders chips/legend in this sequence.
MUSCLE_GROUPS: list[str] = [PECHO, ESPALDA, PIERNA, HOMBRO, BICEPS, TRICEPS, CORE]

# Keyword → group, checked in order; the first substring hit wins. Order matters
# only where names overlap ("curl femoral" is a leg curl, not a biceps curl; a
# Romanian deadlift is legs, a plain deadlift is back), so the more specific group
# is listed first. Keywords are written without accents; names are stripped to
# match. Keep bare ambiguous words ("press", "curl") OUT — always qualify them.
_RULES: list[tuple[str, tuple[str, ...]]] = [
    (
        PIERNA,
        (
            "sentadilla", "squat", "prensa", "leg press", "zancada", "lunge",
            "bulgara", "peso muerto rumano", "rumano", "rdl", "hip thrust",
            "empuje de cadera", "gluteo", "cuadriceps", "femoral", "isquios",
            "gemelo", "pantorrilla", "calf", "extension de pierna", "curl de pierna",
            "aductor", "abductor", "pierna", "leg", "hack", "jaca",
        ),
    ),
    (
        ESPALDA,
        (
            "dominada", "pull up", "pull-up", "pullup", "jalon", "pulldown",
            "remo", "row", "pullover", "peso muerto", "deadlift", "encogimiento",
            "shrug", "trapecio", "espalda", "back", "dorsal", "lat ",
        ),
    ),
    (
        PECHO,
        (
            "press banca", "banca", "bench", "press inclinado", "press declinado",
            "incline press", "press de pecho", "pecho", "chest", "apertura",
            "apertura", "fly", "pec deck", "contractora", "peck deck", "fondos",
            "dips",
        ),
    ),
    (
        HOMBRO,
        (
            "press militar", "militar", "overhead press", "ohp", "hombro",
            "shoulder", "deltoide", "elevacion lateral", "elevaciones laterales",
            "lateral raise", "elevacion frontal", "frontal raise", "pajaro",
            "arnold", "face pull", "remo al menton", "upright row", "posterior",
        ),
    ),
    (
        TRICEPS,
        (
            "triceps", "extension de triceps", "patada", "press frances", "frances",
            "jalon de triceps", "polea triceps", "close grip", "press cerrado",
            "rompecraneos", "skullcrusher", "copa", "kickback",
        ),
    ),
    (
        BICEPS,
        (
            "biceps", "curl", "martillo", "hammer", "predicador", "concentrado",
            "araña", "arana", "spider",
        ),
    ),
    (
        CORE,
        (
            "core", "abdomen", "abdominal", "plancha", "plank", "crunch",
            "oblicuo", "rueda", "ab wheel", "russian twist", "hollow",
            "elevacion de piernas", "elevaciones de piernas", "sit up", "sit-up",
        ),
    ),
]


def _fold(text: str) -> str:
    """Lowercase and strip accents so 'Bíceps' and 'biceps' match the same keys."""
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def classify(name: str) -> str | None:
    """Best-guess muscle group for an exercise name, or ``None`` if unrecognized."""
    folded = _fold(name)
    for group, keywords in _RULES:
        if any(_fold(k) in folded for k in keywords):
            return group
    return None
