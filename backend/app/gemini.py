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
import logging

import httpx

log = logging.getLogger("app.label")

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


class ModelUnavailable(Exception):
    """El modelo no ha contestado algo utilizable. Sin red, saturado, o sin cuota.

    Es del **transporte**, no de lo que se le pedía: la comparte quien lee una
    etiqueta y quien pide platos, porque las dos fallan igual y por lo mismo.
    `quota` es `None | 'minute' | 'day'`, y la distinción no es cosmética — una
    cuota por minuto se pasa esperando y la del día no se pasa hasta mañana.

    `detail` es lo que contestó la API, sin su mensaje: el código HTTP (`"503"`)
    o la clase del fallo de red (`"ReadTimeout"`). Es lo que va al log, y lo que
    el 2026-10-05 faltaba para saber que el modelo estaba saturado.
    """

    def __init__(self, message: str, *, quota: str | None = None, detail: str | None = None):
        self.quota = quota
        self.detail = detail
        super().__init__(message)


class LabelUnreadable(ModelUnavailable):
    """No hay lectura utilizable. Sin red, saturado, una respuesta rara.

    Casi siempre da igual por qué: acabe como acabe, se termina tecleando. La
    excepción es la cuota, y por eso `quota` viaja aparte.

    «Sin cuota» y «no se lee» piden cosas distintas a quien está delante del
    yogur: una foto ilegible se arregla repitiéndola, y una cuota agotada no se
    arregla con nada hasta mañana. Contarlas como lo mismo te deja repitiendo
    una foto que ya no puede salir.
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
# Dos, no tres. El tier gratuito da **5 peticiones por minuto y 20 al día**
# (medido en el panel de AI Studio el 2026-09-04), y con tres intentos una sola
# foto desafortunada gastaba 4 del mismo minuto — el pico real que quedó
# registrado — y 3 de las 20 del día. Dos acotan el coste de una foto a dos
# peticiones y dejan sitio al minuto siguiente.
#
# El tercer intento lo pone la persona: repetir la foto tarda más de doce
# segundos, que es justo el espaciado que este límite pide.
ATTEMPTS = 2
BACKOFF = 2.0
# Doce segundos por intento, no treinta. Con dos intentos y la espera de por
# medio, el peor caso pasa de 62 segundos a 26 — y sesenta segundos de «Leyendo…»
# con el yogur en la mano no son una espera, son una pantalla colgada: dejas de
# mirar, cierras la app, y el fallo se cuenta como que no funciona.
#
# Una lectura buena tarda un par de segundos. Doce ya son cuatro veces eso: lo
# que hay más allá no es una respuesta lenta, es una respuesta que no viene.
TIMEOUT = 12.0

# Lo que no se reintenta: 4xx. Una clave mala, una cuota agotada o una petición
# malformada contestan lo mismo por mucho que se insista, y en el caso de la
# cuota cada intento gasta de lo que ya no hay.
RETRIABLE = range(500, 600)

# Cuota agotada. No es un fallo del que se salga insistiendo.
QUOTA = 429

# Cómo se reconoce en el cuerpo del 429 que la agotada es la del día. Google
# nombra la métrica que se ha pasado, y las diarias lo llevan en el nombre.
DAY_MARKERS = ("perday", "per_day", "per day", "daily", "requests_per_day")


def _quota_scope(response: httpx.Response) -> str:
    """'day' si el 429 habla de una cuota diaria; 'minute' en cualquier otro caso.

    Ante la duda, 'minute': mandar a esperar un minuto a quien en realidad tiene
    que esperar a mañana cuesta un minuto; decirle que vuelva mañana a quien
    sólo tenía que esperar un minuto le cuesta la foto.
    """
    try:
        body = response.text.lower().replace("-", "")
    except Exception:
        return "minute"
    return "day" if any(marker in body for marker in DAY_MARKERS) else "minute"


async def _ask(
    parts: list[dict],
    *,
    api_key: str,
    model: str,
    temperature: float,
    timeout: float = TIMEOUT,
    backoff: float = BACKOFF,
    tools: list[dict] | None = None,
    as_text: bool = False,
    fallback: str | None = None,
) -> dict | str:
    """Manda las partes, devuelve el JSON del modelo y no lo juzga.

    Con `as_text` no se fuerza JSON y se devuelve el texto tal cual, unido si
    viene en varias partes: es lo que hace falta cuando va una herramienta
    (`google_search`) que no está comprobado que conviva con `responseMimeType`.

    Extraído de `read_label` cuando apareció el segundo uso —pedir platos—,
    porque lo que se reusa es el transporte: los reintentos medidos contra la
    API, el 429 con su alcance, y el timeout pensado para alguien esperando.
    Lo que cambia entre los dos usos es qué se manda y con cuánta temperatura.

    Con `fallback`, el reintento va a **otro modelo** en vez de al mismo. No
    suma intentos: ocupa el sitio del segundo. Un 503 es un modelo saturado, y
    preguntarle otra vez dos segundos después le pide lo mismo a quien acaba de
    decir que no puede; otro modelo tiene su propia carga y su propia cuota.
    """
    config: dict = {"temperature": temperature}
    if not as_text:
        config["responseMimeType"] = "application/json"
    body: dict = {"contents": [{"parts": parts}], "generationConfig": config}
    if tools:
        body["tools"] = tools
    last: Exception | None = None
    for attempt in range(ATTEMPTS):
        asked = _model_for(attempt, model, fallback, last)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    API.format(model=asked),
                    json=body,
                    # En cabecera y no en la query: una clave en la URL acaba en
                    # cualquier log de acceso que haya por el camino.
                    headers={"x-goog-api-key": api_key},
                )
                response.raise_for_status()
                payload = response.json()
            if as_text:
                partes = payload["candidates"][0]["content"]["parts"]
                return "".join(p.get("text", "") for p in partes)
            text = payload["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(text)
        except httpx.HTTPStatusError as exc:
            last = exc
            if exc.response.status_code == QUOTA:
                # Ni se reintenta ni se disfraza: cada intento gastaría de lo
                # que ya no hay, y quien está delante necesita saber que no es
                # cuestión de repetir la foto.
                raise ModelUnavailable(
                    str(exc), quota=_quota_scope(exc.response), detail=_detail(exc)
                ) from exc
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
    raise ModelUnavailable(str(last), detail=_detail(last)) from last


def _model_for(attempt: int, model: str, fallback: str | None, last: Exception | None) -> str:
    """El principal en el primer intento; el respaldo, si lo hay, en el resto."""
    if not attempt or not fallback:
        return model
    # Una línea y sin la causa entera: basta con saber que pasó, y a qué.
    log.info("gemini fallback: from=%s to=%s after=%s", model, fallback, _detail(last))
    return fallback


def _detail(exc: Exception | None) -> str | None:
    """El código HTTP si lo hubo; si no, la clase del fallo. Nunca el mensaje."""
    if exc is None:
        return None
    if isinstance(exc, httpx.HTTPStatusError):
        return str(exc.response.status_code)
    return type(exc).__name__


async def read_label(
    image: bytes,
    *,
    api_key: str,
    model: str,
    mime_type: str = "image/jpeg",
    timeout: float = TIMEOUT,
    backoff: float = BACKOFF,
    fallback: str | None = None,
) -> dict:
    """Manda la foto y devuelve el JSON del modelo, sin juzgarlo.

    `temperature: 0` porque esto es una transcripción: dos lecturas de la misma
    foto deberían dar lo mismo, y aquí la creatividad es el fallo.
    """
    parts = [
        {"inline_data": {"mime_type": mime_type, "data": base64.b64encode(image).decode()}},
        {"text": PROMPT},
    ]
    try:
        return await _ask(
            parts,
            api_key=api_key,
            model=model,
            temperature=0,
            timeout=timeout,
            backoff=backoff,
            fallback=fallback,
        )
    except ModelUnavailable as exc:
        # Se traduce al error del camino de la etiqueta: río arriba, `foods.py`
        # distingue «sin cuota» de «no se lee» y eso no cambia.
        raise LabelUnreadable(str(exc), quota=exc.quota, detail=exc.detail) from exc


# Lo que se le pide para llenar el repertorio, y por qué así.
#
# La diferencia de fondo con `PROMPT`: allí se transcribe y aquí se propone. El
# modelo es malo en la aritmética que esto necesitaría y bueno en lo que el
# optimizador no sabe —qué pega con qué—, así que se le pide **sólo la
# combinación**. Ni una cifra de nutriente: los macros salen de `nutrition.py`
# sobre fichas reales del catálogo, y es eso lo que hace seguro que un plato
# propuesto entre sin pasar por una pantalla de revisión.
#
# Los nombres tienen que venir copiados de la lista. Un nombre inventado no es
# un fallo que se corrija: es un alimento que no existe, y `repertoire.py` lo
# aparta al cajón de sugerencias en vez de dejarlo entrar a medias.
DISHES_PROMPT = """Eres quien propone platos con lo que hay en casa.

