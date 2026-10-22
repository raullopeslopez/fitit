import asyncio

import pytest
from pytest_bdd import given, parsers, scenarios, then, when
from sqlalchemy import func, select

from app.auth import get_current_user, hash_password
from app.db import get_session
from app.gemini import LabelUnreadable, VoiceUnavailable
from app.main import app
from app.models import Food, LogEntry, User
from app.naming import fold_exercise_name
from app.routers.food_log import get_text_reader, get_voice_reader

scenarios("../features/voice_logging.feature")


@pytest.fixture()
def ctx():
    return {"foods": {}, "heard": [], "transcript": [], "reader": "stub"}


async def _con_sesion(fn):
    gen = app.dependency_overrides[get_session]()
    session = await gen.__anext__()
    try:
        return await fn(session)
    finally:
        await gen.aclose()


def _como_otra(client, fn):
    """Lo que vería otra persona: un usuario de verdad detrás del override."""

    async def crear(session):
        user = User(username="otra", password_hash=hash_password("otra-pass"))
        session.add(user)
        await session.commit()
        return user.id

    otra = asyncio.run(_con_sesion(crear))
    yo = app.dependency_overrides[get_current_user]
    app.dependency_overrides[get_current_user] = lambda: otra
    try:
        return fn()
    finally:
        app.dependency_overrides[get_current_user] = yo


def _mine(client, ctx, name):
    resp = client.post("/foods", json={"name": name, "kcal_100g": 100})
    assert resp.status_code == 201, resp.text
    ctx["foods"][name] = resp.json()["id"]
    return ctx["foods"][name]


def _log(client, food_id, grams):
    resp = client.post("/food-log", json={"food_id": food_id, "grams": grams})
    assert resp.status_code == 201, resp.text


def _shared(ctx, name, brand=None):
    async def crear(session):
        food = Food(
            name=name,
            name_folded=fold_exercise_name(name),
            brand=brand,
            brand_folded=fold_exercise_name(brand) if brand else None,
            user_id=None,
            kcal_100g=140,
        )
        session.add(food)
        await session.commit()
        return food.id

    ctx["foods"][name] = asyncio.run(_con_sesion(crear))


# --- Mis alimentos --------------------------------------------------------------


@given(parsers.parse('a food "{name}" I have logged at {grams:g} g three times'))
def given_three(client, ctx, name, grams):
    food = _mine(client, ctx, name)
    for _ in range(3):
        _log(client, food, grams)


@given(parsers.parse('a food "{name}" I have logged at {grams:g} g twice'))
def given_twice(client, ctx, name, grams):
    food = _mine(client, ctx, name)
    for _ in range(2):
        _log(client, food, grams)


@given(parsers.parse('a food "{name}" I have logged at {a:g} g twice and {b:g} g once'))
def given_twice_once(client, ctx, name, a, b):
    food = _mine(client, ctx, name)
    for grams in (b, a, a):
        _log(client, food, grams)


@given(parsers.parse('a food "{name}" of mine I never logged'))
def given_never(client, ctx, name):
    _mine(client, ctx, name)


@given(parsers.parse('a shared food "{name}" by "{brand}"'))
def given_shared_brand(ctx, name, brand):
    _shared(ctx, name, brand)


@given(parsers.re(r'a shared food "(?P<name>[^"]+)"$'))
def given_shared(client, ctx, name):
    _shared(ctx, name)


@given(parsers.parse('I have a portion "{label}" of {grams:g} g on "{name}"'))
@given(parsers.parse('I saved a portion "{label}" of {grams:g} g on "{name}"'))
@when(parsers.parse('I save a portion "{label}" of {grams:g} g on "{name}"'))
def when_save_portion(client, ctx, label, grams, name):
    resp = client.post(f"/foods/{ctx['foods'][name]}/portions", json={"label": label, "grams": grams})
    assert resp.status_code == 201, resp.text
    ctx["portion"] = resp.json()["id"]


# --- Lo que oye el modelo -------------------------------------------------------


def _hear(ctx, text, name, quantity=None, unit=None, unit_grams=None, portion_grams=None):
    ctx["transcript"].append(text)
    ctx["heard"].append(
        {
            "text": text,
            "name": name,
            "quantity": quantity,
            "unit": unit,
            "unit_grams": unit_grams,
            "portion_grams": portion_grams,
        }
    )


@given(parsers.parse('the model hears "{text}" as {quantity:g} "{unit}" of "{name}" weighing {grams:g} g each'))
def given_hears_unit(ctx, text, quantity, unit, name, grams):
    _hear(ctx, text, name, quantity, unit, unit_grams=grams)


