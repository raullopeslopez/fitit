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
        # Ahead of ESPALDA, whose bare "back" keyword matches inside "kickback"
        # and files a triceps kickback under Espalda. Only the qualified names
        # are rescued: a bare "Kickback" is genuinely ambiguous (triceps or
        # glute) and is left to the user to tag.
        TRICEPS,
        ("kickback de triceps", "triceps kickback", "patada de triceps"),
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
            "peso muerto rumano", "rumano", "romanian", "rdl", "hip thrust",
            "empuje de cadera", "gluteo", "glute", "femoral", "isquios",
            "isquiotibial", "hamstring", "curl de pierna", "leg curl", "nordic",
            "buenos dias", "good morning", "patada de gluteo", "puente de gluteo",
            "rear kick", "aductor", "abductor",
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


# The muscles a lift trains on the way past, keyed on (primary group, keywords).
# Both have to match: "prensa" is a leg press and trains the hamstrings, but
# "gemelo en prensa" is a calf raise and trains nothing else — gating on the
# primary means the movement family decides, not the word alone.
#
# Deliberately short. Almost every lift has some third or fourth muscle with a
# claim on it, and the 0.5 weight downstream is already a heuristic (Pelland et
# al. call it that themselves); stacking guesses on top of a guess buys noise.
# A pair only earns a place here when the involvement is large and nobody
# argues about it. Isolation work — curls, extensions, laterals, flyes — gets
# nothing, which is the whole point of calling it isolation.
#
# First match wins, so the more specific movement is listed before the family
# it belongs to. Spec: tests/features/secondary_muscles.feature
_SECONDARY_RULES: list[tuple[str, tuple[str, ...], tuple[str, ...]]] = [
    # Overhead pressing is already a shoulder movement; only the triceps are
    # along for the ride. Listed before the chest press family so a "press
    # militar" never reaches it.
    (
        HOMBRO,
        ("press militar", "militar", "overhead press", "ohp", "arnold", "press de hombro"),
        (TRICEPS,),
    ),
    # Horizontal and incline pressing, and dips. Flyes are absent on purpose:
    # a pec deck bends at the elbow only enough to hold the handle.
    (
        PECHO,
        (
            "press banca", "banca", "bench", "press inclinado", "press declinado",
            "incline press", "press de pecho", "fondos", "dips", "press",
        ),
        (TRICEPS, HOMBRO),
    ),
    # Every pull that bends the elbow: the biceps finish what the back starts.
    # Deadlifts and shrugs are absent — the elbow stays straight, so the arm
    # only ever holds on.
    (
        ESPALDA,
        (
            "dominada", "pull up", "pull-up", "pullup", "jalon", "pulldown",
            "remo", "row",
        ),
        (BICEPS,),
    ),
    # A deadlift is a hip hinge that the back holds together.
    (ESPALDA, ("peso muerto", "deadlift"), (FEMORAL,)),
    # Knee-dominant work drives the hips out of the hole too. Leg extensions
    # are absent: the hip never moves. Glutes ride with FEMORAL throughout.
    (
        CUADRICEPS,
        (
            "sentadilla", "squat", "prensa", "leg press", "zancada", "lunge",
            "bulgara", "hack", "jaca", "step up", "subida al cajon",
        ),
        (FEMORAL,),
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


def secondaries_for(name: str, kind: str, primary: str | None = None) -> list[str]:
    """The groups this lift trains indirectly, in canonical order.

    `primary` overrides the auto-classification, so a lift the user has re-tagged
    by hand is read as the movement they say it is. The primary is never returned
    as one of its own secondaries — otherwise a re-tagged press would count the
    shoulder once at full weight and again at half.

    Downstream these count half a set each, the fractional method that won in
    Pelland et al. 2026 against counting them whole or not at all. Empty for
    cardio, for isolation work, and for anything the classifier can't place.
    """
    group = primary if primary is not None else group_for(name, kind)
    if group is None:
        return []
    folded = _fold(name)
    for rule_group, keywords, secondaries in _SECONDARY_RULES:
        if rule_group != group:
            continue
        if any(_fold(k) in folded for k in keywords):
            return [g for g in MUSCLE_GROUPS if g in secondaries and g != group]
    return []
