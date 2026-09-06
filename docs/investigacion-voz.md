# Dictar el desayuno: cómo se hace y qué falta para que funcione

Revisión previa a implementar nada. El caso es concreto: **entras en *Desayuno*, hablas
—«dos huevos, cien gramos de avena y un plátano»— y las entradas quedan puestas.**

Tres conclusiones por delante, porque son las que deciden qué hay que construir:

1. **El navegador transcribe en vivo, y al modelo le va el texto, no el audio.** Ver las
   palabras aparecer mientras hablas no es un lujo: **te convierte en el corrector de
   errores** antes de que nada llegue al modelo. Sección 4.
2. **Oírte es gratis.** `webkitSpeechRecognition` con `interimResults = true` es el mismo
   motor de Google que hay debajo del dictado del teclado, expuesto a cualquier página.
   Sin clave, sin cuota, sin backend.
3. **Falta una pieza en la base de datos, y no es opcional.** Hoy «dos huevos» no tiene
   ninguna forma legítima de convertirse en gramos: las 3.185 filas de CIQUAL entran sin
   raciones y el catálogo compartido no se puede editar. Sección 6.

Misma regla que los otros documentos de esta carpeta: lo que no he verificado va marcado
como tal.

---

## 1. Qué gana esto, exactamente

Hoy, meter el desayuno son tres ciclos completos: tocar `+` en *Desayuno*, buscar
«huevo», tocar la fila, poner los gramos, guardar. Otra vez la avena. Otra el plátano.
**Unos quince toques y tres pasadas por el teclado.**

Dictado son: tocar el micro, hablar diez segundos, un toque para confirmar.

Ese es el tamaño real de la mejora. Pero se apoya entero en que el dictado **entienda
cantidades**: un dictado que acierte el alimento y te deje tecleando los gramos tres
veces no ha quitado casi nada, porque los gramos son el campo que cuesta.

Una cosa buena del flujo: **el slot ya lo sabe la pantalla.** Entras por el `+` de
*Desayuno* (`setAdding({ slot: rail.key })`), así que no hay que decir «de desayuno» ni
adivinarlo. Un campo menos, y el más fácil de equivocar.

---

## 2. Confianza en cada fuente