@given(parsers.re(r'the model hears "(?P<text>[^"]+)" as (?P<quantity>[\d.]+) "(?P<unit>[^"]+)" of "(?P<name>[^"]+)"$'))
def given_hears(ctx, text, quantity, unit, name):
    _hear(ctx, text, name, float(quantity), unit)


@given(parsers.parse('the model hears "{text}" as "{name}" with no amount, {grams:g} g a portion'))
def given_hears_portion(ctx, text, name, grams):
    _hear(ctx, text, name, portion_grams=grams)


@given(parsers.parse('the model hears "{text}" as "{name}" with no amount'))
def given_hears_bare(ctx, text, name):
    _hear(ctx, text, name)


@given("the model hears nothing")
def given_nothing(ctx):
    ctx["reader"] = "nothing"


@given("there is no model key")
def given_no_key(ctx):
    ctx["reader"] = None


@given(parsers.parse('the transcriber heard "{text}" but the model is saturated'))
def given_heard_busy(ctx, text):
    ctx["reader"] = ("heard_busy", text)


@given("the model is saturated")
def given_busy(ctx):
    ctx["reader"] = "busy"


@given("the model is out of its daily quota")
def given_quota(ctx):
    ctx["reader"] = "quota"


def _reader(ctx):
    kind = ctx["reader"]
    if kind is None:
        return None

    async def reader(audio: bytes, mime_type: str) -> dict:
        assert audio, "el audio llega al modelo"
        if kind == "quota":
            raise LabelUnreadable("429", quota="day")
        if isinstance(kind, tuple):
            raise VoiceUnavailable("503", transcript=kind[1], detail="503")
        if kind == "busy":
            raise LabelUnreadable("503", detail="503")
        if kind == "nothing":
            return {"transcript": "", "lines": []}
        return {"transcript": ", ".join(ctx["transcript"]), "lines": ctx["heard"]}

    return reader


@when(parsers.parse("I send a voice note of {mb:d} MB"))
def when_send_big(client, ctx, mb):
    _send(client, ctx, b"x" * (mb * 1024 * 1024))


@when("I send a voice note")
def when_send(client, ctx):
    _send(client, ctx, b"webm-audio")


def _send(client, ctx, audio):
    app.dependency_overrides[get_voice_reader] = lambda: _reader(ctx)
    ctx["response"] = client.post(
        "/food-log/voice", files={"audio": ("nota.webm", audio, "audio/webm")}
    )
    if ctx["response"].status_code == 200:
        ctx["voice"] = ctx["response"].json()


def _text_reader(ctx):
    kind = ctx["reader"]
    if kind is None:
        return None

    async def reader(text: str) -> dict:
        assert text, "la frase llega al modelo"
        if kind == "quota":
            raise LabelUnreadable("429", quota="day")
        if kind == "busy":
            raise LabelUnreadable("503", detail="503")
        if kind == "nothing":
            return {"lines": []}
        return {"lines": ctx["heard"]}

    return reader


@when(parsers.re(r'I write "(?P<text>[^"]*)"'))
def when_write(client, ctx, text):
    app.dependency_overrides[get_text_reader] = lambda: _text_reader(ctx)
    ctx["response"] = client.post("/food-log/text", json={"text": text})
    if ctx["response"].status_code == 200:
        ctx["voice"] = ctx["response"].json()


# --- Lo que contesta ------------------------------------------------------------


def _line(ctx, text):
    return next(line for line in ctx["voice"]["lines"] if line["text"] == text)


@then(parsers.parse('the transcript is "{text}"'))
def then_transcript(ctx, text):
    assert ctx["voice"]["transcript"] == text


@then(parsers.parse("there is {n:d} line"))
def then_lines(ctx, n):
    assert len(ctx["voice"]["lines"]) == n


@then(parsers.parse("my diary has {n:d} entries"))
def then_diary(ctx, n):
    async def contar(session):
        return (await session.execute(select(func.count(LogEntry.id)))).scalar_one()

    assert asyncio.run(_con_sesion(contar)) == n


@then(parsers.parse("the answer is {code:d}"))
def then_answer(ctx, code):
    assert ctx["response"].status_code == code, ctx["response"].text


@then(parsers.parse('the refusal is "{refusal}" for the day'))
def then_refusal_day(ctx, refusal):
    assert ctx["voice"]["refusal"] == refusal
    assert ctx["voice"]["quota_scope"] == "day"


@then(parsers.parse('the refusal is "{refusal}"'))
def then_refusal(ctx, refusal):
    assert ctx["voice"]["refusal"] == refusal


@then(parsers.parse('the line "{text}" is chosen as "{name}"'))
def then_chosen(ctx, text, name):
    line = _line(ctx, text)
    assert line["status"] == "chosen"
    assert line["food"]["name"] == name


