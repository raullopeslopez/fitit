"""Las reglas del envío a Taski: nombre y cantidad."""

from datetime import date

from app.shopping import Articulo
from app.taski import cantidad, nombre, nota


def _art(name="Pollo", brand=None, grams=4200, packs=None, package_grams=None):
    return Articulo(1, name, brand, grams, packs, package_grams)


def test_la_cantidad_es_la_que_pinta_la_lista():
    assert cantidad(_art(grams=4200)) == "~4,2 kg"
    assert cantidad(_art(grams=444)) == "~440 g"
    assert cantidad(_art(grams=12000)) == "~12 kg"
    assert cantidad(_art(packs=3, package_grams=500.0)) == "3 × 500 g"
    assert cantidad(_art(packs=2, package_grams=1500.0)) == "2 × 1,5 kg"


def test_la_marca_se_anade_si_no_va_ya_en_el_nombre():
    assert nombre(_art("Queso fresco", "Hacendado")) == "Queso fresco Hacendado"
    assert nombre(_art("Queso fresco Hacendado", "Hacendado")) == "Queso fresco Hacendado"


def test_la_nota_dice_la_semana():
    assert nota(date(2026, 10, 12)) == "Plan de Fitit · semana del 12 oct"


# --- despertar a Taski ----------------------------------------------------------
# Taski duerme en el plan gratuito de Render. Mientras arranca, Render contesta
# con un 502/503/504 al momento, sin esperar: el 12 oct el envío falló así en
# menos de un segundo. El 13 oct fue un 429 «Too Many Requests», también al
# momento y sin que la petición llegase a Taski (su log está vacío; Taski no
# limita ninguna ruta). Esos se reintentan; el resto de 4xx es una respuesta y no.
import asyncio  # noqa: E402

import httpx  # noqa: E402
import pytest  # noqa: E402

from app.taski import Taski, Unreachable  # noqa: E402


def _taski(codigos):
    llamadas = []

    def responder(request):
        llamadas.append(request)
        codigo = codigos[min(len(llamadas), len(codigos)) - 1]
        return httpx.Response(codigo, json=[] if codigo == 200 else {"detail": "x"})

    async def sin_esperar(_segundos):
        return None

    return Taski("https://taski", "dev", transport=httpx.MockTransport(responder), dormir=sin_esperar), llamadas


def test_mientras_taski_despierta_se_vuelve_a_intentar():
    taski, llamadas = _taski([503, 502, 200])
    assert asyncio.run(taski.listar()) == []
    assert len(llamadas) == 3


def test_el_429_de_render_mientras_despierta_tambien_se_reintenta():
    taski, llamadas = _taski([429, 429, 200])
    assert asyncio.run(taski.listar()) == []
    assert len(llamadas) == 3


def test_si_no_despierta_se_rinde_y_dice_que_contesto():
    taski, llamadas = _taski([503])
    with pytest.raises(Unreachable, match="503"):
        asyncio.run(taski.listar())
    assert len(llamadas) == Taski.INTENTOS


def test_un_error_de_peticion_no_se_reintenta():
    taski, llamadas = _taski([401])
    with pytest.raises(Unreachable, match="401"):
        asyncio.run(taski.listar())
    assert len(llamadas) == 1
