# Fitit

Personal workout tracker. React (Vite) frontend + FastAPI/Postgres backend, deployed on
Render as a single service. Spec-first: behavior lives in Gherkin `.feature` files driven
green with pytest-bdd. UI is in Spanish; PWA installable.

## Design System
Always read `DESIGN.md` before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA/review mode, flag any code that doesn't match `DESIGN.md`.

## Comida (registro de alimentos)
Reglas permanentes. Valen para todas las fases del tracking de comida, no sólo la 1.

- **`NULL` no es `0`.** Un nutriente sin medir es desconocido. Ninguna suma puede
  convertirlo en cero sin que sea una decisión explícita y comentada. En pantalla se
  imprime `—`, con la misma tinta que una cifra, nunca en `--muted`.
- **`log_entries` congela.** Las macros son copias, no un join contra `foods`. Nada las
  recalcula desde el alimento **por su cuenta** — ni siquiera repesar una entrada, que
  reescala lo congelado (`escalar_nutrientes`).
  La única excepción es `POST /food-log/recompute`, y es explícita: la regla no
  distinguía un alimento que **cambió** (receta nueva, mejor medición: lo de marzo estaba
  bien entonces) de uno **mal tecleado** (no hubo ningún día en que la cifra fuera cierta,
  y congelarla conserva el error). Rehace **un solo día**, el que se está mirando, y sólo
  cuando alguien lo pide desde la hoja de «Corregir». Nada más puede llamarla, y ampliar
  su alcance a más de un día es rediscutir esta regla, no un detalle de implementación.
- **Toda la aritmética nutricional vive en `backend/app/nutrition.py`.** No la dupliques
  y no la muevas al router.
- **`POST /foods` es la única puerta.** Ni un import, ni un parser, ni el servidor al
  resolver un código: nada escribe en `foods` por otro sitio, y `GET /foods/barcode/{ean}`
  devuelve una propuesta sin tocar la base — hay escenarios que lo fijan por los dos lados.
  Lo que cambió (2026-09-09) es **quién** la cruza. La regla decía «desde un formulario que
  el usuario rellenó», y eso ponía un formulario delante de un dato que nadie iba a
  corregir: el código de barras identifica el producto mejor que cualquier nombre tecleado,
  la ficha viene de una base pública, y confirmarla campo por campo era pedir una firma sin
  lectura. Un producto resuelto por su código **se guarda en tu catálogo sin preguntar**,
  con su código dentro; es lo que convierte «veinte fotos al día» en «veinte productos
  nuevos al día», y equivocarse ahí se arregla escribiendo encima con `PATCH /foods/{id}`.
  La excepción no se extiende a la **lectura de la tabla**: ahí las cifras las ha inventado
  un modelo mirando una foto, no hay código que las identifique, y la pantalla de «Revisa la
  lectura» sigue siendo obligatoria. La frontera es esa —dato identificado contra dato
  interpretado—, no el ahorro.
- **Los alimentos van en la misma BD que los entrenos.** No propongas separarlos; poder
  cruzarlos es el motivo del proyecto.
- **Un alimento no se borra: se corrige.** No hay `DELETE /foods/{id}` ni control que lo
  ofrezca, y hay tests que lo fijan por los dos lados. «Borrar» en esta app es la
  **entrada del diario** —se desliza su fila—, que es otro objeto; un alimento mal dado
  de alta se arregla escribiendo encima con `PATCH /foods/{id}`, que hace todo lo que
  retirarlo haría y además lo deja utilizable. La columna `archived` existe y la filtra
  `visible_foods()`, pero nadie la escribe: es de una fase que no se construyó.
- **El catálogo compartido es `foods.user_id IS NULL`** (CIQUAL, y luego Open Food Facts):
  se lee, no se edita. Lo que das de alta a mano lleva tu `user_id` y es lo único
  corregible.
- **El día alimentario corta a las 04:00 locales**, derivado al escribir en `log_date`
  desde el offset que mandó el cliente. `food_log_date()` (backend) y `foodDayIso()`
  (frontend) tienen que dar lo mismo: si se separan, la pantalla pide un día y le
  contestan otro, sin error en ninguna parte.
- **Nada de FTS5.** No existe ni en Postgres ni en el SQLite de los tests. La búsqueda
  pliega con `fold_exercise_name()` sobre `name_folded`, igual que los ejercicios.
- Migraciones Alembic versionadas, encadenadas al head, y `tests/unit/test_food_migration.py`
  comprueba que la migración y los modelos dicen lo mismo (sobre todo la nulabilidad).