Te doy una lista de alimentos disponibles y unas condiciones. Devuelve SOLO un
objeto JSON. Sin markdown, sin explicación:

{
  "dishes": [
    {
      "name": "<nombre del plato, en español>",
      "method": "<air_fryer|plancha|sarten|horno|cocido|crudo>",
      "basis": "<raw|cooked>",
      "servings": <número de raciones que salen>,
      "minutes": <minutos de preparación>,
      "ingredients": [{"food": "<nombre EXACTO de la lista>", "grams": <gramos>}]
    }
  ]
}

REGLAS:
- Los `food` salen **copiados literalmente** de la lista de alimentos. No los
  traduzcas, no los abrevies y no inventes ninguno.
- **No devuelvas calorías ni macros.** Se calculan aquí a partir del catálogo;
  cualquier cifra nutricional que mandes se ignora.
- `basis` dice cómo se pesan los ingredientes: `raw` si los gramos son del
  alimento crudo, `cooked` si son del plato ya hecho. Usa el que corresponda a
  los nombres de la lista que estés usando.
- Platos que alguien cocinaría de verdad, no combinaciones aritméticas.
- Varía el modo de cocinado entre unos platos y otros.
"""


async def suggest_dishes(
    *,
    foods: list[str],
    methods: list[str] | None = None,
    minutes: int | None = None,
    n: int = 6,
    api_key: str,
    model: str,
    timeout: float = TIMEOUT,
    backoff: float = BACKOFF,
) -> dict:
    """Pide `n` platos con los alimentos dados. Devuelve el JSON tal cual.

    `temperature` alta al revés que en la etiqueta, y es la misma razón mirada
    del otro lado: allí dos lecturas iguales de la misma foto son lo correcto;
    aquí dos tandas idénticas de la misma despensa serían el fallo — lo que se
    pide es variedad.
    """
    condiciones = [f"Propón exactamente {n} platos distintos."]
    if methods:
        condiciones.append("Prioriza estos modos de cocinado: " + ", ".join(methods) + ".")
    if minutes:
        condiciones.append(f"Ninguno debe pasar de {minutes} minutos de preparación.")

    texto = (
        DISHES_PROMPT
        + "\nCONDICIONES:\n- "
        + "\n- ".join(condiciones)
        + "\n\nALIMENTOS DISPONIBLES:\n- "
        + "\n- ".join(foods)
    )
    return await _ask(
        [{"text": texto}],
        api_key=api_key,
        model=model,
        temperature=0.9,
        timeout=timeout,
        backoff=backoff,
    )


# Lo que se le pide para traer ideas con un alimento, y por qué así.
#
# Aquí el modelo no inventa: **busca**. Va con la herramienta `google_search` y
# se le pide que cada idea salga de una página que ha encontrado, con su enlace.
# Una idea sin enlace no se guarda (`app/ideas.py`), así que pedirlo no es
# cortesía: es la condición para que la respuesta sirva.
#
# Ni ingredientes ni cifras. Lo que se cocina de verdad sale de leer la página
# de la receta, y eso es la fase 2.
IDEAS_PROMPT = """Buscas en la web recetas reales en español construidas alrededor de un alimento.

