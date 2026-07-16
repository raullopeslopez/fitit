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

### To build (spec queue)
- React UI (cont.): start workout → add exercise (shows previous marks) → log sets.