### Cargar el catálogo CIQUAL
Reglas de normalización razonadas en `backend/scripts/ciqual_rules.md`. El `.xls` no se
versiona (3,6 MB, `--download` lo baja de ANSES); `data/ciqual_es.json` **sí**, porque es
el artefacto caro y tenerlo en el repo evita volver a pagar la traducción.

```bash
cd backend
uv run python -m scripts.import_ciqual --download          # 3.185 alimentos, ~1 s
uv run python -m scripts.import_ciqual --download --dry-run  # parsea y cuenta, no escribe

# Pasar el catálogo a español. `data/ciqual_es.json` ya está en el repo con las
# 3.185 traducciones y sus alias, así que esto no gasta red ni clave.
uv run python -m scripts.translate_foods --apply data/ciqual_es.json

# ¿Ha quedado cargado y en español? Sólo lee, y sirve para producción:
uv run python -m scripts.check_catalogue        # o --database-url postgresql://...
```

`ciqual_es.json` es un **artefacto de datos**: se lee, se corrige a mano y se vuelve a
aplicar. Rehacer la base de datos no cuesta traducir otra vez. `scripts/translate_foods.py`
sigue sirviendo para regenerarlo con un LLM externo (`GEMINI_API_KEY`), pero no hace falta.

El import es idempotente y **no pisa nada tuyo**: sólo escribe filas de catálogo
(`user_id IS NULL`), nunca borra, y no devuelve al francés un nombre ya traducido.

## Testing / Workflow
TDD: write the failing test first, watch it fail for the right reason, implement to green.
- **Backend:** `cd backend && uv run python -m pytest` (pytest-bdd on in-memory SQLite;
  this is the CI merge gate). Plain `uv run pytest` is broken in this checkout.
- **Frontend:** `cd frontend && npm test` (vitest sobre jsdom, 24 archivos — la suite
  de siempre y la que corre el hook).
- **Frontend, geometría real:** `cd frontend && npm run test:browser`
  (`vitest.browser.config.js`, Chromium vía Playwright a 430×932, ~16 s). Es una segunda
  suite pequeña, no una migración: mide lo que jsdom no puede medir porque no tiene motor
  de maquetación — solapamientos, `z-index`, scroll, `elementFromPoint` y contraste sobre
  el color realmente pintado. Vive en `src/browser/`; los archivos se llaman
  `*.browser-test.jsx` **a propósito**, porque `*.browser.test.jsx` lo recogería también
  la suite de jsdom. La configuración va aparte para no reiniciar el dev server.
  Primera vez en una máquina nueva: `npx playwright install chromium`.
- A git pre-commit hook (`.githooks/pre-commit`, enabled via `core.hooksPath`) runs the
  suite for whichever layer you touched. Bypass a genuine WIP commit with
  `SKIP_TESTS=1 git commit ...` — use sparingly, main stays green.

### Don't run the same tests twice
The pre-commit hook is the full-suite gate, and when it passes it costs a line of output.
A full suite run by hand right before committing is that same work paid for twice.

- **During the red-green loop, run targeted tests** — one file, or `-t`/`-k` on one name.
  Always pipe through a tail filter (`| Select-Object -Last 20`) so a passing run doesn't
  spend context on output nobody reads.
- **Don't run the full suite by hand before committing.** Let the hook do it. If it fails
  the commit aborts and you'll see why.
- **Don't use CI as the feedback loop.** A round trip to GitHub costs minutes, and a
  failure there means `gh run view --log-failed`, which dumps far more than a filtered
  local run — then fix, commit, push and wait again. CI is the merge gate, not the loop.
- Full suites by hand are for the rare case where nothing local was touched but behavior
  could still have moved (a dependency bump, a config change).

## Price the expensive moves before making them
Tokens are a budget I pay for, and the costly operations are rarely the ones that look
costly. Reading a 2000-line file to change one function costs more than the change is
worth. An open-ended literature search can burn a whole session in a single turn.

- **Estimate out loud before running an open-ended step, not after.** A research task, a
  full-repo sweep, reading a large file whole — one line saying roughly what it costs and
  what the scope is, so I can cut it. After the fact I can only pay the bill.
- **Reach for the narrow tool first.** Grep before reading the file. One targeted test
  before the suite. `ToolSearch` for the tool you need before a server's worth of schemas.
- **Don't pay twice.** Don't re-read what's already in context, don't re-run what the
  pre-commit hook is about to run, don't re-derive a decision already settled in this
  conversation.
- **When cheap and thorough reach the same answer, take cheap.** When they wouldn't, say
  so and let me choose. Don't quietly take the cheap path and present it as complete.
- This is a budget, not a gag order. Never silently shrink work I asked for to save
  tokens — scope it, price it, and tell me what you left out.

