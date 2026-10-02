"""Muscle-group taxonomy + a keyword classifier.

Exercises carry an optional ``muscle_group``. Rather than make the user tag every
lift by hand, we guess the group from the name (Spanish and common English terms),
accent- and case-insensitively. A stored value always wins — this is only the
auto-assignment/fallback, and the guess is editable via the API.

The set is deliberately small (10 groups): the whole point downstream is a
legible per-muscle colour, and a colour per individual muscle would be an
unreadable rainbow.

It was 7 until the weekly-set reference arrived. A single "Pierna" bucket held
squats, leg curls and calf raises at once, so "Pierna: 20 series" could be twenty
sets of squats and nothing else — a number you cannot hold against a per-muscle
reference and learn anything from. The three that a leg day actually splits into
are separated.

Glutes rode with the hamstrings under ``FEMORAL`` until 2026-10, on the argument
that the hinges that train one train the other. True of the hinges, and false of
everything else that trains them: a squat grows the glutes and barely touches the
hamstrings (Kubo et al. 2019), so every squat was paying its half-set to the one
leg muscle it doesn't work, and a hip thrust and a leg curl landed on the same
row. ``GLUTEO`` is the tenth group.
"""

import unicodedata

PECHO = "Pecho"
ESPALDA = "Espalda"
CUADRICEPS = "Cuádriceps"
GLUTEO = "Glúteo"
FEMORAL = "Femoral"
GEMELO = "Gemelo"
HOMBRO = "Hombro"
BICEPS = "Bíceps"
TRICEPS = "Tríceps"
CORE = "Core"

