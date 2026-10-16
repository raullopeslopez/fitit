# Medidas caseras: cucharadas en vez de gramos

Spec del 16 de octubre de 2026, salida de un grill de nueve preguntas. Va antes que
el registro por voz (`docs/investigacion-voz.md`): cuando digas «dos cucharadas de
aceite», el parser de aquí ya lo convierte en gramos.

## 0. En una frase

> **Cocinar y apuntar con cucharadas, sin báscula, sabiendo que es aproximado.**

## 1. Las decisiones

| # | Pregunta | Decidido | Por qué |
|---|---|---|---|
| 1 | ¿Dónde? | Al cocinar **y** al apuntar | Una sola tabla sirve para las dos cosas |
| 2 | ¿De dónde salen los gramos? | Una tabla fija escrita a mano | Funciona desde el primer día; en prod hay 0 filas en `portions` |
| 3 | ¿Depende del alimento? | **No** | Sencillez por encima de precisión (ver §2) |
| 4 | ¿Se lee o también se apunta? | Las dos | Se acepta que lo apuntado así es aproximado |
| 5 | ¿Cómo se ve en el diario? | «2 cdas · ~30 g» | Es lo que hiciste; el `~` avisa sin inventar otra etiqueta |
| 6 | ¿Qué ingredientes de una receta la enseñan? | Sólo hasta 60 g | «≈ 13 cdas de pechuga» no ayuda a nadie |
| 7 | ¿Cómo se elige al apuntar? | Un selector `g ▾` junto a la caja | Decisión del usuario: un toque más que los chips (ver §5) |
| 8 | ¿Con qué unidad se abre? | La última que usaste para ese alimento | Lo probable ya va puesto: repetir cuesta un toque |
| 9 | ¿Las recetas con «2 cucharadas» llevan gramos? | Sí, el parser los rellena | Una casilla menos por línea en cada borrador |

## 2. La tabla

Cuatro medidas, y ninguna más:

| Medida | Abreviatura (singular / plural) | Gramos |
|---|---|---|
| cucharadita | cdta / cdtas | 5 |
| cucharada | cda / cdas | 15 |
| taza | taza / tazas | 240 |
| vaso | vaso / vasos | 200 |

**No dependen del alimento, y se sabe lo que eso cuesta.** Una cucharada es volumen;
sus gramos dependen de la densidad (aceite 13,5 g, harina 8 g, miel 21 g). Con la
tabla fija, «2 cdas de harina» apunta 30 g cuando eran unos 16. Se eligió así a
sabiendas: es sencillo, se entiende y el diario lo marca como aproximado.

**Lo que se queda fuera:** diente, rebanada, loncha, unidad, pizca, chorrito,
puñado. Sólo existen con un alimento concreto, y una tabla fija no puede darles
peso. Si alguna hace falta, su sitio es la tabla `portions` que ya existe (medidas
de un producto: «1 yogur = 125 g»), que convive con esto sin tocarlo.

**Manda `backend/app/nutrition.py`** (`MEDIDAS`), con el resto de la aritmética:
con ella se guardan los gramos. El frontend lleva una copia en `food.js`
(`MEASURES`) para enseñar «≈ 30 g» mientras eliges sin ir al servidor, y
`tests/unit/test_measures_mirror.py` lee ese fichero y falla si se separan. Dos
tablas distintas no darían error en ninguna parte (el mismo riesgo que
`food_log_date()` y `foodDayIso()`).

## 3. Al apuntar

### Pantalla

`Comida → buscar o tocar un alimento → hoja del alimento`. Junto a la caja de
cantidad aparece un selector con la unidad:

- Cerrado enseña la unidad actual: `g ▾`, `cda ▾`…
- Abierto ofrece, en este orden: **g**, **cdta**, **cda**, **taza**, **vaso**.
- Con una medida elegida, la caja es la **cantidad** (empieza en 1, −/+ de media en
  media) y debajo se lee lo que se va a apuntar: «≈ 30 g».
- Se abre con **la unidad de tu última entrada de ese alimento** y la cantidad que
  más repites en esa unidad. Un alimento que nunca apuntaste con medida se abre en
  `g`, como hoy.
