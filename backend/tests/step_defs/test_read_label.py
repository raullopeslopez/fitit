"""Qué hace el backend con lo que conteste el modelo.

Ninguno de estos escenarios llama a Gemini. La dependencia se sustituye por una
función que devuelve lo que queramos, porque lo que hay que fijar aquí no es si
el modelo lee bien —eso se ve usándolo, con la etiqueta delante— sino qué pasa
cuando lee mal, que es lo que no se ve.
"""

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

from app.gemini import LabelUnreadable
from app.main import app
from app.routers.foods import get_label_reader

scenarios("../features/read_label.feature")


CLEAN = {
    "name": "Yogur natural",
    "brand": "Hacendado",
    "column_header": "por 100 g",
    "rows": [
        "Valor energético 61 kcal",
        "Grasas 3,2 g",
        "Hidratos de carbono 4,5 g",
        "Fibra alimentaria 0,3 g",
        "Proteínas 3,8 g",
    ],
    "nutrients": {"kcal": 61, "fat": 3.2, "carbs": 4.5, "fiber": 0.3, "protein": 3.8},
}


def _install(payload=None, *, fails=False, configured=True, quota=None):
    if not configured:
        app.dependency_overrides[get_label_reader] = lambda: None
        return

    async def reader(image: bytes, mime_type: str) -> dict:
        if quota:
            raise LabelUnreadable("429", quota=quota)
        if fails:
            raise LabelUnreadable("no contestó")
        return payload

    app.dependency_overrides[get_label_reader] = lambda: reader


@pytest.fixture(autouse=True)
def _clear_reader():
    yield
    app.dependency_overrides.pop(get_label_reader, None)


@given(
    parsers.parse('the camera reads a clean "{header}" label for "{name}" of "{brand}"'),
)
def given_clean_label(header, name, brand):
    _install({**CLEAN, "column_header": header, "name": name, "brand": brand})


@given("the camera reads a label whose table says nothing about fibre")
def given_no_fibre_row():
    """La trampa: la tabla no habla de fibra y el modelo manda un 0 igualmente."""
    rows = [row for row in CLEAN["rows"] if "Fibra" not in row]
    _install({**CLEAN, "rows": rows, "nutrients": {**CLEAN["nutrients"], "fiber": 0}})


@given(parsers.parse('the camera reads the "{header}" column'))
def given_wrong_column(header):
    _install({**CLEAN, "column_header": header})


@given("the camera cannot read the photo at all")
def given_unreadable():
    _install(fails=True)


@given("the label reader is not configured")
def given_unconfigured():
    _install(configured=False)


@given("the camera has run out of requests for this minute")
def given_minute_quota():
    _install(quota="minute")


@given("the camera has run out of requests for today")
def given_day_quota():
    _install(quota="day")


@when("I photograph a label", target_fixture="response")
def when_photograph(client):
    return client.post(
        "/foods/label",
        files={
            "photo": ("etiqueta.jpg", b"\xff\xd8\xff\xe0 no es una foto de verdad", "image/jpeg")
        },
    )


@then(parsers.parse('the form comes back holding "{name}" of "{brand}"'))
def then_name_and_brand(response, name, brand):
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == name
    assert body["brand"] == brand


@then(parsers.parse('it says the figures came from "{header}"'))
def then_header(response, header):
    assert response.json()["column_header"] == header


@then(parsers.parse("it proposes {kcal:d} kcal per 100 g"))
def then_kcal(response, kcal):
    assert response.json()["nutrients"]["kcal"] == kcal


@then("the proposed fibre is unknown, not zero")
def then_fibre_unknown(response):
    assert response.json()["nutrients"]["fiber"] is None


@then("the form is told fibre was dropped")
def then_fibre_dropped(response):
    """Sin esto el hueco es mudo, y un hueco mudo se lee como «la etiqueta no lo
    declara» — que aquí es justo lo contrario de lo que ha pasado."""
    assert "fiber" in response.json()["dropped"]


@then("the other figures still come through")
def then_rest_survives(response):
    nutrients = response.json()["nutrients"]
    assert nutrients["kcal"] == 61
    assert nutrients["protein"] == 3.8


@then("nothing is proposed")
def then_nothing(response):
    assert response.status_code == 200, response.text
    assert all(value is None for value in response.json()["nutrients"].values())


@then(parsers.parse('it says the column it refused was "{header}"'))
def then_refused_column(response, header):
    body = response.json()
    assert body["refusal"] == "column"
    assert body["refused_column"] == header


@then("it says the photo was unreadable")
def then_unreadable(response):
    assert response.json()["refusal"] == "unreadable"


@then(parsers.parse('the catalogue still does not have "{name}"'))
def then_not_created(client, name):
    """La regla de siempre: leer no es dar de alta. La única puerta del catálogo
    sigue siendo un formulario que alguien rellenó."""
    assert client.get(f"/foods?q={name}").json() == []


@then("the app says the reader is switched off")
def then_switched_off(response):
    assert response.status_code == 503


@then("it says to wait a minute rather than to come back tomorrow")
def then_minute_quota(response):
    body = response.json()
    assert body["refusal"] == "quota"
    assert body["quota_scope"] == "minute"


@then("it says the day's allowance is gone")
def then_day_quota(response):
    body = response.json()
    assert body["refusal"] == "quota"
    assert body["quota_scope"] == "day"


@given("the camera reads a label whose calories do not match its macros")
def given_mismatch():
    """Un dígito mal leído: 3,8 g de proteína transcritos como 8,8.

    La fila existe, el número es plausible y la columna es la buena, así que
    ningún otro filtro lo ve. Lo delata que las cifras de una etiqueta no son
    independientes: 4·8,8 + 9·3,2 + 4·4,5 + 2·0,3 son 83, no 61.
    """
    _install(
        {
            **CLEAN,
            "rows": [*CLEAN["rows"][:-1], "Proteínas 8,8 g"],
            "nutrients": {**CLEAN["nutrients"], "protein": 8.8},
        }
    )


@then("the form still comes back filled in")
def then_still_filled(response):
    """Avisa, no rechaza: el producto puede llevar polioles y la etiqueta puede
    redondear raro. Quien mira el envase decide; esto sólo le da el motivo."""
    assert response.json()["nutrients"]["kcal"] == 61


@then(
    parsers.parse(
        "it warns that {declared:d} declared kcal do not match the {computed:d} the macros make"
    )
)
def then_mismatch(response, declared, computed):
    off = response.json()["mismatch"]
    assert off is not None, "no ha saltado el descuadre"
    assert off["declared"] == declared
    assert round(off["computed"]) == computed
