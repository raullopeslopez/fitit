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

Multi-user. Anyone can register their own account; passwords are hashed with
bcrypt (72-byte ceiling, enforced at sign-up — accented characters cost two
bytes each). Register or log in for a JWT, then send it as a bearer token:

```bash
TOKEN=$(curl -s localhost:8000/auth/register \
  -H 'content-type: application/json' \
  -d '{"username":"fitit","password":"changeme123"}' | jq -r .access_token)

# ...or /auth/login with the same body, once the account exists.

curl localhost:8000/workouts -H "Authorization: Bearer $TOKEN"
```

`/health`, `/auth/register` and `/auth/login` are public; every `/workouts` and
`/exercises` route requires the token, and only ever returns that user's own
data. Requesting another user's workout, set, day or exercise by id is a 404.

`AUTH_USERNAME` / `AUTH_PASSWORD` are no longer the login. They are read once,
by the `add_users_table` migration, to seed the first account on a database that
predates the users table — keep them set until that migration has run.

### Signing in with Google

`POST /auth/google` takes the ID token Google Identity Services hands the page
(`{"credential": "..."}`) and answers with the same `TokenOut` as `/auth/login`.
It registers on first sight, so there is no separate sign-up route.

Which account it opens is decided in order of how much the identity is worth:

1. `users.google_sub` — Google's immutable account id. Survives the person
   renaming themselves or changing their Gmail address.
2. `users.email` — how an account that predates all this gets *adopted* rather
   than shadowed by an empty twin. **Nothing over HTTP can write this column.**
   An email the user merely typed would be a way into somebody else's history,
   so the only thing that sets it is the `add_google_sign_in` migration, from
   `AUTH_EMAIL`.
3. Otherwise a new account, username derived from the address's local part.

Both ends need the OAuth **web** client id from the Google Cloud console — the
backend to check the token's audience, the frontend to ask for one:

- backend: `GOOGLE_CLIENT_ID`. Unset means the feature is off and
  `/auth/google` refuses everything, rather than trusting tokens minted for
  whoever else's app.
- frontend: `VITE_GOOGLE_CLIENT_ID`, at **build** time (Vite inlines it). Unset
  and the button renders nothing at all — better than one that fails on the tap.

In the console the client needs `http://localhost:5173` and the production
origin under *Authorized JavaScript origins*. No redirect URIs: the browser
never leaves the page. Scopes stay at `openid email profile`, which are
non-sensitive — no Google verification review, no user cap — but publishing the
consent screen still requires a privacy policy URL.

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
- **production** — Render hosts the web service (one service: FastAPI serves the built
  React app); the database is [Neon](https://neon.tech) serverless Postgres. Config
  comes from Render env vars; migrations run on container start.

Config always comes from the environment, never the code.

## Deploy (Render + Neon)

Render runs the app; Neon is the database. The web service is defined in `render.yaml`
(a Blueprint). The `Dockerfile` builds the React app, then builds a Python image that
serves it:

- `/api/*` → the FastAPI app (mounted in `app/web.py`)
- `/*` → the built React app (static files)

Steps:

1. Push to GitHub (done).
2. On [Neon](https://neon.tech): create a project with a database named `fitit` and
   copy its **pooled** connection string (looks like
   `postgresql://…@ep-…-pooler.….neon.tech/fitit?sslmode=require`).
3. On Render: **New → Blueprint**, pick this repo. Render reads `render.yaml` and
   provisions the web service (no database — that's on Neon now).
4. Set the secret env vars in the Render dashboard:
   - `DATABASE_URL` → the Neon pooled connection string from step 2. `config.py`
     coerces it to the asyncpg driver and translates Neon's `sslmode`/`channel_binding`
     params, so paste it exactly as Neon gives it.
   - `AUTH_USERNAME` and `AUTH_PASSWORD` → seed the first account. The
     `add_users_table` migration reads them once, on the deploy that introduces
     the users table; after that everyone registers their own account and these
     are only needed again for a fresh database. (`JWT_SECRET` is generated.)
   - `GOOGLE_CLIENT_ID` → enables `/auth/google`. Leave it unset to keep Google
     sign-in off.
   - `AUTH_EMAIL` → **set this before the deploy that runs `add_google_sign_in`,
     or not at all.** The migration stamps it on the account `AUTH_USERNAME`
     seeded, which is what makes the first Google tap open that account instead
     of creating an empty second one. Setting it afterwards does nothing; the
     fix at that point is an `UPDATE` by hand.
5. Deploy. `alembic upgrade head` runs on container start against Neon (creating the
   schema on first deploy); health check is `/api/health`.

Notes: Render's free tier spins down when idle (first open is a slow cold start). Neon's
free tier keeps the database around and pauses idle compute automatically — no 90-day
expiry to worry about. Upgrade either plan for always-on.