Usa la búsqueda. Cada receta tiene que salir de una página que hayas encontrado,
y su `url` es la dirección de esa página, completa, empezando por https://: la
de la web de la receta, nunca un enlace de redirección de la búsqueda
(vertexaisearch.cloud.google.com). No inventes recetas ni direcciones: si no la
has encontrado, no la pongas.

Devuelve SOLO un objeto JSON. Sin markdown, sin explicación:

{
  "ideas": [
    {
      "name": "<nombre de la receta, como lo pone la página>",
      "url": "<dirección de la página de la receta>",
      "method": "<cómo se cocina, en una palabra: sartén, horno, olla, plancha, crudo, freidora de aire…>",
      "minutes": <minutos totales que dice la receta; omítelo si no lo dice>
    }
  ]
}

REGLAS:
- Recetas de páginas distintas, y platos distintos entre sí.
- El alimento es el protagonista del plato, no un acompañamiento.
- **Sin ingredientes, sin cantidades, sin calorías.** Sólo lo de arriba.
"""


async def find_ideas(
    *,
    food: str,
    avoid: list[str] | None = None,
    n: int = 5,
    api_key: str,
    model: str,
    timeout: float = 30.0,
    backoff: float = BACKOFF,
) -> str:
    """Busca `n` recetas con `food` y devuelve el texto del modelo, sin juzgarlo.

    Texto y no JSON: el JSON se pide en el prompt y lo lee `app/ideas.py`, que
    sabe quitarle las vallas. El timeout es más largo que el de la etiqueta
    porque aquí el modelo busca antes de contestar, y nadie tiene un yogur en la
    mano esperando.
    """
    texto = IDEAS_PROMPT + f"\nALIMENTO: {food}\nTrae {n} recetas."
    if avoid:
        texto += "\n\nYA LAS TENGO, trae otras distintas:\n- " + "\n- ".join(avoid)
    return await _ask(
        [{"text": texto}],
        api_key=api_key,
        model=model,
        temperature=0.7,
        timeout=timeout,
        backoff=backoff,
        tools=[{"google_search": {}}],
        as_text=True,
    )
