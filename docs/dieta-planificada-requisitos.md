# Dieta planificada: requisitos técnicos

Fase 2 del proyecto. El brainstorming se cerró el 21-09-2026 en
`docs/dieta-planificada.md` (39 secciones, 19 decisiones cerradas); esto lo
traduce a tablas, endpoints, aritmética y escenarios.

**Qué es esto:** el plan de construcción. Qué se hace, en qué orden, y qué
queda fuera.
**Qué no es:** código. Nada de lo de aquí está implementado.

Detalle completo en las fases 1–3. Las fases 4–6 van esbozadas a propósito:
afinarlas hoy sería escribir sobre decisiones que las tres primeras van a
mover, y ese trabajo se tira.

---

## 1. Las seis fases

Cada una se puede terminar, desplegar y usar sin la siguiente. Eso no es
estética: es lo que permite parar el proyecto en cualquier punto sin haber
construido la mitad de algo.

| # | Entrega | Útil sola porque… | Depende de | Tamaño |
|---|---|---|---|---|
| 1 | **Peso corporal** | ves tu peso y su tendencia | — | pequeña · **hecha** |
| 2 | **Elaboraciones** | registras «lentejas de mamá» de un toque | — | grande · **hecha** |
| 3 | **La IA puebla el repertorio** | llenas la fase 2 sin teclear | 2 | mediana · **hecha** |
| 4 | **Objetivos y reglas** | tus objetivos dejan de ser inventados | 1 | grande · **hecha** |
| 5 | **El generador** | existe la semana | 2, 4 | grande |
| 6 | **El plan en pantalla** | confirmas en vez de teclear | 5 | mediana |

La decisión 12 («la IA entra en la v1») se cumple: la fase 3 aterriza mucho
antes de que exista un plan que seguir.

Las fases 1 y 2 no dependen una de otra y pueden ir en paralelo o en cualquier
orden. La 1 es pequeña y desbloquea la 4, que es de las grandes: conviene
hacerla pronto aunque no luzca.

---

## 2. Fase 1 — Peso corporal

> **Terminada el 21-09.** Tabla, migración, `app/weight.py`, los tres endpoints
> y la tarjeta `Peso` al pie de Progreso, con la tendencia en mono y el guion de
> lo desconocido en la tinta de una cifra. 22 tests + 2 de navegador.
>
> Un cambio sobre lo escrito abajo: la ventana de la tendencia **cuelga de la
> pesada más reciente, no del reloj**. Con pesadas esporádicas (decisión 16),
> una ventana anclada a hoy dejaría la tendencia en blanco justo cuando más
> falta hace. Lo que sí se devuelve es `up_to`, para que la pantalla pueda
> decir que es de hace un mes: decidir si eso es demasiado viejo es de quien lo
> pinta, no de la función.

### Tabla

```
body_weights
  id           PK
  user_id      FK users ON DELETE CASCADE, indexado
  measured_on  DATE     NOT NULL
  kg           FLOAT    NOT NULL
  created_at   TIMESTAMPTZ
  UNIQUE (user_id, measured_on)
```

- **Una pesada por día.** Volver a pesarte el mismo día reescribe la del día:
  la báscula no acumula, mide.
- **La ausencia es ausencia.** No hay fila para los días que no te pesas, y eso
  no es un cero. Misma regla que los nutrientes sin medir.
- `measured_on` es una fecha civil, no un instante: una pesada no tiene hora
  útil. **No usa `food_log_date()`** — el corte de las 04:00 es del diario de
  comida, y aplicarlo aquí haría que pesarte a las 3 de la mañana contara para
  el día anterior, que no significa nada.

### Módulo

`backend/app/weight.py` — nuevo, y pequeño:

- `tendencia(pesadas, *, ventana_dias=7) -> float | None` — media móvil. Es la
  cifra que se usa para todo lo demás; la última pesada **no se usa nunca**
  para derivar nada (decisión 16 + §31: el objetivo no puede perseguir el ruido).
