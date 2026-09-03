"""¿Sirve la clave, y qué modelo puede leer una etiqueta con ella?

Del mismo tipo que `check_catalogue.py`: sólo lee, no cambia nada, y está para
contestar antes de un deploy a «¿esto va a funcionar en producción?».

    uv run python -m scripts.check_gemini            # qué modelos hay
    uv run python -m scripts.check_gemini --probe    # y además, ¿contesta?

La clave sale del entorno —`.env` en local, variables de Render en producción—
y **no se imprime nunca**, ni entera ni en trozos. Lo único que sale por pantalla
son nombres de modelo y códigos de estado, que es lo que hay que saber.

`--probe` gasta una petición del tier gratuito. Una.
"""

import argparse
import asyncio
import base64
import sys

import httpx

from app.config import settings

LIST = "https://generativelanguage.googleapis.com/v1beta/models"

# Un JPEG de 1x1 píxel. Sirve para saber si el modelo acepta imágenes y
# contesta; no para saber si lee bien una etiqueta, que eso se ve con una
# etiqueta delante.
PIXEL = base64.b64decode(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof"
    "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB"
    "AAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=="
)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--probe",
        action="store_true",
        help="además de listar, manda una imagen mínima al modelo configurado",
    )
    args = parser.parse_args()

    key = settings.gemini_api_key.get_secret_value()
    if not key:
        sys.exit(
            "no hay GEMINI_API_KEY en el entorno.\n"
            "  local: una línea en backend/.env\n"
            "  producción: variable de entorno en Render"
        )
    print(f"clave: presente ({len(key)} caracteres)")
    print(f"modelo configurado: {settings.gemini_model}\n")

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(LIST, headers={"x-goog-api-key": key})
        if response.status_code != 200:
            # El cuerpo puede llevar la petición dentro; sólo el código.
            sys.exit(f"la API contestó {response.status_code} al listar modelos")
        models = response.json().get("models", [])

    usable = [
        m
        for m in models
        if "generateContent" in (m.get("supportedGenerationMethods") or [])
        and "embedding" not in m.get("name", "")
    ]
    print(f"{len(usable)} modelos con generateContent:\n")
    for model in sorted(usable, key=lambda m: m.get("name", "")):
        name = model.get("name", "").removeprefix("models/")
        marca = "  <-- el configurado" if name == settings.gemini_model else ""
        print(f"  {name}{marca}")

    names = {m.get("name", "").removeprefix("models/") for m in usable}
    if settings.gemini_model not in names:
        print(
            f"\nAVISO: '{settings.gemini_model}' no está en la lista. "
            "Pon uno de los de arriba en GEMINI_MODEL."
        )

    if not args.probe:
        return

    print(f"\nprobando {settings.gemini_model} con una imagen mínima...")
    from app.gemini import LabelUnreadable, read_label

    try:
        answer = await read_label(
            PIXEL, api_key=key, model=settings.gemini_model, mime_type="image/jpeg"
        )
    except LabelUnreadable as exc:
        # El texto del error puede traer trozos de la petición; sólo su tipo.
        print(f"  no contestó JSON utilizable ({type(exc.__cause__).__name__})")
        return
    print(f"  contestó JSON con las claves: {sorted(answer)}")
    print("  (un píxel no es una etiqueta: esto sólo dice que la tubería está abierta)")


if __name__ == "__main__":
    asyncio.run(main())
