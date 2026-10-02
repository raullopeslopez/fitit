"""The muscle-group classifier: guess a group from an exercise name."""

import pytest

from app.muscles import (
    BICEPS,
    CORE,
    CUADRICEPS,
    ESPALDA,
    FEMORAL,
    GEMELO,
    GLUTEO,
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
        ("Buenos días", FEMORAL),
        # Glutes are their own group since the hip thrust stopped hiding in the
        # hamstring row: hip extension against the hip, not against the knee.
        ("Hip thrust", GLUTEO),
        # Written as one word in the real log, 12 sets of it, and the keyword
        # only knew the spaced spelling.
        ("Hipthrust", GLUTEO),
        ("Hip-thrust", GLUTEO),
        ("Patada de glúteo", GLUTEO),
        ("Puente de glúteo", GLUTEO),
        ("Empuje de cadera", GLUTEO),
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


@pytest.mark.parametrize(
    "name,expected",
    [
        # English names, which is half of what a real exercise list looks like.
        # "Leg Curl" was landing in Cuádriceps: the posterior-chain rules only
        # knew the Spanish "curl de pierna", so the quad catch-all rule "leg"
        # took it first — a hamstring lift counted as quads.
        ("Leg Curl", FEMORAL),
        ("Seated leg curl", FEMORAL),
        ("Hamstring curl", FEMORAL),
        ("Romanian deadlift", FEMORAL),
        ("Nordic curl", FEMORAL),
        ("Glute bridge", GLUTEO),
        # A glute kickback machine. "Patada" and "kickback" belong to triceps, so
        # this one is matched on its own name rather than by loosening those.
        ("Rear Kick Máq", GLUTEO),
        ("Leg extension", CUADRICEPS),
        ("Leg press", CUADRICEPS),
        ("Calf raise", GEMELO),
    ],
)
def test_reads_english_leg_names_too(name, expected):
    assert classify(name) == expected


def test_the_triceps_kickback_is_still_triceps():
    """The glute rule must not eat it: 'patada'/'kickback' stay with triceps."""
    assert classify("Patada de tríceps") == TRICEPS
    assert classify("Kickback de tríceps") == TRICEPS


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
    order too — and the four leg groups sit adjacent, which is what the
    colorblind validation was run against."""
    assert MUSCLE_GROUPS == [
        "Pecho",
        "Espalda",
        "Cuádriceps",
        "Glúteo",
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


# ── Movimientos que el orden de reglas mandaba al músculo equivocado ──────────
#
# Todos estos fallaban por precedencia, no por falta de keyword: la regla de un
# grupo anterior casaba con un trozo del nombre y se lo quedaba. Se arreglan
# como ya se arregló "elevación de piernas" — con un rescate específico por
# delante — y no aflojando la regla que los capturaba, que sigue siendo correcta
# para el resto de su familia.


def test_an_upright_row_is_a_shoulder_lift():
    """ESPALDA veía "remo" y se lo llevaba, así que la keyword "remo al menton"
    que HOMBRO ya tenía escrita no se alcanzaba nunca: era código muerto."""
    assert classify("Remo al mentón") == HOMBRO
    assert classify("Upright row") == HOMBRO
    # Y el remo de espalda de toda la vida no se mueve.
    assert classify("Remo con barra") == ESPALDA


def test_a_rear_delt_fly_is_a_shoulder_lift():
    """PECHO veía "apertura" y contaba un deltoide posterior como pecho."""
    assert classify("Aperturas posteriores") == HOMBRO
    assert classify("Apertura invertida en máquina") == HOMBRO
    assert classify("Pájaro con mancuernas") == HOMBRO
    # La apertura de pecho sigue siendo de pecho.
    assert classify("Aperturas con polea") == PECHO


def test_an_ab_crunch_is_not_a_shrug():
    """"Encogimiento" estaba escrito como shrug, así que un encogimiento
    abdominal contaba como espalda."""
    assert classify("Encogimiento abdominal") == CORE
    # Los encogimientos de hombros siguen siendo trapecio, y el trapecio espalda.
    assert classify("Encogimientos de hombros") == ESPALDA


def test_a_bare_kickback_is_left_for_the_user_to_tag():
    """Un "Kickback" pelado es ambiguo —tríceps o glúteo— y el comentario de
    `_RULES` decía que se dejaba sin clasificar. No se dejaba: la keyword "back"
    de ESPALDA casa dentro de *kick·back*, y lo archivaba en Espalda."""
    assert classify("Kickback") is None
    # Cualificado sí se clasifica, por los dos lados.
    assert classify("Kickback de tríceps") == TRICEPS
    assert classify("Rear Kick Máq") == GLUTEO


def test_vocabulary_holes():
    """Dos nombres corrientes que no casaban con nada por cómo estaban escritas
    las keywords: "pullover" sin espacio, y "frontal raise", que no es inglés."""
    assert classify("Pull over con mancuerna") == ESPALDA
    assert classify("Pullover") == ESPALDA
    assert classify("Front raise") == HOMBRO
    assert classify("Elevación frontal") == HOMBRO


# ── Lo que la literatura corrige ─────────────────────────────────────────────


def test_a_back_extension_is_a_hip_exercise():
    """El banco romano no entrena el extensor lumbar en ningún sentido medible:
    sin fijación pélvica son el glúteo y los isquios los que "des-rotan" la
    pelvis (Graves et al. 1994). Mayer et al. 2003 lo cargó progresivamente 12
    semanas y el torque lumbar no se movió; Fisher et al. 2013 subió un 16% el
    1RM de peso muerto rumano sin mover ese torque en ninguno de 7 ángulos.

    Así que es trabajo de extensores de cadera, y va con los demás hinges — no
    en Espalda, que es donde lo pondría la intuición."""
    assert classify("Hiperextensiones") == FEMORAL
    assert classify("Hiperextensión en banco") == FEMORAL
    assert classify("Banco romano") == FEMORAL
    assert classify("Back extension") == FEMORAL


def test_isolated_lumbar_extension_is_not_filed_as_a_hinge():
    """La excepción del test anterior: la extensión lumbar *con fijación
    pélvica* sí entrena el erector, y es el único ejercicio que lo hace. No hay
    grupo para ella —su MEV directo no tiene banda publicada— así que se queda
    sin clasificar y la etiquetas tú, en vez de mentir metiéndola en Femoral."""
    assert classify("Extensión lumbar") is None
    assert classify("Extensión lumbar en máquina") is None


def test_the_abductor_machine_is_not_posterior_chain():
    """El aductor se queda en Femoral y el abductor no.

    No es simetría: el aductor mayor es un extensor de cadera —aporta la mitad
    o más del par de extensión en sentadilla, y Kubo et al. 2019 midió +6,2% de
    volumen sólo sentadillando—, así que pertenece a la familia del hinge. La
    abducción no es extensión de cadera y ningún hinge la entrena: Plotkin et
    al. 2023 no halló crecimiento del glúteo medio/menor ni con sentadilla ni
    con hip thrust."""
    assert classify("Aductores en máquina") == FEMORAL
    assert classify("Copenhagen") is None  # tampoco se inventa uno


def test_the_abductor_machine_is_glute_work():
    """Sin grupo Glúteo, el abductor se quedaba sin clasificar: no tenía sitio
    honesto entre los nueve. Lo que trabaja es el glúteo medio y menor, que es
    justo lo que ni la sentadilla ni el hip thrust hacen crecer (Plotkin et al.
    2023), así que con Glúteo como grupo es trabajo directo de glúteo."""
    assert classify("Abductores en máquina") == GLUTEO
    assert classify("Abductor") == GLUTEO
    assert classify("Hip abduction") == GLUTEO
    # El parecido de nombre no arrastra al aductor.
    assert classify("Aductor") == FEMORAL


def test_hamstring_and_hinge_work_stays_femoral():
    """Separar el glúteo no saca nada de la bisagra: el peso muerto rumano y el
    banco romano siguen siendo Femoral, y el glúteo los cobra como secundario."""
    for name in ["Curl femoral", "Peso muerto rumano", "Nordic curl", "Buenos días",
                 "Hiperextensiones"]:
        assert classify(name) == FEMORAL, name


def test_a_deadlift_filed_under_femoral_still_pays_the_glutes():
    """Un peso muerto que el usuario archivó a mano en Femoral es una bisagra
    igual: cobra el glúteo. La regla del peso muerto estaba atada a Espalda, y
    con el primario cambiado no le daba nada a nadie."""
    from app.muscles import secondaries_for

    assert secondaries_for("Peso muerto", "strength", primary=FEMORAL) == [GLUTEO]
    assert secondaries_for("Deadlift", "strength", primary=FEMORAL) == [GLUTEO]
    # Archivado donde lo pondría el clasificador, sigue pagando a los dos.
    assert secondaries_for("Peso muerto", "strength") == [GLUTEO, FEMORAL]