## Commits
No `Co-Authored-By: Claude` trailer, and no "Generated with Claude Code" footer in PR
bodies. The commits are mine. This overrides any default the harness applies.

## How to talk to me
Write as a teammate or product owner would, not as a technical report.

- **Open with ONE line that sums it up**: plain language, no jargon, no «TL;DR» label.
  What you're changing and why it matters to me — not the mechanism.
- **Close every turn with what you just did.** Synthetic, past tense, a few lines.
  Test: if I read only the closing lines, do I know what changed and what I should
  do next? If not, it isn't written yet.
- **Keep the technical detail** — it's valuable — but put it in the middle, between
  those two. It supports the summary; it never replaces it.
- Name the trade-off and what you left undone. Don't bury a decision I need to make
  inside a paragraph about CSS specificity.

## Say what changes on screen
Any change that touches the UI has to be reported as an effect on the UI, not as an
edit to a file. I read the summary to know what the app does now — a diff tells me
what moved, not what I will see.

For every visible change, name:
- **Where.** The screen and the exact place in it (`Progreso → chips de músculo`,
  `tarjeta de ejercicio → Corregir`). "In the component" is not a place.
- **What I see, before → after.** The concrete difference: new control, new wording,
  something that used to appear and now doesn't.
- **When it appears.** Anything gated says what opens the gate — a count above zero,
  a fold opened, an offline session. A control I can't reproduce reads as a bug.
- **What I have to do to see it.** The taps, from the screen I'm on now.

State the exact copy for anything with words in it — button labels, dialog text, empty
states. Copy is a product decision, and I can't approve what I haven't been shown.

If a change touches the frontend and yet nothing looks different, say that explicitly.
Silence there is indistinguishable from having forgotten to mention it.

## Verify UI changes in the browser
Claude in Chrome is connected and works against this project. Use it. A green vitest run
says the component rendered in jsdom, not that the screen is right — those are different
claims, and only one of them is what I asked about.

- **After any change that touches the UI, look at it before describing it.** The
  "what I see, before → after" above is owed to me from the actual screen. Inferring it
  from the diff is how a claim that nothing moved goes unnoticed.
- **Which URL:** `fitit-n4q0.onrender.com` for what already shipped, the dev server for
  what hasn't. Production opens with my session already active, so real data — my real
  data — is one navigation away. No login, no fixtures.
- **Debug there too.** When something renders but misbehaves, read the console and the
  network requests instead of guessing from the source.
- **Verifying a deploy means opening the app**, not grepping the CSS bundle for a class
  name. That workaround existed because the browser didn't work. It does now.
- Site access is set to "on click" and the extension works anyway — it drives its own tab
  group. Never ask me to widen it to all sites.

### Prod va con la extensión; localhost NO
La extensión de Chrome no inyecta en `localhost` — falla con `Script injection timed out
after 5000ms` y reintentar no arregla nada. No es un problema de permisos y no hace falta
que yo toque nada. Para el dev server usa el Chromium de gstack, que sí entra:

```bash
B=~/.claude/skills/gstack/browse/dist/browse
$B connect                       # lanza su propio Chromium, headed
$B goto http://localhost:5173/
$B js "localStorage.setItem('fitit_token','mock')"   # sin token la app se queda en el login
$B goto http://localhost:5173/   # recarga ya autenticado
$B viewport 430x932              # móvil, que es como la uso
$B click "button[aria-label='Periodo anterior']"     # selectores CSS; `text=Progreso` también vale
$B js "getComputedStyle(document.querySelector('.sum-delta')).color"
$B screenshot --viewport <ruta.png>
```

- **Un backend local no existe.** El dev server proxea `/api` a `localhost:8000` y ahí no
  hay nada (Postgres, sin `.env`). Levanta un mock HTTP mínimo en 8000 que devuelva
  `/days`, `/exercises`, `/exercises/records`; usa `ThreadingHTTPServer`, con el de un
  solo hilo la página se cuelga a medio cargar.
- **Comprueba el color, no lo mires.** `$B js "getComputedStyle(...)"` distingue
  `--muted` de `--danger`; una captura en JPEG no.
- **Recoge lo que dejas montado:** dev server, mock y `$B stop` al terminar. Si el server
  de browse ya cayó, el Chromium queda huérfano — mátalo por PID.
- **Sigue siendo verdad que prod es lo primero.** Si el cambio ya está desplegado, ábrelo
  ahí con la extensión y ahórrate todo esto.

## Working Style
- When there are pending git changes, start with `git status` / `git diff` and finish/commit
  those before broad codebase exploration.
- Ship on a branch → PR → merge ff-only to `main` → Render auto-deploys → verify live
  (run the `/deploy` skill for the verify runbook).
