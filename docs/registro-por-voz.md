# Registro por voz: dictar lo que comes

Spec del 16 de octubre de 2026, salida de un grill de nueve preguntas. Parte de
`docs/investigacion-voz.md` y se aparta de ella en una cosa, a sabiendas: el audio va
entero a Gemini en vez de transcribirlo el móvil (pregunta 1). Se apoya en las medidas
caseras (`docs/medidas-caseras.md`): «dos cucharadas de aceite» ya sabe pesarse.

## 0. En una frase

> **Tocas el micro, dices lo que has comido, confirmas: queda apuntado con tus alimentos
> de siempre.**

> **Cambio del 2026-10-16 (pregunta 1).** El audio ya no va a Gemini: lo transcribe
> **Whisper en Groq** (`app/groq.py`, gratis, unas 2.000 peticiones al día) y Gemini sólo
> lee el texto, con una cadena de respaldos (`GEMINI_FALLBACK_MODEL=a,b`, un intento por
> modelo). Motivo: en el primer día de uso la voz falló tres veces seguidas porque
> `gemini-3.8-flash` y su respaldo daban 503 «high demand» a la vez; en una prueba de cuatro
> peticiones por modelo, todos los Flash fallaban una o dos. Si Gemini falla después de
> oír, la pantalla enseña «Has oído: …» junto al aviso. Sin `GROQ_API_KEY`, el audio
> vuelve a ir entero a Gemini.

## 1. Las decisiones

| # | Pregunta | Decidido | Por qué |
|---|---|---|---|
| 1 | ¿Quién transcribe? | **El audio entero a Gemini**, que devuelve también lo que oyó | Oye mejor la jerga de cocina; el modal enseña «Has oído: …» para saber si falló oyendo o entendiendo |
| 2 | «Dos huevos» → gramos | **Se pregunta una vez**, con la cifra de Gemini puesta: «¿Cuánto pesa un huevo? [60]», y queda como **ración tuya** | El dato lo confirma una persona; luego deja de ser estimado |
| 3 | ¿Qué alimento? | **Se preselecciona sólo lo que ya has comido** (o uno tuyo que case claro); si no, «¿Cuál?» con tres | «pasta» casa con 131 alimentos en prod; la marca no basta para elegir |
| 4 | Sin cantidad | Costumbre → tu cantidad de siempre. Nuevo → la ración de Gemini **como estimado** | Lo que puso un modelo se dice, como en «Comer fuera» |
| 5 | Lo que no existe | **«Falta: … · Buscar»**, que abre la búsqueda con el texto | Nada se da de alta solo (`POST /foods` es la única puerta) |
| 6 | ¿Dónde está el micro? | **Botón flotante** junto a «Añadir comida» **y** dentro de «Añadir a X» | El flotante es el camino corto; el de dentro, donde ya estabas |
| 7 | ¿Cuándo para? | **Solo, a los 2 s de silencio**; o «Listo». Tope 30 s | Sin sostener el dedo; «Seguir hablando» por si cortó antes |
| 8 | ¿Y la cuota? | **Plan gratuito** con aviso; la facturación, cuando la uses a diario | El aviso hace falta igual; pagar se decide en la consola de Google |
| 9 | «Apuntar» con pendientes | **Desactivado** hasta resolver o quitar (✕) cada línea | Nada dictado se pierde sin verlo |

## 2. Toques

| Camino | Hoy | Con voz |
|---|---|---|
| Tres cosas de siempre | 4–5 por alimento (≈ 13) | **2**: micro → (para solo) → Apuntar |
| Desde «Añadir a X» | igual | 3: micro → (para solo) → Apuntar |
| Un alimento nuevo | — | +1: elegir de tres |
| Una unidad nueva («huevo») | — | +1: confirmar su peso, una vez en la vida |
| Algo que no existe | — | +1 hasta la búsqueda, y lo de siempre desde ahí |

## 3. En pantalla

### El micro

- **Comida**, junto al botón flotante «Añadir comida»: un botón redondo con el icono de
  micrófono, `aria-label="Dictar comida"`. La comida se deduce de la hora
  (`inferMealSlot`) y se cambia en el modal.
- **«Añadir a X»**, junto a la caja de búsqueda: el mismo botón. La comida es X.
- **Sin red**, desactivado, como lo demás que necesita red.

### Grabando

Una franja abajo: **«Escuchando… 0:04»** con un punto que late y **«Listo»**. Para sola a
los 2 s de silencio o a los 30 s. Luego **«Entendiendo…»** mientras contesta el servidor.

### El modal: «Revisa lo que has dicho»

- Arriba, en `--muted`: **«Has oído: dos huevos, pasta y un café con leche»**.
- Los chips de la comida (Desayuno, Comida, Cena, Snack), con la deducida ya elegida.
- Una fila por línea, según su estado:
  - **Elegida**: nombre del alimento y cantidad (`120 g`, `2 cdas · ~30 g`,
    `~80 g · estimado`), editable de un toque, y ✕.
  - **«¿Cuál?»**: el texto dicho y tres chips; tocar uno la deja elegida.
  - **«¿Cuánto pesa un huevo?»**: la casilla con la cifra de Gemini puesta y «g». Al
    apuntar, se guarda como ración tuya.
  - **«Falta: lomo embuchado · Buscar»**: abre, dentro de la propia fila, una búsqueda
    con el texto escrito; lo elegido allí la resuelve. Sin escáner desde aquí (fase 3):
    para escanear, se quita la línea y se escanea desde «Añadir».
