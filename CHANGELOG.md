# Changelog

All notable changes to Fitit are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **La tarjeta de periodo tiene una referencia, no solo una comparación.** La
  barra de cada músculo se medía contra tu propio músculo más entrenado, así que
  cinco series de pecho llenaban la barra de lado a lado — el gesto de "hecho" —
  solo porque nada las superaba. Ahora se mide contra **20 series semanales**
  fijas, con una marca a las 10, y debajo dice qué significa: *Referencia: 4
  series/semana es el mínimo que produce crecimiento. 10–20 es la zona eficiente.
  Barra llena = 20.* Los números vienen de la meta-regresión de Pelland et al.
  (Sports Medicine, 2026), resumida en `docs/investigacion-series-semana.md`.
  No dice "óptimo" en ningún sitio, porque la curva no tiene pico: tiene
  eficiencia decreciente.
- **Nada de veredictos a media semana.** El lunes todo el mundo está a cero, y
  eso habla del calendario, no del entrenamiento. Mientras el periodo sigue
  abierto la tarjeta avisa: *Semana en curso — la referencia es para la semana
  completa.*

### Changed
- **"Pierna" se parte en Cuádriceps, Femoral y Gemelo.** Un solo cubo mezclaba
  sentadillas, curl femoral y gemelos, así que "Pierna: 20 series" podía ser
  veinte de sentadilla con el gemelo sin tocar — una cifra que no se puede
  comparar con ninguna referencia. Los ejercicios ya registrados se re-clasifican
  solos por su nombre al desplegar; el que no se entienda se queda en Cuádriceps
  y se corrige con un toque en Progreso · Corregir. El glúteo va con Femoral: los
  ejercicios de cadera que entrenan uno entrenan el otro. La paleta pasa de 7 a 9
  colores, revalidada para daltonismo en claro y oscuro; Cuádriceps se queda el
  rosa que era de Pierna, para que el grueso del historial no cambie de color.

### Removed
- **«Registrar sin abrir» y el aviso de descanso.** Ni la notificación de la PWA
  (service worker) ni la del APK (notificaciones locales) funcionaron nunca de
  forma fiable: las dos intentaban mantener vivo, desde fuera, un estado que
  sólo conocía la página. Se retira entero, en APK y PWA; lo sustituye el
  control nativo que describe `docs/widgets-entreno.md`.

### Fixed
- **Una serie reintentada ya no puede entrar dos veces.** Si el servidor guardaba
  una serie pero la respuesta se perdía (red que se corta en el sótano), la cola
  la reenviaba y quedaba duplicada. Ahora cada serie lleva un `client_id` desde
  que se registra, y el servidor reconoce el reintento: contesta 200 con el
  entreno tal cual en vez de crear otra. Es el primer paso de la fase 1 de
  `docs/widgets-entreno.md`, donde la cola nativa del APK lo necesita aún más.
- **"Elevación de piernas" contaba como pierna.** El clasificador veía "pierna"
  dentro del nombre antes de llegar a la regla de abdominales, así que un ejercicio
  de core llevaba meses sumando en el grupo equivocado. Ahora es Core.
- **Series sin peso.** Dominadas, fondos y abdominales no llevan peso, y la app
  exigía uno: dejar el campo vacío guardaba `0 kg`, que es un número — salía en
  la gráfica, podía batir un récord y la fila decía "0×12". Ahora el peso es
  opcional en fuerza (las reps no), un campo vacío viaja como "sin peso" y se
  lee **Corporal × 12** en la fila, en el chip y en el aviso de la pantalla de
  bloqueo, donde además una cifra suelta ya se entiende como reps. Un 0 escrito
  a mano sigue siendo un 0: barra vacía y máquina asistida son valores reales.
- **Eliminar un ejercicio** desde Progreso · Corregir, con un diálogo que dice
  cuántas series se van con él. No había forma de borrar uno: se podía borrar
  serie, entreno y día, pero un nombre tecleado mal se quedaba para siempre en
  el buscador y en los chips.
- **Fusionar duplicados.** Renombrar "Fondo" a "Fondos" cuando "Fondos" ya
  existe devolvía 409 — correcto, pero el aviso salía al pie de la página, tres
  pantallas por debajo del campo, así que en el móvil no lo veías. Ahora la
  queja sale junto al campo y trae la salida real: *Fusionar con Fondos*, que
  mueve las series al ejercicio bueno y borra el duplicado.
