# Ideas con un alimento

«Me apetece acelga, ¿qué hago con ella?». Eliges un alimento, la IA busca recetas
reales en la web y te trae ideas con enlace a la original; la que te gusta se
convierte en plato y acaba en el plan.

Decidido en conversación (2026-09-24) y validado a mano con Gemini: los tres enlaces
que devolvió existían, los gramos eran la receta original dividida por las raciones,
y se dejó el parmesano y el aceite — de ahí que en la fase 2 los ingredientes se lean
de la página y no de lo que diga el modelo.

## Reglas que valen para las tres fases

- **Las ideas no son platos.** Nada entra en `dishes` sin que alguien pulse «Guardar».
- **Las búsquedas se guardan por alimento** y se comparten entre usuarios (una receta
  de acelgas no es un dato tuyo). Sólo «Otras ideas» vuelve a gastar cuota, y suma.
- **La IA propone qué combinar, nunca cuánto suma.** Las macros salen de
  `nutrition.py` sobre fichas reales, con `—` donde un nutriente no está medido.
- **Nada escribe en `foods`.** Un ingrediente que no está ni en tu despensa ni en
  CIQUAL se queda como «Falta: …»; nunca se crea desde lo que dijo un modelo ni desde
  lo que publica una web. `POST /foods` sigue siendo la única puerta.
- **El servidor sólo lee páginas que él mismo guardó** como idea. Nunca una URL que
  mande el cliente (SSRF).
- Gemini se llama a través de una dependencia inyectable, como `get_label_reader` y
  `get_dish_proposer`: la suite no tiene red, ni clave, ni cuota.

## Fase 1 — Ideas con enlace · PR 1

Spec: `backend/tests/features/dish_ideas.feature` (12 escenarios).

- Tabla `dish_ideas` (food_id, name, url única por alimento, method, minutes,
  created_at) + migración encadenada al head.
- `POST /dish-ideas` `{food_id, more: bool}`: sirve lo guardado; con `more` o sin nada
  guardado, llama a Gemini con `google_search` y guarda lo nuevo. Mismos `refusal` que
  `/dishes/generate` (`off`, `quota` + `quota_scope`, `unavailable`, `unusable`).
- Frontend: línea «Ideas con {alimento}» al pie de la hoja del alimento (gris, como
  «Corregir»; oculta si la función está apagada) → pantalla completa «IDEAS CON ·
  {alimento}», filas con nombre, dominio ↗, `30 MIN` / `SARTÉN`, fila entera abre la
  receta; «Otras ideas» fijo abajo como botón `secondary`, con su línea de estado.
  Diseño aprobado: maqueta de la conversación del 2026-09-24.

## Fase 2 — Convertir una idea en plato · PR 2 (sobre la 1)

Spec: `backend/tests/features/dish_from_idea.feature`.

- El servidor lee la página de la idea y saca `recipeIngredient` y `recipeYield` del
  JSON-LD schema.org. Sin IA: es lo que publica la receta. Se guarda en la idea, para
  no volver a leer la página.
- Cada línea («500 gr de acelgas», «2 huevos») → cantidad, unidad, nombre →
  candidatos de tu despensa + CIQUAL por `fold_exercise_name`. Uno claro: elegido.
  Varios: «¿Cuál?». Ninguno: «Falta: …». Gramos por ración = cantidad ÷ raciones.
- Unidades sin gramos («2 huevos», «½ cebolla», «sal») → gramos desconocidos, `—`, y el
  plato no se guarda hasta que los pongas. `NULL` no es `0`.
- Sin JSON-LD en la página: no se inventa nada; se abre «Nuevo plato» con el nombre ya
  puesto y el enlace a la receta.
- Sin `recipeYield` (okdiario no lo publica) no se divide entre uno: el borrador
  pregunta «¿Para cuántas raciones es?», vacío, y no guarda hasta que se diga.
- Guardar va por `POST /dishes` (la puerta de siempre) con `idea_id`, en una sola
  petición, y la fila pasa a decir «Guardado». Lo que recuerda es **el plato**
  (`dishes.idea_id`), no la idea: la idea es de todos —se guarda por alimento y sin
  usuario— y el plato es tuyo, así que un `dish_id` en la idea marcaría «Guardado» en
  la pantalla de otra persona.
- Las macros por ración del borrador las calcula el servidor (`POST /dishes/preview`),
  con la misma aritmética que el plato guardado.
- SSRF: el servidor sólo abre el enlace guardado en la idea, y `fetch_page` resuelve el
  nombre, rechaza cualquier dirección que no sea de internet, conecta a la IP
  comprobada y vuelve a comprobar en cada redirección.

## Fase 3 — Llevarlo al plan · PR 3 (sobre la 2)

Spec: `backend/tests/features/idea_to_plan.feature`.

- Dos puertas a la misma hoja (`PonerEnPlan.jsx`): el plato recién guardado (el
  borrador no se cierra al guardar: dice «Guardado en tus platos.» y ofrece «Ponerlo en
  el plan», con «Hecho» donde estaba «Cancelar») y la columna «✓ Guardado» de la fila de
  la idea, que pasa a ser botón. `POST /dish-ideas` devuelve `dish_name` junto a
  `dish_id` para titular la hoja con tu plato y no con la receta.
- La hoja lista los huecos de esta semana que no han pasado ni tienen respuesta
  (`GET /plans/entries/ahead`) y el elegido se **sobrescribe** con
  `PUT /plans/entries/{id}/dish` (plato y gramos; el anterior no se recuerda). No es el
  `swapped` de `PATCH`: no escribe el diario y la fila sigue por confirmar.
- Al ponerlo, Comida vuelve a pedir el plan de la semana que enseña.
- Sin plan esta semana: se dice, y el plato queda guardado igual; entrará en el
  generador la próxima vez.

## Orden

Las fases van **en serie**, no en paralelo: 1 y 2 añaden migraciones y las dos
correrían a ser el head de Alembic. Cada PR sale de la anterior y se reapunta a
`main` cuando la anterior se fusiona.
