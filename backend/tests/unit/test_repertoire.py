"""Lo que el modelo dice haber propuesto, convertido en algo que se sostiene.

Mismo sitio que `test_label.py` ocupa para la etiqueta: aquí no hay red, ni
clave, ni cuota. Lo que se comprueba es qué hace el backend **con lo que el
modelo conteste**, que es donde está todo el riesgo.

La defensa que más importa es la última: el modelo propone *qué combinar* y
nunca *cuánto suma*. Es eso —y no una promesa en el prompt— lo que hace seguro
que un plato propuesto entre sin pasar por una pantalla de revisión.
"""

import pytest

from app.repertoire import ProposalRefused, read_proposals

CATALOGO = {"pollo, pechuga, cruda": 11, "arroz blanco cocido": 9, "aceite de oliva": 5}


def resolve(name: str) -> int | None:
    return CATALOGO.get(name.strip().lower())


def _payload(**dish):
    base = {
        "name": "Pechuga a la air fryer",
        "method": "air_fryer",
        "basis": "raw",
        "servings": 1,
        "ingredients": [{"food": "Pollo, pechuga, cruda", "grams": 200}],
    }
    base.update(dish)
    return {"dishes": [base]}


def test_una_propuesta_con_todo_en_el_catalogo_es_utilizable():
    (propuesta,) = read_proposals(_payload(), resolve=resolve)
    assert propuesta.usable
    assert propuesta.unknown == []
    assert propuesta.ingredients[0].food_id == 11


def test_un_alimento_que_no_tienes_no_tumba_la_propuesta_pero_la_aparta():
    payload = _payload(
        ingredients=[
            {"food": "Pollo, pechuga, cruda", "grams": 200},
            {"food": "Tofu ahumado", "grams": 100},
        ]
    )
    (propuesta,) = read_proposals(payload, resolve=resolve)
    assert not propuesta.usable
    assert propuesta.unknown == ["Tofu ahumado"]


# La defensa que lo sostiene todo.
def test_las_cifras_de_nutrientes_que_mande_el_modelo_se_ignoran():
    payload = _payload(kcal=9999, protein=500, nutrients={"kcal": 1})
    (propuesta,) = read_proposals(payload, resolve=resolve)
    assert not hasattr(propuesta, "kcal")
    assert "kcal" not in propuesta.__dict__


def test_un_plato_sin_ingredientes_no_es_un_plato():
    assert read_proposals(_payload(ingredients=[]), resolve=resolve) == []


def test_un_plato_sin_nombre_se_descarta():
    assert read_proposals(_payload(name="  "), resolve=resolve) == []


@pytest.mark.parametrize("grams", [0, -5, 9000, "mucho", None])
def test_unos_gramos_imposibles_descartan_el_ingrediente(grams):
    payload = _payload(ingredients=[{"food": "Pollo, pechuga, cruda", "grams": grams}])
    assert read_proposals(payload, resolve=resolve) == []


def test_un_metodo_que_no_existe_se_queda_en_nada_y_no_inventa_otro():
    (propuesta,) = read_proposals(_payload(method="sous_vide"), resolve=resolve)
    assert propuesta.method is None


def test_una_base_rara_cae_a_crudo_porque_es_lo_que_dice_la_lista():
    (propuesta,) = read_proposals(_payload(basis="al gusto"), resolve=resolve)
    assert propuesta.basis == "raw"


def test_unas_raciones_imposibles_caen_a_una():
    (propuesta,) = read_proposals(_payload(servings=0), resolve=resolve)
    assert propuesta.servings == 1


def test_una_respuesta_que_no_trae_platos_se_rechaza_en_vez_de_adivinar():
    with pytest.raises(ProposalRefused):
        read_proposals({"resultado": "ok"}, resolve=resolve)


def test_y_una_que_no_es_un_objeto_tampoco():
    with pytest.raises(ProposalRefused):
        read_proposals(["pollo"], resolve=resolve)


# --- para qué comidas, y cuánta proteína (catálogo del súper) --------------------

from app.nutrition import proteina_minima  # noqa: E402
from app.repertoire import read_proposals as _leer  # noqa: E402


def _con_slots(slots):
    return {"dishes": [{"name": "Plato", "ingredients": [{"food": "Pollo", "grams": 200}], "slots": slots}]}


def test_las_comidas_propuestas_salen_en_el_orden_del_dia():
    (p,) = _leer(_con_slots(["cena", "Comida"]), resolve=lambda n: 1)
    assert p.slots == ("comida", "cena")


def test_una_comida_que_no_existe_se_ignora():
    (p,) = _leer(_con_slots(["merienda", "cena"]), resolve=lambda n: 1)
    assert p.slots == ("cena",)


def test_sin_comidas_dichas_es_ninguna_dicha():
    (p,) = _leer(_con_slots("comida"), resolve=lambda n: 1)
    assert p.slots is None


def test_el_minimo_es_el_20_por_ciento_en_comida_y_cena():
    assert proteina_minima(202, ("comida",)) == 40.4
    assert proteina_minima(202, ("desayuno", "cena")) == 40.4


def test_desayuno_y_merienda_no_tienen_minimo():
    assert proteina_minima(202, ("desayuno", "snack")) is None


def test_sin_comidas_dichas_se_juzga_como_principal():
    assert proteina_minima(200, None) == 40.0


def test_sin_objetivo_no_hay_minimo():
    assert proteina_minima(None, ("comida",)) is None
