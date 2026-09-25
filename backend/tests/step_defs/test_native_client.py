"""CORS para los orígenes de Capacitor y el corte por `X-Client-Version`.

Se habla con `app.main.app`, que en producción está montada bajo `/api`: las
rutas aquí van sin ese prefijo, igual que en el resto de specs.
"""

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

from app.config import settings

scenarios("../features/native_client.feature")


@pytest.fixture()
def ctx():
    return {}


@pytest.fixture(autouse=True)
def _gate_off_by_default(monkeypatch):
    # El corte se lee de settings en cada petición; que un `.env` local o un
    # escenario anterior no deje una mínima puesta.
    monkeypatch.setattr(settings, "min_client_version", "")


def _preflight(client, origin, method, path):
    return client.options(
        path,
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": "authorization, content-type, x-client-version",
        },
    )


@given(parsers.parse('la versión mínima es "{version}"'))
def given_min_version(monkeypatch, version):
    monkeypatch.setattr(settings, "min_client_version", version)


@when(parsers.parse('la app pregunta desde "{origin}" si puede hacer un {method} a "{path}"'))
@when(parsers.parse('la app vieja pregunta desde "{origin}" si puede hacer un {method} a "{path}"'))
def when_preflight(client, ctx, origin, method, path):
    ctx["response"] = _preflight(client, origin, method, path)


@when(parsers.parse('pido "{path}" con la versión "{version}"'))
def when_get_with_version(client, ctx, path, version):
    ctx["response"] = client.get(path, headers={"X-Client-Version": version})


@when(parsers.parse('pido "{path}" sin versión'))
def when_get_without_version(client, ctx, path):
    ctx["response"] = client.get(path)


@then(parsers.parse('la respuesta permite el origen "{origin}"'))
def then_allows_origin(ctx, origin):
    resp = ctx["response"]
    assert resp.status_code == 200, resp.text
    assert resp.headers.get("access-control-allow-origin") == origin


@then(parsers.parse('la respuesta permite la cabecera "{header}"'))
def then_allows_header(ctx, header):
    allowed = ctx["response"].headers.get("access-control-allow-headers", "")
    assert header.lower() in [h.strip().lower() for h in allowed.split(",")], allowed


@then("la respuesta no permite ningún origen")
def then_no_origin(ctx):
    assert "access-control-allow-origin" not in ctx["response"].headers


@then(parsers.parse("la respuesta es {status:d}"))
def then_status(ctx, status):
    assert ctx["response"].status_code == status, ctx["response"].text


@then(parsers.parse('el mensaje es "{message}"'))
def then_message(ctx, message):
    assert ctx["response"].json() == {"detail": message}
