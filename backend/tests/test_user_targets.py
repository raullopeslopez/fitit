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