| Fuente | Qué aporta | Confianza | Por qué |
|---|---|---|---|
| `foods.py`, `food_log.py`, `models.py` | Que el catálogo no se edita, que las raciones sólo nacen en `POST /foods`, que `_resolve_grams` exige gramos o ración | **Alta** | Código de este repo |
| `scripts/import_ciqual.py` | Que las 3.185 filas de CIQUAL entran **sin ninguna ración** | **Alta** | Ni una mención a `Portion` en el script |
| `Comida.jsx` (`quickLog`) | Que registrar con «la cantidad de siempre» de un toque ya es algo que la app hace | **Alta** | Código de este repo, ya desplegado |
| `features/frequent_foods.feature` | Que el repertorio devuelve los gramos que repites y la comida a la que suele ir | **Alta** | Spec de este repo |
| `gemini.py` | Cuota real: 5 peticiones/minuto, 20/día, compartidas con el lector de etiquetas | **Alta** | Medido contra AI Studio el 2026-09-04 |
| [MDN — `SpeechRecognition`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) | `interimResults`; que en Chrome el reconocimiento **va por red**; que no existe en Firefox | **Alta** | Documentación oficial, leída |
| [Gemini — Audio understanding](https://ai.google.dev/gemini-api/docs/audio) | Que aceptaría el audio directo si hiciera falta: `audio/webm`, 20 MB, 32 tokens/s | **Alta** | Documentación oficial, leída |
| Qué tal transcribe Chrome el vocabulario de cocina en español | Si «cortado», «pechuga» o «un puñado» sobreviven | ⚠️ **Sin verificar** | **Es la incógnita gorda.** Se prueba en cinco minutos — sección 10 |
| Que el motor de Chrome sea el mismo que el del teclado de Android | Explica por qué la sensación es idéntica | ⚠️ **Media** | Ambos son reconocimiento de Google en streaming; que compartan implementación es inferencia mía, no algo que haya verificado |

---

## 3. El pipeline, de una punta a otra

```
[micro] → webkitSpeechRecognition, interimResults=true
              │
              │  el texto va apareciendo en pantalla mientras hablas
              │  ← AQUÍ LO VES, Y AQUÍ LO CORRIGES
              ▼
        texto final → POST /food-log/dictado
                            │
                  gemini.py: texto → JSON (1 petición)
                            │
              { items: [ {said, food, quantity, unit} ] }
                            │
                  voz.py: comprobar, no creer
                            │
             /foods/search por cada alimento  ← el catálogo elige
                            │
             los gramos, por las cuatro reglas (§6)
                            │
        propuesta en pantalla → un toque → POST /food-log ×N
```

Dos cosas que este diseño no hace nunca, y que son la diferencia entre una funcionalidad
y un ensuciador de diario:

- **El modelo no devuelve un `food_id`.** Devuelve texto. Quien elige el alimento es
  `/foods/search`, que ya pliega acentos (`fold_exercise_name`), ya ordena por exactitud
  (`_rank`) y ya tiene los alias que dejó la traducción de CIQUAL. Si el modelo se
  inventa un alimento, no hay nada que insertar.
- **El modelo no devuelve gramos.** Ni se le piden. Salen de la sección 6.

Y sigue en pie lo de `CLAUDE.md`, donde el parser de voz está nombrado por escrito antes
de existir: **nada crea alimentos solo.** Si «un cortado» no casa con nada, el final del
camino es el buscador con el texto puesto.

---

## 4. Por qué el navegador transcribe y el modelo sólo lee

### 4.1 Lo que ya conoces, por debajo

Cuando le das al micro y ves las palabras aparecer, lo que hay es **reconocimiento en
streaming con resultados parciales**: el motor no espera a que acabes la frase, va
emitiendo hipótesis cada pocos cientos de milisegundos y corrigiéndolas hacia atrás
según le llega más audio. Por eso una palabra aparece y luego se rectifica sola.

Chrome expone ese mismo comportamiento a cualquier página con una propiedad:

```js
const rec = new webkitSpeechRecognition()
rec.lang = 'es-ES'
rec.interimResults = true                       // ← la sensación es esto
rec.onresult = (e) => {
  const t = [...e.results].map((r) => r[0].transcript).join('')
  setTexto(t)                                   // se repinta mientras hablas
  if (e.results[e.results.length - 1].isFinal) proponer(t)
}
rec.start()
```

Gratis, sin clave, sin cuota, sin backend. El matiz, y está en MDN: en Chrome **el audio
sale a un servicio de Google**, así que necesita red. Para la comida da igual — la
pantalla ya necesita red para buscar en el catálogo.

### 4.2 La alternativa, y por qué pierde

La otra opción era grabar con `MediaRecorder` y mandarle el `.webm` entero a Gemini, que
está confirmado que lo acepta. Oiría mejor la jerga de cocina, porque oye el audio
original en vez de un texto ya apretado por un reconocedor genérico. Y costaría **las
mismas peticiones**: una por dictado en los dos casos.

Pierde por una razón que pesa más que la precisión:

> **Con el texto en pantalla, el que corrige eres tú.** Si «un cortado» sale como «un
> corta 2», lo ves y lo arreglas antes de que nada llegue al modelo. Con el audio yendo
> directo, una mala escucha es **invisible** hasta que vuelve la propuesta mal — y
> entonces ni siquiera sabes si se equivocó oyendo o entendiendo.

Lo demás va en la misma dirección: es menos código (no hay endpoint de audio ni
`MediaRecorder`), es instantáneo en vez de 2–5 s, y si Gemini está caído o sin cuota
todavía te queda el texto para pegarlo en el buscador. El precio es que sólo funciona en
Chrome — que es donde usas esto — y que la jerga de cocina la va a apretar más.

| | **Navegador transcribe → texto** | Audio entero a Gemini |
|---|---|---|
| Peticiones a Gemini | 1 | 1 — la misma |
| **Ves y corriges lo que ha oído** | **Sí, mientras hablas** | No |
| Oye jerga de cocina | Peor | Mejor |
| Latencia hasta la propuesta | Sólo lo que tarde Gemini | + 2–5 s de subida |
| Código | `SpeechRecognition` + llamada de texto | `MediaRecorder` + endpoint + llamada |
| Si Gemini falla | Te queda el texto | No te queda nada |
| Navegadores | Sólo Chrome | Cualquiera con micro |

### 4.3 La cuota, dicha claramente

**20 peticiones al día, compartidas con el lector de etiquetas.** Cuatro comidas son
cuatro dictados; con repeticiones, seis u ocho. Deja doce para etiquetas, y algún día no
dejará ninguna: al agotarse **se caen las dos cosas** hasta mañana. `gemini.py` ya
distingue la cuota del minuto de la del día, así que la pantalla puede decirlo bien.

Y la salida, en voz alta: **esto se arregla con una tarjeta, no con código.** Flash cobra
céntimos por miles de llamadas. Si el dictado acaba siendo tu forma principal de
registrar, salir del tier gratuito es la decisión correcta y es barata.

---

## 5. Cómo se le pregunta al modelo

Mismo criterio que el `PROMPT` de las etiquetas, que no pide cinco números sino tres
cosas contrastables entre sí:

```
Lees lo que alguien ha dictado sobre lo que ha comido. Devuelve SOLO un objeto JSON:

{
  "items": [
    {"said": "<el trozo literal del texto del que sale>",
     "food": "<el alimento, en singular, sin cantidad>",
     "quantity": 2,
     "unit": "<'g' | 'ml' | la palabra que ha dicho: 'huevo', 'rebanada', 'vaso'>"}
  ]
}

REGLAS:
- `said` es un trozo LITERAL del texto que te doy. Si no puedes señalarlo, no pongas el item.
- No conviertas nada a gramos. No estimes pesos. `unit` es la palabra que ha dicho.
- Si no dice cantidad, omite `quantity`. No pongas 1.
- No añadas alimentos que no ha nombrado, ni ingredientes implícitos.
- El texto viene de un dictado y puede traer palabras mal transcritas. Si una no se
  entiende, omite el item: no adivines qué quiso decir.
```

Los porqués:

- **`said` es lo que permite comprobar.** Es el equivalente de `rows` en las etiquetas:
  un item que no se ancle a un trozo del texto es inventado y se tira antes de enseñarlo.
  Literalmente `_backed_by_a_row()` con otro nombre — y aquí sale **gratis de verificar**,
  porque el texto original lo tienes tú, no te lo tiene que contar el modelo.
- **«No estimes pesos» y «no pongas 1»**, por lo mismo que «omite la clave en vez de poner
  0»: un modelo contesta lo que le pides aunque no lo sepa, y un peso inventado no
  chirría en pantalla. La instrucción no es la defensa —la defensa es el validador—, pero
  sube la probabilidad de que llegue bien.
- **La última regla es nueva y viene del reparto elegido:** aquí el modelo lee un texto que
  ya puede venir roto por el reconocedor, y hay que decirle explícitamente que no lo
  arregle a base de suponer.

`temperature: 0`, como en las etiquetas: esto es una transcripción, y la creatividad es
el fallo.

---

## 6. Los gramos: lo que falta

Aquí se decide si esto funciona o si te deja tecleando.

### 6.1 El muro

- `_resolve_grams()` acepta dos cosas y sólo dos: `grams`, o un `portion_id` **de ese
  alimento**. Si no llega ninguna, 422.
- **CIQUAL entra sin una sola ración.** Comprobado: ni una mención a `Portion` en el
  script de importación.
- **Y no se les pueden añadir**: `PATCH /foods/{id}` contesta `403 "the shared catalogue
  is not editable"` para todo lo que tenga `user_id IS NULL`.

O sea: hoy, «dos huevos» **no tiene ninguna forma legítima de acabar en gramos**. Y la
tentación —60 g por huevo, 125 por yogur, 30 por rebanada— es el mismo pecado que el `0`
de fibra que `label.py` existe para impedir, con el agravante de que un peso inventado es
creíble: 120 g de huevo no le chirría a nadie, y congelado en `log_entries` ya no se
distingue de uno que pesaste.

### 6.2 La pieza que falta: raciones tuyas sobre el catálogo

Una columna `user_id` en `portions`, nullable, y una regla de visibilidad de tres líneas:
vale una ración si es del alimento (`user_id IS NULL`, como hoy) **o** si es tuya.
Migración Alembic encadenada al head, más el `test_food_migration.py` de rigor.

Con eso, la primera vez que dices «dos huevos» la app pregunta **una vez**:

> **¿Cuánto pesa un huevo?**

Pones 60. Se guarda como ración tuya sobre esa fila de CIQUAL, se registran 120 g, **y no
te lo vuelve a preguntar nunca.** A las tres semanas tu media docena de alimentos de
diario están resueltos y el dictado va entero de un tirón.

No viola nada: no crea alimentos, no edita el catálogo compartido, y el número lo pones
tú, explícito, una vez. Es la misma lógica por la que `POST /foods` es la única puerta:
el dato entra porque alguien lo escribió, no porque algo lo dedujo.

### 6.3 Las cuatro reglas, por prioridad

| Lo que dices | De dónde salen los gramos |
|---|---|
| «cien gramos de avena» | De lo que has dicho |
| «dos huevos», con ración tuya `huevo = 60 g` | `portion_id` × cantidad |
| «un yogur natural», sin cantidad, y está en tu repertorio | Los gramos que sueles poner |
| «dos huevos», sin ración todavía | **Te pregunta cuánto pesa uno. Una vez.** |

La tercera no es una licencia nueva: **es lo que ya hace la fila «Siempre»**. `quickLog()`
registra con `item.grams` del repertorio de un solo toque, y la pantalla lo anuncia — «Un
toque lo registra con la cantidad de siempre». Que la voz haga lo mismo no abre ninguna
puerta que no estuviera abierta.

### 6.4 La trampa del ×cantidad

El repertorio guarda **gramos por entrada**, no por unidad: si sueles registrar 120 g de
huevo, nadie sabe si eran uno o dos. Por eso la regla 3 sólo aplica **cuando no dices
cantidad**, y «dos huevos» sin ración va a la regla 4 en vez de multiplicar 120 por 2.
Multiplicar sería escalar por un factor que nadie eligió — justo lo que `label.py` se
niega a hacer con la columna «por ración».

---

## 7. Qué ves en pantalla

**Dónde:** *Comida* → `+` de **Desayuno** → la hoja que ya se abre hoy. En la fila que
ahora tiene *Escanear código* y *Leer etiqueta* aparece un tercero.

**Antes → después:** dos botones pasan a ser tres. El nuevo dice **«Dictar»**.

**Qué haces:** abres *Comida*, tocas el `+` de *Desayuno*, tocas *Dictar*, hablas. La
primera vez te pide el micrófono.

**Mientras hablas** —y esto es el corazón de la funcionalidad— el texto va apareciendo y
corrigiéndose solo, encima del formulario, con el botón diciendo **«Escuchando…»**. Es
editable: si ves una palabra mal, la tocas y la arreglas antes de seguir. Al parar, el
botón pasa a **«Apuntando…»** mientras el modelo lo lee.

**Qué sale luego:**

> «dos huevos, cien gramos de avena y un plátano»  ← editable
>
> ☑ **Huevo, entero, crudo** — 120 g · *ración tuya: 60 g*
> ☑ **Copos de avena** — 100 g
> ☑ **Plátano** — *¿cuánto pesa un plátano?* [___] g
>
> **[ Guardar los 3 ]**

- **Un toque para los tres.** Cada fila se puede desmarcar o corregir, pero el caso normal
  es un botón. Pedir tres confirmaciones sería devolver los toques que esto viene a quitar.
- **Lo que falta bloquea sólo su fila.** El plátano sin peso no impide guardar los otros dos.
- **Nada se escribe sin que lo veas.** Al contrario que una serie de entreno, una entrada
  mal resuelta congela macros equivocados en `log_entries`, y el «Deshacer» llega tarde si
  no te has enterado.

**Copys de lo que puede salir mal:**

- Alimento no encontrado: **«No tengo "cortado" en el catálogo. Búscalo o tecléalo.»**
- Sin cuota del minuto: **«He gastado el cupo de este minuto. Espera un poco.»**
- Sin cuota del día: **«Se ha acabado el cupo de hoy. Mañana vuelve.»**
- Gemini no contesta: **«No he podido apuntarlo. El texto se queda aquí para que lo
  busques.»** — y el texto se queda, que es la ventaja de este reparto.
- No se oye nada: **«No te he oído. Prueba otra vez.»**

**Dónde no se ve nada:** en un navegador sin `SpeechRecognition` —Firefox, y Safari a
medias— el botón no aparece, igual que hoy no aparece *Escanear código* en Safari. El
precedente y su argumento están escritos en `Comida.jsx`: «un botón que no puede funcionar
es peor que uno que no está».

**Nada de esto fija estilos:** el control se decide contra `DESIGN.md` antes de pintarlo.

---

## 8. Lo que no se le consiente al modelo

Copiado de la postura de `label.py`, que no se fía y por eso funciona:

1. **No crea alimentos.** Devuelve texto; elige el catálogo.
2. **No inventa gramos.** No se le piden, y si los manda se ignoran.
3. **No registra solo.** Propone; confirmas tú.
4. **Cada fila señala las palabras de las que salió** (`said` ⊂ texto dictado). La que no
   pueda, se tira antes de enseñarse.
5. **`NULL` no es `0`.** Tampoco por voz.

---

## 9. Qué hay que construir

| | Qué | Dónde |
|---|---|---|
| 1 | Migración: `portions.user_id` nullable + visibilidad | Alembic, `models.py`, `test_food_migration.py` |
| 2 | `POST /foods/{id}/portions` — tu ración sobre un alimento del catálogo | `routers/foods.py` |
| 3 | `escuchar_comida()` — texto → JSON, hermano de `read_label()` | `app/gemini.py` |
| 4 | El validador: `said ⊂ texto`, tirar lo que no se ancle | `app/voz.py` **nuevo** |
| 5 | `POST /food-log/dictado` — orquesta, busca, aplica las 4 reglas | `routers/food_log.py` |
| 6 | El reconocedor con `interimResults`, y esconderlo donde no exista | `Comida.jsx` + `api.js` |
| 7 | El texto editable, la propuesta y el «Guardar los N» | `Comida.jsx` |

El 4 va aparte del 3 **a propósito**, por la misma razón que `label.py` va aparte de
`gemini.py`: la comprobación es lo que hay que poder probar sin red, sin clave y sin
gastar cuota, que es todo lo que hace la suite.

El backend de escribir no se toca: `entry_source="voice"` ya está en `schemas.py` y en
`models.py` desde el día uno, con el comentario escrito de que existe «so that, a month
in, "how much do I actually use the voice parser?" is a query rather than a guess».

**Cómo se prueba:** el validador y las cuatro reglas son funciones puras — `pytest`, sin
red. El endpoint entero va en Gherkin, que aquí sí encaja: «dos huevos sin ración pregunta
el peso», «los gramos del repertorio son los que repito», «un alimento que no está en el
catálogo no se da de alta». El reconocedor se prueba en jsdom con `window.SpeechRecognition`
suplantado, igual que ya se hace con `BarcodeDetector`. El micro real, en el teléfono y a
mano: el Chromium de Playwright no trae la clave del servicio de voz de Google.

---

## 10. Antes de escribir nada: la prueba de cinco minutos

La incógnita gorda ya no es Gemini: es **qué tal transcribe Chrome una frase de cocina en
español**, porque de eso depende cuánto vas a tener que corregir a mano. Se comprueba sin
tocar el repo. Abre `fitit-n4q0.onrender.com` en el móvil, conecta el depurador y pega:

```js
const SR = window.SpeechRecognition || window.webkitSpeechRecognition
console.log('API:', !!SR)
const r = new SR(); r.lang = 'es-ES'; r.interimResults = true
r.onresult = (e) => console.log([...e.results].map((x) => x[0].transcript).join(''))
r.start()
// Di la frase más fea que se te ocurra:
// «un cortado, dos rebanadas de pan con tomate y un puñado de almendras»
```

- **Si sale limpio:** el reparto de la sección 4 es el bueno, y el grueso del trabajo es
  la migración de las raciones, no la voz.
- **Si se come palabras de comida** («cortado» → «corta 2», «puñado» → «puñao»): sigue
  valiendo, porque lo ves y lo corriges — pero si pasa a menudo, hay que volver a poner
  sobre la mesa mandar el audio a Gemini, que oye el original. La comparativa de la 4.2 se
  estrecha mucho si la transcripción falla más de lo tolerable.

Yo lo resolvería antes de tocar la base de datos.

---

## 11. Lo que no he verificado

- **Qué tal transcribe Chrome el vocabulario de cocina en español.** Sección 10. Es la gorda.
- Que el motor de Chrome sea el mismo que hay bajo el dictado del teclado de Android. Los
  dos son reconocimiento de Google en streaming y la sensación es idéntica, pero que
  compartan implementación es inferencia mía.
- Cuántos dictados al día acabarías haciendo, y por tanto si 20 peticiones aguantan.
- Si el permiso del micrófono sobrevive bien en la PWA instalada (`display: standalone`).
  Debería concederse una vez por origen, pero no lo he probado ahí.
- Qué porcentaje de lo que dices en un desayuno normal cae en la regla 4 la primera
  semana. Depende de tu repertorio y sólo se sabe usándolo.

---

## 12. Apunte: el entreno

Lo miré antes de saber que esto era para comida, y la conclusión es la contraria, así que
la dejo escrita para el día que toque. En el gimnasio **el dictado por red no vale**: lo
dice `offline.js` en su primera línea —«Gyms are basements and the free tier sleeps»— y
tanto Gemini como el reconocedor de Chrome van por red. Allí la capa de oír tendría que
ser local (`processLocally`, que Chrome ya soporta) y el troceo un parser en el frontend,
porque «ochenta por ocho» sí lo trocea un parser. Gemini queda fuera por cuota: 20
peticiones al día contra 25 series por sesión. Dos apuntes más: `set_entries` **no tiene
columna de origen** —al contrario que `log_entries`—, así que la adopción no se podría
medir sin otra migración; y una serie sí admite registrarse con un «Deshacer» en lugar de
pedir confirmación, porque dentro de la tarjeta de un ejercicio no hay ambigüedad.
