# Changelog

All notable changes to Fitit are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
