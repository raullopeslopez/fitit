"""El límite diario de llamadas al modelo, contado por cuenta y por día UTC."""

import asyncio
from datetime import date

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

from app import llm_quota
from app.auth import get_current_user, hash_password
from app.config import settings
from app.db import get_session
from app.main import app
from app.models import User
from app.routers.food_log import get_text_reader

scenarios("../features/llm_daily_limit.feature")


@pytest.fixture()
def ctx(client, monkeypatch):
    state = {"calls": 0, "day": date(2026, 11, 17)}
    monkeypatch.setattr(llm_quota, "quota_day", lambda: state["day"])

    async def reader(text: str) -> dict:
        state["calls"] += 1
        return {"lines": []}

    app.dependency_overrides[get_text_reader] = lambda: reader
    return state


def _write(client, ctx):
    ctx["response"] = client.post("/food-log/text", json={"text": "un plátano"})
    return ctx["response"]


@given(parsers.parse("the daily model limit is {n:d}"))
def given_limit(monkeypatch, n):
    monkeypatch.setattr(settings, "llm_daily_limit", n)


@given(parsers.parse("I wrote a phrase for the model {n:d} times"))
@when(parsers.parse("I write a phrase for the model {n:d} times"))
def write_n(client, ctx, n):
    ctx["statuses"] = [_write(client, ctx).status_code for _ in range(n)]


@when("I write a phrase for the model")
def write_once(client, ctx):
    _write(client, ctx)


@when("another account writes a phrase for the model")
def other_writes(client, ctx):
    async def crear():
        gen = app.dependency_overrides[get_session]()
        session = await gen.__anext__()
        try:
            user = User(username="otra", password_hash=hash_password("otra-pass"))
            session.add(user)
            await session.commit()
            return user.id
        finally:
            await gen.aclose()

    otra = asyncio.run(crear())
    yo = app.dependency_overrides[get_current_user]
    app.dependency_overrides[get_current_user] = lambda: otra
    try:
        _write(client, ctx)
    finally:
        app.dependency_overrides[get_current_user] = yo


@when("the day changes")
def day_changes(ctx):
    ctx["day"] = date(2026, 11, 18)


@when(parsers.parse("I POST to {path}"))
def post_to(client, ctx, path):
    ctx["response"] = client.post(path)


@then("every one of them was read by the model")
def all_read(ctx):
    assert ctx["statuses"] == [200] * len(ctx["statuses"])
    assert ctx["calls"] == len(ctx["statuses"])


@then("that account is read by the model")
def other_read(ctx):
    assert ctx["response"].status_code == 200, ctx["response"].text


@then(parsers.parse("I am refused with {code:d}"))
def refused(ctx, code):
    assert ctx["response"].status_code == code, ctx["response"].text


@then("the refusal says the day's quota is spent")
def says_quota(ctx):
    detail = ctx["response"].json()["detail"]
    assert detail["refusal"] == "quota"
    assert detail["quota_scope"] == "day"
    assert detail["message"] == "Has llegado al límite de consultas de hoy. Vuelve mañana."


@then(parsers.parse("the model was called {n:d} times"))
def called(ctx, n):
    assert ctx["calls"] == n