- Las porciones de `portions`, si un alimento las tiene, siguen siendo los chips de
  encima. No pasan al selector.

### En el diario

La fila de la entrada dice **«2 cdas · ~30 g»** (`1 cda · ~15 g`, `½ taza · ~120 g`).
Las entradas en gramos se ven igual que ahora.

### Frecuentes y cantidades habituales

`GET /foods/frequent` y `GET /foods/{id}/usual` cuentan la medida como parte de la
cantidad: «2 cdas» y «30 g» son dos cantidades distintas aunque pesen lo mismo. Un
frecuente apuntado con medida se repite con su medida.

## 4. En las recetas

Donde se pinta un ingrediente de un plato con sus gramos —la receta del plato, el
borrador de una idea o de un plan importado, los platos del plan— se añade la
medida cuando la cantidad es pequeña:

- **Menos de 10 g** → cucharaditas. **De 10 a 60 g** (incluido) → cucharadas.
  **Más de 60 g** → sólo gramos.
- El número se redondea a la **media** más cercana. Si sale 0 (1 g de sal), no se
  enseña medida.
- Copy: **«27 g · ≈ 2 cdas»**, **«3 g · ≈ ½ cdta»**. En la línea de ingredientes
  del plan, donde « · » ya separa un ingrediente de otro, va sin punto:
  **«Aceite 13,5 g ≈ 1 cda · Pollo 150 g»**.
- En el borrador de una idea, «≈ 2 cdas» aparece junto a la casilla de gramos y
  cambia mientras escribes.
- Taza y vaso no aparecen nunca solos en una receta.
- **La lista de la compra sigue en gramos.** Una botella de aceite no se compra en
  cucharadas.

### El parser

`ingredient_line.py` deja hoy en blanco los gramos de «2 cucharadas de aceite»
(«sin peso fiable»). Con esta feature, cucharada, cucharadita, taza y vaso pasan a
`GRAMS_PER_UNIT` con los gramos de la tabla, y la línea llega al borrador con 30 g.
El resto de medidas sin peso sigue en blanco. El borrador sigue siendo obligatorio.

## 5. Toques

| Camino | Hoy | Con esto |
|---|---|---|
| Repetir «2 cdas de aceite» desde su hoja | escribir 27 + Apuntar ≈ 4 | **1** (Apuntar: ya viene puesto) |
| Primera vez con medida | — | `g ▾` → `cda` → `+` → Apuntar = **4** |
| Apuntar en gramos | escribir + Apuntar | igual |
| Línea «2 cucharadas» en un borrador | escribir gramos | **0** |

El selector cuesta un toque más que los chips fijos que se propusieron en el grill
(pregunta 7). Lo decidió el usuario, y lo compensa la pregunta 8: el toque extra se
paga una vez por alimento.

## 6. Datos

- `log_entries` gana dos columnas **anulables**: `measure` (`cdta`, `cda`, `taza`,
  `vaso`) y `measure_count` (número, en medias). Una entrada en gramos las deja en
  `NULL`. Los gramos se siguen guardando siempre (los de la tabla × la cantidad), y
  las macros se congelan desde ellos como hasta ahora.
- `POST /food-log` acepta `measure` + `quantity` como tercera forma de dar la
  cantidad. Exactamente una de las tres (`grams`, `portion_id`, `measure`): dos a la
  vez es un 422, igual que hoy con `grams` + `portion_id`.
- Repesar (`PATCH /food-log/{id}`) en gramos borra la medida: la entrada deja de ser
  «2 cdas».
- Migración Alembic encadenada al head; `test_food_migration.py` comprueba que las
  columnas nuevas son anulables en los dos sitios.

## 7. Fases

1. **Backend.** La tabla y la medida de una receta en `nutrition.py`, el parser,
   las columnas, `POST /food-log` con medida, y frecuentes y habituales que la
   recuerdan. Escenarios en `backend/tests/features/household_measures.feature`.
2. **Hoja del alimento.** El selector `g ▾`, la unidad con la que se abre, y la fila
   del diario.
3. **Recetas.** «27 g · ≈ 2 cdas» en receta, borradores y plan.

No toca nada nativo: la APK lo recoge en su siguiente versión sin cambios de Android.
