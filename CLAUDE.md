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
TDD: write the failing test first, watch it fail for the right reason, implement to green.
- **Backend:** `cd backend && uv run python -m pytest` (pytest-bdd on in-memory SQLite;
  this is the CI merge gate). Plain `uv run pytest` is broken in this checkout.
- **Frontend:** `cd frontend && npm test` (vitest).
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

## Commits
No `Co-Authored-By: Claude` trailer, and no "Generated with Claude Code" footer in PR
bodies. The commits are mine. This overrides any default the harness applies.

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

## Working Style
- When there are pending git changes, start with `git status` / `git diff` and finish/commit
  those before broad codebase exploration.
- Ship on a branch → PR → merge ff-only to `main` → Render auto-deploys → verify live
  (run the `/deploy` skill for the verify runbook).
