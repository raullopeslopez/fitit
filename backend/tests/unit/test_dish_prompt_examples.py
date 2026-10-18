"""Lo que de verdad le llega al modelo al pedir platos: tus platos, por comida.

Los escenarios sustituyen al que propone, así que no ven el prompt. Esto llama
a `suggest_dishes` de verdad con el transporte cambiado, y mira el texto.
"""

import asyncio

from app import gemini


def _prompt(monkeypatch, **kwargs) -> str:
    enviado = {}

    async def ask(parts, **_):
        enviado["texto"] = parts[0]["text"]
        return {"dishes": []}

    monkeypatch.setattr(gemini, "_ask", ask)
    asyncio.run(gemini.suggest_dishes(foods=["Pollo"], api_key="k", model="m", **kwargs))
    return enviado["texto"]


def test_my_dishes_go_in_the_prompt_by_meal(monkeypatch):
    texto = _prompt(
        monkeypatch,
        examples={"comida": ["Pollo con arroz", "Lentejas"], "cualquiera": ["Tortilla"]},
    )
    assert "PLATOS QUE YA COCINO:" in texto
    assert "- Comida: Pollo con arroz; Lentejas" in texto
    assert "- Cualquier comida: Tortilla" in texto
    assert "en la línea de los que ya cocino" in texto


def test_without_dishes_the_prompt_says_nothing_about_them(monkeypatch):
    texto = _prompt(monkeypatch, examples={})
    assert "PLATOS QUE YA COCINO" not in texto
    assert "en la línea de los que ya cocino" not in texto


# Épica de cuatro comidas, fase 5.
def test_ideas_for_a_meal_say_which_meal(monkeypatch):
    texto = _prompt(monkeypatch, examples={"snack": ["Tostada con jamón"]}, slot="snack")
    assert "Todos los platos son para la merienda" in texto
    assert 'En "slots" pon sólo esa comida.' in texto


def test_what_i_said_no_to_is_named(monkeypatch):
    texto = _prompt(monkeypatch, slot="desayuno", avoid=["Taco de pollo"])
    assert "Nunca propongas estos platos ni nada parecido a ellos" in texto
    assert "Taco de pollo." in texto


def test_without_a_meal_nothing_changes(monkeypatch):
    texto = _prompt(monkeypatch, examples={})
    assert "Todos los platos son para" not in texto
    assert "Nunca propongas" not in texto
