# Fitit

Personal workout tracker. React (Vite) frontend + FastAPI/Postgres backend, deployed on
Render as a single service. Spec-first: behavior lives in Gherkin `.feature` files driven
green with pytest-bdd. UI is in Spanish; PWA installable.

## Design System
Always read `DESIGN.md` before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA/review mode, flag any code that doesn't match `DESIGN.md`.

## Testing / Workflow
TDD: write the failing test first, implement to green, run the suite before committing.
- **Backend:** `cd backend && uv run pytest` (pytest-bdd on in-memory SQLite; this is the CI merge gate).
- **Frontend:** `cd frontend && npm test` (vitest).
- A git pre-commit hook (`.githooks/pre-commit`, enabled via `core.hooksPath`) runs the
  suite for whichever layer you touched. Bypass a genuine WIP commit with
  `SKIP_TESTS=1 git commit ...` — use sparingly, main stays green.

## Working Style
- When there are pending git changes, start with `git status` / `git diff` and finish/commit
  those before broad codebase exploration.
- Ship on a branch → PR → merge ff-only to `main` → Render auto-deploys → verify live
  (run the `/deploy` skill for the verify runbook).
