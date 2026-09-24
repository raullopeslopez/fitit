"""Lo que la pantalla de ideas necesita y el feature no fija: el orden, la
marca de «nueva» y el interruptor en el día."""

import asyncio

from app.config import settings
from app.db import get_session
from app.main import app
from app.models import Food
from app.routers.ideas import get_idea_finder


def _acelga():
    async def crear():
        gen = app.dependency_overrides[get_session]()
        session = await gen.__anext__()
        food = Food(name="Acelga, cruda", name_folded="acelga, cruda", user_id=None)
        session.add(food)
        await session.commit()
        await gen.aclose()
        return food.id

    return asyncio.run(crear())


def test_other_ideas_go_on_top_marked_new(client):
    tandas = iter(
        [
            {"ideas": [{"name": "A", "url": "https://a.es/1"}, {"name": "B", "url": "https://a.es/2"}]},
            {"ideas": [{"name": "C", "url": "https://a.es/3"}, {"name": "A", "url": "https://a.es/1"}]},
        ]
    )

    async def finder(**_kw):
        return next(tandas)

    app.dependency_overrides[get_idea_finder] = lambda: finder
    try:
        food_id = _acelga()
        first = client.post("/dish-ideas", json={"food_id": food_id}).json()
        assert [i["name"] for i in first["ideas"]] == ["A", "B"]
        assert first["stored_at"] is not None
        more = client.post("/dish-ideas", json={"food_id": food_id, "more": True}).json()
    finally:
        app.dependency_overrides.pop(get_idea_finder, None)

    assert [(i["name"], i["new"]) for i in more["ideas"]] == [("C", True), ("A", False), ("B", False)]
    assert more["new_count"] == 1


def test_the_day_says_whether_ideas_can_be_searched(client, monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", type(settings.gemini_api_key)("k"))
    assert client.get("/food-log").json()["dish_ideas"] is True
    monkeypatch.setattr(settings, "gemini_api_key", type(settings.gemini_api_key)(""))
    assert client.get("/food-log").json()["dish_ideas"] is False
