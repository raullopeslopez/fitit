# Fitit

Personal workout tracker. Log your sets, and when you pick an exercise, see your
**previous marks** so you know what to beat. Lean on purpose.

- **Frontend:** React (Vite)
- **Backend:** FastAPI + Postgres, managed with [uv](https://docs.astral.sh/uv/)
- **Built spec-first:** behavior is written as Gherkin `.feature` files and driven
  to green with `pytest-bdd`, one vertical slice at a time.

## Quickstart (Docker)

```bash
cp .env.example backend/.env      # optional; compose sets its own env
docker compose up --build
```

- API: http://localhost:8000 (docs at `/docs`)
- Frontend: http://localhost:5173

## Run the specs

The Gherkin/pytest-bdd suite runs against in-memory SQLite — no Docker needed:

```bash
cd backend
uv sync
uv run pytest            # the spec suite (this is the merge gate in CI)
uv run ruff check .      # lint
```

The scaffold ships with the first spec **red** on purpose: `log_set.feature`
expects logging a set to work, and the endpoint returns `501` until you build it.
That's your red-green starting line. Implement `POST /workouts/{id}/sets` in
`backend/app/routers/workouts.py` until the scenario passes.

## Auth

Single user, credentials from the environment (`AUTH_USERNAME` / `AUTH_PASSWORD`).
Log in for a JWT, then send it as a bearer token:

```bash
TOKEN=$(curl -s localhost:8000/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"fitit","password":"changeme"}' | jq -r .access_token)

curl localhost:8000/workouts -H "Authorization: Bearer $TOKEN"
```

`/health` and `/auth/login` are public; every `/workouts` and `/exercises` route
requires the token. Set real values in your Render env group for production.

## Database migrations

Schema changes are Alembic migrations (Postgres in dev/prod; tests use SQLite).

```bash
cd backend
# with Postgres running (docker compose up db):
DATABASE_URL=postgresql+asyncpg://fitit:fitit@localhost:5432/fitit uv run alembic upgrade head
# after changing models:
uv run alembic revision --autogenerate -m "describe change"
```

## Layout

```
backend/            FastAPI + uv
  app/
    main.py         app + /health
    config.py       env-driven settings (pydantic-settings)
    db.py           async SQLAlchemy engine/session
    models.py       Exercise, Workout, SetEntry
    schemas.py      Pydantic I/O (validation lives here)
    routers/        workouts, exercises  (unbuilt slices raise 501)
  alembic/          migrations
  tests/
    unit/           fast unit tests (schema validation) — no app/DB
    features/       Gherkin specs (the source of truth for behavior)
    step_defs/      pytest-bdd step definitions (integration tier)
frontend/           Vite + React
.github/workflows/  CI (specs + lint + migrations, frontend build)
docker-compose.yml  db + backend + frontend for local dev
```

## The build loop (spec-driven / `/tdd`)

For each slice:

1. Write (or bind) the `.feature` scenario.
2. Write step definitions that hit the API — they fail (**red**).
3. Implement the endpoint until the scenario passes (**green**).
4. Refactor. Commit feature + impl together. Add a `CHANGELOG.md` line.

Slice order: **log a set → previous marks → edit/delete a set → auth**, then the
React UI against the now-proven API.

## Environments

- **local** — Docker Compose, config from `.env`.
- **production** — Render (FastAPI serves the built React app), managed Postgres,
  config from a Render env group. Migrations run on pre-deploy (`alembic upgrade head`).

Config always comes from the environment, never the code.
