"""Muscle-group taxonomy + a keyword classifier.

Exercises carry an optional ``muscle_group``. Rather than make the user tag every
lift by hand, we guess the group from the name (Spanish and common English terms),
accent- and case-insensitively. A stored value always wins — this is only the
auto-assignment/fallback, and the guess is editable via the API.

The set is deliberately small (9 groups): the whole point downstream is a legible
per-muscle colour, and a colour per individual muscle would be an unreadable
rainbow.

It was 7 until the weekly-set reference arrived. A single "Pierna" bucket held
squats, leg curls and calf raises at once, so "Pierna: 20 series" could be twenty
sets of squats and nothing else — a number you cannot hold against a per-muscle
reference and learn anything from. The three that a leg day actually splits into
are separated; glutes ride with the hamstrings under ``FEMORAL`` because the
hinges that train one train the other.
"""

import unicodedata

PECHO = "Pecho"
ESPALDA = "Espalda"
CUADRICEPS = "Cuádriceps"
FEMORAL = "Femoral"
GEMELO = "Gemelo"
HOMBRO = "Hombro"
BICEPS = "Bíceps"
TRICEPS = "Tríceps"
CORE = "Core"

# Canonical order — the UI renders chips/legend in this sequence, and it is the
# order the categorical palette was validated in (adjacent pairs), so the three
# leg groups have to stay together and in this position.
MUSCLE_GROUPS: list[str] = [
    PECHO,
    ESPALDA,
    CUADRICEPS,
    FEMORAL,
    GEMELO,
    HOMBRO,
    BICEPS,
    TRICEPS,
    CORE,
]

# Keyword → group, checked in order; the first substring hit wins. Order matters
# only where names overlap ("curl femoral" is a leg curl, not a biceps curl; a
# Romanian deadlift is legs, a plain deadlift is back), so the more specific group
# is listed first. Keywords are written without accents; names are stripped to
# match. Keep bare ambiguous words ("press", "curl") OUT — always qualify them.
_RULES: list[tuple[str, tuple[str, ...]]] = [
    (
        # First, or the leg groups below would swallow it: "elevación de piernas"
        # is an ab move that happens to contain "pierna". Leg extensions say
        # "extensión", never "elevación", so nothing legitimate is caught here.
        CORE,
        ("elevacion de pierna", "elevaciones de pierna", "elevacion de las pierna"),
    ),
    (
        # Calves before the rest of the leg: "gemelo en prensa" is a calf raise.
        GEMELO,
        (
            "gemelo", "pantorrilla", "calf", "soleo", "elevacion de talones",
            "elevaciones de talones", "talones", "ponerse de puntillas",
        ),
    ),
    (
        # Hip hinge and knee flexion. Glutes live here: the RDLs and hip thrusts
        # that train them train the hamstrings in the same set, and a separate
        # glute colour was the tenth in a palette that stops being readable at
        # nine. Adductor/abductor machines are hip work with nowhere better.
        FEMORAL,
        (
            "peso muerto rumano", "rumano", "rdl", "hip thrust", "empuje de cadera",
            "gluteo", "femoral", "isquios", "isquiotibial", "curl de pierna",
            "buenos dias", "good morning", "patada de gluteo", "puente de gluteo",
            "aductor", "abductor",
        ),
    ),
    (
        # Knee-dominant work, and the catch-all for anything that just says "leg".
        CUADRICEPS,
        (
            "sentadilla", "squat", "prensa", "leg press", "zancada", "lunge",
            "bulgara", "cuadriceps", "extension de pierna", "extension de cuadriceps",
            "step up", "subida al cajon", "sissy", "pierna", "leg", "hack", "jaca",
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


def group_for(name: str, kind: str) -> str | None:
    """Auto-classify by name, but never for cardio.

    The keyword rules are written for strength moves ("remo" reads as a back
    row), but a cardio machine sharing that name — a rowing ergometer, say —
    isn't training that muscle group. Cardio gets no auto-guess; only an
    explicit override on the exercise assigns it one.
    """
    if kind == "cardio":
        return None
    return classify(name)
