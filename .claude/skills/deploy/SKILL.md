---
name: deploy
description: Ship the current Fitit branch to Render and verify it's live — merge ff-only to main, watch the auto-deploy, then run health/bundle/auth checks against production. Use when the user says deploy, ship, or "push to prod".
---

# /deploy — Fitit ship + verify

Fitit is one Render web service (Docker). The image runs `alembic upgrade head && uvicorn`,
serves the built frontend as static files, and the API under `/api`. Postgres is **Neon**
(`DATABASE_URL`). Pushing to `main` triggers an auto-deploy. This skill merges, watches the
deploy, and proves it's actually live — don't declare success on a green deploy alone.

## 0. Preconditions
- On a feature branch, working tree clean, tests green (the pre-commit hook enforces this).
- If not pushed yet: `git push -u origin <branch>`.
- Confirm the branch is what the user means to ship.

## 1. Merge to main (ff-only)
```sh
git checkout main
git pull --ff-only
git merge --ff-only <branch>
git push origin main
```
If ff-only fails, main moved — rebase the branch first, never force main.

## 2. Resolve the service + watch the deploy (Render MCP)
- `mcp__render__list_services` → find the Fitit web service; note its `id` and `.onrender.com` URL.
  - If the workspace looks unselected/empty: `mcp__render__list_workspaces` then
    `mcp__render__select_workspace`, and retry.
- `mcp__render__list_deploys` (serviceId) → grab the newest deploy `id` (the one for your commit SHA).
- Poll `mcp__render__get_deploy` until status is `live`. Free tier is a cold Docker build —
  expect ~3-4 min. Don't spin tightly; wait ~180-200s, then check, repeat.
- On `build_failed`/`update_failed`: pull logs with `mcp__render__list_logs` and diagnose
  (common: Alembic migration error at startup, since the CMD migrates before uvicorn).

## 3. Verify LIVE (all must pass — this is the point of the skill)
Let `BASE=https://<service>.onrender.com`.
1. **Health:** `GET $BASE/health` → 200.
2. **Frontend bundle matches:** the served `index.html` must reference the same hashed JS/CSS
   as your freshly built local `frontend/dist`. Rebuild locally (`cd frontend && npm run build`)
   if unsure, then compare the asset filenames. Stale `dist` = false mismatch — rebuild before crying wolf.
3. **Auth gate:** hit an auth-gated API route (e.g. a protected `GET`) with no/wrong creds →
   expect **401**. This proves `AUTH_USERNAME`/`AUTH_PASSWORD` env are deployed (a past incident:
   defaults `fitit`/`changeme` silently worked because the real secrets weren't set).
4. **New surface:** if this deploy added a route/asset (e.g. `/manifest.webmanifest`, a new
   endpoint), curl it and confirm status + `content-type`.
5. **DB alive:** if the deploy touched models/migrations, confirm via a read endpoint that returns
   real data, or `mcp__render__query_render_postgres` isn't available for Neon — use the app's
   own read path instead.

## 4. Report
State plainly: deploy id + status, each check with its result (200/401/match), and the live URL.
If any check fails, say which and stop — a green Render deploy that fails these is **not** shipped.

## Notes
- Secrets (`AUTH_*`, `DATABASE_URL`) are Render dashboard env with sync:false — never echo them,
  never send Render API keys to external hosts.
- Keep `main` deployable: only ff-only merges, tests green first.
