# Registrar comida con la voz: dónde está el problema de verdad

Revisión previa a implementar nada. La pregunta era «con IA y/o con lo que ofrezca el
propio teléfono», y la respuesta corta es que **la parte de oírte está resuelta y es
gratis, y el problema entero está en el otro lado**: convertir «un yogur natural» en
un número de gramos sin inventárselo.

Misma regla que los otros documentos de esta carpeta: lo que no he verificado va
marcado como tal.

---

## 1. El problema no es oírte

Es tentador leer «registrar con la voz» como un problema de reconocimiento de voz. No
lo es. Lo dice el propio flujo de hoy: para meter un yogur en el diario tocas *Buscar
alimento*, escribes «yog», tocas la fila, escribes los gramos, eliges la comida y
guardas. De esos seis pasos, **el dictado sólo se come el segundo**.

Lo que sí se come de golpe es el caso de varias cosas a la vez: «dos huevos, una
tostada de pan integral y un café con leche» son hoy tres ciclos completos de
búsqueda, y dictados son uno. Ahí está el valor, y por eso el diseño tiene que ser
**multientrada desde el primer día** — una funcionalidad que sólo sepa meter un
alimento por dictado no gana nada al teclado.

Y luego está el muro, que es la sección 6: dictar «un yogur» no dice cuántos gramos
es un yogur, y este proyecto tiene prohibido inventárselo.

---

## 2. Confianza en cada fuente