@then(parsers.parse('the line "{text}" asks which among "{a}", "{b}", "{c}"'))
def then_which(ctx, text, a, b, c):
    line = _line(ctx, text)
    assert line["status"] == "ambiguous"
    assert line["food"] is None
    assert [f["name"] for f in line["candidates"]] == [a, b, c]


@then(parsers.parse('the line "{text}" is missing'))
def then_missing(ctx, text):
    line = _line(ctx, text)
    assert line["status"] == "missing"
    assert line["food"] is None and line["candidates"] == []


@then(parsers.parse('no food called "{name}" exists'))
def then_no_food(ctx, name):
    async def contar(session):
        stmt = select(func.count(Food.id)).where(Food.name_folded == fold_exercise_name(name))
        return (await session.execute(stmt)).scalar_one()

    assert asyncio.run(_con_sesion(contar)) == 0


@then(parsers.parse('the line "{text}" weighs {grams:g} g, not estimated'))
def then_weighs(ctx, text, grams):
    line = _line(ctx, text)
    assert line["grams"] == grams
    assert line["estimated"] is False


@then(parsers.parse('the line "{text}" weighs {grams:g} g, estimated'))
def then_weighs_estimated(ctx, text, grams):
    line = _line(ctx, text)
    assert line["grams"] == grams
    assert line["estimated"] is True


@then(parsers.parse('the line "{text}" is {count:g} "{measure}", {grams:g} g'))
def then_measure(ctx, text, count, measure, grams):
    line = _line(ctx, text)
    assert (line["measure"], line["measure_count"], line["grams"]) == (measure, count, grams)


@then(parsers.parse('the line "{text}" asks how much one weighs, suggesting {grams:g} g'))
def then_unit_question(ctx, text, grams):
    line = _line(ctx, text)
    assert line["grams"] is None
    assert line["unit_question"]["suggested_grams"] == grams
    assert line["unit_question"]["name"] == "huevo"


# --- Mis raciones ---------------------------------------------------------------


def _portions(client, food_id):
    resp = client.get(f"/foods/{food_id}")
    assert resp.status_code == 200, resp.text
    return [(p["label"], p["grams"]) for p in resp.json()["portions"]]


@then(parsers.parse('"{name}" shows my portion "{label}" of {grams:g} g'))
def then_shows(client, ctx, name, label, grams):
    assert (label, grams) in _portions(client, ctx["foods"][name])


@then(parsers.parse('someone else sees no portions on "{name}"'))
def then_someone_else(client, ctx, name):
    assert _como_otra(client, lambda: _portions(client, ctx["foods"][name])) == []


@when(parsers.parse('someone else logs {count:d} of my portion on "{name}"'))
def when_someone_else_logs(client, ctx, count, name):
    body = {"food_id": ctx["foods"][name], "portion_id": ctx["portion"], "quantity": count}
    ctx["response"] = _como_otra(client, lambda: client.post("/food-log", json=body))


# --- Apuntar ----------------------------------------------------------------------


def _batch(client, ctx, items):
    ctx["response"] = client.post("/food-log/batch", json={"entries": items})


@when(parsers.parse('I log by voice {a:g} g of "{first}" and {b:g} g of "{second}"'))
def when_batch_two(client, ctx, a, first, b, second):
    _batch(
        client,
        ctx,
        [{"food_id": ctx["foods"][first], "grams": a}, {"food_id": ctx["foods"][second], "grams": b}],
    )
    assert ctx["response"].status_code == 201, ctx["response"].text


@when(parsers.parse('I log by voice {grams:g} g of "{name}" estimated'))
def when_batch_estimated(client, ctx, grams, name):
    _batch(client, ctx, [{"food_id": ctx["foods"][name], "grams": grams, "estimated": True}])
    assert ctx["response"].status_code == 201, ctx["response"].text


@when(parsers.parse('I log by voice {a:g} g of "{name}" and {b:g} g of a food that does not exist'))
def when_batch_broken(client, ctx, a, name, b):
    _batch(client, ctx, [{"food_id": ctx["foods"][name], "grams": a}, {"food_id": 99999, "grams": b}])


def _last_sources(n):
    async def leer(session):
        stmt = select(LogEntry.entry_source).order_by(LogEntry.id.desc()).limit(n)
        return list((await session.execute(stmt)).scalars())

    return asyncio.run(_con_sesion(leer))


@then(parsers.parse('the last {n:d} entries come from "{source}"'))
def then_last_sources(ctx, n, source):
    assert _last_sources(n) == [source] * n


@then(parsers.parse('the last entry comes from "{source}"'))
def then_last_source(ctx, source):
    assert _last_sources(1) == [source]
