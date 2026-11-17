# Fitit

A personal training and nutrition tracker: log a set in one tap against your last
mark, log food by barcode, label photo or voice, and plan the week's meals around
training. The UI is in Spanish on purpose — it's built for its one real user.

[![CI](https://github.com/raullopeslopez/fitit/actions/workflows/ci.yml/badge.svg)](https://github.com/raullopeslopez/fitit/actions/workflows/ci.yml)
[![Android APK](https://github.com/raullopeslopez/fitit/actions/workflows/android.yml/badge.svg)](https://github.com/raullopeslopez/fitit/actions/workflows/android.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Architecture

```
  Android app (Capacitor + native Java)        Browser (installable PWA)
          │  same React bundle inside the APK          │
          └──────────────────┬─────────────────────────┘
                             │ HTTPS, JWT
                 ┌───────────▼────────────┐
                 │  FastAPI  (/api/*)     │──► Gemini / Groq (label & voice reading,
                 │  + built React app (/*)│    capped per account per day)
                 └───────────┬────────────┘──► Open Food Facts (barcode lookup)
                             │ SQLAlchemy async
                       ┌─────▼─────┐
                       │ Postgres  │  Alembic migrations, run on container start
                       └───────────┘
```

- **Backend:** Python 3.12, FastAPI, async SQLAlchemy, Pydantic, Postgres (Neon in
  production), Alembic. Managed with [uv](https://docs.astral.sh/uv/).
- **Frontend:** React + Vite, shipped as an installable PWA.
- **Android:** the same bundle wrapped with Capacitor, plus native Java where the web
  can't reach: home-screen workout widgets, an ongoing-session notification with the
  rest timer, an offline queue that sends sets logged without signal, idempotently, once it's back, Keystore-encrypted
  tokens, and Health Connect for weight and steps.
- **Deploy:** one Docker service on Render (`render.yaml`): FastAPI serves the API
  under `/api` and the built React app at `/`. GitHub Actions gates every PR and
  builds the APK.

| Measured on 2026-11-17 | |
|---|---|
| Gherkin specs | 45 `.feature` files, 458 scenarios |
| Backend tests (pytest-bdd + unit) | 1,546 |
| Frontend tests (Vitest, jsdom) | 1,364 |
| Browser-geometry tests (Vitest, real Chromium) | 124 |
| Alembic migrations | 45 |
| Lines of code | backend 16.3k · backend tests 17.9k · frontend 34.6k · Android 7.5k |

## Design decisions worth reading

**Spec-first with pytest-bdd.** Behavior is written as Gherkin scenarios in
`backend/tests/features/` before the code exists, then driven to green. The scenarios
run against in-memory SQLite in CI on every pull request; that run is the merge gate,
and a pre-commit hook runs the suite for whichever layer a commit touches.

**`NULL` is not `0`.** A nutrient nobody measured is unknown, not zero. No sum may turn
it into a zero without an explicit, commented decision, and the UI prints `—` for it
in the same ink as a number — not greyed out, because "unknown" is information.

**The food log freezes its macros.** A `log_entries` row stores a copy of the numbers,
not a join to `foods`: correcting a food today must not rewrite what you ate in March.
Re-weighing an entry rescales the frozen values. The single exception is an explicit
`POST /food-log/recompute`, for a food that was mistyped rather than changed. It
rebuilds one day — the one on screen — and only when the user asks for it.

**The food day ends at 04:00 local time.** A midnight snack belongs to the evening
before. The server derives `log_date` from the offset the client sends, and
`food_log_date()` (Python) and `foodDayIso()` (JavaScript) must agree: if they drift
apart, the screen asks for one day and gets another, with no error anywhere. Both are
pinned by tests on each side.

**All nutrition arithmetic lives in one module.** Scaling, summing, per-serving maths
and the Atwater kcal check live in `backend/app/nutrition.py` — not duplicated in routers or in the
frontend — so the `NULL` rule is enforced in exactly one place.

**Closed sign-up and a daily AI budget per account.** In production, only emails on
`ALLOWED_EMAILS` can create an account; existing accounts always get in. Every call
to a model (Gemini for label photos, typed food and dish ideas; Groq Whisper for voice) counts against
one per-account, per-UTC-day counter (`LLM_DAILY_LIMIT`, `app/llm_quota.py`), because
the API keys belong to the server and a valid token must not be able to drain them.

## Running it locally

**Everything in Docker** (Postgres, API with reload, Vite):

```bash
docker compose up --build
```

API at <http://localhost:8000> (OpenAPI docs at `/docs`), app at <http://localhost:5173>.

**On the host:** start Postgres (`docker compose up db`), then:

```bash
cp .env.example backend/.env
cd backend && uv sync && uv run alembic upgrade head
uv run uvicorn app.main:app --reload             # :8000
cd ../frontend && npm install && npm run dev     # :5173, proxies /api to :8000
```

**Frontend only:** `python -I scripts/mock_api.py` answers on :8000 with made-up data
(a week's meal plan, six weeks of workouts), enough to click through the screens.

Optional features stay off until their key is set: `GEMINI_API_KEY` (label photos,
dish ideas), `GROQ_API_KEY` (voice), `GOOGLE_CLIENT_ID` (Google sign-in). The food
catalogue is loaded by hand: `uv run python -m scripts.import_ciqual --download` and
`uv run python -m scripts.import_off`.

## Tests

```bash
cd backend  && uv run python -m pytest -n auto   # specs + unit tests, in-memory SQLite
cd frontend && npm test                          # Vitest on jsdom: behavior of components
cd frontend && npm run test:browser              # Vitest in real Chromium at 430×932
```

The browser suite exists because jsdom has no layout engine. It measures what jsdom
can't: overlaps, `z-index`, scroll, `elementFromPoint` hit-testing and contrast on
the color actually painted. First run on a new machine: `npx playwright install chromium`.

## Deploying

`render.yaml` is a Render Blueprint for one web service. The `Dockerfile` builds the
React app, then a Python image that serves it. Set `DATABASE_URL` (a Postgres
connection string; Neon's pooled URL works as pasted), `ALLOWED_EMAILS`, and the
optional keys above in the Render dashboard; `JWT_SECRET` is generated.
`alembic upgrade head` runs on container start, and the health check is `/api/health`.

## License

The code is released under the [MIT License](LICENSE). The food data in `backend/data/`
carries its own licenses (Ciqual under Licence Ouverte 2.0, the Open Food Facts extract
under ODbL 1.0): see [DATA_LICENSES.md](DATA_LICENSES.md).
