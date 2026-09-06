# Dictar el desayuno: cómo se hace y qué falta para que funcione

Revisión previa a implementar nada. El caso es concreto: **entras en *Desayuno*, hablas
—«dos huevos, cien gramos de avena y un plátano»— y las entradas quedan puestas.**

Dos conclusiones por delante, porque cambian lo que hay que construir:

1. **Se manda el audio al modelo, sin transcribirlo antes en el navegador.** Es la forma
   más simple y la que mejor oye, y no cuesta ni una petición más — sección 4.
2. **Falta una pieza en la base de datos, y no es opcional.** Hoy «dos huevos» no tiene
   ninguna forma legítima de convertirse en gramos, porque las 3.185 filas de CIQUAL
   entran sin raciones y el catálogo compartido no se puede editar. Sin esa pieza, la
   mitad de lo que dices acaba pidiéndote que teclees — sección 6.

Misma regla que los otros documentos de esta carpeta: lo que no he verificado va
marcado como tal.

---

## 1. Qué gana esto, exactamente

Hoy, meter el desayuno son tres ciclos completos: tocar `+` en *Desayuno*, buscar
«huevo», tocar la fila, poner los gramos, guardar. Otra vez para la avena. Otra para el
plátano. **Unos quince toques y tres pasadas por el teclado.**

Dictado son: tocar el micro, hablar diez segundos, y un toque para confirmar.

Ese es el tamaño real de la mejora, y es grande. Pero se apoya entero en que **el
dictado entienda cantidades**, que es donde está el trabajo de verdad. Un dictado que
acierte el alimento pero te deje tecleando los gramos tres veces no ha quitado casi
nada: los gramos son el campo que cuesta.

Una cosa buena de tu flujo: **el slot ya lo sabe la pantalla**. Entras por el `+` de
*Desayuno* (`setAdding({ slot: rail.key })`), así que no hay que decir «de desayuno» ni
adivinarlo. Un campo menos que resolver, y encima el más fácil de equivocar.

---

## 2. Confianza en cada fuente