- `None` cuando no hay pesadas suficientes en la ventana. No se inventa.

### Endpoints

```
POST   /body-weight        {measured_on, kg}      → crea o reescribe el día
GET    /body-weight?desde=&hasta=                 → las pesadas
GET    /body-weight/trend                          → {kg, ventana, pesadas_usadas}
```

`GET /body-weight/trend` devuelve **también cuántas pesadas ha usado**, porque
una tendencia sobre dos pesadas y una sobre veinte no valen lo mismo y la
pantalla tiene que poder decirlo.

### Migración y tests

- Alembic encadenada al head vigente, **`f4a1c6e29b83`** (18 migraciones hoy).
- `tests/unit/test_body_weight_migration.py`, con la misma forma que
  `test_food_migration.py`: la migración y el modelo tienen que decir lo mismo,
  **sobre todo la nulabilidad**.
- `tests/features/body_weight.feature`:
  - Registrar una pesada y verla en el histórico.
  - Pesarse dos veces el mismo día deja una sola fila, la última.
  - La tendencia con una sola pesada **no es esa pesada**: es desconocida.
  - Un día sin pesada no rompe la tendencia ni cuenta como cero.

---

## 3. Fase 2 — Elaboraciones

> **Terminada el 22-09.** Backend —`dishes`, `dish_ingredients`,
> `log_entries.dish_id`, la aritmética en `nutrition.py`, cinco endpoints— y
> pantalla: chips de «Tus platos» en Añadir, alta a pantalla completa, y el
> diario agrupando las filas de un mismo plato bajo su nombre.
>
> **Dos apartes de alcance sobre lo escrito abajo, los dos a la baja:**
>
> 1. **No se crean `role`, `min_grams`, `max_grams`, `is_block` ni `rating`.**
>    Son de las fases 3 y 5 y hoy no las leería nadie. Este repo ya arrastra dos
>    columnas muertas —`archived` e `is_recipe`— y añadir cinco más por
>    adelantado es repetir el error con mejor letra. Entran con la fase que las
>    use; en Alembic una columna nueva es barata.
> 2. **No se escribe `convertir_base()`.** Dentro de esta fase nada convierte:
>    `basis` dice cómo pesas el plato y sus ingredientes tienen que ser filas
>    medidas así — CIQUAL trae las dos. Escribirla ahora significaría inventarse
>    factores de merma sin fuente, que es justo lo que §7 dice que hay que
>    verificar antes. La conversión la pedirá el generador (fase 5), y para
>    entonces habrá que traer el factor de algún sitio.

La pieza que `comida-pendiente.md` dejó pendiente por no tener dónde apoyarse.
Aquí se apoya.

### Tablas

```
dishes
  id           PK
  user_id      FK users NOT NULL         -- no hay catálogo compartido de platos
  name         VARCHAR(160) NOT NULL
  name_folded  VARCHAR(160) NOT NULL, indexado
  method       VARCHAR(24) NULL          -- air_fryer | plancha | horno | sarten | cocido | crudo
  basis        VARCHAR(8)  NOT NULL      -- 'raw' | 'cooked'      (decisión 7)
  servings     FLOAT NOT NULL DEFAULT 1
  rating       SMALLINT NULL             -- decisión 14; NULL es «sin puntuar», no «malo»
  is_block     BOOLEAN NOT NULL DEFAULT false   -- §39: el guiso no se deja ajustar
  created_at   TIMESTAMPTZ

dish_ingredients
  id         PK
  dish_id    FK dishes ON DELETE CASCADE, indexado
  food_id    FK foods
  grams      FLOAT NOT NULL
  role       VARCHAR(16) NOT NULL DEFAULT 'fixed'   -- fixed | adjust_carb | adjust_fat
  min_grams  FLOAT NULL
  max_grams  FLOAT NULL
```

Y una columna nueva en `log_entries`:

```
log_entries
  + dish_id   FK dishes NULL, indexado
```

### Las cuatro decisiones de diseño que esto fija