- **Cuentas de verdad: cada uno con su propio registro.** Hasta ahora la app era
  de un solo usuario — un usuario y una contraseña en variables de entorno, sin
  tabla `users` y sin `user_id` en ningún modelo. Dar acceso a otra persona
  significaba darle *tu* cuenta, y sus entrenos caían en las mismas tablas que
  los tuyos. Ahora hay tabla de usuarios con contraseñas cifradas (bcrypt),
  `POST /auth/register`, y ejercicios y días pertenecen a quien los creó.
- La pantalla de alta ("Crear cuenta") cuelga del login y te deja dentro al
  registrarte, sin un segundo paso para iniciar sesión.
- El catálogo de ejercicios pasa a ser **por usuario, no compartido**. Es lo que
  hace seguro renombrar: en un catálogo común, uno cambiando "Press banca" se lo
  cambiaba a todos. Dos personas pueden tener su propio "Press banca", y la
  unicidad de nombre de ejercicio y de fecha de día ahora es por persona.

### Security
- **Filtrar las listas no bastaba.** Todos los endpoints que reciben un id
  (`workout_id`, `set_id`, `day_id`, `exercise_id`) lo aceptaban sin comprobar
  de quién era. En cuanto dos personas comparten tablas con ids correlativos,
  eso es leer, editar y borrar los entrenos del otro tecleando un número. Los
  seis comprueban dueño y responden 404 — nunca 403, que confirmaría que la fila
  existe.
- Registro y login devolvían **500** con contraseñas de más de 72 bytes, el
  límite de bcrypt. En una app en español el detalle muerde antes de lo que
  parece: cada tilde y cada ñ ocupan dos bytes, así que una frase de 80
  caracteres ya se pasa. Ahora el alta lo dice (422) y el login simplemente
  rechaza (401). El hash tolera además cualquier entrada sin lanzar, porque la
  migración que siembra la primera cuenta corre como arranque del contenedor:
  ahí una excepción no es una petición fallida, es una app que no levanta.

### Fixed
- Progreso: el resumen por músculo **daba todo en negativo al empezar un mes o
  una semana**. Comparaba un periodo en curso contra uno terminado — el 1 de
  agosto, un día de agosto contra las cuatro semanas de julio — así que cada
  grupo se desplomaba por calendario, no por entrenar menos. Ahora la
  comparación es contra el **mismo tramo** del periodo anterior: nueve días de
  mes contra los nueve primeros del mes pasado, miércoles contra miércoles.
  Además el mes se medía sobre "mínimo una semana", que cogía los tres días que
  llevaba y los dividía entre siete; ahora se mide sobre los días realmente
  transcurridos, y **no hay media semanal hasta que hay una semana** que
  promediar — 12 series el día 1 no son 84/sem. El subtítulo dice cuánto llevas
  ("3.7 semanas", "6 días") mientras el periodo sigue abierto.
- Progreso: el delta salía **contra un tramo vacío**. Comprobado con los datos
  reales del 1 de agosto: el tramo equivalente es el 1 de julio, que fue día de
  descanso, así que cada fila leía su propio valor disfrazado de subida
  (*Pierna 13 series, +13*). La tarjeta ya tenía la regla — un delta contra
  nada no es un delta — pero la condicionaba a *existe mes anterior* en vez de
  a *el tramo comparado tiene volumen*. Ahora el delta y el "vs." del pie
  desaparecen juntos cuando no hay con qué comparar.
- Progreso: un músculo que **dejabas de entrenar desaparecía** del resumen en
  vez de aparecer a cero. La tarjeta responde a "¿entreno lo que creo?" y
  escondía justo el caso que hay que ver: ahora *Espalda 0 series, −6*.
- Progreso: las barras **no sumaban el total** del subtítulo y nada lo explicaba.
  El cardio no tiene grupo muscular por diseño y un ejercicio que el
  clasificador no reconoce tampoco, así que esas series contaban como volumen
  sin pintar ninguna fila. Ahora se dicen aparte: *3 series sin músculo
  asignado*.
- Progreso: el calendario **no cabía en el móvil**. Quince semanas de celdas de
  21px más una columna de siete chips a la derecha son medio metro de contenido
  en una tarjeta de 320px: el grid salía recortado por los dos lados, las
  etiquetas de día se caían por la izquierda y los chips seguían por debajo del
  calendario. Ahora son diez semanas — dos meses y medio, que es el rango que
  la pregunta necesita — y los chips van bajo el grid en una línea que se
  desliza, como los del buscador.
