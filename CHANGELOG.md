# Changelog

All notable changes to Fitit are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
