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

## How to talk to me
Write as a teammate or product owner would, not as a technical report.

- **Open with a TL;DR of what you're doing**: 2–3 lines, plain language, no jargon.
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

## Working Style
- When there are pending git changes, start with `git status` / `git diff` and finish/commit
  those before broad codebase exploration.
- Ship on a branch → PR → merge ff-only to `main` → Render auto-deploys → verify live
  (run the `/deploy` skill for the verify runbook).
