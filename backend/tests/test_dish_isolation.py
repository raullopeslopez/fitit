"""Un plato es de quien lo cocina.

`dishes.user_id` es NOT NULL y no hay catálogo compartido: al revés que en
`foods`, donde CIQUAL vive con `user_id IS NULL` y lo lee todo el mundo. Como en
el resto de la app, una negativa sobre el id de otro es un **404** y no un 403,
para que adivinar ids no confirme que una fila existe.
"""

import pytest


def _register(client, username: str, password: str = "s3cretpass") -> dict:
    resp = client.post("/auth/register", json={"username": username, "password": password})
    assert resp.status_code == 201, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture()
def alice_and_bob(unauthed_client):
    return unauthed_client, _register(unauthed_client, "alice"), _register(unauthed_client, "bob")


def _a_dish(client, headers, name="Lentejas de mi madre"):
    food = client.post(
        "/foods", json={"name": f"Lenteja de {name}", "kcal_100g": 116}, headers=headers
    ).json()
    resp = client.post(
        "/dishes",
        json={"name": name, "servings": 4, "ingredients": [{"food_id": food["id"], "grams": 400}]},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_bob_does_not_see_alices_dish(alice_and_bob):
    client, alice, bob = alice_and_bob
    _a_dish(client, alice)
    assert client.get("/dishes", headers=bob).json() == []


def test_bob_cannot_read_alices_dish_by_id(alice_and_bob):
    client, alice, bob = alice_and_bob
    dish = _a_dish(client, alice)
    assert client.get(f"/dishes/{dish['id']}", headers=bob).status_code == 404


def test_bob_cannot_correct_alices_dish(alice_and_bob):
    client, alice, bob = alice_and_bob
    dish = _a_dish(client, alice)
    resp = client.patch(f"/dishes/{dish['id']}", json={"servings": 8}, headers=bob)
    assert resp.status_code == 404
    # Y sigue intacto para Alice.
    assert client.get(f"/dishes/{dish['id']}", headers=alice).json()["servings"] == 4


def test_bob_cannot_log_alices_dish(alice_and_bob):
    client, alice, bob = alice_and_bob
    dish = _a_dish(client, alice)
    assert client.post(f"/dishes/{dish['id']}/log", json={"servings": 1}, headers=bob).status_code == 404


def test_a_dish_cannot_be_built_from_somebody_elses_food(alice_and_bob):
    """El plato nombra alimentos, y los alimentos también están acotados."""
    client, alice, bob = alice_and_bob
    food = client.post(
        "/foods", json={"name": "Piquillos de mi madre", "kcal_100g": 60}, headers=alice
    ).json()
    resp = client.post(
        "/dishes",
        json={"name": "Robo", "servings": 1, "ingredients": [{"food_id": food["id"], "grams": 50}]},
        headers=bob,
    )
    assert resp.status_code == 404


def test_two_people_can_have_a_dish_with_the_same_name(alice_and_bob):
    """La unicidad es por usuario: las lentejas de cada madre son distintas."""
    client, alice, bob = alice_and_bob
    _a_dish(client, alice)
    _a_dish(client, bob)
    assert len(client.get("/dishes", headers=alice).json()) == 1
    assert len(client.get("/dishes", headers=bob).json()) == 1
