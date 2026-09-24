"""El nombre de una línea de receta, contra una lista de alimentos.

Tres respuestas, y la pantalla dice cada una tal cual:

- **chosen**: hay uno claro. Se preselecciona, y se puede cambiar.
- **ambiguous**: hay varios, o uno que se parece sin ser seguro. «¿Cuál?», con
  hasta tres candidatos.
- **missing**: ninguno. «Falta: …». No se da de alta nada: una web no es un
  formulario que hayas rellenado.

Elegir por la persona es lo caro de equivocarse — un plato con las macros de la
patata frita de bolsa no avisa de nada —, así que «elegido» exige que el nombre
coincida entero con un alimento, y en la duda se pregunta.

Cómo se compara. Nada de FTS: se pliega con `fold_exercise_name()` como toda la
búsqueda del proyecto, se parte en palabras, se quitan las vacías («de», «al»)
y se pasa cada una a singular («acelgas» → «acelga», «piñones» → «piñon»). Un
alimento tiene dos maneras de llamarse así:

- su **cabeza**: el nombre hasta la primera coma, sin paréntesis («Patata,
  cocida (alimento medio)» → «patata»). Es como CIQUAL ordena sus nombres.
- sus **alias**: los que trae `food_aliases` («acelga», «acelgas»).

Coincidir por las dos cuenta más que por una: «acelgas» es la cabeza de tres
acelgas (cruda, cocida, penca) pero alias sólo de la cruda, y esa gana.

Lo crudo desempata sólo entre alimentos a los que el **alias** da ese nombre:
«ajo» es alias de «Ajo, crudo», «Ajo, asado» y «Ajo, salteado», y el crudo es
lo que se compra. Entre «Patata, cruda» y «Patata, cocida» sin alias, ser crudo
no basta: la receta puede pesar las patatas cocidas, y eso lo sabe quien la lee.

Si el nombre entero no coincide, se prueba por trozos («piñones tostados» →
«piñon»). Un trozo sólo **elige** si lo que se dejó fuera describe en vez de
nombrar («tostados», «picado», «diente de»); si no, ofrece: «caldo de pollo»
no es pollo. Y si ningún trozo coincide, se ofrecen los alimentos que
contienen todas las palabras (sin elegir nunca).

Función pura: la consulta que le trae los alimentos se escribe aparte.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field

from app.naming import fold_exercise_name

MAX_CANDIDATES = 3

_STOPWORDS = frozenset(
    {
        "de",
        "del",
        "la",
        "el",
        "los",
        "las",
        "lo",
        "con",
        "en",
        "y",
        "e",
        "al",
        "a",
        "o",
        "u",
        "para",
        "un",
        "una",
    }
)

# Lo que se puede quitar de un nombre y sigue siendo el mismo alimento. Plegado
# y en singular, como las palabras con las que se compara. «queso» está porque
# en «queso parmesano» lo que nombra es «parmesano»; «diente» porque «diente de
# ajo» es ajo.
_DESCRIPTIVE = frozenset(
    {
        "tostado",
        "tostada",
        "picado",
        "picada",
        "rallado",
        "rallada",
        "troceado",
        "troceada",
        "cortado",
        "cortada",
        "pelado",
        "pelada",
        "limpio",
        "limpia",
        "fresco",
        "fresca",
        "maduro",
        "madura",
        "grande",
        "pequeno",
        "pequena",
        "mediano",
        "mediana",
        "entero",
        "entera",
        "laminado",
        "laminada",
        "molido",
        "molida",
        "triturado",
        "triturada",
        "fino",
        "fina",
        "finamente",
        "dado",
        "juliana",
        "rodaja",
        "tira",
        "hoja",
        "rama",
        "diente",
        "queso",
        "virgen",
        "extra",
        "bueno",
        "buena",
        "calidad",
    }
)

_RAW = frozenset({"crudo", "cruda"})
_PARENS = re.compile(r"\([^()]*\)")


@dataclass(frozen=True)
class FoodCandidate:
    """Lo mínimo de un alimento para compararlo. Una fila `Food` también sirve."""

    id: int
    name: str
    aliases: tuple[str, ...] = ()


@dataclass(frozen=True)
class IngredientMatch:
    status: str  # "chosen" | "ambiguous" | "missing"
    food_id: int | None
    # Ids, del más probable al menos, hasta `MAX_CANDIDATES`. Con «chosen» es
    # `[food_id]`; con «missing», vacía.
    candidates: list[int] = field(default_factory=list)


def match_ingredient(name: str, foods: Iterable) -> IngredientMatch:
    """`foods`: cualquier cosa con `id`, `name` y `aliases` (cadenas u objetos
    con `.alias`, como `FoodAlias`)."""
    query = _tokens(name)
    if not query:
        return IngredientMatch("missing", None, [])
    indexed = [_Indexed.of(food) for food in foods]

    for length in range(len(query), 0, -1):
        found = []
        for start in range(len(query) - length + 1):
            piece = query[start : start + length]
            hits = [hit for food in indexed if (hit := food.exact(piece))]
            if hits:
                dropped = query[:start] + query[start + length :]
                found.append((all(word in _DESCRIPTIVE for word in dropped), hits))
        if found:
            # Entre trozos del mismo largo: primero el que deja fuera sólo
            # descripción («queso parmesano» → «parmesano», no «queso»), y
            # luego el más concreto, el que menos alimentos toca.
            may_choose, hits = min(found, key=lambda f: (not f[0], len(f[1])))
            return _resolve(hits, may_choose)

    wanted = set(query)
    containing = [_Hit(food, 0) for food in indexed if wanted <= food.words]
    if containing:
        return _resolve(containing, may_choose=False)
    return IngredientMatch("missing", None, [])


@dataclass(frozen=True)
class _Hit:
    food: _Indexed
    # 2: cabeza y alias; 1: sólo uno de los dos; 0: sólo contiene las palabras.
    score: int
    by_alias: bool = False

    @property
    def raw_by_alias(self) -> bool:
        return self.by_alias and self.food.raw


@dataclass(frozen=True)
class _Indexed:
    id: int
    name: str
    head: tuple[str, ...]
    aliases: frozenset[tuple[str, ...]]
    words: frozenset[str]
    raw: bool
    generic: bool

    @classmethod
    def of(cls, food) -> _Indexed:
        name = food.name
        aliases = frozenset(
            tokens
            for tokens in (_tokens(_alias_text(a)) for a in getattr(food, "aliases", ()) or ())
            if tokens
        )
        name_words = _tokens(name)
        head = _tokens(_PARENS.sub(" ", name).split(",", 1)[0])
        words = frozenset(name_words).union(*aliases) if aliases else frozenset(name_words)
        return cls(
            id=food.id,
            name=name,
            head=head,
            aliases=aliases,
            words=words,
            raw=bool(_RAW & set(name_words)),
            # CIQUAL marca así su entrada promedio: la más razonable a ofrecer.
            generic="alimento medio" in fold_exercise_name(name),
        )

    def exact(self, piece: tuple[str, ...]) -> _Hit | None:
        by_head = piece == self.head
        by_alias = piece in self.aliases
        if not (by_head or by_alias):
            return None
        return _Hit(self, int(by_head) + int(by_alias), by_alias)


def _resolve(hits: list[_Hit], may_choose: bool) -> IngredientMatch:
    top_score = max(hit.score for hit in hits)
    top = [hit for hit in hits if hit.score == top_score]
    winner = None
    if len(top) == 1:
        winner = top[0]
    else:
        raw_by_alias = [hit for hit in top if hit.raw_by_alias]
        if len(raw_by_alias) == 1:
            winner = raw_by_alias[0]
    if winner is not None and may_choose:
        return IngredientMatch("chosen", winner.food.id, [winner.food.id])

    ordered = sorted(
        hits,
        key=lambda h: (
            h is not winner,
            -h.score,
            not h.food.raw,
            not h.food.generic,
            len(h.food.name),
            h.food.name,
        ),
    )
    return IngredientMatch("ambiguous", None, [h.food.id for h in ordered[:MAX_CANDIDATES]])


def _alias_text(alias) -> str:
    return alias if isinstance(alias, str) else getattr(alias, "alias", "")


def _tokens(text: str) -> tuple[str, ...]:
    folded = re.sub(r"[^a-z0-9]+", " ", fold_exercise_name(text or ""))
    return tuple(_singular(word) for word in folded.split() if word not in _STOPWORDS)


def _singular(word: str) -> str:
    """Plural español a singular, lo bastante bien para comparar.

    Se aplica igual a los dos lados, así que basta con que sea consistente:
    «nueces» → «nuez», «piñones» → «pinon», «tomates» → «tomate», «acelgas» →
    «acelga».
    """
    if len(word) <= 3:
        return word
    if word.endswith("ces"):
        return word[:-3] + "z"
    if word.endswith("es") and word[-3] in "lnrdjy":
        return word[:-2]
    if word.endswith("s") and word[-2] in "aeiou":
        return word[:-1]
    return word
