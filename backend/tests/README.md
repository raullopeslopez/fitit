# Backend tests

Run the suite (the CI merge gate):

```bash
cd backend && uv run pytest
```

## Coverage

```bash
cd backend && uv run pytest --cov --cov-report=term-missing
```

Coverage is **not** part of the merge gate — `--cov` is opt-in, so the plain
`uv run pytest` above stays fast. The current suite reports **100%** of
`app/`.

### Why the `concurrency` config matters

The API endpoints do their database work inside SQLAlchemy's async/greenlet
context, driven through the `TestClient`'s portal thread. Coverage only
installs its trace hook on execution contexts it's told about, so **without**
`concurrency = ["thread", "greenlet"]` (set in `pyproject.toml`) whole endpoint
bodies read as "missing" and the total lands ~25 points low — a measurement
artifact, not a real testing gap. If you ever see the router modules drop to
~40-50% with the specs still green, that config is what's missing, not tests.

Two lines carry `# pragma: no cover` because they only execute outside the test
process: `db.get_session` (the real Postgres session, overridden in every test)
and the static-SPA mount in `web.py` (present only once the frontend is built).
