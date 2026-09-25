"""Lo que dice haber encontrado el buscador, antes de guardarlo.

La búsqueda en la web va con `google_search`, y no está comprobado que Gemini
acepte a la vez esa herramienta y una respuesta forzada a JSON. Así que el JSON
se pide en el prompt y se lee a la defensiva: con vallas de markdown, con texto
alrededor, o sin forma ninguna.
"""

import pytest

from app.ideas import IdeasRefused, read_ideas

ONE = '{"ideas": [{"name": "Acelgas esparragadas", "url": "https://a.es/x", "method": "Sartén", "minutes": 30}]}'


def test_plain_json():
    (idea,) = read_ideas(ONE)
    assert idea.name == "Acelgas esparragadas"
    assert idea.url == "https://a.es/x"
    assert idea.method == "sartén"
    assert idea.minutes == 30


def test_fenced_json_with_chatter_around():
    (idea,) = read_ideas("Claro, aquí van:\n```json\n" + ONE + "\n```\nQue aproveche.")
    assert idea.url == "https://a.es/x"


def test_a_bare_list_is_accepted():
    (idea,) = read_ideas([{"name": "A", "url": "http://b.es/y"}])
    assert idea.minutes is None
    assert idea.method is None


@pytest.mark.parametrize("url", [None, "", "receta-inventada", "ftp://a.es/x", "javascript:alert(1)", "https://"])
def test_an_idea_without_a_web_link_is_dropped(url):
    assert read_ideas({"ideas": [{"name": "A", "url": url}]}) == []


# El buscador de Gemini cita sus fuentes con enlaces de redirección propios. Uno
# de esos no es la receta: no dice de qué web es, no se puede deduplicar —cada
# búsqueda da uno distinto para la misma receta— y caduca.
@pytest.mark.parametrize(
    "url",
    [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbF9wXE",
        "https://VertexAISearch.cloud.google.com/grounding-api-redirect/x",
    ],
)
def test_a_search_redirect_is_not_a_recipe_link(url):
    assert read_ideas({"ideas": [{"name": "A", "url": url}]}) == []


def test_minutes_that_are_not_a_duration_are_unknown_not_zero():
    ideas = read_ideas({"ideas": [
        {"name": "A", "url": "https://a.es/1", "minutes": 0},
        {"name": "B", "url": "https://a.es/2", "minutes": "40 min"},
        {"name": "C", "url": "https://a.es/3", "minutes": 9999},
    ]})
    assert [i.minutes for i in ideas] == [None, 40, None]


def test_the_same_link_twice_is_one_idea():
    ideas = read_ideas({"ideas": [
        {"name": "A", "url": "https://a.es/1"},
        {"name": "A con pan", "url": "https://a.es/1"},
    ]})
    assert [i.name for i in ideas] == ["A"]


@pytest.mark.parametrize("raw", ["Lo siento, no he encontrado nada.", "", None, 42, {"dishes": []}, '{"ideas": "x"}'])
def test_an_answer_without_a_list_is_refused(raw):
    with pytest.raises(IdeasRefused):
        read_ideas(raw)
