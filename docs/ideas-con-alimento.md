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
- Guardar va por `POST /dishes` (la puerta de siempre) y la idea recuerda su plato
  (`dish_id`): la fila pasa a decir «Guardado».

## Fase 3 — Llevarlo al plan · PR 3 (sobre la 2)

Spec: `backend/tests/features/idea_to_plan.feature`.

- Desde el plato recién guardado (y desde la fila «Guardado» de la idea): «Ponerlo en
  el plan» → eliges uno de los huecos de esta semana → se cambia por este plato con el
  `PATCH /plans/entries/{id}` que ya existe (`status: swapped`).
- Sin plan esta semana: se dice, y el plato queda guardado igual; entrará en el
  generador la próxima vez.

## Orden

Las fases van **en serie**, no en paralelo: 1 y 2 añaden migraciones y las dos
correrían a ser el head de Alembic. Cada PR sale de la anterior y se reapunta a
`main` cuando la anterior se fusiona.
