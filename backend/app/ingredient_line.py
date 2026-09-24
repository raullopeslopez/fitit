"""Una línea de ingredientes, tal como la escribe una receta en español.

«500 gr de acelgas» → 500, «g», 500 g, «acelgas». Lo que sale de aquí es lo que
la línea **dice**, no lo que significa: «2 huevos» tiene cantidad y no tiene
gramos, y `grams` queda en `None`. Traducir un huevo a 60 g sería inventar un
peso que la receta no dio — NULL no es 0, y tampoco es una media.

Sólo las unidades de masa y de volumen llevan a gramos. El volumen se toma como
si fuese agua (1 ml ≈ 1 g): para caldo, leche, vino o nata el error es de unos
pocos por ciento; para aceite (~0,92 g/ml) o miel (~1,4 g/ml) es mayor, y aun
así la cifra está a la vista y se corrige a mano en el borrador del plato.
Cucharadas, tazas, dientes o pizcas no tienen un peso fiable (depende de qué
se mida con ellas) y se quedan sin gramos.

Función pura: sin base de datos y sin red.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.naming import fold_exercise_name


@dataclass(frozen=True)
class ParsedLine:
    quantity: float | None
    unit: str | None
    # Sólo con una unidad de masa o volumen. `None` = desconocido, no cero.
    grams: float | None
    name: str


# Gramos por unidad. Volumen como agua: ver el docstring del módulo.
GRAMS_PER_UNIT = {
    "mg": 0.001,
    "g": 1.0,
    "kg": 1000.0,
    "ml": 1.0,
    "cl": 10.0,
    "dl": 100.0,
    "l": 1000.0,
}

# Cómo se escribe cada unidad → su forma canónica. Las claves van plegadas
# (sin tildes, en minúscula), igual que la palabra con la que se comparan.
_UNIT_WORDS = {
    **dict.fromkeys(["mg", "miligramo", "miligramos"], "mg"),
    **dict.fromkeys(["g", "gr", "grs", "grm", "gramo", "gramos"], "g"),
    **dict.fromkeys(["kg", "kgs", "kilo", "kilos", "kilogramo", "kilogramos"], "kg"),
    **dict.fromkeys(["ml", "mililitro", "mililitros", "cc"], "ml"),
    **dict.fromkeys(["cl", "centilitro", "centilitros"], "cl"),
    **dict.fromkeys(["dl", "decilitro", "decilitros"], "dl"),
    **dict.fromkeys(["l", "lt", "lts", "litro", "litros"], "l"),
    # Sin peso fiable.
    **dict.fromkeys(["cucharada", "cucharadas", "cda", "cdas"], "cucharada"),
    **dict.fromkeys(["cucharadita", "cucharaditas", "cdta", "cdtas", "cdita"], "cucharadita"),
    **dict.fromkeys(["taza", "tazas"], "taza"),
    **dict.fromkeys(["vaso", "vasos"], "vaso"),
    **dict.fromkeys(["diente", "dientes"], "diente"),
    **dict.fromkeys(["pizca", "pizcas", "pellizco"], "pizca"),
    **dict.fromkeys(["punado", "punados"], "puñado"),
    **dict.fromkeys(["chorro", "chorros"], "chorro"),
    **dict.fromkeys(["chorrito", "chorritos"], "chorrito"),
    **dict.fromkeys(["lata", "latas"], "lata"),
    **dict.fromkeys(["bote", "botes"], "bote"),
    **dict.fromkeys(["sobre", "sobres"], "sobre"),
    **dict.fromkeys(["rama", "ramas", "ramita", "ramitas"], "rama"),
    **dict.fromkeys(["hoja", "hojas"], "hoja"),
    **dict.fromkeys(["loncha", "lonchas"], "loncha"),
    **dict.fromkeys(["rebanada", "rebanadas"], "rebanada"),
    **dict.fromkeys(["rodaja", "rodajas"], "rodaja"),
    **dict.fromkeys(["trozo", "trozos"], "trozo"),
    **dict.fromkeys(["manojo", "manojos"], "manojo"),
    **dict.fromkeys(["cabeza", "cabezas"], "cabeza"),
    **dict.fromkeys(["unidad", "unidades", "ud", "uds"], "unidad"),
}

_FRACTIONS = {"½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125}
_WORD_QUANTITIES = {"un": 1.0, "una": 1.0, "uno": 1.0, "medio": 0.5, "media": 0.5}

_NUM = r"\d+(?:[.,]\d+)?"
_FRAC_CHARS = "".join(_FRACTIONS)
# «1 ½», «1/2», «½», «1,5», «500»; y un rango «2-3» o «2 o 3», del que vale el primero.
_QUANTITY = re.compile(
    rf"^(?:(?P<whole>\d+)\s+(?P<frac>[{_FRAC_CHARS}])"
    rf"|(?P<num>\d+)\s*/\s*(?P<den>\d+)"
    rf"|(?P<ufrac>[{_FRAC_CHARS}])"
    rf"|(?P<dec>{_NUM}))"
    rf"(?:\s*(?:-|–|a|o)\s*{_NUM}(?=\s|$|[a-zA-Z]))?"
)

# Relleno que no es parte del alimento.
_PARENTHESES = re.compile(r"\([^()]*\)|\[[^\[\]]*\]")
_FILLER = re.compile(
    r"(?:,\s*|\s+|^)(?:al\s+gusto|a\s+gusto|opcional|c/n|cantidad\s+necesaria)\s*$",
    re.IGNORECASE,
)


def parse_line(line: str) -> ParsedLine:
    text = _PARENTHESES.sub(" ", line)
    text = " ".join(text.split())
    # Dos pasadas: «Perejil, opcional» y «Sal, al gusto» pueden encadenarse.
    for _ in range(2):
        text = _FILLER.sub("", text).strip(" ,;.")

    quantity, text = _take_quantity(text)
    unit, text = _take_unit(text) if quantity is not None else (None, text)
    if unit is not None:
        text = re.sub(r"^(?:de|del)\s+", "", text, flags=re.IGNORECASE)

    grams = None
    if quantity is not None and unit in GRAMS_PER_UNIT:
        grams = round(quantity * GRAMS_PER_UNIT[unit], 2)
    return ParsedLine(quantity=quantity, unit=unit, grams=grams, name=text.strip(" ,;."))


def _take_quantity(text: str) -> tuple[float | None, str]:
    match = _QUANTITY.match(text)
    if match:
        if match["whole"]:
            value = int(match["whole"]) + _FRACTIONS[match["frac"]]
        elif match["num"]:
            den = int(match["den"])
            if den == 0:
                return None, text
            value = int(match["num"]) / den
        elif match["ufrac"]:
            value = _FRACTIONS[match["ufrac"]]
        else:
            value = float(match["dec"].replace(",", "."))
        return _tidy(value), text[match.end() :].strip()

    first, _, rest = text.partition(" ")
    word = fold_exercise_name(first)
    if word in _WORD_QUANTITIES:
        return _tidy(_WORD_QUANTITIES[word]), rest.strip()
    return None, text


def _take_unit(text: str) -> tuple[str | None, str]:
    # La unidad es una palabra entera, con o sin punto: «kg.», «gr», «500g».
    match = re.match(r"^([^\W\d_]+)\.?(?=\s|$)", text)
    if not match:
        return None, text
    unit = _UNIT_WORDS.get(fold_exercise_name(match.group(1)))
    if unit is None:
        return None, text
    return unit, text[match.end() :].strip()


def _tidy(value: float) -> float:
    return int(value) if float(value).is_integer() else value
