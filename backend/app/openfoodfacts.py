"""Un código de barras, resuelto contra Open Food Facts.

La puerta barata. Un EAN identifica un producto mejor que ninguna foto y mejor
que ningún nombre, y consultarlo no cuesta clave, ni cuota, ni modelo — que es
justo lo que sí cuesta leer la etiqueta. El escáner existe para que la cámara
quede sólo donde OFF no llega: marca blanca sin ficha, panadería, granel.

La misma postura que con el modelo, por el mismo motivo: **lo que llega de
fuera no se cree, se comprueba**. OFF es una base colaborativa, así que sus
fichas vienen a medias con normalidad y un campo ausente no es un cero. Las
reglas de `app/label.py` valen aquí enteras, y este módulo es su gemelo para
una fuente distinta.

Lo que no hace: escribir. Devuelve una propuesta para el formulario de alta,
que sigue siendo la única puerta del catálogo.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import httpx

from app.nutrition import NUTRIENTS

API = "https://world.openfoodfacts.org/api/v2/product/{ean}.json"

# OFF lo pide en su documentación: una aplicación identificable, para poder
# distinguir el tráfico y avisar a quien la escribió si algo va mal. Mandar el
# User-Agent por defecto de la librería es lo que hace que te bloqueen.
USER_AGENT = "Fitit/1.0 (personal workout+food tracker; https://github.com/raullopeslopez/fitit)"

# Los campos por 100 g de OFF, ya normalizados por ellos. El de las kilocalorías
# se llama distinto que los demás y no se puede derivar de `energy_100g`, que
# viene en kJ.
OFF_FIELDS = {
    "kcal": "energy-kcal_100g",
    "protein": "proteins_100g",
    "fat": "fat_100g",
    "carbs": "carbohydrates_100g",
    "fiber": "fiber_100g",
}

# Un EAN es 8 o 13 dígitos (y 12 en el UPC americano, que OFF acepta igual).
EAN = re.compile(r"^\d{8}$|^\d{12,14}$")

# Cuándo lo de OFF no son gramos. `_100g` es el nombre del campo, no una
# promesa: en una bebida esas cifras son por 100 **ml**, y pasarlas a gramos
# necesita una densidad que la ficha no trae. Se rechaza, por lo mismo que se
# rechaza la columna «por 100 ml» de una etiqueta: entre guardar un número que
# no es el que dice ser y no guardar nada, no guardar nada.
LIQUID_UNITS = ("ml", "cl", "l", "litre", "litro")


class NotFound(Exception):
    """OFF no conoce ese código. No es un error: es un alimento que das de alta."""


class Unusable(Exception):
    """OFF lo conoce pero su ficha no sirve, y por qué.

    Separada de `NotFound` porque en pantalla no dicen lo mismo: una invita a
    teclear la etiqueta que tienes delante, la otra explica que el dato existía
    y no era de fiar.
    """

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


class Unreachable(Exception):
    """No se pudo preguntar. Sin red, OFF caído, una respuesta rara."""


@dataclass
class Scanned:
    """Una propuesta para el formulario. Ni un alimento, ni una entrada."""

    barcode: str
    name: str | None
    brand: str | None
    # '100g' o '100ml'. `_100g` es el nombre del campo en OFF, no una promesa:
    # en una bebida esas cifras son por 100 ml. Se aceptan y se marcan, igual
    # que la columna equivalente de una etiqueta — rechazarlas dejaba fuera
    # media nevera, y en un líquido acuoso la diferencia es del 3%.
    per: str
    nutrients: dict[str, float | None]


async def fetch(ean: str, *, timeout: float = 10.0) -> dict:
    """La ficha cruda de OFF, sin juzgarla."""
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            response = await client.get(API.format(ean=ean), headers={"User-Agent": USER_AGENT})
            response.raise_for_status()
            return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise Unreachable(str(exc)) from exc


def read_product(ean: str, payload: dict) -> Scanned:
    """Convierte la ficha de OFF en algo que se puede poner en el formulario.

    Lanza `NotFound` si no la conoce y `Unusable` si la conoce a medias — nunca
    devuelve ceros de relleno, que es la única forma de equivocarse aquí que no
    se puede deshacer después.
    """
    if not payload or payload.get("status") != 1:
        raise NotFound(ean)
    product = payload.get("product") or {}

    per = str(product.get("nutrition_data_per") or "").strip().lower()
    if per and per != "100g":
        # OFF sólo dice «100g» o «serving». Con lo segundo, sus campos `_100g`
        # pueden venir calculados o no venir: no hay forma de saber cuál, y
        # adivinarlo es escalar por un factor inventado.
        raise Unusable("por ración")
    nutrients = {}
    for nutrient, field in OFF_FIELDS.items():
        nutrients[nutrient] = _number((product.get("nutriments") or {}).get(field))

    # Sin kilocalorías la ficha no contesta a la pregunta por la que se escanea.
    # Los demás pueden faltar: faltarán como desconocidos, con su raya, igual
    # que en cualquier alimento que des de alta a medias.
    if nutrients["kcal"] is None:
        raise Unusable("sin kcal")

    return Scanned(
        barcode=ean,
        per="100ml" if _is_liquid(product) else "100g",
        name=_text(product.get("product_name")),
        brand=_text((product.get("brands") or "").split(",")[0]),
        nutrients=nutrients,
    )


def looks_like_a_barcode(value: str) -> bool:
    return bool(EAN.match(value.strip()))


def _is_liquid(product: dict) -> bool:
    unit = str(product.get("product_quantity_unit") or "").strip().lower()
    if unit in LIQUID_UNITS:
        return True
    quantity = str(product.get("quantity") or "").strip().lower()
    return bool(re.search(r"\d\s*(ml|cl|l)\b", quantity))


def _number(value) -> float | None:
    if value is None or isinstance(value, bool) or value == "":
        return None
    try:
        number = float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return None
    # Los mismos topes que la etiqueta: por encima no es un alimento raro, es
    # una ficha mal rellenada — y OFF las tiene, porque la rellena cualquiera.
    if number < 0 or number > 1000:
        return None
    return number


def _text(value) -> str | None:
    cleaned = " ".join(str(value or "").split())
    return cleaned or None


assert set(OFF_FIELDS) == set(NUTRIENTS), "los cinco nutrientes, ni uno más ni uno menos"
