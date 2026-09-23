"""Leer la tabla CIQUAL y convertirla a filas de `foods`.

Todo lo de aquí es puro: entra una celda o una fila del XLS y sale un valor o un
dict. Nada toca la base de datos —eso es `import_ciqual.py`— para que las reglas
de normalización, que son la parte que puede corromper el catálogo en silencio,
se puedan probar sin infraestructura.

Las reglas están documentadas y razonadas en `scripts/ciqual_rules.md`. El
resumen es que el fichero tiene exactamente **cinco** formas de valor y que dos
de ellas significan «nadie lo midió», que no es lo mismo que cero.
"""

import re
import unicodedata

# Columnas de la hoja `compo` que van a columna propia en `foods`. El resto de
# nutrientes va entero a `nutrients_json`.
#
# Dos elecciones, porque CIQUAL da dos versiones de cada una y hay que quedarse
# con una: la energía por el **Reglamento UE 1169/2011**, que es el número
# impreso en una etiqueta española (la alternativa, «N x factor Jones, avec
# fibres», tiene exactamente la misma cobertura, así que no se gana nada); y la
# proteína por el **factor de Jones**, que es la referencia de CIQUAL frente al
# N x 6,25 genérico.
MACRO_COLUMNS = {
    "kcal_100g": "Energie, Règlement UE N° 1169/2011 (kcal/100 g)",
    "protein_100g": "Protéines, N x facteur de Jones (g/100 g)",
    "fat_100g": "Lipides (g/100 g)",
    # `Glucides` de CIQUAL son glúcidos **disponibles**, con la fibra contada
    # aparte — que es exactamente lo que afirma `carb_convention='available'`.
    "carbs_100g": "Glucides (g/100 g)",
    "fiber_100g": "Fibres alimentaires (g/100 g)",
}

NAME_COLUMN = "alim_nom_fr"
CODE_COLUMN = "alim_code"
# Los códigos y no los nombres: `0201` es estable y no habla ningún idioma,
# mientras que `légumes` habría que traducirlo y mantenerlo traducido. El mapa
# a español vive en `app/food_groups.py`, junto a las reglas que lo usan.
GROUP_CODE_COLUMN = "alim_grp_code"
SUBGROUP_CODE_COLUMN = "alim_ssgrp_code"

# Las columnas descriptivas: ni son nutrientes ni van a `nutrients_json`.
NON_NUTRIENT_COLUMNS = {
    "alim_grp_code",
    "alim_ssgrp_code",
    "alim_ssssgrp_code",
    "alim_grp_nom_fr",
    "alim_ssgrp_nom_fr",
    "alim_ssssgrp_nom_fr",
    "alim_code",
    "alim_nom_fr",
    "alim_nom_sci",
}

# Espacios de millar. CIQUAL usa tanto el normal como el fino insecable.
_SPACES = "    "

_TRACES = "traces"
_NOT_DETERMINED = "-"


class CiqualValueError(ValueError):
    """Una celda con una forma que estas reglas no reconocen.

    Se levanta a propósito en vez de devolver `None`: una forma nueva en una
    edición futura del fichero tiene que parar el import, no colarse como 3.186
    nutrientes «desconocidos» que nadie va a mirar.
    """


def parse_value(raw) -> float | None:
    """Una celda de nutriente → número, o `None` si nadie lo midió.

    Las cinco formas que trae el fichero, y qué hace cada una:

    - `45,4`   → 45.4. Coma decimal y espacios de millar, que es como escribe
                 los números un fichero francés.
    - `-`      → `None`. Es el «non déterminé» de CIQUAL: nadie lo midió.
    - vacío    → `None`. Lo mismo, sin la raya.
    - `< 0,3`  → 0.15. Por debajo del límite de cuantificación: se guarda el
                 punto medio del intervalo [0, X], que es la regla del plan.
    - `traces` → 0.0, **no `None`**. Y esta es la única que merece explicación:
                 «traces» es un *resultado* de medición —alguien miró y la
                 cantidad es despreciable—, no una ausencia de medición.
                 Guardarlo como desconocido tiraría esa información y, con la
                 regla de sumas del día, un solo alimento con trazas de vitamina
                 C dejaría la vitamina C del día entera en «desconocido» cuando
                 lo que se sabe es que es casi nada. Decisión de usuario,
                 2026-08-31.

    Un `0` explícito es 0.0 y no `None`: es una medición, y decir «no se sabe»
    de algo que sí se sabe es tan falso como lo contrario.
    """
    if raw is None:
        return None
    # xlrd devuelve float en las celdas numéricas; el fichero casi no tiene,
    # pero una edición futura podría traerlas ya como número.
    if isinstance(raw, int | float):
        return float(raw)

    text = str(raw).strip()
    if text == "" or text == _NOT_DETERMINED:
        return None
    if text.lower() == _TRACES:
        return 0.0

    below = text.startswith("<")
    if below:
        text = text[1:].strip()

    for space in _SPACES:
        text = text.replace(space, "")
    text = text.replace(",", ".")

    try:
        value = float(text)
    except ValueError as exc:
        raise CiqualValueError(f"forma de valor desconocida: {raw!r}") from exc

    # El punto medio de [0, X]. `< 0,3` no es 0,3 ni es 0: es «algo entre nada y
    # 0,3», y 0,15 es el único número del intervalo que no elige un extremo.
    return value / 2 if below else value