- Progreso: en el resumen mensual, `6.2 series/sem` partía en dos líneas dentro
  de su columna y rompía el ritmo de todas las filas. El pie ya dice que son
  medias semanales de series, así que la fila solo pone `6.2/sem`.
- Progreso: cada fila del resumen mostraba un delta igual a su propio valor
  (`+6.2`, `+4.6`…) cuando no había mes anterior con el que comparar. Sin
  periodo previo la columna queda vacía.
- Progreso: los chips de músculo estaban en la tarjeta del buscador, al final
  de la pantalla, así que para cambiar de qué iba la gráfica había que pasar por
  delante de ella. Ahora viven en la tarjeta que gobiernan.
- Progreso: la etiqueta del último récord de la gráfica se salía por el borde
  derecho (`30 × 15` se leía `3(`). Las etiquetas pasada la mitad del ancho se
  cuelgan hacia dentro.
- Progreso: `Corregir` se colaba entre el nombre del ejercicio y la gráfica,
  donde parecía un segundo encabezado. Vuelve al pie de la tarjeta.

### Changed
- **Progreso responde otra pregunta.** El calendario ya no mide constancia: el
  color es el músculo y la opacidad las series, así que de un vistazo ves si
  llevas dos semanas sin tocar pierna. Los chips de la derecha son la leyenda y
  el filtro a la vez. En su sitio hay además una tarjeta de resumen — series por
  músculo en la semana o el mes, con la diferencia contra el periodo anterior y
  flechas para ir hacia atrás.
- **Evolución sustituye a la gráfica de 1RM estimado y a "Mejores marcas".**
  Escalones en vez de pendiente: solo las sesiones en las que el peso subió de
  verdad. La curva anterior trazaba línea también por los días en que solo
  mantenías, y eso se lee como un progreso que no ocurrió.
- **Entreno encabeza con lo que pusiste en la barra**, no con un 1RM estimado:
  "Última vez · hace 3 días" y la serie tope de aquel día. El récord se marca en
  la fila que lo tomó, con la etiqueta `PR peso`, y ahora es un récord de peso
  real — más kilos que nunca a ese número de reps o más — en lugar de una
  fórmula por la que un single pesado ganaba a una serie dura de ocho. Fuera el
  banner: tapaba el log un momento y no dejaba nada detrás.
- **Repetir serie pasa a la fila de Registrar**, en gris. El log de hoy vuelve a
  numerar las series (S1, S2…) sobre filas en cebra, y las tarjetas plegadas
  enseñan las series de hoy como chips.
- **Jerarquía de tarjetas**: el ejercicio en curso lleva un lavado ámbar, la
  tarjeta protagonista de cada pantalla se eleva y lo ya hecho se hunde hacia el
  fondo. Con el dedo, ninguna fila tocable se tiñe de ámbar: solo velo gris
  mientras pulsas.
- **Marca nueva**: el icono es una barra cargada vista de frente, que de paso
  insinúa una F — al revés que el anterior, que era una F recortada sobre un
  cuadrado naranja. Iconos de app, badge y favicon nuevos.

### Removed
- Progreso: racha de días, constancia semanal, heatmap por intensidad de series,
  "Mejores marcas" y los avisos de músculo desatendido.

### Fixed
- Entreno: la notificación **saltaba cada vez que salías de la app**, no solo al
  bloquear el móvil. "Oculta" también es abrir WhatsApp o mirar la música, y
  como el reanuncio tiene que sonar para contar como una llegada, el arreglo de
  la pantalla de bloqueo se convirtió en un banner interrumpiendo cualquier otra
  cosa. La unidad correcta es la serie, no el cambio de app: registrar una serie
  da derecho a **una** llegada, que se gasta al ocultarse la app la primera vez;
  la siguiente hay que ganársela levantando algo.
- Entreno: el icono pequeño de la notificación (barra de estado y el círculo de
  la propia notificación) era un bloque gris sin forma. Apuntaba al icono de la
  app, y Android no dibuja ese hueco como una imagen: se queda con la silueta,
  tira el color y tiñe lo que queda. Un cuadrado naranja opaco de borde a borde
  silueta como un cuadrado, así que la F nunca salía. Nuevo `badge-96.png`: la
  misma F, blanca sobre transparente y nada más. El icono grande no cambia.
