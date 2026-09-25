"""Pasos diarios: `PUT /steps` y `GET /steps`.

Todo va con autenticación de verdad (`unauthed_client` + registro), porque el
escenario de aislamiento necesita dos personas y el resto no pierde nada por
llevar su token.
"""

from datetime import UTC, date, datetime, timedelta

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/daily_steps.feature")


@pytest.fixture()
def ctx():
    return {}


def _register(client, username):
    resp = client.post("/auth/register", json={"username": username, "password": "s3cretpass"})
    assert resp.status_code == 201, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _today_utc() -> date:
    return datetime.now(UTC).date()


def _pairs(text: str) -> list[dict]:
    """`"2026-09-01=5000, 2026-09-02=9100"` → la lista de días del cuerpo."""
    days = []
    for chunk in text.strip().strip('"').split(","):
        if not chunk.strip():
            continue
        on, steps = chunk.strip().split("=")
        days.append({"date": on, "steps": int(steps)})
    return days


def _consecutive(count: int, start: date) -> list[dict]:
    return [
        {"date": (start + timedelta(days=i)).isoformat(), "steps": 1000 + i} for i in range(count)
    ]


def _payload(text: str) -> list[dict]:
    """Las subidas del Scenario Outline, dichas en prosa."""
    text = text.strip()
    if text == "ninguna fecha":
        return []
    if text.endswith("días seguidos"):
        return _consecutive(int(text.split()[0]), date(2026, 7, 1))
    if " y otro dentro de 2 días" in text:
        head = text.replace(" y otro dentro de 2 días", "")
        return _pairs(head) + [{"date": (_today_utc() + timedelta(days=2)).isoformat(), "steps": 1}]
    return _pairs(text)


def _put(client, headers, days):
    return client.put("/steps", json={"days": days}, headers=headers)


def _get(client, headers, desde, hasta):
    return client.get("/steps", params={"from": desde, "to": hasta}, headers=headers)


def _render(rows: list[dict]) -> str:
    return ", ".join(f"{r['date']}={r['steps']}" for r in rows)


# --- Quién -------------------------------------------------------------------


@given("que tengo una cuenta")
def i_have_an_account(unauthed_client, ctx):
    ctx["me"] = _register(unauthed_client, "yo")


@given("que otra persona tiene una cuenta")
def someone_else_has_an_account(unauthed_client, ctx):
    ctx["other"] = _register(unauthed_client, "otra")


# --- Subir -------------------------------------------------------------------


def _upload_ok(client, headers, days, ctx):
    resp = _put(client, headers, days)
    assert resp.status_code == 200, resp.text
    ctx["upload"] = resp


@given(parsers.parse("que subí {steps:d} pasos el {on}"))
@when(parsers.parse("subo {steps:d} pasos el {on}"))
def upload_one(unauthed_client, ctx, steps, on):
    _upload_ok(unauthed_client, ctx["me"], [{"date": on, "steps": steps}], ctx)


@given(parsers.parse('que subí "{days}"'))
@when(parsers.parse('subo "{days}"'))
def upload_many(unauthed_client, ctx, days):
    _upload_ok(unauthed_client, ctx["me"], _pairs(days), ctx)


@when(parsers.parse("subo {steps:d} pasos mañana"))
def upload_tomorrow(unauthed_client, ctx, steps):
    tomorrow = (_today_utc() + timedelta(days=1)).isoformat()
    _upload_ok(unauthed_client, ctx["me"], [{"date": tomorrow, "steps": steps}], ctx)


@when(parsers.parse("subo {count:d} días seguidos desde el {start}"))
def upload_consecutive(unauthed_client, ctx, count, start):
    days = _consecutive(count, date.fromisoformat(start))
    _upload_ok(unauthed_client, ctx["me"], days, ctx)


@given(parsers.parse("que la otra persona subió {steps:d} pasos el {on}"))
def other_uploads(unauthed_client, ctx, steps, on):
    resp = _put(unauthed_client, ctx["other"], [{"date": on, "steps": steps}])
    assert resp.status_code == 200, resp.text


@when(parsers.parse("intento subir {subida}"))
def try_upload(unauthed_client, ctx, subida):
    ctx["upload"] = _put(unauthed_client, ctx["me"], _payload(subida))


@when(parsers.parse("alguien sin sesión sube {steps:d} pasos el {on}"))
def anonymous_upload(unauthed_client, ctx, steps, on):
    ctx["upload"] = _put(unauthed_client, {}, [{"date": on, "steps": steps}])


@then(parsers.parse("la subida dice que guardó {count:d} día"))
@then(parsers.parse("la subida dice que guardó {count:d} días"))
def upload_says_saved(ctx, count):
    assert ctx["upload"].json() == {"saved": count}


@then("la subida se rechaza")
def upload_refused(ctx):
    assert ctx["upload"].status_code == 422, ctx["upload"].text


@then("la subida sin sesión se rechaza por no estar autenticada")
def upload_unauthenticated(ctx):
    assert ctx["upload"].status_code == 401, ctx["upload"].text


# --- Leer --------------------------------------------------------------------


def _read_ok(client, headers, desde, hasta):
    resp = _get(client, headers, desde, hasta)
    assert resp.status_code == 200, resp.text
    return resp.json()


@then(parsers.parse('mis pasos del {desde} al {hasta} son "{expected}"'))
def my_steps_are(unauthed_client, ctx, desde, hasta, expected):
    assert _render(_read_ok(unauthed_client, ctx["me"], desde, hasta)) == expected


@then(parsers.parse('los pasos de la otra persona del {desde} al {hasta} son "{expected}"'))
def other_steps_are(unauthed_client, ctx, desde, hasta, expected):
    assert _render(_read_ok(unauthed_client, ctx["other"], desde, hasta)) == expected


@then(parsers.parse("el {on} no aparece en mis pasos"))
def day_absent(unauthed_client, ctx, on):
    # Ni con 0 ni con null: sin fila no hay entrada.
    rows = _read_ok(unauthed_client, ctx["me"], on, on)
    assert rows == []


@then(parsers.parse("tengo {count:d} días con pasos del {desde} al {hasta}"))
def count_days(unauthed_client, ctx, count, desde, hasta):
    assert len(_read_ok(unauthed_client, ctx["me"], desde, hasta)) == count


@when(parsers.parse("pido mis pasos del {desde} al {hasta}"))
def ask_range(unauthed_client, ctx, desde, hasta):
    ctx["read"] = _get(unauthed_client, ctx["me"], desde, hasta)


@then("la lectura se rechaza")
def read_refused(ctx):
    assert ctx["read"].status_code == 422, ctx["read"].text


@then("la lectura responde sin días")
def read_empty(ctx):
    assert ctx["read"].status_code == 200, ctx["read"].text
    assert ctx["read"].json() == []
