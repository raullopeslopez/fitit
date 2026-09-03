"""Lo que dice haber leído el modelo, convertido en una propuesta de la que
uno se puede fiar — o en un rechazo.

Nada de esto escribe en `foods`. Devuelve algo que rellena el formulario de
alta, que sigue siendo la única puerta del catálogo. Si algo aquí acaba
insertando un alimento, el escáner se ha convertido en lo que el proyecto lleva
prohibiendo desde el primer día.

**El módulo no confía en el modelo.** No le pide números y se los cree: le pide
además la cabecera de la columna que ha leído y la transcripción de las filas,
y comprueba lo segundo contra lo primero. Es una postura, y sale de que los dos
errores que importan son invisibles:

- Un `0` donde la etiqueta no declara nada. En pantalla un cero es un dato, no
  un hueco, así que no lo revisas; y una vez congelado en `log_entries` ya no se
  puede distinguir de una medición. Es el único daño de esta feature que ningún
  arreglo posterior deshace, porque la información que destruye —que aquello no
  se sabía— nunca llegó a escribirse.
- La columna «por ración» leída como «por 100 g». Da una cifra creíble escalada
  por un factor que nadie eligió, y no hay nada en pantalla que chirríe.

Ninguno se corrige pidiéndole al modelo que se porte bien, porque cuando falle
lo hará con la misma seguridad con la que acierta. Se corrigen aquí:
`_backed_by_a_row()` tira toda cifra que la transcripción no respalde, y
`_hundred_grams()` rechaza la lectura entera antes que reescalarla a ojo.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.naming import fold_exercise_name as fold
from app.nutrition import NUTRIENTS


class ColumnRefused(Exception):
    """La lectura no venía de una columna por 100 g, y no se puede convertir.

    Rechazar no es fallar: el formulario se abre igual, en blanco, y lo tecleas.
    Lo que no puede pasar es que un número por ración entre en la base de datos
    como si fuera por 100 g.
    """

    def __init__(self, header: str | None):
        self.header = header
        super().__init__(header or "sin cabecera")


# Cómo se llama cada nutriente en una etiqueta española, plegado. No hace falta
# que sea exhaustivo ni bonito: sólo tiene que reconocer la fila cuando está,
# porque lo que decide es si **hay** fila, no qué pone exactamente en ella.
#
# Prefijos y no palabras enteras: "proteinas", "proteina" y "proteinas (n x
# 6,25)" son la misma fila, y las etiquetas escriben las tres.
ROW_WORDS: dict[str, tuple[str, ...]] = {
    "kcal": ("kcal", "energ", "calor"),
    "protein": ("protein",),
    "fat": ("grasa", "lipid", "materia grasa"),
    "carbs": ("hidrato", "carbohidrat", "glucid"),
    "fiber": ("fibra",),
}

# El tope de un macro en 100 g de comida son 100 g. Por encima, o por debajo de
# cero, no es un alimento raro: es una lectura mal hecha —un decimal perdido,
# una cifra de otra columna—, y vale más desconocida que creída.
GRAM_CEILING = 100.0
# Las kcal no viven bajo ese techo: el aceite anda por 900. Por encima de mil en
# 100 g no hay comida, así que ahí sí corta.
KCAL_CEILING = 1000.0

_HUNDRED_GRAMS = re.compile(r"100\s*(g\b|gr\b|gramos\b|g$)")
_PER_PORTION = ("racion", "porcion", "unidad", "envase", "pieza", "rebanada")


@dataclass
class LabelRead:
    """Una propuesta para el formulario. Ni un alimento, ni una entrada."""

    name: str | None
    brand: str | None
    # La cabecera tal y como venía impresa. Va a la pantalla —«leído de «por
    # 100 g»»— porque una cifra que no sabes de dónde sale no se puede
    # confirmar, sólo firmar en blanco.
    column_header: str
    nutrients: dict[str, float | None]
    # Lo que el modelo mandó y esto tiró por no venir respaldado. La pantalla lo
    # necesita para no dejar el hueco mudo: un campo vacío se lee como «la
    # etiqueta no lo dice», y aquí significa «no me fío de lo que leyó».
    dropped: tuple[str, ...] = field(default_factory=tuple)


def read_from_payload(payload: dict) -> LabelRead:
    """Valida lo que devolvió el modelo. Lanza `ColumnRefused` si no hay forma
    de saber que los números son por 100 g."""
    header = payload.get("column_header")
    if not _hundred_grams(header):
        raise ColumnRefused(header)

    rows = [fold(str(row)) for row in payload.get("rows") or []]
    raw = payload.get("nutrients") or {}

    nutrients: dict[str, float | None] = {}
    dropped: list[str] = []
    for nutrient in NUTRIENTS:
        value = _number(raw.get(nutrient))
        if value is None:
            # El modelo no lo mandó, o mandó algo que no es un número. En
            # cualquier caso: desconocido. Nunca cero.
            nutrients[nutrient] = None
            continue
        if not _sane(nutrient, value):
            nutrients[nutrient] = None
            dropped.append(nutrient)
            continue
        if not _backed_by_a_row(nutrient, rows):
            # Aquí muere el cero falso. La cifra puede ser correcta —a veces lo
            # será— pero no hay nada en la foto que la sostenga, y el precio de
            # equivocarse es un dato inventado que ya no se puede desmentir.
            nutrients[nutrient] = None
            dropped.append(nutrient)
            continue
        nutrients[nutrient] = value

    return LabelRead(
        name=_text(payload.get("name")),
        brand=_text(payload.get("brand")),
        column_header=str(header),
        nutrients=nutrients,
        dropped=tuple(dropped),
    )


def _hundred_grams(header: str | None) -> bool:
    """¿Los números son por 100 g?

    Sólo `True` cuando se puede afirmar. Sin cabecera, con mililitros o con una
    ración de por medio, la respuesta es no — y no hay rama que intente
    reescalar: el factor tendríamos que ponerlo nosotros.
    """
    if not header:
        return False
    folded = fold(str(header))
    if "ml" in folded.split() or "100 ml" in folded:
        return False
    if any(word in folded for word in _PER_PORTION):
        return False
    return bool(_HUNDRED_GRAMS.search(folded))


def _backed_by_a_row(nutrient: str, rows: list[str]) -> bool:
    """¿Transcribió el modelo una fila que hable de este nutriente?"""
    return any(word in row for row in rows for word in ROW_WORDS[nutrient])


def _sane(nutrient: str, value: float) -> bool:
    ceiling = KCAL_CEILING if nutrient == "kcal" else GRAM_CEILING
    return 0 <= value <= ceiling


def _number(value) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int | float):
        return float(value)
    # Un modelo que devuelve "3,8" en vez de 3.8 no se ha equivocado de dato,
    # sólo de coma. Es la coma decimal de la etiqueta.
    try:
        return float(str(value).replace(",", ".").strip())
    except ValueError:
        return None


def _text(value) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(str(value).split())
    return cleaned or None
