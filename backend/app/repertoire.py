"""Lo que dice haber propuesto el modelo, convertido en algo que se sostiene.

Mismo papel que `label.py` para la etiqueta, y la misma postura: la salida de un
modelo no entra en el dominio sin pasar por sus puertas. Lo que cambia es cuál
es el riesgo.

En la etiqueta el riesgo son **las cifras**: un modelo que rellena con un cero
el nutriente que no encuentra inventa una medida que nadie va a desmentir. Aquí
no hay cifras que inventar, y no por confianza sino por construcción: el prompt
no pide ninguna y **esto no lee ninguna**. Un plato propuesto es una lista de
nombres y gramos; los macros los calcula `nutrition.py` sobre fichas reales del
catálogo. Eso es lo que hace seguro que un plato entre sin pasar por una
pantalla de revisión — y por eso hay un test que lo fija.

El riesgo que sí hay es **el nombre inventado**. Un alimento que no está en tu
catálogo no es un error que se corrija solo: es una ficha que habría que
escribir, y escribirla desde lo que dijo un modelo sí sería dato interpretado.
Así que esas propuestas no entran: se apartan, marcadas, al cajón de
sugerencias, que es donde vive la pantalla de revisión.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Lo que se puede hacer con un plato. Un modo que no esté aquí no se traduce ni
# se aproxima: se queda en nada, que es lo que significa «no lo sé».
METHODS = ("air_fryer", "plancha", "sarten", "horno", "cocido", "crudo")
BASES = ("raw", "cooked")
# Las cuatro comidas del día, como `MealSlot`. Una que no esté aquí se ignora.
SLOTS = ("desayuno", "comida", "cena", "snack")

# Gramos creíbles para un ingrediente de un plato. El suelo y el techo no son
# paranoia: son la misma postura que `_sane()` en `label.py` — una cifra
# imposible es ruido, y guardarla la convierte en un dato que hay que desmentir.
MIN_GRAMS = 1.0
MAX_GRAMS = 2000.0
MAX_SERVINGS = 20.0


class ProposalRefused(Exception):
    """La respuesta no tiene forma de propuesta, y no se adivina.

    Igual que `ColumnRefused` en `label.py`: cuando lo que llega no se puede
    leer, lo honesto es decirlo, no rellenar los huecos con lo que haya a mano.
    """


@dataclass(frozen=True)
class ProposedIngredient:
    """Un alimento propuesto, con el id que le corresponde en tu catálogo.

    `food_id` a `None` significa que no lo tienes — no que no exista.
    """

    food_name: str
    grams: float
    food_id: int | None


@dataclass(frozen=True)
class DishProposal:
    """Una propuesta de plato. **Ni un plato, ni una entrada.**

    Fíjate en lo que no hay aquí: ni kcal, ni proteína, ni un solo nutriente.
    No se han perdido por el camino — nunca se leyeron.
    """

    name: str
    method: str | None
    basis: str
    servings: float
    ingredients: list[ProposedIngredient] = field(default_factory=list)
    # Para qué comidas lo propone, en el orden del día. `None` es que no lo
    # dijo, y se lee como en un plato tuyo: «vale para cualquiera».
    slots: tuple[str, ...] | None = None

    @property
    def unknown(self) -> list[str]:
        """Los alimentos que nombra y no tienes, en el orden en que los nombró."""
        return [i.food_name for i in self.ingredients if i.food_id is None]

    @property
    def usable(self) -> bool:
        """Si puede guardarse sola. Con un alimento que no tienes, no."""
        return bool(self.ingredients) and not self.unknown


def _number(value) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _sane_grams(value) -> float | None:
    grams = _number(value)
    if grams is None or not (MIN_GRAMS <= grams <= MAX_GRAMS):
        return None
    return grams


def _text(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def _ingredients(raw, resolve) -> list[ProposedIngredient] | None:
    """Los ingredientes de un plato, o `None` si alguno no se lee.

    Un ingrediente ilegible no se salta: tira el plato entero. Un plato al que
    le falta un ingrediente no es el plato que propusieron, y guardarlo a medias
    sería inventarse una receta más corta.
    """
    ingredientes: list[ProposedIngredient] = []
    for item in raw.get("ingredients") or []:
        if not isinstance(item, dict):
            return None
        food_name = _text(item.get("food"))
        grams = _sane_grams(item.get("grams"))
        if not food_name or grams is None:
            return None
        ingredientes.append(
            ProposedIngredient(food_name=food_name, grams=grams, food_id=resolve(food_name))
        )
    return ingredientes or None


def _one(raw, resolve) -> DishProposal | None:
    """Una propuesta, o `None` si no se sostiene."""
    if not isinstance(raw, dict):
        return None
    name = _text(raw.get("name"))
    if not name:
        return None
    ingredientes = _ingredients(raw, resolve)
    if ingredientes is None:
        return None

    servings = _number(raw.get("servings"))
    if servings is None or not (0 < servings <= MAX_SERVINGS):
        servings = 1.0

    method = raw.get("method")
    basis = raw.get("basis")
    return DishProposal(
        name=name,
        # Un modo que no conocemos se queda en `None`. Aproximarlo al más
        # parecido sería inventarse cómo se cocina.
        method=method if method in METHODS else None,
        basis=basis if basis in BASES else "raw",
        servings=servings,
        ingredients=ingredientes,
        slots=_slots(raw.get("slots")),
    )


def _slots(raw) -> tuple[str, ...] | None:
    """Las comidas que dijo, sólo las que existen y en el orden del día. Una que
    no conocemos no se aproxima a la más parecida: se ignora."""
    if not isinstance(raw, list):
        return None
    dichas = {s.strip().lower() for s in raw if isinstance(s, str)}
    return tuple(s for s in SLOTS if s in dichas) or None


def read_proposals(payload, *, resolve) -> list[DishProposal]:
    """Valida lo que devolvió el modelo. Lanza `ProposalRefused` si no hay forma.

    `resolve(nombre) -> id | None` es quien dice si un alimento existe **para
    ti**; vive fuera para que esto no toque la base de datos y se pueda probar
    sin ella, igual que `label.py`.

    Una propuesta a la que le falle algo se descarta entera y en silencio: el
    modelo ha propuesto varias, y quedarse con las buenas es mejor que tirarlas
    todas por una.
    """
    if not isinstance(payload, dict):
        raise ProposalRefused("la respuesta no es un objeto")
    dishes = payload.get("dishes")
    if not isinstance(dishes, list):
        raise ProposalRefused("la respuesta no trae una lista de platos")

    propuestas = (_one(raw, resolve) for raw in dishes)
    return [propuesta for propuesta in propuestas if propuesta is not None]
