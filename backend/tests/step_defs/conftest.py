"""Pasos que comparten varias features.

La compra de una semana (plan v2) se ve desde dos sitios: el envío a Taski la
abre y el ticket la cierra. Sus pasos viven aquí para que las dos features digan
lo mismo con las mismas palabras.
"""

from datetime import date, timedelta

import pytest
from pytest_bdd import given, then, when

from app.main import app
from app.taski import get_taski


def lunes_de_hoy() -> date:
    hoy = date.today()
    return hoy - timedelta(days=hoy.weekday())


class TaskiVacio:
    """Un Taski que acepta todo. Lo que importa aquí es que el envío salió bien."""

    def __init__(self):
        self.items = []

    async def listar(self) -> list[dict]:
        return list(self.items)

    async def anadir(self, item: dict) -> None:
        self.items.append({**item, "checked": False})


@pytest.fixture()
def taski_vacio():
    app.dependency_overrides[get_taski] = TaskiVacio
    yield
    app.dependency_overrides.pop(get_taski, None)


def _mandar(client):
    resp = client.post(f"/plans/{lunes_de_hoy().isoformat()}/shopping/taski", json={"skip_food_ids": []})
    assert resp.status_code == 200, resp.text


@given("that week's list was sent to Taski")
def given_sent(client, taski_vacio):
    _mandar(client)


@when("that week's list is sent to Taski again")
def when_sent_again(client, taski_vacio):
    _mandar(client)


def _compra(client):
    resp = client.get(f"/plans/{lunes_de_hoy().isoformat()}")
    assert resp.status_code == 200, resp.text
    return resp.json()["shopping"]


@then("that week is waiting for its ticket")
def then_waiting(client):
    compra = _compra(client)
    assert compra is not None
    assert compra["sent_at"] is not None
    assert compra["ticket_at"] is None


@then("that week is no longer waiting for its ticket")
def then_closed(client):
    compra = _compra(client)
    assert compra is not None
    assert compra["ticket_at"] is not None


@then("that week is not waiting for any ticket")
def then_nothing(client):
    assert _compra(client) is None