# Canonical order — the UI renders chips/legend in this sequence, and it is the
# order the categorical palette was validated in (adjacent pairs), so the four
# leg groups have to stay together and in this position.
MUSCLE_GROUPS: list[str] = [
    PECHO,
    ESPALDA,
    CUADRICEPS,
    GLUTEO,
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
        # "Encogimiento" is written below as a shrug, so an *abdominal* crunch
        # spelled that way was counting as Espalda. Same shape of fix: the
        # qualified name is rescued here, the bare word keeps its meaning.
        CORE,
        (
            "elevacion de pierna", "elevaciones de pierna", "elevacion de las pierna",
            "encogimiento abdominal", "encogimientos abdominales",
            "encogimiento de abdomen",
        ),
    ),
    (
        # Only the qualified names are rescued: a bare "Kickback" is genuinely
        # ambiguous (triceps or glute) and is left to the user to tag. That used
        # not to be true — ESPALDA carried a bare "back" keyword that matched
        # inside *kick·back* and filed the lot under Espalda. The keyword is
        # gone (nothing legitimate needed it; "back extension" is a hinge and is
        # claimed by FEMORAL below), so the promise this comment makes is now
        # one the code keeps. Spec: test_a_bare_kickback_is_left_for_the_user_to_tag.
        TRICEPS,
        ("kickback de triceps", "triceps kickback", "patada de triceps"),
    ),
    (
        # Ahead of ESPALDA and PECHO, which would otherwise take these on a
        # fragment of the name: "remo" makes an upright row a back lift, and
        # "apertura" makes a rear-delt fly a chest lift. Both are shoulder work
        # — HOMBRO already had "remo al menton" written into it further down,
        # where it could never be reached.
        HOMBRO,
        (
            "remo al menton", "upright row", "apertura posterior",
            "aperturas posteriores", "apertura invertida", "reverse fly",
            "reverse pec deck",
        ),
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
        # Hip extension against the hip, and abduction. Ahead of FEMORAL so
        # "patada de glúteo" and "glute bridge" never reach a hinge keyword, and
        # ahead of the triceps "patada".
        #
        # The abductor lives here. It used to have no group at all — see the
        # FEMORAL comment below — because abduction is not hip extension and no
        # hinge trains it. What it trains is gluteus medius and minimus, which is
        # glute work by any reading, and the one part of the glute that neither
        # squats nor hip thrusts grow (Plotkin et al. 2023). With a glute group it
        # finally has an honest home. Spelled "abduc", never "aduc": the adductor
        # is a hip extensor and stays with the hinge.
        GLUTEO,
        (
            "hip thrust", "empuje de cadera", "gluteo", "glute", "patada de gluteo",
            "puente de gluteo", "rear kick", "abductor", "abduccion", "abduction",
        ),
    ),
    (
        # Hip hinge and knee flexion. Glutes lived here until they got their own
        # group: the hinges below still train them, and pay them half a set
        # through `_SECONDARY_RULES` rather than being filed under them.
        #
        # The adductor belongs here on biomechanics, not for want of a better
        # shelf: the adductor magnus is a hip extensor — musculoskeletal
        # modelling puts half or more of the squat's hip-extension torque
        # through it, and Kubo et al. 2019 measured +6.2% adductor volume from
        # full squats alone, more than the quadriceps gained. It is family.
        #
        # The *abductor* is not, and used to sit on this same line. Abduction is
        # not hip extension and no hinge trains it: Plotkin et al. 2023 found
        # little to no gluteus medius/minimus growth after nine weeks of *either*
        # squats or hip thrusts. It went unclassified while there was no glute
        # group, and is filed under GLUTEO above now that there is.
        #
        # Back extensions are hinges too, which is the least obvious entry here.
        # Without pelvic fixation the glutes and hamstrings de-rotate the pelvis
        # and the lumbar extensors barely work (Graves et al. 1994): Mayer et
        # al. 2003 loaded a 45° Roman chair progressively for 12 weeks and
        # isometric lumbar torque did not move, and Fisher et al. 2013 put 16%
        # on a Romanian deadlift 1RM without shifting that torque at any of
        # seven angles. So the bench trains hip extensors, and is counted with
        # them. Isolated lumbar extension — the pelvis-restrained machine, the
        # one exercise that does train the erectors — is deliberately absent:
        # see test_isolated_lumbar_extension_is_not_filed_as_a_hinge.
        FEMORAL,
        (
            "peso muerto rumano", "rumano", "romanian", "rdl", "femoral", "isquios",
            "isquiotibial", "hamstring", "curl de pierna", "leg curl", "nordic",
            "buenos dias", "good morning", "aductor",
            "hiperextension", "banco romano", "roman chair", "back extension",
            "extension de espalda", "reverse hyper",
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
            "remo", "row", "pullover", "pull over", "peso muerto", "deadlift",
            "encogimiento", "shrug", "trapecio", "espalda", "dorsal", "lat ",
        ),
    ),
    (
        PECHO,
        (
            "press banca", "banca", "bench", "press inclinado", "press declinado",
            "incline press", "press de pecho", "pecho", "chest", "apertura",
            "fly", "pec deck", "contractora", "peck deck", "fondos",
            "dips",
        ),
    ),
    (
        HOMBRO,
        (
            "press militar", "militar", "overhead press", "ohp", "hombro",
            "shoulder", "deltoide", "elevacion lateral", "elevaciones laterales",
            "lateral raise", "elevacion frontal", "frontal raise", "front raise",
            "pajaro", "arnold", "face pull", "posterior",
        ),
    ),
    (
        TRICEPS,
        (
            "triceps", "extension de triceps", "patada", "press frances", "frances",
            "jalon de triceps", "polea triceps", "close grip", "press cerrado",
            # No bare "kickback": qualified forms are rescued at the top of
            # `_RULES`, and the word alone is a triceps move or a glute move
            # with nothing in the name to say which.
            "rompecraneos", "skullcrusher", "copa",
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
    # A deadlift is a hip hinge that the back holds together, and a hinge
    # trains both of its hip extensors.
    (ESPALDA, ("peso muerto", "deadlift"), (FEMORAL, GLUTEO)),
    # The hinges filed under FEMORAL train the glutes in the same set. Leg
    # curls are absent: knee flexion, the hip never moves.
    (
        FEMORAL,
        (
            "peso muerto rumano", "rumano", "romanian", "rdl", "buenos dias",
            "good morning", "hiperextension", "banco romano", "roman chair",
            "back extension", "extension de espalda", "reverse hyper",
        ),
        (GLUTEO,),
    ),
    # Knee-dominant work drives the hips out of the hole too — through the
    # glutes, not the hamstrings. Kubo et al. 2019: full squats grew the glutes
    # and the adductors and left the hamstrings essentially unchanged, because
    # the hamstrings lengthen at the hip as they shorten at the knee and never
    # change length much. Leg extensions are absent: the hip never moves.
    (
        CUADRICEPS,
        (
            "sentadilla", "squat", "prensa", "leg press", "zancada", "lunge",
            "bulgara", "hack", "jaca", "step up", "subida al cajon",
        ),
        (GLUTEO,),
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