| Fuente | Qué aporta | Confianza | Por qué |
|---|---|---|---|
| `foods.py`, `food_log.py`, `models.py`, `schemas.py` | Que el catálogo no se edita, que las raciones sólo nacen en `POST /foods`, que `_resolve_grams` exige gramos o ración | **Alta** | Código de este repo |
| `features/frequent_foods.feature` | Que el repertorio ya devuelve los gramos que repites y la comida a la que suele ir | **Alta** | Spec de este repo |
| `scripts/import_ciqual.py` | Que las 3.185 filas de CIQUAL entran **sin ninguna ración** | **Alta** | Sin una sola mención a `Portion` en el script |
| `gemini.py` | Cuota real: 5 peticiones/minuto, 20/día, compartidas con el lector de etiquetas | **Alta** | Medido contra el panel de AI Studio el 2026-09-04 |
| [Gemini — Audio understanding](https://ai.google.dev/gemini-api/docs/audio) | Acepta `audio/webm`, 20 MB por petición, 32 tokens/segundo | **Alta** | Documentación oficial, leída |
| [MDN — `SpeechRecognition`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) | Que en Chrome el reconocimiento va por red; `available()`, `install()`, `processLocally` | **Alta** | Documentación oficial, leída |
| [Explainer de reconocimiento local](https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md) | Los cuatro estados de `available()` | **Alta** | Explainer oficial, leído |
| Soporte de `webkitSpeechRecognition` en Chrome Android | Que la API existe en tu móvil | ⚠️ **Media** | Fuentes secundarias. **Se resuelve en cinco minutos con tu teléfono** — sección 10 |
| Qué tal reconoce `es-ES` los nombres de comida | Si «cortado» o «pechuga» llegan enteros | ⚠️ **Sin verificar** | Misma comprobación de la sección 10 |

---

## 3. Las dos capas

Partirlo aquí es lo que decide todo lo demás:

- **Capa A — audio → texto.** «Convierte lo que he dicho en una cadena.»
- **Capa B — texto → entradas del diario.** «Convierte esa cadena en filas de `log_entries`.»

La capa A está resuelta, es gratis e ilimitada. **Toda la dificultad, todo el riesgo y
todo el trabajo están en la capa B.** El diseño que trata esto como un bloque —grabar,
mandárselo a un modelo, que devuelva las entradas— parece el más moderno y es el que
más se equivoca, porque le pide al modelo justo lo que el modelo no puede saber: cuánto
pesa tu yogur.

---

## 4. Capa A: cómo oírte

### 4.1 Web Speech API (lo que ofrece el propio teléfono)

Cinco líneas, cero backend, cero coste:

```js
const rec = new webkitSpeechRecognition()
rec.lang = 'es-ES'
rec.interimResults = true      // para pintar lo que va oyendo
rec.onresult = (e) => proponer(e.results[0][0].transcript)
rec.start()
```

- **Coste:** cero. Sin clave, sin cuota, sin límite.
- **Latencia:** con `interimResults`, el texto aparece mientras hablas.
- **Dónde va el audio:** por defecto a un servidor de Google, así que **necesita red**.
  Para comida eso da igual: la pantalla ya necesita red para buscar en el catálogo,
  así que la voz no añade ninguna dependencia nueva. (No así en el gimnasio — sección 12.)
- **Navegadores:** Chrome sí; Safari desde iOS 14.5 pero irregular; Firefox no. El
  proyecto ya tiene el precedente exacto: `canScan()` esconde el botón de código de
  barras donde `BarcodeDetector` no existe, con el argumento escrito de que «un botón
  que no puede funcionar es peor que uno que no está».

### 4.2 Audio → Gemini

`MediaRecorder` graba y se manda el `.webm` a `generateContent`, igual que la foto de
la etiqueta. Está confirmado que acepta `audio/webm`, con tope de 20 MB, a 32 tokens
por segundo — un dictado de diez segundos son 320 tokens, calderilla.

Lo que no es calderilla es la cuota: **20 peticiones al día, compartidas con el lector
de etiquetas**. Un dictado por comida son 3–5 al día, así que cabe — pero cada dictado
es una foto de etiqueta que ese día ya no puedes hacer.

Y a cambio de ese coste no te llevas gran cosa, porque **el modelo tampoco sabe cuántos
gramos es un yogur**. Pagas la cuota por la parte fácil.

### 4.3 El punto de partida honesto: el dictado del teclado ya funciona

Hoy, tocando el micro de Gboard con el buscador de alimentos enfocado, ya dictas
«yogur natural». Coste cero, cero código. Lo que eso **no** te da:

1. No entiende **varias cosas de una vez**. Es la razón principal de la funcionalidad.
2. No rellena los **gramos** ni la **comida**: sigues tocando dos campos más.
3. No sabe que «cortado» es «café con leche».

Si el trabajo no elimina esos tres, no ha valido la pena. Es el listón.

### 4.4 Comparativa

| | Web Speech | MediaRecorder → Gemini | Dictado de Gboard |
|---|---|---|---|
| Coste por uso | 0 | 1 de 20 al día | 0 |
| Latencia | ~instantánea | 2–12 s | ~instantánea |
| Trabajo de backend | Ninguno | Endpoint + validador | Ninguno |
| Varias cosas de un tirón | Sí, si la capa B lo trocea | Sí | No |
| Te enseña lo que ha oído | Sí | Sí | Sí (lo escribe) |
| **Resuelve los gramos** | **No** | **No** | **No** |

La última fila es la que importa, y es la que hace que la elección de capa A sea casi
indiferente. Por eso: **Web Speech**, que es la gratis.

---

## 5. Capa B: del texto al diario, en cuatro pasos

«dos huevos, una tostada de pan integral y un café con leche»

1. **Trocear** en `[(2, "huevos"), (1, "tostada de pan integral"), (1, "café con leche")]`.
   Corta por comas y por «y». Números en palabras («ciento veinticinco») o en dígitos,
   según lo que devuelva el reconocedor.
2. **Buscar** cada trozo en `/foods/search`, que ya pliega acentos (`fold_exercise_name`)
   y ya ordena por exactitud (`_rank`). **Aquí no elige el modelo: elige el catálogo.**
3. **Poner los gramos.** Sección 6. Es el paso difícil.
4. **Proponer**, no registrar. Sección 8.

Dos cosas que este repo ya tiene y que hacen el paso 2 mucho mejor de lo que parece:

- **La tabla `food_aliases`.** La traducción de CIQUAL dejó 3.185 nombres **con sus
  alias**, y `_rank` los puntúa. O sea que la distancia entre cómo hablas y cómo se
  llama la fila ya está parcialmente cubierta sin IA ninguna.
- **`entry_source="voice"`**, reservado en `schemas.py` y en `models.py` desde el día
  uno, con el comentario escrito de que existe «so that, a month in, "how much do I
  actually use the voice parser?" is a query rather than a guess». El backend de la
  comida **no hay que tocarlo**: basta con mandar ese valor.

---

## 6. El muro: los gramos

Aquí es donde se decide si esta funcionalidad es buena o es una máquina de ensuciar el
diario.

### 6.1 Por qué es un muro

- `_resolve_grams()` sólo acepta dos cosas: `grams`, o un `portion_id` **de ese
  alimento**. Si no llega ninguna, devuelve 422. No hay tercera vía, y está bien que no
  la haya.
- **Las 3.185 filas de CIQUAL entran sin una sola ración.** Lo he comprobado: no hay ni
  una mención a `Portion` en `import_ciqual.py`.
- **Y no se les pueden añadir.** Las raciones sólo nacen dentro de `POST /foods`, y
  `PATCH /foods/{id}` contesta `403 "the shared catalogue is not editable"` para
  cualquier fila con `user_id IS NULL`.

Conclusión incómoda: **hoy, «dos rebanadas» sólo puede funcionar con alimentos que
hayas dado de alta tú.** Para todo lo que venga de CIQUAL —que es casi todo— una
cantidad dicha en unidades no tiene ninguna forma legítima de convertirse en gramos.

Y la tentación es obvia y hay que decirla en voz alta para poder rechazarla: poner 125 g
por yogur, 60 g por huevo, 30 g por rebanada. Sería **exactamente el mismo pecado que
el `0` de fibra** que `label.py` se dedica a impedir, con otro disfraz: un número que
nadie midió, congelado en `log_entries`, indistinguible para siempre de uno que pesaste.
Con el agravante de que un peso inventado no chirría en pantalla — 125 g de yogur es
perfectamente creíble.

### 6.2 La salida: tu propio repertorio

`GET /foods/frequent` ya devuelve, por cada alimento que has comido, **los gramos que
repites** y **la comida a la que suele ir**. Y la spec es explícita sobre cuál devuelve:

> Scenario: The amount offered is the one I repeat, not the last one I typed

Eso no es un número inventado: es tuyo, lo escribiste tú, y ya está en el diario. Usarlo
para rellenar el campo —enseñándolo, editable— es legítimo. Es memoria, no adivinanza.

**Las cuatro reglas, por orden de prioridad:**

| Lo que dices | De dónde salen los gramos |
|---|---|
| «ciento veinticinco gramos de yogur natural» | De lo que has dicho |
| «dos rebanadas de pan de molde» (alimento **tuyo**, con ración «rebanada») | `portion_id` × cantidad |
| «un yogur natural», sin cantidad | De tu repertorio: los gramos que sueles poner |
| Cualquier otra cosa | **En blanco. Los pones tú.** |

La cuarta regla es la que sostiene las otras tres. Y la primera vez que dictas algo
siempre caes en ella — pero sólo la primera vez: pones los gramos, la entrada se
escribe, y a partir de la tercera vez el repertorio ya la conoce. **La funcionalidad se
afila sola con el uso, sin que nadie invente nada.**

### 6.3 La trampa del ×cantidad

El repertorio guarda **gramos por entrada**, no gramos por unidad. Si sueles registrar
120 g de huevo cocido, nadie sabe si esos 120 g eran un huevo o dos.

Así que **cuando dices una cantidad en unidades y no hay ración, no se multiplica nada**:
los gramos se quedan en blanco y la cantidad dicha se enseña. Multiplicar el repertorio
por la cantidad dicha sería escalar por un factor que nadie eligió, que es literalmente
lo que `label.py` se niega a hacer con la columna «por ración» —

> Rechazar no es fallar: el formulario se abre igual, en blanco, y lo tecleas.

— y sería peor aquí, porque allí se rechaza la lectura entera y aquí saldría una cifra
creíble.

### 6.4 La decisión que te dejo encima de la mesa

**Lo que más sube el techo de esta funcionalidad no es la voz: son las raciones sobre el
catálogo compartido.** Con una tabla de raciones tuyas apuntando a filas de CIQUAL
—«huevo: unidad = 60 g», dicho por ti una vez— la regla 2 pasa de cubrir tus cuatro
alimentos propios a cubrirlo todo, y «dos huevos» se registra entero de un tirón.

Es una migración Alembic y un endpoint, no es gratis, y **no viola ninguna regla del
proyecto**: no crea alimentos, no edita el catálogo, y el número lo pones tú. Pero es
una decisión tuya y no la tomo yo. Sin ella, la fase 1 funciona y es útil; con ella, es
notablemente mejor.

---

## 7. Dónde entra la IA de verdad

Menos de lo que parece, y por un sitio distinto del que uno supondría.

**No hace falta para trocear.** «Dos huevos y un yogur» lo parte una función pura de
ochenta líneas que corre gratis, al instante, y que se prueba entera sin red, sin clave
y sin cuota — que es justo lo que `gemini.py` y `label.py` tuvieron que separar a
propósito para conseguir.

**No resuelve los gramos.** Sección 6. Es el muro para todo el mundo, modelo incluido.

**Sí ayuda con el nombre.** CIQUAL habla en formal traducido del francés («Yogur
natural, entero») y tú hablas en castellano de cocina («un cortado», «pechuga a la
plancha», «un yogur de esos griegos»). Ahí un modelo convierte tu frase en un término de
búsqueda decente. Pero fíjate en la forma: **el modelo propone texto de búsqueda; el que
elige el alimento sigue siendo `/foods/search`.** Nunca devuelve un `food_id`.

Y ese hueco ya está medio tapado por los alias de la traducción, así que la única forma
honesta de saber si merece la cuota es **medirlo**: construir la fase 1 sin IA, mirar
con `entry_source="voice"` cuántos dictados acaban en «no lo encuentro», y meter el
modelo detrás sólo si el número molesta. El patrón de `gemini.py` + validador está
hecho y se reutiliza tal cual.

---

## 8. Lo que la voz no puede hacer nunca

De `CLAUDE.md`, y el parser de voz está nombrado ahí por escrito antes de existir:

> **Nada crea alimentos solo.** Ni un import, ni el escáner, ni un parser: `POST /foods`
> desde un formulario que el usuario rellenó es la única puerta.

De ahí, tres límites que no son negociables:

1. **No da de alta alimentos.** Si «cortado» no casa con nada, el final del camino es el
   buscador con el texto puesto, o el formulario en blanco. Igual que una foto ilegible.
2. **No registra sola.** Propone filas; tú confirmas. La comida sí es ambigua —hay doce
   yogures— y aquí no vale el «deshacer» que bastaría para una serie de entreno: una
   entrada mal resuelta congela macros equivocados en `log_entries`.
3. **No rellena un macro que nadie ha medido.** `NULL` no es `0`, tampoco por voz.

Y una cuarta que copio directamente de `label.py`: **cada fila propuesta tiene que poder
señalar las palabras de las que salió.** `_backed_by_a_row()` tira toda cifra que la
transcripción no respalde; aquí, una entrada que no se pueda anclar a un trozo de lo que
dijiste es una entrada inventada, y se tira igual. Por eso la transcripción se enseña:
es la prueba, no la decoración.

---

## 9. La propuesta

**Un tercer botón en `Comida.jsx`**, al lado de *Escanear código* y *Leer etiqueta*.
Los tres acaban en el mismo sitio: el formulario relleno, que tú confirmas.

**Dónde:** pantalla *Comida*, en la fila de acciones que hoy tiene los dos botones de
cámara, debajo del buscador de alimentos.

**Qué ves, antes → después:** hoy hay dos botones; pasa a haber tres. El nuevo se llama
**«Dictar»**, y mientras escucha dice **«Escuchando…»** — la misma forma que el
«Leyendo…» de los otros dos, y por la misma razón: que se vea cuál de los tres está
trabajando.

**Qué tienes que hacer para verlo:** abrir *Comida* y mirar. Tocar *Dictar* pide el
micrófono la primera vez.

**Después de hablar** aparece, encima del formulario:

- La transcripción: **«He oído: "dos huevos y un yogur natural"»**
- Una fila por cosa entendida, cada una con su alimento resuelto, sus gramos y su
  comida, y un botón de confirmar.
- Donde no haya gramos: **«Pon los gramos»**, con el campo enfocado.
- Donde salgan del repertorio: **«125 g · lo que sueles poner»**.
- Donde no haya alimento: **«No tengo "cortado" en el catálogo. Búscalo o tecléalo.»**

**Dónde no se ve nada:** en un navegador sin `SpeechRecognition` el botón no existe,
igual que hoy no existe *Escanear código* en Safari.

**Qué se toca:** `frontend/src/voz.js` (trocear, números en castellano — función pura),
el envoltorio del reconocedor, y la pantalla. **Backend: nada**, salvo que decidas lo de
las raciones (6.4).

**Nada de esto fija estilos:** el control se decide contra `DESIGN.md` antes de pintarlo.

---

## 10. Cómo salir de dudas en cinco minutos

Dos cosas deciden cuánto trabajo es esto, y ninguna se contesta desde aquí: hacen falta
**tu** móvil y **tu** Chrome. Abre `fitit-n4q0.onrender.com`, conecta el depurador y
pega esto:

```js
const SR = window.SpeechRecognition || window.webkitSpeechRecognition
console.log('API:', !!SR)

const r = new SR(); r.lang = 'es-ES'
r.onresult = (e) => console.log('OÍDO:', JSON.stringify(e.results[0][0].transcript))
r.start()
// Di: «dos huevos, ciento veinticinco gramos de yogur natural y un cortado»
```

Lo que imprima decide dos cosas:

- **Si los números salen como `"125"` o como `"ciento veinticinco"`.** Lo primero deja
  la gramática de números casi sin trabajo; lo segundo la pide entera. Probablemente
  salgan las dos según el día, así que se soportarán las dos — pero saber cuál es la
  común decide cuál se prueba primero.
- **Si «cortado» llega entero**, y en general qué tal aguanta el vocabulario de cocina.
  Es lo único que puede justificar meter a Gemini (sección 7).

Antes de esa prueba no merece la pena escribir el parser.

---

## 11. Cómo se prueba

- **El troceador, en `vitest`.** Es una función pura: entra una cadena, salen tuplas o
  nada. Es donde vive de verdad la especificación, y no cuesta ni red ni cuota.
- **El envoltorio del reconocedor, en jsdom**, con `window.SpeechRecognition` suplantado
  — el mismo truco con el que ya se prueba `BarcodeDetector`.
- **La suite de navegador no puede probar esto.** El Chromium de Playwright no trae la
  clave del servicio de voz de Google. El micro real se prueba en el teléfono, a mano.
- **Y sí hay Gherkin que escribir**, al contrario que en el entreno: una entrada con
  `entry_source="voice"` es comprobable de punta a punta, y las reglas de la sección 6
  son escenarios de libro — «una cantidad en unidades sin ración no propone gramos»,
  «los gramos del repertorio son los que repito, no los últimos». Encaja en el molde
  spec-first de siempre.

---

## 12. Lo que no he verificado, y un apunte sobre el entreno

Sin verificar:

- Que `webkitSpeechRecognition` exista en tu Chrome Android. Sección 10.
- Si los números vuelven en dígitos o en palabras. Sección 10.
- Qué tal reconoce `es-ES` el vocabulario de cocina. Sección 10.
- Si el permiso del micrófono sobrevive bien en la PWA instalada (`display: standalone`).
  Debería concederse una vez por origen, pero no lo he probado ahí.
- Cuántos de tus dictados reales caerían en la regla 4 (gramos en blanco). Depende de tu
  repertorio, y sólo se sabe midiendo.

**Y el entreno, de paso.** Lo miré antes de que me dijeras que esto era para comida, y
hay una conclusión que merece quedar escrita porque es la contraria: en el gimnasio
**la voz por red no vale**. Lo dice `offline.js` en su primera línea —«Gyms are
basements and the free tier sleeps»—, y el reconocimiento de Chrome va contra un
servidor. Ahí la capa A tendría que ser local (`processLocally`, que Chrome ya soporta y
que haría falta comprobar en tu móvil) y la capa B un parser en el frontend. Gemini
queda fuera del registro de series por cuota: 20 peticiones al día contra 25 series por
sesión. Dos apuntes más para ese día: `set_entries` **no tiene columna de origen** —al
contrario que `log_entries`—, así que la adopción no se podría medir sin una migración;
y una serie sí admite registrarse con un «deshacer» en vez de pedir confirmación,
porque dentro de la tarjeta de un ejercicio no hay ambigüedad ninguna.
