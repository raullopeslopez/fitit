"""Foods and the diary are scoped like everything else here.

Two kinds of row live in `foods`, and they are scoped differently on purpose:
the shared catalogue (user_id NULL) is measurements everyone reads, and a food
you typed is yours alone. The diary is never shared. As elsewhere, a denial on
somebody else's id is a 404, so guessing ids cannot confirm a row exists.
"""

import pytest

from app.models import Food


def _register(client, username: str, password: str = "s3cretpass") -> dict:
    resp = client.post("/auth/register", json={"username": username, "password": password})
    assert resp.status_code == 201, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture()
def alice_and_bob(unauthed_client):
    return unauthed_client, _register(unauthed_client, "alice"), _register(unauthed_client, "bob")


def test_bob_does_not_see_alices_food(alice_and_bob):
    client, alice, bob = alice_and_bob
    client.post("/foods", json={"name": "Piquillos de mi madre", "kcal_100g": 60}, headers=alice)
    assert client.get("/foods?q=piquillos", headers=bob).json() == []


def test_bob_cannot_read_or_correct_alices_food(alice_and_bob):
    client, alice, bob = alice_and_bob
    food = client.post("/foods", json={"name": "Pan", "kcal_100g": 250}, headers=alice).json()
    assert client.get(f"/foods/{food['id']}", headers=bob).status_code == 404
    assert (
        client.patch(f"/foods/{food['id']}", json={"kcal_100g": 1}, headers=bob).status_code == 404
    )


def test_bob_cannot_log_alices_food(alice_and_bob):
    client, alice, bob = alice_and_bob
    food = client.post("/foods", json={"name": "Pan", "kcal_100g": 250}, headers=alice).json()
    resp = client.post("/food-log", json={"food_id": food["id"], "grams": 100}, headers=bob)
    assert resp.status_code == 404


def test_bob_does_not_see_alices_diary(alice_and_bob):
    client, alice, bob = alice_and_bob
    food = client.post("/foods", json={"name": "Pan", "kcal_100g": 250}, headers=alice).json()
    entry = client.post(
        "/food-log",
        json={"food_id": food["id"], "grams": 100, "logged_at": "2026-08-31T09:00:00+02:00"},
        headers=alice,
    ).json()
    assert client.get("/food-log?date=2026-08-31", headers=bob).json()["entries"] == []
    assert (
        client.patch(f"/food-log/{entry['id']}", json={"grams": 1}, headers=bob).status_code == 404
    )
    assert client.delete(f"/food-log/{entry['id']}", headers=bob).status_code == 404


def test_recomputing_a_day_never_reaches_another_persons_diary(alice_and_bob):
    # El endpoint que rehace entradas es el único que reescribe el diario, así
    # que es el que más importa que esté atado al dueño por los dos lados: el
    # alimento y las entradas.
    client, alice, bob = alice_and_bob
    resp = client.post("/foods", json={"name": "Pan", "kcal_100g": 250}, headers=alice)
    food_id = resp.json()["id"]
    client.post(
        "/food-log",
        json={"food_id": food_id, "grams": 100, "logged_at": "2026-09-08T14:00:00+02:00"},
        headers=alice,
    )
    client.patch(f"/foods/{food_id}", json={"kcal_100g": 900}, headers=alice)
    # Para Bob ese alimento no existe, así que tampoco existe el día que rehacer.
    assert (
        client.post(
            "/food-log/recompute",
            json={"food_id": food_id, "date": "2026-09-08"},
            headers=bob,
        ).status_code
        == 404
    )
    assert client.get("/food-log?date=2026-09-08", headers=alice).json()["totals"]["kcal"] == 250


async def _seed_catalogue(sessionmaker, name: str) -> int:
    """A shared-catalogue row, which is what the CIQUAL import will write.

    Seeded out of band on purpose: no HTTP endpoint may create one. Nothing in
    this project writes to `foods` without a user confirming it, and the import
    is a script that runs once, not a request.
    """
    async with sessionmaker() as session:
        food = Food(
            user_id=None,
            name=name,
            name_folded=name.lower(),
            source="ciqual",
            carb_convention="available",
            kcal_100g=130,
        )
        session.add(food)
        await session.commit()
        await session.refresh(food)
        return food.id


def test_the_shared_catalogue_is_readable_by_everyone(alice_and_bob, db_sessionmaker):
    import asyncio

    client, alice, bob = alice_and_bob
    food_id = asyncio.run(_seed_catalogue(db_sessionmaker, "arroz blanco cocido"))
    for who in (alice, bob):
        assert [f["id"] for f in client.get("/foods?q=arroz", headers=who).json()] == [food_id]
        assert (
            client.post(
                "/food-log", json={"food_id": food_id, "grams": 100}, headers=who
            ).status_code
            == 201
        )


def test_the_shared_catalogue_is_not_editable(alice_and_bob, db_sessionmaker):
    import asyncio

    client, alice, _ = alice_and_bob
    food_id = asyncio.run(_seed_catalogue(db_sessionmaker, "arroz blanco cocido"))
    # Visible, so a 404 would be a lie; refused, because it is not yours to fix.
    assert client.get(f"/foods/{food_id}", headers=alice).json()["is_mine"] is False
    resp = client.patch(f"/foods/{food_id}", json={"kcal_100g": 1}, headers=alice)
    assert resp.status_code == 403


def test_the_shared_catalogue_cannot_be_archived(alice_and_bob, db_sessionmaker):
    import asyncio

    client, alice, bob = alice_and_bob
    food_id = asyncio.run(_seed_catalogue(db_sessionmaker, "arroz blanco cocido"))
    # Por lo mismo que no se puede corregir: la fila es de todos, y `archived`
    # es una columna suya, así que retirarla la escondería para todo el mundo.
    # Esconderla sólo para quien lo pide haría falta otra tabla, y no la hay.
    assert client.delete(f"/foods/{food_id}", headers=alice).status_code == 403
    assert client.get(f"/foods/{food_id}", headers=bob).status_code == 200


def test_your_own_food_outranks_the_catalogue(alice_and_bob, db_sessionmaker):
    import asyncio

    client, alice, _ = alice_and_bob
    asyncio.run(_seed_catalogue(db_sessionmaker, "pan"))
    mine = client.post("/foods", json={"name": "Pan", "kcal_100g": 260}, headers=alice).json()
    assert [f["id"] for f in client.get("/foods?q=pan", headers=alice).json()][0] == mine["id"]


def test_bobs_repertoire_is_not_alices(alice_and_bob):
    """«Lo de siempre» es de quien lo come.

    El repertorio se construye desde el diario, que nunca se comparte: lo que
    Alice repite cinco veces no puede aparecerle a Bob a un toque.
    """
    client, alice, bob = alice_and_bob
    food = client.post("/foods", json={"name": "Bacalao", "kcal_100g": 80}, headers=alice).json()
    for _ in range(5):
        client.post("/food-log", json={"food_id": food["id"], "grams": 200}, headers=alice)

    assert [r["name"] for r in client.get("/foods/frequent", headers=alice).json()] == ["Bacalao"]
    assert client.get("/foods/frequent", headers=bob).json() == []