**Un plato no es un alimento.** No entra en `foods`, no aparece en la búsqueda
de alimentos, y no pasa por `POST /foods`. Si coláramos platos en el catálogo,
`POST /foods` dejaría de ser la puerta que es. Consecuencia menor:
**`foods.is_recipe` queda muerto** — como `archived`, columna de una fase que no
se construyó. Recomiendo dejarla y documentarla, no migrar por estética.

**`name_folded` con `fold_exercise_name()`**, igual que alimentos y ejercicios.
Nada de FTS5, que no existe ni en Postgres ni en el SQLite de los tests.

**Registrar un plato congela una entrada por ingrediente, no una suma.**
`comida-pendiente.md` dejaba la pregunta abierta y la regla del congelado
empujaba a la suma. La respuesta es la contraria, y por tres motivos concretos:
`escalar_nutrientes()` sigue funcionando sobre cada fila, corregir el peso de un
ingrediente sigue siendo posible, y `sumar_nutrientes()` no se entera de nada.
El precio —un diario más largo— se paga en pantalla agrupando por `dish_id`,
que es un problema de presentación y no de datos.

**Un plato no se borra: se corrige.** Espejo de la regla de alimentos, y por la
misma razón: hay entradas congeladas y habrá planes apuntando a él. No hay
`DELETE /dishes/{id}` y habrá tests que lo fijen por los dos lados.

### Aritmética — en `nutrition.py`, no en el router

Funciones nuevas, junto a las que ya están (`calcular_nutrientes`,
`escalar_nutrientes`, `sumar_nutrientes`, `restante`, `atwater_kcal`):

- `macros_de_plato(ingredientes) -> dict` — la suma de los ingredientes,
  **propagando desconocidos**: si a un alimento le falta la fibra, la fibra del
  plato es desconocida, no la suma de los demás. Reusa `sumar_nutrientes()`.
- `macros_por_racion(plato) -> dict` — lo anterior entre `servings`.
- `convertir_base(nutrientes, de, a, factor) -> dict` — crudo ↔ cocinado
  (decisión 7). **Se niega en vez de estimar** cuando no hay factor: es la misma
  postura que `ColumnRefused` en `label.py`.

`atwater_kcal()` y `kcal_disagreement()` ya existen y **sirven tal cual** para
avisar de un plato cuyas kcal no cuadran con sus macros.

### Endpoints

```
POST   /dishes                    → crea (nombre, método, base, raciones, ingredientes)
GET    /dishes?q=                 → busca sobre name_folded
GET    /dishes/{id}               → con ingredientes y macros por ración
PATCH  /dishes/{id}               → corrige. La única forma de arreglar un plato
POST   /dishes/{id}/log           → registra N raciones en un hueco y un día
PATCH  /dishes/{id}/rating        → decisión 14
```

`POST /dishes/{id}/log` es el que escribe: una `log_entry` por ingrediente, con
los gramos escalados por raciones, los macros congelados en ese momento y el
`dish_id` puesto. **No toca `foods`.**

### Escenarios que lo dirigen

`tests/features/dishes.feature`:

- Los macros por ración son la suma de los ingredientes entre las raciones.
- Un ingrediente al que le falta un nutriente deja ese nutriente **desconocido**
  en el plato entero, no lo suma como cero.
- Registrar un plato escribe una entrada por ingrediente, y el subtotal del
  hueco las recoge todas.
- **Corregir el plato no toca lo ya registrado** (la regla del congelado, sobre
  el objeto nuevo).
- Repesar una entrada venida de un plato reescala sólo esa entrada.
- No hay forma de borrar un plato.

---

## 4. Fase 3 — La IA puebla el repertorio

