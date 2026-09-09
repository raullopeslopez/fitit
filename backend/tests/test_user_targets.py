"""El objetivo diario: se lee y se fija en el perfil, no en el día."""

import pytest
from pydantic import ValidationError

from app.schemas import UserTargetsIn


def test_a_new_account_has_no_target(client):
    me = client.get("/auth/me").json()
    assert me["objetivo_kcal"] is None
    assert me["objetivo_proteina"] is None


def test_setting_a_target_is_read_back(client):
    resp = client.patch(
        "/auth/me", json={"objetivo_kcal": 2800, "objetivo_proteina": 160}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["objetivo_kcal"] == 2800
    assert resp.json()["objetivo_proteina"] == 160
    assert client.get("/auth/me").json()["objetivo_kcal"] == 2800


def test_a_target_can_be_cleared_with_null(client):
    client.patch("/auth/me", json={"objetivo_kcal": 2800, "objetivo_proteina": 160})
    resp = client.patch("/auth/me", json={"objetivo_kcal": None, "objetivo_proteina": None})
    assert resp.status_code == 200, resp.text
    assert resp.json()["objetivo_kcal"] is None
    assert resp.json()["objetivo_proteina"] is None


def test_a_target_of_zero_is_rejected():
    """Cero no es un objetivo pequeño, es no comer nada: la misma frontera que
    `LogEntryIn.grams` usa para una cantidad."""
    with pytest.raises(ValidationError):
        UserTargetsIn(objetivo_kcal=0)


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
            "objetivo_kcal": 2600,
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