| Fuente | Qué aporta | Confianza | Por qué |
|---|---|---|---|
| `foods.py`, `food_log.py`, `models.py` | Que el catálogo no se edita, que las raciones sólo nacen en `POST /foods`, que `_resolve_grams` exige gramos o ración | **Alta** | Código de este repo |
| `scripts/import_ciqual.py` | Que las 3.185 filas de CIQUAL entran **sin ninguna ración** | **Alta** | Ni una mención a `Portion` en el script |
| `Comida.jsx` (`quickLog`) | Que registrar con «la cantidad de siempre» y un solo toque ya es algo que la app hace | **Alta** | Código de este repo, ya desplegado |
| `features/frequent_foods.feature` | Que el repertorio devuelve los gramos que repites y la comida a la que suele ir | **Alta** | Spec de este repo |
| `gemini.py` | Cuota real: 5 peticiones/minuto, 20/día, compartidas con el lector de etiquetas | **Alta** | Medido contra AI Studio el 2026-09-04 |
| [Gemini — Audio understanding](https://ai.google.dev/gemini-api/docs/audio) | Acepta `audio/webm`, 20 MB por petición, 32 tokens/segundo, hasta 9,5 h | **Alta** | Documentación oficial, leída |
| [MDN — `SpeechRecognition`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) | Que en Chrome va por red, y que no existe en Firefox | **Alta** | Documentación oficial, leída |
| Qué tal oye Gemini el vocabulario de cocina en español | Si «un cortado» o «pechuga» llegan enteros | ⚠️ **Sin verificar** | No lo he probado. Se prueba en diez minutos — sección 10 |
| Cuántas veces al día acabarías dictando | Si la cuota de 20 aguanta | ⚠️ **Sin verificar** | Depende de cuánto lo uses y de cuánto tengas que repetir |

---

## 3. El pipeline, de una punta a otra

```
[micro] → MediaRecorder → POST /food-log/dictado (audio/webm)
                                    │
                          gemini.py: audio → JSON
                                    │
              { transcript, items: [ {cantidad, unidad, alimento} ] }
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
  inventa un alimento que no existe, no hay nada que insertar.
- **El modelo no devuelve gramos.** Ni se le piden. Los gramos salen de la sección 6.

Y sigue en pie lo de `CLAUDE.md`, donde el parser de voz está nombrado por escrito antes
de existir: **nada crea alimentos solo.** Si «un cortado» no casa con nada del catálogo,
el final del camino es el buscador con el texto puesto. No se da de alta nada.

---

## 4. Por qué el audio va entero al modelo

Ayer recomendé lo contrario —transcribir gratis en el navegador con `webkitSpeechRecognition`
y mandar sólo el texto—. **Con lo que quieres hacer, esa recomendación ya no se sostiene**,
y el motivo es que dices «así tal cual»: lenguaje natural, no frases disciplinadas.
«Un bol de avena con plátano y un puñado de nueces» no lo trocea un parser. Si el modelo
va a estar en el circuito de todas formas, la transcripción del navegador deja de ser
gratis y pasa a ser **un paso lossy de más**.

Contadas las dos opciones con eso encima de la mesa:

| | Navegador transcribe → texto a Gemini | **Audio entero a Gemini** |
|---|---|---|
| Peticiones a Gemini por dictado | 1 | **1 — la misma** |
| Tokens | ~60 | ~480 (15 s a 32 tok/s). Irrelevante: el límite son peticiones, no tokens |
| Oye bien «pechuga», «cortado» | Regular: lo aprieta un reconocedor genérico primero | **Mejor: oye el audio original** |
| Navegadores | Sólo Chrome | **Cualquiera con micro, Safari incluido** |
| Código a escribir | Envoltorio del reconocedor **+** llamada a Gemini | **Sólo `MediaRecorder` + una llamada** |
| Latencia | Instantánea | 2–5 s para un clip corto |

Gana la de la derecha en todo menos en latencia, y encima es menos código: reutiliza
`gemini.py` casi tal cual, cambiando `inline_data` de `image/jpeg` a `audio/webm`, que
está confirmado que la API acepta.

**Lo que pierdes es el texto apareciendo mientras hablas.** Se compensa haciendo que el
modelo devuelva la transcripción y enseñándola —que además hay que hacerlo por otra
razón, la de la sección 8.

### La cuota, dicha claramente

**20 peticiones al día, compartidas con el lector de etiquetas.** Cuatro comidas son
cuatro dictados; con repeticiones y picoteos, seis u ocho. Deja doce para las etiquetas,
y algún día no dejará ninguna: cuando se agote, **se caen las dos cosas a la vez** hasta
mañana. `gemini.py` ya distingue la cuota del minuto de la del día precisamente porque
son avisos distintos, así que la pantalla puede decirlo bien.

Y conviene decir la salida en voz alta: **esto se arregla con una tarjeta, no con
código.** Flash cobra céntimos por miles de llamadas. Si el dictado acaba siendo tu forma
principal de registrar, salir del tier gratuito es la decisión correcta y es barata. No
hay que diseñar alrededor de un límite que se quita pagando poco.

---

## 5. Cómo se le pregunta al modelo

Mismo criterio que el `PROMPT` de las etiquetas, que no pide cinco números sino tres
cosas contrastables entre sí. Aquí:

```
Escuchas a alguien contando lo que ha desayunado. Devuelve SOLO un objeto JSON:

{
  "transcript": "<lo que has oído, literal>",
  "items": [
    {"said": "<el trozo del que sale, literal>",
     "food": "<el alimento, en singular, sin cantidad>",
     "quantity": 2,
     "unit": "<'g' | 'ml' | la palabra que ha dicho: 'huevo', 'rebanada', 'vaso'>"}
  ]
}

REGLAS:
- `said` es un trozo literal de `transcript`. Si no puedes señalarlo, no pongas el item.
- No conviertas nada a gramos. No estimes pesos. `unit` es la palabra que ha dicho.
- Si no dice cantidad, omite `quantity`. No pongas 1.
- No añadas alimentos que no ha nombrado, ni ingredientes implícitos.
```

Los dos porqués:

- **`said` es lo que permite comprobar.** Es el equivalente de `rows` en las etiquetas:
  un item que no se pueda anclar a un trozo de la transcripción es un item inventado, y
  se tira antes de enseñarlo. Es literalmente `_backed_by_a_row()` con otro nombre.
- **«No estimes pesos» y «no pongas 1»**, por lo mismo que «omite la clave en vez de
  poner 0»: un modelo contesta lo que le pides aunque no lo sepa, y un peso inventado no
  chirría en pantalla. La instrucción no es la defensa —la defensa es el validador—,
  pero sube la probabilidad de que llegue bien.

`temperature: 0`, como en las etiquetas: esto es una transcripción, y aquí la
creatividad es el fallo.

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
tentación —60 g por huevo, 125 por yogur, 30 por rebanada— es exactamente el mismo pecado
que el `0` de fibra que `label.py` existe para impedir, con el agravante de que un peso
inventado es creíble: 120 g de huevo no le chirría a nadie, y una vez congelado en
`log_entries` es indistinguible de uno que pesaste.

### 6.2 La pieza que falta: raciones tuyas sobre el catálogo

Una columna `user_id` en `portions`, nullable, y una regla de visibilidad de tres líneas:
vale una ración si es del alimento (`user_id IS NULL`, como hoy) **o** si es tuya. Migración
Alembic encadenada al head, más el `tests/unit/test_food_migration.py` de rigor.

Con eso, la primera vez que dices «dos huevos» la app te pregunta **una vez**:

> **¿Cuánto pesa un huevo?**

Pones 60. Se guarda como ración tuya sobre esa fila de CIQUAL, se registran 120 g, **y no
te lo vuelve a preguntar nunca.** A la tercera semana tu media docena de alimentos de
diario están todos resueltos y el dictado va entero de un tirón.

No viola nada: no crea alimentos, no edita el catálogo compartido, y el número lo pones
tú, explícito, una vez. Es la misma lógica por la que `POST /foods` es la única puerta —
el dato entra porque alguien lo escribió, no porque algo lo dedujo.

**Ayer llamé a esto «opcional». Con lo que quieres hacer, no lo es**: es lo que convierte
«diciendo cantidades de alimentos» en una funcionalidad en vez de en una promesa.

### 6.3 Las cuatro reglas, por prioridad

| Lo que dices | De dónde salen los gramos |
|---|---|
| «cien gramos de avena» | De lo que has dicho |
| «dos huevos», con ración tuya `huevo = 60 g` | `portion_id` × cantidad |
| «un yogur natural», sin cantidad, y está en tu repertorio | Los gramos que sueles poner |
| «dos huevos», sin ración todavía | **Te pregunta cuánto pesa uno. Una vez.** |

La tercera no es una licencia nueva: **es exactamente lo que ya hace la fila «Siempre»**.
`quickLog()` registra con `item.grams` del repertorio de un solo toque, y la pantalla lo
anuncia — «Un toque lo registra con la cantidad de siempre». Que la voz haga lo mismo no
abre ninguna puerta que no estuviera abierta.

### 6.4 La trampa del ×cantidad

El repertorio guarda **gramos por entrada**, no por unidad: si sueles registrar 120 g de
huevo, nadie sabe si eran uno o dos. Por eso la regla 3 sólo aplica **cuando no dices
cantidad**, y por eso «dos huevos» sin ración va a la regla 4 en vez de multiplicar 120
por 2. Multiplicar sería escalar por un factor que nadie eligió — justo lo que `label.py`
se niega a hacer con la columna «por ración».

---

## 7. Qué ves en pantalla

**Dónde:** *Comida* → `+` de **Desayuno** → la hoja que ya se abre hoy. En la fila que
ahora tiene *Escanear código* y *Leer etiqueta*, aparece un tercero.

**Antes → después:** dos botones pasan a ser tres. El nuevo dice **«Dictar»**. Mientras
graba dice **«Escuchando…»** y mientras espera al modelo, **«Apuntando…»** — la misma
forma que el «Leyendo…» de los otros dos, para que se vea cuál está trabajando.

**Qué haces:** abres *Comida*, tocas el `+` de *Desayuno*, tocas *Dictar*, hablas, sueltas.
La primera vez te pide el micrófono.

**Qué sale al soltar**, encima del formulario:

> He oído: «dos huevos, cien gramos de avena y un plátano»
>
> ☑ **Huevo, entero, crudo** — 120 g · *ración tuya: 60 g*
> ☑ **Copos de avena** — 100 g
> ☑ **Plátano** — *¿cuánto pesa un plátano?* [___] g
>
> **[ Guardar los 3 ]**

- **Un toque para los tres.** Cada fila se puede desmarcar o corregir antes, pero el caso
  normal es un botón. Pedir tres confirmaciones sería devolver los toques que la
  funcionalidad viene a quitar.
- **Lo que falta bloquea sólo su fila.** El plátano sin peso no impide guardar los otros
  dos: se queda pendiente con su campo enfocado.
- **Nada se escribe sin que lo veas.** Al contrario que una serie de entreno, una entrada
  mal resuelta congela macros equivocados en `log_entries`, y el «Deshacer» llega tarde
  si no te has enterado.

**Copys de lo que puede salir mal:**

- Alimento no encontrado: **«No tengo "cortado" en el catálogo. Búscalo o tecléalo.»**
- Sin cuota del minuto: **«He gastado el cupo de este minuto. Espera un poco.»**
- Sin cuota del día: **«Se ha acabado el cupo de hoy. Mañana vuelve.»**
- No se entiende nada: **«No te he entendido. Repítelo o tecléalo.»**
- Sin clave configurada: el botón no aparece.

**Nada de esto fija estilos:** el control se decide contra `DESIGN.md` antes de pintarlo.

---

## 8. Lo que no se le consiente al modelo

Copiado de la postura de `label.py`, que no se fía y por eso funciona:

1. **No crea alimentos.** Devuelve texto; elige el catálogo.
2. **No inventa gramos.** No se le piden, y si los manda se ignoran.
3. **No registra solo.** Propone; confirmas tú.
4. **Cada fila señala las palabras de las que salió** (`said` ⊂ `transcript`). La que no
   pueda, se tira antes de enseñarse. Por eso la transcripción se pinta: es la prueba, no
   el adorno.
5. **`NULL` no es `0`.** Tampoco por voz.

---

## 9. Qué hay que construir

| | Qué | Dónde |
|---|---|---|
| 1 | Migración: `portions.user_id` nullable + visibilidad | Alembic, `models.py`, `test_food_migration.py` |
| 2 | `POST /foods/{id}/portions` — tu ración sobre un alimento del catálogo | `routers/foods.py` |
| 3 | `escuchar_comida()` — audio → JSON, hermano de `read_label()` | `app/gemini.py` |
| 4 | El validador: `said ⊂ transcript`, tirar lo que no se ancle | `app/voz.py` **nuevo** |
| 5 | `POST /food-log/dictado` — orquesta, busca, aplica las 4 reglas | `routers/food_log.py` |
| 6 | Grabar y mandar | `Comida.jsx` + `api.js` |
| 7 | La propuesta y el «Guardar los N» | `Comida.jsx` |

El 4 va aparte del 3 **a propósito**, por la misma razón que `label.py` va aparte de
`gemini.py`: la comprobación es lo que hay que poder probar sin red, sin clave y sin
gastar cuota, que es todo lo que hace la suite.

Y el backend de escribir no se toca: `entry_source="voice"` ya está en `schemas.py` y en
`models.py` desde el día uno, con el comentario escrito de que existe «so that, a month
in, "how much do I actually use the voice parser?" is a query rather than a guess».

**Cómo se prueba:** el validador y las cuatro reglas son funciones puras — `pytest`, sin
red. El endpoint entero va en Gherkin, que aquí sí encaja: «dos huevos sin ración pregunta
el peso», «los gramos del repertorio son los que repito», «un alimento que no está en el
catálogo no se da de alta». La grabación se prueba en jsdom con `MediaRecorder`
suplantado; el micro real, en el teléfono y a mano.

---

## 10. Antes de escribir nada: la prueba de diez minutos

Todo esto depende de una cosa que no he verificado: **qué tal oye Gemini una frase de
cocina en español**. Se comprueba sin tocar el repo, grabando un `.webm` de móvil y
mandándolo con `curl` a `generateContent` con el prompt de la sección 5. Di la frase más
fea que se te ocurra — «un cortado, dos rebanadas de pan con tomate y un puñado de
almendras» — y mira si `transcript` sale entero y si `items` los separa bien.

- **Si sale bien:** el trabajo es el de la sección 9, y la mayor parte es la migración de
  las raciones, no la voz.
- **Si se come palabras:** hay que probar el otro reparto —transcribir en el navegador,
  mandar texto— antes de decidir. La comparativa de la sección 4 se vuelve del revés si
  la premisa «oye mejor» resulta falsa, y es una premisa, no una medición.

Es la única incógnita que puede tirar el diseño abajo. Yo la resolvería antes de la
migración.

---

## 11. Lo que no he verificado

- Que Gemini oiga bien el vocabulario de cocina en español. Sección 10. **Es la gorda.**
- Cuántos dictados al día acabarías haciendo, y por tanto si 20 peticiones aguantan.
- Si el permiso del micrófono sobrevive bien en la PWA instalada (`display: standalone`).
  Debería concederse una vez por origen, pero no lo he probado ahí.
- Qué porcentaje de lo que dices en un desayuno normal cae en la regla 4 la primera
  semana. Depende de tu repertorio y sólo se sabe usándolo.
- Que `MediaRecorder` en Chrome Android dé `audio/webm;codecs=opus` sin más. Es lo
  normal, pero conviene mirar `isTypeSupported` antes de fiarse.

---

## 12. Apunte: el entreno

Lo miré antes de saber que esto era para comida, y la conclusión es la contraria, así que
la dejo escrita para el día que toque. En el gimnasio **el dictado por red no vale**: lo
dice `offline.js` en su primera línea —«Gyms are basements and the free tier sleeps»— y
tanto Gemini como el reconocedor de Chrome van por red. Allí la capa de oír tendría que
ser local (`processLocally`, que Chrome ya soporta) y el troceo un parser en el frontend,
porque «ochenta por ocho» sí lo trocea un parser. Gemini queda fuera por cuota: 20
peticiones al día contra 25 series por sesión. Y dos apuntes: `set_entries` **no tiene
columna de origen** —al contrario que `log_entries`—, así que la adopción no se podría
medir sin otra migración; y una serie sí admite registrarse con un «Deshacer» en lugar de
pedir confirmación, porque dentro de la tarjeta de un ejercicio no hay ambigüedad.
