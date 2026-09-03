"""La llamada al modelo que mira la foto. Nada más.

Aquí no se decide nada: se pide, se recoge el JSON y se devuelve tal cual. Quién
comprueba que lo devuelto se sostiene es `app/label.py`, y están separados a
propósito — la comprobación es lo que hay que poder probar sin red, sin clave y
sin gastar cuota, que es todo lo que hace la suite.

Primera vez que este proyecto llama a un modelo mientras un usuario espera. El
único uso anterior —`scripts/translate_foods.py`— es de los que se ejecutan a
mano, una vez, y deja el resultado en un fichero versionado. Este no: corre en
el request. De ahí que el prompt no pida sólo los números, sino de dónde salen.
"""

from __future__ import annotations

import asyncio
import base64
import json

import httpx

API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

# Lo que se le pide, y por qué se le pide así.
#
# Un prompt que pidiera cinco números sacaría cinco números siempre — incluida
# la etiqueta que no declara fibra, donde el hueco se rellena con un cero que
# nadie va a poder desmentir después. Así que se le piden tres cosas que se
# pueden contrastar entre sí: la cabecera de la columna, la transcripción de las
# filas y los valores. Si los valores no cuadran con la transcripción, se tiran.
#
# La instrucción de omitir en vez de poner cero no es la defensa —un modelo
# obedece hasta que no—; la defensa es `label.py`. Esto sólo sube la probabilidad
# de que lo que llegue ya venga bien.
PROMPT = """Lees la tabla de información nutricional de la foto de un producto envasado.

Devuelve SOLO un objeto JSON. Sin markdown, sin explicación:

{
  "name": "<nombre del producto, sin la marca>",
  "brand": "<la marca o el supermercado del logotipo; \\"\\" si no se ve>",
  "column_header": "<la cabecera de la columna de la que sacas los números, LITERAL>",
  "rows": ["<cada fila de la tabla, transcrita tal cual, con su nombre y su cifra>"],
  "nutrients": {"kcal": 0, "protein": 0, "fat": 0, "carbs": 0, "fiber": 0}
}

REGLAS:
- `rows` es una transcripción, no un resumen. Copia lo que pone, fila a fila,
  con sus cifras y sus unidades. Si una fila no se lee, no la inventes: omítela.
- En `nutrients`, **omite la clave** del nutriente que la etiqueta no declare.
  No pongas 0. Un 0 significa "la etiqueta dice 0", nunca "no lo encuentro".
- Todos los números salen de UNA sola columna, y `column_header` dice de cuál.
  Si la tabla trae varias ("por 100 g" y "por ración"), usa la de 100 g.
- Si no ves la cabecera con seguridad, pon "" — no la supongas ni la deduzcas.
- No conviertas unidades, no escales, no calcules nada. Copia.
- Hidratos: el valor de "hidratos de carbono", no el de "de los cuales azúcares".
- Grasas: el total, no el de "de las cuales saturadas".
"""


class LabelUnreadable(Exception):
    """El modelo no contestó, o contestó algo que no es JSON.

    Cuota agotada, sin red, tier cambiado, una respuesta rara: da igual cuál de
    los cuatro. Lo único que importa río abajo es que no hay lectura, y que eso
    tiene que acabar en el formulario en blanco y no en un callejón.
    """


# Cuántas veces se pregunta cuando el que falla es el servidor, y cuánto se
# espera entre una y otra.
#
# Medido contra la API el 2026-09-03: de tres llamadas seguidas, dos volvieron
# con `503 Service Unavailable` — el modelo saturado, ni la clave ni la cuota.
# Sin reintento el botón acertaría una vez de cada tres y parecería roto las
# otras dos.
#
# Tres intentos y no más: al otro lado de esto hay alguien con el móvil en una
# mano y un yogur en la otra, y esperar quince segundos para acabar tecleando es
# peor que teclear desde el principio.
ATTEMPTS = 3
BACKOFF = 1.0

# Lo que no se reintenta: 4xx. Una clave mala, una cuota agotada o una petición
# malformada contestan lo mismo por mucho que se insista, y en el caso de la
# cuota cada intento gasta de lo que ya no hay.
RETRIABLE = range(500, 600)


async def read_label(
    image: bytes,
    *,
    api_key: str,
    model: str,
    mime_type: str = "image/jpeg",
    timeout: float = 30.0,
    backoff: float = BACKOFF,
) -> dict:
    """Manda la foto y devuelve el JSON del modelo, sin juzgarlo."""
    body = {
        "contents": [
            {
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": base64.b64encode(image).decode(),
                        }
                    },
                    {"text": PROMPT},
                ]
            }
        ],
        # `temperature: 0` porque esto es una transcripción: dos lecturas de la
        # misma foto deberían dar lo mismo, y aquí la creatividad es el fallo.
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0},
    }
    last: Exception | None = None
    for attempt in range(ATTEMPTS):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    API.format(model=model),
                    json=body,
                    # En cabecera y no en la query: una clave en la URL acaba en
                    # cualquier log de acceso que haya por el camino.
                    headers={"x-goog-api-key": api_key},
                )
                response.raise_for_status()
                payload = response.json()
            text = payload["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(text)
        except httpx.HTTPStatusError as exc:
            last = exc
            if exc.response.status_code not in RETRIABLE:
                break
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            # Un corte de red o una respuesta a medias son de los que mejoran
            # solos; una respuesta que no es JSON, no — pero distinguirlas
            # costaría más de lo que ahorra, y el tope de tres las acota igual.
            last = exc
        if attempt < ATTEMPTS - 1 and backoff:
            await asyncio.sleep(backoff * (attempt + 1))

    # El mensaje se queda aquí. Río arriba sólo se sabe que no hubo lectura: lo
    # que cuenta un error de la API no le dice nada a quien está delante de la
    # cámara, y puede llevar dentro trozos de la petición.
    raise LabelUnreadable(str(last)) from last
