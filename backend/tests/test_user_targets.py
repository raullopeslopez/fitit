"""El objetivo diario: se lee y se fija en el perfil, no en el día."""

import pytest
from pydantic import ValidationError

from app.schemas import UserTargetsIn


def test_a_new_account_has_no_target(client):
    me = client.get("/auth/me").json()
    assert me["objetivo_kcal"] is None
    assert me["objetivo_proteina"] is None


def test_setting_a_target_is_read_back(client):
    resp = client.patch("/auth/me", json={"objetivo_proteina": 160})
    assert resp.status_code == 200, resp.text
    assert resp.json()["objetivo_proteina"] == 160
    assert client.get("/auth/me").json()["objetivo_proteina"] == 160


def test_a_target_can_be_cleared_with_null(client):
    client.patch("/auth/me", json={"objetivo_proteina": 160})
    resp = client.patch("/auth/me", json={"objetivo_proteina": None})
    assert resp.status_code == 200, resp.text
    assert resp.json()["objetivo_proteina"] is None
    assert resp.json()["objetivo_kcal"] is None


# Las kcal son **consecuencia**, no entrada.
#
# Se fijaban aparte, y eso dejaba fijar un total que sus propios macros no daban:
# 2.600 kcal con 160 g de proteína, 300 de hidratos y 80 de grasa son 2.560, y la
# pantalla enseñaba las dos cifras sin que nada dijera cuál mandaba. Ahora se
# reparte en gramos y el total sale de ahí, por los mismos factores con los que
# se comprueba una etiqueta (`atwater_kcal`).
def test_kcal_are_derived_from_the_macros(client):
    resp = client.patch(
        "/auth/me",
        json={"objetivo_proteina": 160, "objetivo_hidratos": 300, "objetivo_grasa": 80},
    )
    assert resp.status_code == 200, resp.text
    # 4·160 + 4·300 + 9·80
    assert resp.json()["objetivo_kcal"] == 2560


def test_kcal_cannot_be_set_by_hand(client):
    """Mandarlas no las fija: el servidor las vuelve a derivar de los macros."""
    resp = client.patch(
        "/auth/me", json={"objetivo_kcal": 9999, "objetivo_proteina": 160}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["objetivo_kcal"] == 640


def test_without_macros_there_is_no_total(client):
    """Sin un solo macro fijado no hay reparto, y por tanto no hay total. Cero
    diría «tu objetivo es no comer», que es otra afirmación."""
    resp = client.patch("/auth/me", json={})
    assert resp.json()["objetivo_kcal"] is None


def test_a_target_of_zero_is_rejected():
    """Cero no es un objetivo pequeño, es no comer nada: la misma frontera que
    `LogEntryIn.grams` usa para una cantidad."""
    with pytest.raises(ValidationError):
        UserTargetsIn(objetivo_proteina=0)


def test_me_requires_auth(unauthed_client):
    assert unauthed_client.get("/auth/me").status_code == 401


# Los cuatro macros, no dos.
#
# La cabecera de Comida pinta lo que falta de cada uno, y sin objetivo no hay
# nada que faltar: una barra sin meta no mide nada. Grasa e hidratos entran por
# la misma puerta que ya usaban kcal y proteína, con la misma regla de nulos —
# `None` es «no lo has fijado», y cero se rechaza porque cero no es un objetivo
# pequeño, es no comer.
def test_a_new_account_has_no_macro_targets(client):
    me = client.get("/auth/me").json()
    assert me["objetivo_grasa"] is None
    assert me["objetivo_hidratos"] is None


def test_the_four_targets_are_read_back(client):
    resp = client.patch(
        "/auth/me",
        json={
            "objetivo_proteina": 160,
            "objetivo_grasa": 80,
            "objetivo_hidratos": 300,
        },
    )
    assert resp.status_code == 200, resp.text
    me = client.get("/auth/me").json()
    assert me["objetivo_grasa"] == 80
    assert me["objetivo_hidratos"] == 300


def test_a_macro_target_of_zero_is_rejected():
    with pytest.raises(ValidationError):
        UserTargetsIn(objetivo_grasa=0)
    with pytest.raises(ValidationError):
        UserTargetsIn(objetivo_hidratos=0)