- Entreno: la notificación **no llegaba a la pantalla de bloqueo** salvo cuando
  el descanso terminaba — y con `Descanso: Sin`, nunca. Estaba en el cajón, con
  sus botones, y ahí se quedaba. La diferencia no era el contenido sino el
  momento de llegada: Android dibuja en el bloqueo lo que **llega** estando
  bloqueado, y no repinta lo que ya estaba en el cajón. El aviso de fin de
  descanso cumplía esa condición por casualidad; la notificación que nace al
  pulsar `Registrar` no podía cumplirla nunca, porque en ese instante el móvil
  está desbloqueado y en tu mano. Ahora la app avisa al worker cuando se oculta
  —que es justo cuando el móvil va al bolsillo— y la notificación llega otra vez,
  bajo la misma etiqueta. Sin temporizadores adivinando cuánto tardas en
  guardarte el móvil.

### Added
- Entreno: bajo `Registrar sin abrir`, una línea que dice si el aviso está vivo
  de verdad — `Activo · última a las 18:41`, o el motivo cuando no lo está. La
  notificación la construye otro hilo y la muestra el sistema, así que la app no
  veía nada de su propia función: el worker sin despertar, el worker fallando,
  el permiso revocado por detrás y Android descartando la notificación eran
  cuatro problemas distintos con la misma cara — la de que no pasa nada. La
  entrega es ahora de ida y vuelta y el worker contesta `{ ok, shown }`, con
  `shown` leído de `getNotifications`: `ok` con `shown: 0` aísla "el sistema no
  se quedó nada" de cualquier fallo del worker.

### Fixed
- Entreno: la notificación de descanso **llegaba al panel pero no a la pantalla
  de bloqueo**, que es el único sitio donde sirve. La marcaba como `silent` para
  no molestar en cada serie, y Android se lo toma al pie de la letra: varias
  capas (One UI entre ellas) esconden del bloqueo las notificaciones
  silenciosas. Ahora el silencio lo lleva `renotify: false` — una sustitución
  bajo la misma etiqueta no vuelve a avisar, así que suena una vez al aparecer
  en la sesión y luego se actualiza sin ruido, serie tras serie. El fin del
  descanso y el acuse de una serie tecleada sí piden ser oídos. Silenciarla del
  todo es una preferencia legítima y vive en el canal por sitio de Android.

### Changed
- Entreno: el descanso y el registro desde la pantalla de bloqueo pasan a ser
  **dos ajustes independientes**. `Aviso de descanso` se llama ahora
  **`Registrar sin abrir`** y va por su cuenta; `Descanso` solo decide si esa
  notificación además lleva cuenta atrás y pita al terminar. Antes estaban
  pegados, así que elegir `Sin descanso` quitaba también el botón `+1 serie` —
  y "no cronometro los descansos" no es lo mismo que "no quiero registrar desde
  el bolsillo". Sin descanso, la notificación sale con el ejercicio de título y
  sin reloj. Saltar el descanso ya no la cierra: se reenvía sin cuenta atrás,
  porque saltarse un descanso no es salirse de la sesión. La preferencia
  anterior se lee una vez como valor inicial de la nueva.
- Entreno: la notificación de descanso cambia `Saltar` por un **campo de texto**,
  así que una serie con otro peso o reps (`32.5x12`) también se registra desde la
  pantalla de bloqueo — pirámides y drop sets, que antes no tenían ninguna vía.
  Android solo da dos acciones, y `Saltar` era la prescindible: deslizar ya
  descarta la notificación y el descanso se agota solo. El parser acepta
  `32,5 x 12`, `30kg x 8` o `60 5`, pero no adivina: un número suelto es
  ambiguo entre peso y reps, y una serie inventada es peor que una no
  registrada. Lo que escribes pasa a ser también lo que repite `+1 serie`.

### Added
- Entreno: the rest countdown goes to the Android lock screen as a notification
  with a **`+1 serie`** button, so a straight set is one tap on a phone you never
  take out of your pocket. The service worker owns it (the page is frozen while
  the screen is off): it is handed the set to repeat, the token to send it with
  and the page's own unsent count, writes the set to disk before the network,
  and refuses to send while older sets are still queued in the app — `set_index`
  is assigned in arrival order. Unsent sets are handed back when the app comes
  forward, and the outbox stays the only thing that drains. Off until switched
  on in the header `⋯` (it needs a notification permission, and a permission is
  only ever asked for from a tap). Cardio blocks get no repeat button: the
  interval you just ran is not the one you are about to run.
- Entreno: a screen Wake Lock while a session is open, so the phone stops
  locking itself between sets. On by default, `Pantalla activa` in the header
  `⋯` turns it off. Re-taken whenever the app comes back, since Android drops it
  the moment the tab is hidden.

