"""Una ficha de Open Food Facts, convertida en una fila del catálogo del súper.

Puro: ni red ni base. Lo usa `scripts/import_off.py`, y por eso se puede probar
entero sin una cosa ni la otra.

**La validación es la del escáner, no una segunda.** `read_product` ya decide
qué ficha de Open Food Facts vale —cifras por 100 g, con kcal, sin ceros de
relleno—, y un producto que el escáner rechazaría tampoco entra por aquí. Encima
va la comprobación que el escáner no necesita y el catálogo sí: allí la cifra la
mira alguien antes de comer con ella; aquí entra en miles de búsquedas sin que
nadie la lea. Si las macros no cuadran con las kcal, la ficha está mal rellenada
y se queda fuera. `NULL` no es `0`: un nutriente que la ficha no trae entra
como desconocido.
"""

from __future__ import annotations

import re

from app.openfoodfacts import NotFound, Unusable, read_product

# Cuánto pueden separarse las kcal declaradas de las que salen de las macros
# (4 por gramo de proteína e hidrato, 9 por gramo de grasa) antes de dar la
# ficha por mal rellenada. La fibra, los polioles y el redondeo de la etiqueta
# separan unas pocas kcal; el «lomo» con 40 g de proteína y 117 kcal que hay en
# OFF separa 60.
TOLERANCIA_ABS = 25
TOLERANCIA_REL = 0.25

_GRAMOS = re.compile(r"(\d+(?:[.,]\d+)?)\s*g\b", re.IGNORECASE)


def coherente(protein, carbs, fat, kcal) -> bool:
    """Si las macros explican las kcal. Con alguna desconocida no hay suma que
    hacer, y la ficha no se juzga: entra con su raya."""
    if None in (protein, carbs, fat, kcal):
        return True
    calculadas = 4 * protein + 4 * carbs + 9 * fat
    return abs(calculadas - kcal) <= max(TOLERANCIA_ABS, TOLERANCIA_REL * kcal)


def serving_portion(texto: str | None) -> tuple[str, float] | None:
    """La ración de la etiqueta como medida casera: `("1 tarrina", 125.0)`.

    Sólo si viene en gramos. «250 ml» necesitaría una densidad que la ficha no
    trae, y «1 unidad» no dice cuánto pesa: en los dos casos, nada.
    """
    texto = " ".join(str(texto or "").split())
    gramos = _GRAMOS.search(texto)
    if not gramos:
        return None
    peso = float(gramos.group(1).replace(",", "."))
    if peso <= 0:
        return None
    # «1 tarrina (125 g)» → «1 tarrina». Si lo único que hay es el peso, la
    # etiqueta no dice de qué es la ración, y se llama ración.
    etiqueta = texto.split("(")[0].strip() if "(" in texto else ""
    if not etiqueta or _GRAMOS.fullmatch(etiqueta):
        etiqueta = "1 ración"
    return etiqueta, peso


def product_to_food(product: dict) -> dict | None:
    """La fila para `foods`, o `None` si la ficha no vale."""
    code = str(product.get("code") or "").strip()
    # El buscador de OFF da las marcas como lista; la ficha por producto, la
    # que lee el escáner, como texto separado por comas. Se habla el idioma de
    # la ficha para que `read_product` no tenga que saber de dónde vino.
    if isinstance(product.get("brands"), list):
        product = {**product, "brands": ", ".join(product["brands"])}
    try:
        leida = read_product(code, {"status": 1, "product": product})
    except (NotFound, Unusable):
        return None
    if not code or not leida.name:
        return None

    n = leida.nutrients
    if not coherente(n["protein"], n["carbs"], n["fat"], n["kcal"]):
        return None

    return {
        "barcode": code,
        "source_ref": code,
        "name": leida.name,
        "brand": leida.brand,
        "kcal_100g": n["kcal"],
        "protein_100g": n["protein"],
        "fat_100g": n["fat"],
        "carbs_100g": n["carbs"],
        "fiber_100g": n["fiber"],
        "portion": serving_portion(product.get("serving_size")),
    }