- Abajo: **«Seguir hablando»** (añade líneas) y el botón **«Apuntar 3»**; con algo
  pendiente, desactivado y diciendo **«Falta elegir 2»**.

### Errores

- Sin cuota: **«Sin cuota de voz hasta mañana. Busca o escanea.»** (o «…hasta dentro de
  un minuto» si es la del minuto).
- No entendió nada: **«No he entendido nada. Prueba otra vez.»**
- Sin clave en el servidor: el micro no aparece.

## 4. Las reglas del servidor

### Lo que se le pide a Gemini

El audio y una instrucción. Devuelve **sólo** JSON:

```json
{"transcript": "dos huevos, pasta y un café con leche",
 "lines": [
   {"text": "dos huevos", "name": "huevo", "quantity": 2, "unit": "unidad",
    "unit_grams": 60, "portion_grams": null},
   {"text": "pasta", "name": "pasta", "quantity": null, "unit": null,
    "unit_grams": null, "portion_grams": 80}
 ]}
```

- `name` es lo dicho, sin marcas inventadas ni sinónimos: «lomo embuchado», no
  «embutido».
- `unit` es `g`, `ml`, `cdta`, `cda`, `taza`, `vaso`, `unidad` o `null`.
- `unit_grams`, sólo con `unidad`: lo que pesa **una**. `portion_grams`, sólo sin
  cantidad: una ración normal en España.
- Ni kcal ni macros: salen del catálogo, como siempre.

### De dónde salen los gramos, por prioridad

| Lo dicho | Gramos |
|---|---|
| «200 gramos de pasta» | 200 |
| «2 cucharadas de aceite» | medida casera: `measure=cda`, 30 g |
| «2 huevos», con ración tuya de huevo | ración × 2 |
| «2 huevos», sin ración | **pregunta**, con `unit_grams` de Gemini puesto |
| «pasta», y es costumbre | tu cantidad más repetida (la regla de `/frequent`) |
| «pasta», nueva | `portion_grams` de Gemini, **estimado** |

Nunca se multiplica tu cantidad de costumbre por lo dicho: 120 g de huevo habituales no
dicen si eran uno o dos (`investigacion-voz.md` §6.4).

### Qué alimento

Un emparejador **sólo para la voz**; el de recetas, tickets y planes no cambia.

1. Si una coincidencia es **costumbre** (apuntada en los 90 días de `/frequent`), se
   elige la más repetida.
2. Si no, si `match_line` elige uno **tuyo**, ése.
3. Si no, «¿Cuál?» con tres, en este orden: costumbre, tuyos, Hacendado/Eroski, CIQUAL.
4. Sin ninguno: `missing`.

### Qué se guarda

- `POST /food-log/voice` **no guarda nada**: recibe el audio, contesta transcripción y
  líneas. El audio no se escribe en ningún sitio.
- `POST /food-log/batch` apunta las líneas confirmadas de una vez, **todas o ninguna**.
  `entry_source = "voice"`, salvo las de gramos de Gemini, que van como `"estimated"`
  para que el diario las diga igual que las de «Comer fuera».
- Una ración confirmada en el modal se guarda con `POST /foods/{id}/portions`: **ración tuya** sobre
  cualquier alimento visible, también del catálogo. Nadie más la ve. No toca el alimento.

## 5. Datos

- `portions.user_id`, **anulable**. `NULL` es una ración del alimento (las de siempre);
  con valor, sólo de esa persona. `Food.portions` deja de servirse entero: se filtra a
  las del alimento más las tuyas (`visible_portions`). Migración encadenada al head y
  `test_food_migration.py`; la clave ajena sólo en Postgres, que SQLite no la añade a una
  tabla hecha.
- Nada más cambia de forma: `entry_source` ya admite `voice`, y `measure` /
  `measure_count` son de las medidas caseras.

## 6. Fases

1. **Raciones tuyas.** `portions.user_id`, `POST /foods/{id}/portions`, el filtro. Se ven ya como
   chips en la hoja del alimento.
2. **El servidor de la voz.** La instrucción, `POST /food-log/voice` con el lector
   sustituible en tests (como `get_meal_estimator`), el emparejador y `POST
   /food-log/batch`. Escenarios en `backend/tests/features/voice_logging.feature`.
3. **La pantalla.** Grabar con silencio, los dos micros, el modal y sus errores.
4. **APK.** `RECORD_AUDIO` y `MODIFY_AUDIO_SETTINGS` en el manifest (las dos que pide
   `BridgeWebChromeClient` de Capacitor al conceder el micro). La versión se saca **después
   de fusionar**, con `just release minor "registro por voz"`: el script parte de `main`.

## 7. Lo que no está verificado

- Que el WebView de Capacitor conceda el micrófono a `getUserMedia` con el permiso en el
  manifest y sin plugin. Se comprueba al empezar la fase 3, en el móvil.
- La cuota y el precio de Gemini con audio para esta clave: la investigación midió 20
  peticiones al día, compartidas con las etiquetas, y eso puede haber cambiado.
- Que Gemini oiga bien «lomo embuchado» y compañía. Se mide con diez audios tuyos antes
  de dar la fase 2 por buena.