### Fixed
- Accessibility: the amber accent now clears WCAG AA (4.5:1) everywhere, the
  floor `DESIGN.md` mandates. White text on filled buttons failed AA in both
  themes (3.70 light, 2.86 dark) — buttons now use a near-black `--on-accent`
  ink (5.8 / 6.23). Amber used as text (Salir, the active tab, the "HOY" badge,
  the stepper `+`) takes a deeper `--accent-ink` (`#C2440F`) so it passes on the
  paper background, and light `--muted` went `#6B7280` → `#616875` (4.32 → 5.01
  on paper). Amber hues unchanged. Also dropped a dead `.previous strong` rule
  and added `text-wrap: balance` to headings.

### Changed
- Database moved from Render's managed Postgres to [Neon](https://neon.tech)
  serverless Postgres; Render now hosts only the web service. Dropped the
  `databases:` block from `render.yaml` and made `DATABASE_URL` a dashboard secret.
  `config.py` now normalizes Neon connection strings — translating libpq
  `sslmode` to the asyncpg `ssl` param and dropping `channel_binding` (which asyncpg
  rejects) — alongside the existing asyncpg-driver coercion (`test_config.py`).

### Added
- Project scaffold: React (Vite) frontend, FastAPI + Postgres backend on uv,
  Docker Compose for local dev, GitHub Actions CI (specs + lint + migrations),
  README and this changelog.
- Data model: `exercises`, `workouts`, `sets`.
- Spec-driven setup: Gherkin `.feature` files (`log_set`, `previous_marks`,
  `correct_set`) with `pytest-bdd`. First scenario (log a set) is intentionally
  red — the endpoint returns `501` until implemented.
- Working endpoints: `GET /health`, `POST /exercises`, `POST /workouts`,
  `GET /workouts/{id}`.
- `POST /workouts/{id}/sets` — log a set: creates the exercise on first use and
  assigns the next set index. First green slice (`log_set.feature`).
- Hardened input validation (Pydantic): `unit` restricted to `kg`/`lb`, `reps`
  1–1000, `weight` 0–1000 (0 = bodyweight), and names trimmed + non-empty.
- Unit test tier in `backend/tests/unit/` (schema validation), separate from the
  Gherkin integration specs.
- `GET /exercises/previous?name=` — previous marks: the sets from the most recent
  workout that includes an exercise; `found` is false when it was never logged
  (`previous_marks.feature`). Second green slice.
- `PATCH`/`DELETE /workouts/sets/{id}` — correct a logged set (fix its values) or
  remove it (`correct_set.feature`). Third green slice. `get_or_create_exercise`
  extracted as a shared helper.
- Single-user auth (`auth.feature`): `POST /auth/login` checks a username/password
  from the environment (`AUTH_USERNAME`/`AUTH_PASSWORD`) and returns a JWT; all
  `/workouts` and `/exercises` routes now require a bearer token (`/health` and
  `/auth` stay public). Fourth green slice.
- Frontend login screen (React): a `Login` form that posts to `/auth/login`, stores
  the JWT, and shows an error on bad credentials; `App` gates on the token. Built
  test-first with Vitest + React Testing Library (`Login.test.jsx`, `App.test.jsx`),
  now run in CI.
- Authenticated API client (`apiFetch`): attaches the stored JWT, prefixes `/api`,
  returns JSON (or `null` for 204), and on 401 clears the token and drops back to
  the login screen. Tested with Vitest (`api.test.js`).
- Workout screen (React): starts a workout, and adding an exercise shows its
  previous marks inline (`Last time: 60 kg x 8`, or "no previous marks yet"); logged
  sets appear in a list. The core log-and-beat loop, wired through `apiFetch`. Tested
  with Vitest (`Workout.test.jsx`).
- UI polish: a `styles.css` design system (cards, inputs, buttons, green accent,
  tabular set numbers, **dark mode** via `prefers-color-scheme`, mobile-first), plus
  loading (`Checking…`/`Logging…`), empty ("no sets yet"), and error (`role="alert"`)
  states across the login and workout screens. Error handling covered by a Vitest test.
- Production deploy: `render.yaml` Blueprint (web service + managed Postgres,
  migrations on pre-deploy, health check `/api/health`) and a multi-stage `Dockerfile`
  that builds the React app and serves it + the API from one FastAPI service
  (`app/web.py` mounts the API under `/api`, the static React app at `/`).
  `DATABASE_URL` is coerced to the asyncpg driver so Render's connection string works.
  Covered by unit tests (`test_web.py`, `test_config.py`).