_UNIT_SUFFIX = {"g": "g", "mg": "mg", "µg": "ug", "μg": "ug", "kj": "kj", "kcal": "kcal"}
# La unidad va en el ÚLTIMO paréntesis de la cabecera, y no puede buscarse con
# un paréntesis cualquiera: hay nombres con paréntesis dentro
# («AG 18:2 9c,12c (n-6), linoléique (g/100 g)»).
_UNIT_RE = re.compile(r"\(([^()]*?)/100\s*g\)\s*$")


def _fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text)
    ascii_only = "".join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", ascii_only.lower())).strip("_")


def nutrient_key(header: str) -> str:
    """Cabecera CIQUAL → clave estable para `nutrients_json`.

    `'Sodium (mg/100 g)'` → `'sodium_mg'`. La unidad se queda **en la clave**
    porque el valor es un número desnudo: sin ella, un día que sume hierro en mg
    con yodo en µg no tiene forma de saber que está sumando peras con manzanas.

    Sin traducir. Estas claves no se enseñan todavía (la fase 1 sólo pinta las
    cinco macros) y dejarlas en francés las mantiene rastreables hasta la
    columna exacta del fichero de origen.
    """
    match = _UNIT_RE.search(header)
    unit = _UNIT_SUFFIX.get(match.group(1).strip().lower(), "") if match else ""
    name = header[: match.start()] if match else header
    key = _fold(name)
    return f"{key}_{unit}" if unit else key


def measured_count(row: dict) -> int:
    """Cuántos nutrientes de la fila trae medidos.

    Es el desempate cuando un `alim_code` sale repetido: CIQUAL 2020 trae
    `Son de blé` dos veces con el código 9621, una fila vacía y otra con datos.
    Gana la que más ha medido.
    """
    return sum(
        1
        for header, raw in row.items()
        if header not in NON_NUTRIENT_COLUMNS and parse_value(raw) is not None
    )


def row_to_food(row: dict) -> dict:
    """Una fila de la hoja `compo` → los campos de una fila de `foods`.

    Devuelve un dict plano, sin tocar la base de datos: `nutrients` viene como
    dict y es el llamante quien decide serializarlo.
    """
    name = str(row[NAME_COLUMN]).strip()
    code = row[CODE_COLUMN]
    # xlrd lee los códigos como float (9621.0); el código es un entero.
    code = str(int(code)) if isinstance(code, float) else str(code).strip()

    macros = {field: parse_value(row.get(header)) for field, header in MACRO_COLUMNS.items()}
    nutrients = {
        nutrient_key(header): parse_value(raw)
        for header, raw in row.items()
        if header not in NON_NUTRIENT_COLUMNS and header not in MACRO_COLUMNS.values()
    }
    return {
        "name": name,
        "source": "ciqual",
        "source_ref": code,
        # La convención europea: la fibra no está dentro de los glúcidos.
        "carb_convention": "available",
        # Vacío es **sin clasificar**, no «ninguno»: 45 filas de CIQUAL no
        # tienen grupo, y una regla de verduras tiene que contarlas aparte.
        "group_code": str(row.get(GROUP_CODE_COLUMN, "")).strip() or None,
        "subgroup_code": str(row.get(SUBGROUP_CODE_COLUMN, "")).strip() or None,
        "nutrients": nutrients,
        **macros,
    }