> **Terminada el 22-09.** Backend —`app/repertoire.py`, el transporte de
> `gemini.py` extraído y reusado, `POST /dishes/generate`— y pantalla:
> «Proponme platos» en Añadir, la tanda que llega ya guardada, y el cajón de
> sugerencias diciendo qué alimento falta.
>
> Lo que **no** hace la pantalla: resolver una sugerencia de un toque. Dar de
> alta el alimento que falta y volver a pedir son hoy dos gestos separados.
>
> **Tres apartes sobre lo escrito abajo:**
>
> 1. **El endpoint se llama `/dishes/generate`, no `/dishes/propose`.** Por la
>    decisión 13 no sólo propone: **guarda** los platos que se sostienen solos,
>    y un nombre que dice «proponer» sobre algo que escribe es un nombre que
>    miente. Devuelve `created` y `suggestions` por separado.
> 2. **La despensa no es el catálogo entero.** CIQUAL son 3.185 alimentos y
>    mandárselos haría proponer con cosas que no has comprado en tu vida. Es lo
>    que has dado de alta más lo que has registrado alguna vez, hasta 60.
> 3. **Sin cuota de exploración todavía** (decisión 22). Explorar se define
>    contra una zona de confort, y la zona de confort la darían las
>    puntuaciones — que son la columna `rating` que la fase 2 dejó sin crear por
>    no tener lector. Hoy **todas** las propuestas son exploración, así que la
>    cuota no distinguiría nada. Entra cuando entren las puntuaciones.
>
> Y un cambio de orden que es de producto: se comprueba **la despensa antes que
> el modelo**. No tener nada registrado es un hecho sobre ti que no cambia
> porque la función esté encendida, y es el único de los dos que puedes
> arreglar tú.

Sin tablas nuevas. Decisión 13: los platos propuestos **entran solos**, así que
no hay tabla de propuestas pendientes — se crean como `dishes` y se corrigen.

### Módulo

`backend/app/repertoire.py`, **calcado de `label.py`** y por el mismo motivo: la
salida de un modelo no entra en el dominio sin pasar por sus puertas.

- `DishProposal` — «una propuesta de plato. Ni un plato, ni una entrada».
- `_foods_exist(nombres)` — cada ingrediente propuesto **tiene que casar con una
  fila de `foods`**. Aquí está la garantía que hace segura la decisión 13: el
  modelo propone *qué combinar*, nunca *cuánto suma*, y los macros los calcula
  `nutrition.py` sobre fichas reales.
- `_sane_grams(alimento, gramos)` — rangos creíbles, como `_sane()`.
- `ProposalRefused` — se niega cuando nombra un alimento que no existe y no es
  del cajón de sugerencias.

El cliente HTTP es **`gemini.py` tal cual**: ya tiene reintentos y ya distingue
el 429 de cuota del día del de cuota del minuto. No se reescribe.

### El cajón de sugerencias (decisión 15)

Un plato que nombra un alimento que no tienes es el único caso que **sí** pasa
por pantalla de revisión: ese alimento no tiene ficha, y si la escribe el modelo
es dato interpretado. Entra por `POST /foods` como todo lo demás.

Es la frontera de `CLAUDE.md` respetada sin excepciones nuevas: **dato
identificado contra dato interpretado**.

### Endpoints

```
POST   /dishes/propose    {despensa?, metodos?, minutos_max?, n}  → N propuestas
```

Y una **cuota de exploración** (§39): una parte de las propuestas a propósito
fuera de la zona de confort, **etiquetada como tal**. Que se vea que es una
prueba, no una sorpresa.

### Escenarios

`tests/features/propose_dishes.feature`:

- Una propuesta cuyos ingredientes están todos en el catálogo se guarda sola.
- Una propuesta que nombra un alimento desconocido **no se guarda**: sale al
  cajón de sugerencias.
- Los macros del plato propuesto salen del catálogo, no de lo que dijo el modelo
  — aunque el modelo mande cifras, se ignoran.
- Con la cuota del día agotada (429), la función se retira y el resto de la app
  sigue igual. (El camino reactivo que ya funciona en la lectura de etiquetas.)

---

## 5. Fase 4 — Objetivos y reglas (esbozo)

