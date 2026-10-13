"""La lista de la compra, enviada a Taski.

En un solo sentido: Fitit manda y Taski no contesta nada. Lo que se tacha en
Taski no vuelve, porque en Fitit lo que importa es confirmar lo que comes, no lo
que compraste.

Taski no tiene usuarios ni claves: un miembro del hogar es una cabecera
`X-Device-ID`, y un hogar admite dos. Fitit no puede entrar como tercero, así
que envía como tú, con tu identificador guardado como secreto
(`TASKI_DEVICE_ID`). Vacío, la función está apagada, igual que la de Gemini.

Enviar dos veces no duplica: antes se mira qué tiene Taski pendiente y sólo se
añade lo que falta. Lo ya tachado sí se vuelve a mandar — es otra compra.
"""

from __future__ import annotations

import asyncio
from datetime import date

import httpx

from .config import settings
from .naming import fold_exercise_name as fold
from .shopping import Articulo

# Sin `category`: en Taski ese campo es el emoji del artículo, no un pasillo. La
# app pinta lo que venga en él como icono (un «Otros» en vez de 🥛), y si no viene
# nada lo elige ella por el nombre (`EmojiService.suggest`). Que lo elija Taski.

_MESES = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")


class Unreachable(Exception):
    """Taski no ha contestado, o ha contestado con un error."""


def nombre(articulo: Articulo) -> str:
    """El nombre con la marca, si la marca no va ya dentro: en el súper se busca
    «Queso fresco batido 0% Hacendado», no un queso cualquiera."""
    if articulo.brand and fold(articulo.brand) not in fold(articulo.name):
        return f"{articulo.name} {articulo.brand}"
    return articulo.name


def _peso(gramos: float) -> str:
    if gramos >= 1000:
        kg = round(gramos / 100) / 10
        return f"{kg:g} kg".replace(".", ",")
    return f"{gramos:g} g"


def cantidad(articulo: Articulo) -> str:
    """Lo mismo que pinta la lista (`cantidad()` en `ListaCompra.jsx`): en
    envases si se sabe el envase, al peso si no."""
    if articulo.packs and articulo.package_grams:
        return f"{articulo.packs} × {_peso(articulo.package_grams)}"
    return f"~{_peso(round(articulo.grams / 10) * 10)}"


def nota(semana: date) -> str:
    return f"Plan de Fitit · semana del {semana.day} {_MESES[semana.month - 1]}"


def pendientes(por_pasillo: dict[str, list[Articulo]], en_taski: list[dict], semana: date,
               saltar: set[int]) -> list[dict]:
    """Lo que hay que añadir a Taski: la lista menos lo que se deja fuera («Lo
    tengo») y menos lo que Taski ya tiene sin tachar, por nombre plegado."""
    ya = {fold(i["name"]) for i in en_taski if not i.get("checked")}
    nuevos = []
    for articulos in por_pasillo.values():
        for articulo in articulos:
            if articulo.food_id in saltar:
                continue
            n = nombre(articulo)
            if fold(n) in ya:
                continue
            ya.add(fold(n))
            nuevos.append({
                "name": n,
                "quantity": cantidad(articulo),
                "notes": nota(semana),
                "is_recurring": False,
            })
    return nuevos


class Taski:
    """Las dos llamadas que Fitit hace a la API de Taski."""

    # Taski duerme en el plan gratuito de Render y la primera llamada lo
    # despierta: puede tardar un minuto en contestar.
    TIMEOUT = 90.0
    # Mientras arranca, Render puede contestar al momento con un 502/503/504 en
    # vez de esperar (12 oct: el envío falló así en menos de un segundo). Esos
    # se reintentan, unos 75 s en total; un 4xx es una respuesta y no.
    DESPERTANDO = frozenset({502, 503, 504})
    INTENTOS = 6
    PAUSA = 15.0

    def __init__(self, url: str, device_id: str, *, transport=None, dormir=asyncio.sleep):
        self.url = url.rstrip("/")
        self.headers = {"X-Device-ID": device_id}
        self.transport = transport
        self.dormir = dormir

    async def _llamar(self, metodo: str, ruta: str, **kwargs) -> httpx.Response:
        for intento in range(1, self.INTENTOS + 1):
            try:
                async with httpx.AsyncClient(timeout=self.TIMEOUT, transport=self.transport) as client:
                    respuesta = await client.request(metodo, self.url + ruta, headers=self.headers, **kwargs)
            except httpx.HTTPError as exc:
                raise Unreachable(f"{metodo} {ruta}: {exc!r}") from exc
            if respuesta.status_code in self.DESPERTANDO and intento < self.INTENTOS:
                await self.dormir(self.PAUSA)
                continue
            if respuesta.is_error:
                raise Unreachable(f"{metodo} {ruta}: {respuesta.status_code} {respuesta.text[:200]}")
            return respuesta
        raise AssertionError("inalcanzable")

    async def listar(self) -> list[dict]:
        return (await self._llamar("GET", "/shopping")).json()

    async def anadir(self, item: dict) -> None:
        await self._llamar("POST", "/shopping", json=item)


async def get_taski() -> Taski | None:
    """Quien habla con Taski, o nadie si no hay identificador. Dependencia para
    que la suite lo cambie por una lista en memoria: no hay red."""
    device_id = settings.taski_device_id.get_secret_value()
    if not device_id:
        return None
    return Taski(settings.taski_api_url, device_id)
