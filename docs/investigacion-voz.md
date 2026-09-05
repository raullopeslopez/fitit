# Registrar con la voz: qué se puede hacer hoy y cuál de los tres caminos vale

Revisión previa a implementar nada. La pregunta era «con IA y/o con lo que ofrezca
el propio teléfono», y la respuesta corta es que **el teléfono llega más lejos de lo
que parece y la IA hace falta más tarde de lo que parece** — pero sólo si se parte
el problema en dos capas, que es lo que hace este documento.

Misma regla que los otros documentos de esta carpeta: lo que no he verificado va
marcado como tal.

---

## 0. Confianza en cada fuente

| Fuente | Qué aporta | Confianza | Por qué |
|---|---|---|---|
| `backend/app/gemini.py`, `label.py`, `foods.py` | Coste, cuota y forma de una llamada al modelo en request | **Alta** | Código de este repo, con las cuotas ya medidas contra la API en agosto y septiembre |
| `frontend/src/offline.js` | Que el registro de series funciona sin red | **Alta** | Código de este repo |
| `backend/app/schemas.py`, `models.py` | Que `entry_source="voice"` está reservado desde el día uno | **Alta** | Código de este repo |
| [Gemini API — Audio understanding](https://ai.google.dev/gemini-api/docs/audio) | Formatos de audio, tope de 20 MB, 32 tokens/segundo | **Alta** | Documentación oficial, leída |
| [MDN — `SpeechRecognition`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) | Que en Chrome el reconocimiento va contra un servidor y **no funciona sin red**; `available()`, `install()`, `processLocally` | **Alta** | Documentación oficial, leída |
| [Explainer de reconocimiento en el dispositivo (WebAudio/W3C)](https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md) | Los cuatro estados de `available()` | **Alta** | Explainer oficial, leído |
| [Intent to Ship: On-device Web Speech API](https://groups.google.com/a/chromium.org/g/blink-dev/c/VNOok2dbmHM/m/gwbtzV-lAQAJ) | Que lo local ya está enviado en Chrome | **Media-alta** | Hilo de blink-dev, leído por encima |
| Soporte de `webkitSpeechRecognition` en Chrome Android | Que la API existe en tu móvil | ⚠️ **Media** | Fuentes secundarias. **Se resuelve en cinco minutos con tu teléfono** — sección 8 |
| Disponibilidad de `es-ES` en el dispositivo | Si el dictado funciona en el sótano | ⚠️ **Sin verificar** | Depende del móvil concreto. Misma comprobación de la sección 8 |

---

## 1. Son dos funcionalidades, no una

«Registrar con la voz» significa cosas distintas en las dos pantallas, y meterlas en
el mismo saco es lo que hace que el proyecto parezca grande.

**Serie de entreno.** Estás de pie, con las manos ocupadas y sudadas, dentro de una
tarjeta de ejercicio que ya sabe qué ejercicio es. Lo que falta son **dos números**:
`80 por 8`. El vocabulario es cerrado, el margen de ambigüedad es casi nulo y la
pantalla ya imprime el par en ese mismo orden (`shownPair` pinta `peso×reps`), así
que lo que se dice y lo que se ve coinciden sin tener que enseñar nada.

**Entrada de comida.** Estás sentado, con una mano libre, y lo que falta es
**resolver un nombre contra un catálogo de 3.185 filas** y ponerle una cantidad:
«un yogur natural de Hacendado». El vocabulario es abierto y la ambigüedad es el
problema entero — hay doce yogures.

Son dos problemas de dificultad muy distinta. El primero se resuelve sin IA. El
segundo puede que también, y si no, la IA entra por un sitio mucho más barato que
el que uno supondría.

---

## 2. Las dos capas

Todo lo que viene después depende de partirlo aquí:

- **Capa A — audio → texto.** «Convierte lo que he dicho en una cadena.»
- **Capa B — texto → intención.** «Convierte esa cadena en `{reps: 8, weight: 80}`.»

Se pueden elegir por separado, y **elegirlas por separado es lo que abarata la
funcionalidad hasta hacerla viable.** El diseño que sale de pensarlo como un bloque
—grabar audio, mandárselo a un modelo, que devuelva la serie— es el más caro de los
posibles y encima es el que falla justo donde hace falta. Sección 4.

---

## 3. Capa A: las tres formas de convertir voz en texto

### 3.1 Web Speech API (lo que ofrece el propio teléfono)

`webkitSpeechRecognition` en Chrome. Cinco líneas, cero backend, cero coste:

```js
const rec = new webkitSpeechRecognition()
rec.lang = 'es-ES'
rec.interimResults = true      // para pintar lo que va oyendo
rec.onresult = (e) => parseSerie(e.results[0][0].transcript)
rec.start()
```

- **Coste:** cero. Sin clave, sin cuota, sin límite de peticiones.
- **Latencia:** con `interimResults` el texto aparece mientras hablas.
- **Dónde va el audio:** por defecto, **a un servidor de Google**. Que la API sea
  del navegador no la hace local — es el punto que más se malinterpreta de esta API
  y el que decide la sección 4.
- **Navegadores:** Chrome sí; Safari desde iOS 14.5 pero con fama de irregular;
  Firefox no. El proyecto ya tiene el precedente exacto de cómo tratar esto:
  `canScan()` en `Comida.jsx` esconde el botón de código de barras donde
  `BarcodeDetector` no existe, con el argumento escrito de que «un botón que no
  puede funcionar es peor que uno que no está».

### 3.2 Reconocimiento en el dispositivo (la misma API, en local)

La novedad que cambia el análisis. Chrome añadió tres piezas a esa misma API:

```js
await SpeechRecognition.available({ langs: ['es-ES'], processLocally: true })
// → 'available' | 'downloadable' | 'downloading' | 'unavailable'
await SpeechRecognition.install({ langs: ['es-ES'], processLocally: true })
rec.processLocally = true
```

Con el paquete de idioma instalado, **el audio no sale del teléfono y el dictado
funciona sin red**. Eso es exactamente lo que este proyecto necesita, y es gratis.
Lo que no sé es si `es-ES` está disponible en tu móvil: la disponibilidad depende
del fabricante y de la versión. Se comprueba en un minuto (sección 8).

### 3.3 Audio → Gemini (la vía «IA»)

`MediaRecorder` graba, se sube el `.webm` y se manda a `generateContent` como
`inline_data`, igual que la foto de la etiqueta. Está confirmado que la API acepta
`audio/webm`, que el tope de petición son 20 MB y que el audio cuesta 32 tokens por
segundo — un dictado de diez segundos son 320 tokens, calderilla.

**Y aun así es la peor opción para las series, por una razón que no son los tokens.**
Lo dice tu propio código, medido en el panel de AI Studio el 2026-09-04 y anotado
en `gemini.py`:

> El tier gratuito da **5 peticiones por minuto y 20 al día**.

Un entreno son 20–30 series. Con una llamada por serie, **el primer ejercicio se
come la cuota del día entero** — y se la come compartiéndola con el lector de
etiquetas, que la necesita para la comida. No es que salga caro: es que no cabe.

Donde sí cabe es en **un dictado largo por sesión o por comida** («press banca
ochenta por ocho, ochenta por siete, ochenta por seis»): una petición en vez de
veinticinco. Es una funcionalidad legítima, pero es otra —«contar lo que ya hice»
en vez de «registrar mientras entreno»— y llega tarde: lo que se dicta a
posteriori compite con la memoria, no con el teclado.

### 3.4 El punto de partida honesto: el dictado del teclado ya funciona

Antes de construir nada: hoy, tocando el micro de Gboard con el campo de reps
enfocado, ya se dicta un número. Coste cero, cero código.

Lo que eso **no** te da, y es todo lo que justifica esta funcionalidad:

1. Sigue habiendo que **tocar el campo** — dos campos, dos toques, con las manos ocupadas.
2. No entiende **la serie entera de una vez**: «ochenta por ocho» en un campo numérico no es nada.
3. No encadena series sin volver a la pantalla.

Si al final el trabajo no elimina esos tres toques, no ha valido la pena. Es el
listón contra el que hay que medir cualquier prototipo.

### 3.5 Comparativa

| | Web Speech (nube) | Web Speech (local) | MediaRecorder → Gemini | Dictado de Gboard |
|---|---|---|---|---|
| Coste por uso | 0 | 0 | 1 de 20 al día | 0 |
| **Funciona sin red** | **No** | **Sí** | No | No (dictado de Google) |
| Latencia | ~instantánea | ~instantánea | 2–12 s | ~instantánea |
| El audio sale del móvil | Sí | **No** | Sí | Sí |
| Trabajo de backend | Ninguno | Ninguno | Endpoint + validador | Ninguno |
| Serie entera de un tirón | Sí | Sí | Sí | No |
| Vocabulario abierto (comida) | Regular | Regular | **Bueno** | Regular |

---

## 4. El hallazgo que decide: el gimnasio es un sótano

Está escrito en la primera línea de `frontend/src/offline.js`:

> Gyms are basements and the free tier sleeps, so a set you have already done must
> never depend on a request succeeding right now.

Ese comentario es la razón de que exista la cola de `localStorage`, y **descalifica
de golpe las dos opciones que van por red** para el caso de las series. Una
funcionalidad de voz que necesita cobertura falla exactamente en el sitio donde se
usa, y falla en silencio: tocas el micro, no pasa nada, y no hay forma de distinguir
«no te he oído» de «no hay red».

De ahí salen las tres conclusiones que ordenan todo lo demás:

1. **Para las series, la capa A tiene que ser local** (`processLocally`) o no tiene
   sentido construirla. Si `es-ES` no está disponible en el dispositivo, la
   funcionalidad se degrada a «funciona con cobertura», y eso **hay que decirlo en
   pantalla**, con la misma lógica con que `ScanNote` distingue «no he visto código»
   de «no había red».
2. **Para las series, la capa B tiene que ser local también.** Un parser en el
   frontend, no un endpoint. Un parser que necesita servidor tiene el mismo problema
   que el reconocimiento que necesita servidor.
3. **Gemini no pinta nada en el registro de series.** Ni por cuota, ni por latencia,
   ni por red. Donde puede pintar algo es en la comida, y sobre **texto**, no sobre
   audio (sección 6.3).

---

## 5. Capa B, series: una gramática, no un modelo

Lo que hay que entender es un lenguaje diminuto y cerrado. Un parser determinista lo
cubre en unas ochenta líneas, corre sin red, tarda cero, no cuesta nada y —esto es
lo importante— **se prueba entero sin mock, sin clave y sin cuota**, que es lo que
`gemini.py`/`label.py` tuvieron que separar a propósito para conseguir.

Lo que tiene que reconocer, en `frontend/src/voz.js`:

| Lo que dices | Lo que sale |
|---|---|
| «ochenta por ocho» | `{ weight: 80, reps: 8 }` |
| «80 por 8» (si el reconocedor ya digitaliza) | igual |
| «ochenta kilos ocho repeticiones» | igual |
| «ochenta y dos y medio por seis» | `{ weight: 82.5, reps: 6 }` |
| «ciento veinte por tres» | `{ weight: 120, reps: 3 }` |
| «ocho repeticiones» | `{ reps: 8 }` — el peso se queda el que ya trae el formulario |
| «corporal ocho», «sin peso ocho» | `{ weight: null, reps: 8 }` |
| cualquier otra cosa | `null` — y no se toca el formulario |

Dos detalles que no son de estilo:

- **El orden es peso × reps porque la pantalla ya lo pinta así.** No hay que
  enseñar una convención nueva; hay que respetar la que ya está impresa.
- **Nunca se corrige un par implausible dándole la vuelta.** «Ocho por ochenta»
  son 8 kg y 80 reps, y es raro, pero adivinar que querías decir lo contrario es
  precisamente lo que `label.py` se niega a hacer con la columna «por ración»:
  antes rechazar que reescalar a ojo. Se rellena lo que se ha oído y lo ves.

El reconocedor **no se puede sesgar**: `SpeechGrammarList` no hace nada en Chrome.
Por eso el vocabulario de la fase 1 son números y nada más — el día que se dicte el
nombre del ejercicio («press banca» sale como «presbanca», «prensa banca», «press
franca»), la salvación es que ese problema ya está resuelto en este repo:
`fold_exercise_name()` y el emparejamiento de `test_exercise_matching.py` son
exactamente para esto.

---

## 6. Capa B, comida: el catálogo resuelve, la voz sólo trocea

### 6.1 Lo que la voz no puede hacer, y no es negociable

De `CLAUDE.md`:

> **Nada crea alimentos solo.** Ni un import, ni el escáner, ni un parser: `POST
> /foods` desde un formulario que el usuario rellenó es la única puerta.

El parser de voz está nombrado ahí, por escrito, antes de existir. Así que la voz
**puede** elegir un alimento del catálogo y ponerle gramos; **no puede** dar de alta
uno que no esté. Cuando el nombre no casa con nada, el final del camino es el
formulario en blanco, igual que una foto ilegible.

Y `NULL` sigue sin ser `0`: la voz no rellena un macro que nadie ha medido.

### 6.2 Lo que ya está preparado para esto

El esquema lleva la funcionalidad reservada desde el primer día:

```python
# schemas.py
EntrySource = Literal["manual", "barcode", "template", "repeat", "voice"]
quantity: float = Field(default=1, gt=0, le=100)  # "dos rebanadas"
```

El comentario de `models.py` dice para qué: «so that, a month in, "how much do I
actually use the voice parser?" is a query rather than a guess». O sea que del lado
de la comida el backend **no hay que tocarlo**: mandar `entry_source="voice"` en
`POST /food-log` es todo.

> ⚠️ **Del lado de las series no existe ese campo.** `set_entries` no tiene columna
> de origen. Si quieres poder responder la misma pregunta para el entreno, hace
> falta una migración Alembic con un `source` en `set_entries`. Es una decisión
> tuya, no un detalle: sin ella, dentro de un mes «¿uso la voz en el gimnasio?» se
> contesta de memoria.

### 6.3 Dónde entra la IA, si es que entra

«Un yogur natural de Hacendado y dos rebanadas de pan integral» se trocea en
`[(1, "yogur natural", "Hacendado"), (2, "rebanada", "pan integral")]`, y **el que
resuelve cada trozo es el buscador que ya existe**: `/foods/search` pliega acentos
con `fold_exercise_name` y ordena por exactitud (`_rank`). El modelo no elige el
alimento; propone un texto de búsqueda. Si hay doce yogures, se pintan los doce y
tocas uno — que es lo que hace la pantalla hoy.

Con esa forma, la IA es opcional:

- **Sin IA:** un parser de «cantidad + unidad + nombre» cubre la mayoría de las
  frases reales, y lo que no entiende se queda en el buscador con el texto dictado
  tal cual. Coste cero.
- **Con IA (Gemini, sobre texto):** una llamada por dictado, no por alimento; ~200
  tokens de entrada. Aguanta «me he comido medio paquete de pasta con atún y un
  chorro de aceite», que el parser no. Sigue gastando de las 20 peticiones diarias
  que comparte con el lector de etiquetas, así que **son ~5 dictados al día**, que
  para comidas da de sobra y para series no daba.

Recomendación: construir la versión sin IA y **medirla** (`entry_source="voice"` ya
lo permite). Si el parser falla lo bastante como para molestar, ya está el sitio
hecho para meter el modelo detrás, con el patrón de `gemini.py` + validador tal cual.

---

## 7. La propuesta, en tres fases

**Fase 1 — Series, sin red y sin IA.** Un botón de micro en la tarjeta de ejercicio
del entreno en curso. Tocas, dices «ochenta por ocho», la serie queda registrada con
un deshacer visible. `voz.js` (parser) + `reconocimiento.js` (envoltorio de la API,
con el `canScan()` de `Comida.jsx` como plantilla para esconder el botón donde no
funcione). Backend: nada, salvo la migración de `source` si la quieres.

Por qué registra en vez de pedir confirmación: la serie no es ambigua una vez estás
dentro de la tarjeta, y obligar a mirar y confirmar devuelve el toque que la
funcionalidad venía a quitar. La red de seguridad es el deshacer —el mismo patrón
que ya usa el borrado de entradas de comida— más el «Corregir» que ya existe.

**Fase 2 — Comida, con el catálogo.** Micro en el buscador de alimentos. Dictas, se
trocea, se busca, eliges. Aquí **sí** se rellena el formulario en vez de registrar:
doce yogures son doce yogures.

**Fase 3 — IA sobre el texto, sólo si la fase 2 se queda corta.** Y sólo para comida.

Nada de esto propone tocar `DESIGN.md`: el control se decide ahí antes de pintarlo.

---

## 8. Cómo salir de dudas en cinco minutos

Dos cosas deciden si la fase 1 es lo que promete, y ninguna se puede contestar desde
aquí: hacen falta **tu** móvil y **tu** Chrome. Abre `fitit-n4q0.onrender.com` en el
teléfono, conecta el depurador y pega esto en la consola:

```js
// 1. ¿Existe la API, y hay reconocimiento local en español?
const SR = window.SpeechRecognition || window.webkitSpeechRecognition
console.log('API:', !!SR)
console.log('local es-ES:', SR.available && await SR.available({ langs: ['es-ES'], processLocally: true }))

// 2. ¿Qué texto devuelve realmente? Di «ochenta por ocho».
const r = new SR(); r.lang = 'es-ES'
r.onresult = (e) => console.log('OÍDO:', JSON.stringify(e.results[0][0].transcript))
r.start()
```

- Si la línea 2 dice `'available'` o `'downloadable'` → la fase 1 funciona en el
  sótano y merece la pena entera.
- Si dice `'unavailable'` → funciona sólo con cobertura, y hay que decidir si eso
  sigue valiendo (yo diría que sí para la comida, y que a medias para el entreno).
- Lo que imprima `OÍDO:` decide el parser: si sale `"80 por 8"` la gramática de
  números sobra casi entera; si sale `"ochenta por ocho"`, hace falta completa. Muy
  probablemente salgan las dos según el día, así que se soportarán las dos — pero
  saber cuál es la común decide cuál se prueba primero.

---

## 9. Cómo se prueba

- **El parser, en `vitest`.** Es una función pura: entra una cadena, sale un objeto
  o `null`. Es el sitio donde vive de verdad la especificación de esta
  funcionalidad, y no cuesta ni red ni cuota.
- **El envoltorio del reconocimiento, en jsdom**, con `window.SpeechRecognition`
  suplantado — el mismo truco con el que ya se prueba `BarcodeDetector`.
- **La suite de navegador no puede probar esto.** El Chromium de Playwright no trae
  la clave del servicio de voz de Google, así que la API o no está o no contesta.
  Que quede dicho: el micro real sólo se prueba en el teléfono, a mano.
- ⚠️ **Y esto choca con «spec-first».** El proyecto pone el comportamiento en
  `.feature` con pytest-bdd, y la fase 1 **no toca el backend**: no hay nada que
  escribir en Gherkin salvo que se añada la columna `source`. La fase 2 sí (una
  entrada con `entry_source="voice"` es comprobable de punta a punta). Es una
  decisión tuya y la dejo encima de la mesa en vez de tomarla: o la fase 1 acepta
  que su spec vive en vitest, o se empieza por la fase 2, que encaja en el molde de
  siempre.

---

## 10. Lo que no he verificado

- Si `es-ES` está disponible en el dispositivo en tu móvil. Sección 8.
- Si Chrome Android devuelve los números como dígitos o como palabras. Sección 8.
- Si el permiso del micro sobrevive bien en la PWA instalada (`display: standalone`).
  Debería concederse una vez por origen, pero no lo he probado ahí.
- Qué tal reconoce `es-ES` los nombres de ejercicio en la jerga del gimnasio. Por eso
  no están en la fase 1.
- Si `continuous = true` aguanta varias series seguidas en Android sin cortarse.
  Tiene mala fama; la fase 1 lo evita usando un disparo por serie.