> **La mitad del objetivo, terminada el 23-09 (backend).** `users.goal`,
> `goal_rate` y los datos del cuerpo; `daily_targets` congelando el objetivo del
> día la primera vez que se lee; `app/targets.py` con la fórmula y la medición;
> `GET /targets/proposal`, `POST /targets/accept`. 25 tests.
>
> **Se parte en dos y el corte es el del brainstorming:** el objetivo da
> **kcal**, y el reparto en macros es de **las reglas**. Una cosa es cuánto
> comes y otra cómo lo repartes; mezclarlas aquí habría hecho que el objetivo
> tuviera que saber de proteína por kilo, que es una regla.
>
> Lo que quedó decidido al construirlo:
>
> - **El factor de actividad sale de los días que entrenas**, que la app ya
>   sabe, en vez de un «nivel de actividad» que rellena el usuario. Sigue siendo
>   estimación —por eso la medición la sustituye—, pero no se la inventa nadie.
> - **La medición manda en cuanto hay con qué** (14 días de registro y dos
>   tendencias de peso), y la respuesta dice de cuál de las dos salió.
> - **Suelo de 1.200 kcal, y se dice cuando toca.** No es prescribir: es negarse
>   a pintar una cifra que sale de multiplicar mal un ritmo de bajada.
> - **Los días anteriores a esto no reciben fila** en `daily_targets`. No había
>   objetivo congelado, y escribirlo hacia atrás sería inventarse lo que aquel
>   día decía la pantalla.
>
> **Los grupos de alimento, hechos el 23-09.** `foods.group_code` y
> `subgroup_code`, el import de CIQUAL escribiéndolos —**ya los leía y los
> tiraba**—, y `app/food_groups.py` con el vocabulario que hablarán las reglas:
> verdura, tubérculo, legumbre, fruta, frutos secos, cereal, carne, pescado,
> huevo y lácteo, sobre el nivel 2 de CIQUAL. El nivel 1 no sirve para reglas:
> frutas, verduras, legumbres y frutos secos caen todos en el mismo cajón.
>
> Se guardan **los códigos**, no los nombres franceses, que habría que traducir
> y mantener traducidos. Y sin clasificar es `None`, nunca «no es verdura»: 45
> filas de CIQUAL no tienen grupo y ninguno de tus alimentos a mano lo trae, así
> que una regla que cuente verduras tendrá que contarlos aparte.
>
> **Ojo al desplegar:** los alimentos ya cargados se quedan sin código hasta que
> se vuelva a pasar `scripts/import_ciqual.py`, que es idempotente.
>
> **Las reglas, hechas el 23-09 (backend).** Tabla `rules` con **ámbito**
> (`day`, `week`, `slot`), **condición** (`training`, `rest`, ninguna) y
> **dureza** (`hard`, `soft`); `app/rules.py` con el catálogo cerrado de seis
> tipos y sus evaluadores; `POST/GET/PATCH /rules` y `GET /rules/verdicts`.
> Con esto se expresan las ocho reglas de §32 del brainstorming.
>
> Decisiones tomadas al construirlo:
>
> - **`params_json` y no columnas.** Los seis tipos piden cosas distintas y
>   seis juegos de columnas mayormente nulas describirían peor lo que hay. La
>   garantía la dan el validador y los tests, no el esquema.
> - **Una regla se retira, no se borra.** No hay `DELETE`: se le pone
>   `active_to`. Cambiar de opinión en octubre no puede reescribir cómo se
>   juzgó septiembre.
> - **Retirada y callada no son lo mismo.** Una condicionada al tipo de día
>   sigue siendo tuya y sale como `n_a`; una retirada no sale, porque
>   enseñarla cada día como «no aplica» sería ruido para siempre.
> - **`unknown` no es `broken`.** Sin tendencia de peso, o con un alimento sin
>   clasificar, la regla dice que no puede saber y cuenta cuántos no pudo
>   clasificar. No saber no estropea el día.
> - **Al dar de alta un alimento se puede decir su familia**, que es la otra
>   mitad de la decisión 19. Se pide la familia y no el código porque es lo que
>   alguien sabe de un brócoli.
>
> **La pantalla, hecha el 23-09.** Dos superficies nuevas, las dos colgando de
> la hoja de objetivos de Comida (el lápiz de la tarjeta de macros):
>
> - **`Objetivo.jsx`** abre la hoja con de dónde salen tus calorías: la cifra
>   propuesta, si está **medida con tus datos** (y cuántos días) o **estimada
>   con una fórmula**, qué falta para poder medirla, y el perfil (qué quieres,
>   kg por semana, altura, año de nacimiento, sexo). «Aceptar» copia la cifra
>   al objetivo del día; el reparto en macros sigue debajo, porque es de las
>   reglas.
> - **`Reglas.jsx`** es pantalla completa: tus reglas **en castellano**
>   («Proteína entre 1,5 y 2 g por kilo, los días que entreno»), con su dureza
>   y un «Retirar» que pone `active_to`; y el alta, que enseña sólo los campos
>   del tipo elegido. El catálogo cerrado del backend se ve aquí como seis
>   recetas, no como un formulario genérico.
> - **`Veredictos`** vive en el día de Comida, bajo las macros, y **sólo pinta
>   lo que no está bien**: lo roto y lo que no se puede saber. Una regla
>   cumplida no ocupa sitio, que es lo contrario de un checklist.
>
> Dos defectos que ni jsdom ni la suite de geometría podían ver, y que salieron
> de abrir la app en Chromium:
>
> - El **asa** de la hoja se había quedado a media altura, porque la sección
>   nueva se insertó por encima del formulario que la tenía dentro. Se sacó de
>   `Objetivos` y se pinta arriba de la hoja.
> - **Dos cifras decían ser el objetivo del día** —la propuesta (2.600) y el
>   total derivado del reparto (2.330)— sin nada que dijera cuál manda. Se
>   añadió una línea bajo el total: «Tu objetivo son 2.400 kcal: te faltan 70
>   por repartir».

