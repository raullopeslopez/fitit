"""Un plan es de quien se lo va a comer.

Misma forma que `test_dish_isolation.py`, y por lo mismo: una negativa sobre la
semana de otro es un **404** y no un 403, para que adivinar fechas no confirme
que un plan existe.
"""

import pytest

LUNES = "2026-09-21"


def _register(client, username: str, password: str = "s3cretpass") -> dict:
    resp = client.post("/auth/register", json={"username": username, "password": password})
    assert resp.status_code == 201, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture()
def alice_and_bob(unauthed_client):
    return unauthed_client, _register(unauthed_client, "alice"), _register(unauthed_client, "bob")


def _a_plan(client, headers, cuantos=8):
    food = client.post(
        "/foods",
        json={"name": f"Pollo de {headers['Authorization'][-6:]}", "kcal_100g": 165},
        headers=headers,
    ).json()
    for i in range(cuantos):
        resp = client.post(
            "/dishes",
            json={
                "name": f"Plato {i}",
                "servings": 1,
                "ingredients": [{"food_id": food["id"], "grams": 150}],
            },
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
    resp = client.post("/plans", json={"week_start": LUNES}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_bob_does_not_see_alices_week(alice_and_bob):
    client, alice, bob = alice_and_bob
    _a_plan(client, alice)
    assert client.get(f"/plans/{LUNES}", headers=bob).status_code == 404


def test_bobs_week_is_built_from_bobs_dishes(alice_and_bob):
    """Y no de los de Alice: el repertorio se lee por usuario, no por id suelto."""
    client, alice, bob = alice_and_bob
    de_alice = _a_plan(client, alice)
    de_bob = _a_plan(client, bob)
    suyos = {e["dish_id"] for e in de_alice["entries"]}
    assert not (suyos & {e["dish_id"] for e in de_bob["entries"]})


def test_bob_cannot_generate_a_week_with_no_dishes(alice_and_bob):
    """Sin repertorio no hay plan, y se dice — no es un 500."""
    client, _alice, bob = alice_and_bob
    resp = client.post("/plans", json={"week_start": LUNES}, headers=bob)
    assert resp.status_code == 422
    assert "platos" in resp.json()["detail"]["motivo"]