```
users        + goal VARCHAR(12) NULL, goal_rate FLOAT NULL
             los cuatro objetivo_* pasan a ser caché de lo derivado
daily_targets  user_id, log_date, kcal/protein/fat/carbs NULL,
               source ('formula'|'measured'|'manual'), UNIQUE (user_id, log_date)
rules          user_id, type, scope ('day'|'week'|'slot'), slot NULL,
               day_condition ('training'|'rest') NULL, hardness ('hard'|'soft'),
               params_json, active_from, active_to NULL
```

- **`daily_targets` es el congelado del objetivo** (§31). Deja de ser opcional
  en cuanto el objetivo se deriva: sin él, bajar de peso reescribe el pasado.
- **`rules` lleva `active_from`/`active_to`** porque las reglas tienen historia
  (§30), igual que los planes.
- El catálogo cerrado de tipos vive en `backend/app/rules.py`, con un validador
  por tipo. `params_json` es pragmático: **la garantía la dan el validador y los
  tests, no el esquema**. Seis tipos para empezar: `macro_per_kg`,
  `macro_share`, `group_presence`, `group_frequency`, `cap`,
  `method_preference`.
- Grupos de alimento: `foods.group_code` + reimport de CIQUAL (decisión 19).
  **Ver §7 antes de planificarlo.**

---

## 6. Fase 5 — El generador (esbozo)

```
plans         user_id, week_start, seed, created_at
plan_entries  plan_id, log_date, slot, dish_id, scale,
              status NULL,           -- NULL es «no dicho», no «saltado»
              log_entry_id NULL
```

**No es un solver.** Es un voraz aleatorizado con reinicios, y eso es una
decisión, no una limitación aceptada a regañadientes:

1. Para cada día y hueco, candidatos = platos que cumplen las **reglas duras de
   hueco** y no están en enfriamiento (no repetir, y no repetir la semana
   pasada).
2. Elegir con peso: puntuación alta tira más, con la cuota de exploración.
3. **Ajustar por día, no por plato** (§39). Resolver los gramos de los
   ingredientes ajustables del día contra `daily_targets`, recortando a
   `[min_grams, max_grams]`. Un plato `is_block` no aporta ajuste: el resto del
   día compensa.
4. Evaluar las **reglas blandas** → puntuación de la semana.
5. N reinicios con semillas distintas; se queda el mejor.
6. Devolver **también el porqué**: qué regla blanda no se cumplió y por cuánto.

**Determinista dada la semilla.** Es lo que hace que el plan sea el mismo el
martes que el jueves (§22), y lo que permite el diff de §34: regenerar con una
regla nueva y comparar.

---

## 7. Lo que hay que verificar antes de empezar

Tres cosas que el brainstorming dejó marcadas como no verificadas y que cambian
el tamaño de una fase si salen mal:

1. ~~¿El `.xls` de CIQUAL trae columnas de grupo?~~ **Comprobado el 21-09: sí.**
   Son las **seis primeras columnas de la hoja `compo`**, en tres niveles:
   `alim_grp_code` / `alim_ssgrp_code` / `alim_ssssgrp_code` y sus tres nombres
   en francés. El import las está leyendo y tirándolas.

   Y la taxonomía **distingue lo que hace falta**, en el nivel 2:

   | Grupo (nivel 2) | Alimentos |
   |---|---|
   | `légumes` | 303 |
   | `pommes de terre et autres tubercules` | 51 |
   | `légumineuses` | 38 |
   | `salades composées et crudités` | 21 |

   Nivel 1 son once grupos grandes (`fruits, légumes, légumineuses et
   oléagineux`, `viandes, œufs, poissons et assimilés`…), demasiado gruesos
   para una regla; el útil es el 2.

   Dos consecuencias de diseño:

   - **Se guardan los códigos, no los nombres.** `alim_grp_code` y
     `alim_ssgrp_code` son estables y no hablan ningún idioma; los nombres
     franceses habría que traducirlos y mantenerlos. El mapa código → nombre en
     español vive en un módulo, junto a las reglas que lo usan.
   - **45 filas no tienen grupo** (los «aliment moyen», con código `00` y nombre
     vacío). Eso es `NULL`, no cadena vacía, y una regla de «verdura» tiene que
     contarlas como **sin clasificar**, nunca como «no es verdura».

   La decisión 19 queda, por tanto, en **dos columnas y un reimport**. Barata.
2. **¿Hay fila *cocida* para los alimentos de tu despensa?** La decisión 7 pide
   que cada plato diga su base; convertir entre las dos necesita o la fila
   pareja de CIQUAL o un factor de merma. Si falta, hay que decidir de dónde
   sale ese factor — y `convertir_base()` debe negarse mientras no lo haya.
3. **El repertorio real.** Todo esto se dimensiona muy distinto con 15 platos
   que con 60. Conviene medirlo en la fase 2 antes de diseñar el generador.

---

## 8. Lo que no se construye

Dicho para que nadie lo eche de menos a mitad:

- **Adherencia literal** (decisión 5). Sólo la nutricional. Se puede añadir
  después sin rehacer nada, pero no sale gratis del otro número.
- **Lista de la compra.** Es una suma determinista sobre el plan, así que la
  fase 5 la deja a tiro — pero no entra en estas seis.
- **Avisos por comida**, **micronutrientes**, **prescribir la dieta**,
  **compartir el plan**. Todo fuera, y razonado en el brainstorming.
- **FTS5.** No existe aquí y no va a existir.

---

## 9. Lo que sigue abierto (no bloquea)

Cuatro decisiones del brainstorming siguen en su default —4, 17, 18, 19— y tres
nacieron con §39 —21, 22, 23—. Ninguna impide empezar por las fases 1 y 2, que
no las tocan. La 17 y la 19 hay que cerrarlas antes de la fase 4; la 21 (¿el
ajuste es por plato o por día?) ya está resuelta de hecho en §6 de este
documento, a favor del día.

Y los dos números de §37: cuántos días lleva verdura la cena, y qué es «pesada».
Son parámetros de dos reglas, así que se pueden poner el día que exista la
fase 4.
