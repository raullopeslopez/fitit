# How to build with Fitit

**Read this before the section below it.** Fitit is an application, not a component
library. `_ds_bundle.js` is intentionally empty — `window.Fitit` exports nothing and
there are no importable components or preview cards. What this design system ships is
its **tokens and its stylesheet**. Build UI with plain HTML elements and the class
vocabulary below; ignore any README text about importing components.

Fitit is a Spanish-language, mobile-first workout tracker used one-handed in a gym.
Write UI copy in Spanish. It is an instrument, not a wellness app: numbers are the
product, decoration is close to zero.

## Setup

Link `styles.css` — it is the whole system (`@import`s `fonts/fonts.css` and
`_ds_bundle.css`). There is no provider, no theme prop, no JS. Light and dark both come
from `prefers-color-scheme` automatically; never hardcode a hex, always use a token.

Wrap page content in `.container` — a 480px max-width centered column with padding that
already reserves space for the fixed `.bottom-nav`. Do **not** build multi-column
dashboards; one column is correct for this product.

## Tokens (all 24, defined in `_ds_bundle.css` for both schemes)

- Surfaces: `--bg` `--surface` `--surface-raised` `--border`
- Ink: `--text` `--muted`
- Accent (amber, the single brand/effort/CTA color): `--accent` `--accent-hover` `--ring`
- Earned moment only: `--pr` · Destructive only: `--danger`
- Shape: `--radius` (8px, cards) `--radius-control` (6px, controls) `--shadow`
- Type: `--font-display` (Space Grotesk) `--font-body` (Geist) `--font-mono` (Geist Mono)
- Muscle-group data palette — **for data marks only, never CTAs or text**:
  `--m-pecho` `--m-espalda` `--m-pierna` `--m-hombro` `--m-biceps` `--m-triceps` `--m-core`

## The numeric rule (the signature — do not skip)

Every number a user reads — weight, reps, 1RM, dates, counts — is
`font-family: var(--font-mono); font-variant-numeric: tabular-nums;`. Labels stay in
`--font-body`, values right-aligned. This is what makes the log read like an instrument
readout. A number rendered in the body font is a bug.

## Class vocabulary

Reusable anywhere:

| Class | What it is |
|---|---|
| `.container` | 480px centered page column |
| `.card` | surface panel: `--surface`, 1px `--border`, `--radius`, `--shadow` |
| `.field` | one labeled form control (bottom margin) |
| `.row` | flex row, 0.75rem gap; `.row > .field` flexes equally |
| `.hint` | muted small meta text |
| `.alert` | error banner tinted from `--danger` (pair with `role="alert"`) |
| `.chip` | pill, 36px min-height, transparent with `--border` |
| `.dot` | 9px round data mark; set its color via the `--chip` custom property |
| `.stepper` / `.stepper-btn` / `.stepper-field` | −/+ numeric input, mono and tabular |
| `.btn-full` | full-width button |
| `.link-btn` | button rendered as a quiet muted link |
| `.set-action` | compact button size inside dense rows |
| `.app-header` / `.bottom-nav` / `.tab` | app chrome; `.bottom-nav` is fixed, max 480px |

Element defaults already carry the design — use bare tags, don't restyle them:
`button` is the amber CTA (44px min-height, dark `--on-accent` ink for AA); `button.secondary` is the
transparent outlined variant in `--text`; `input` / `select` / `textarea` inherit the
body font and get an amber focus ring; `h1` and `h2` are Space Grotesk with negative
tracking.

**Do not reuse these** — they are bound to specific Fitit screens and will look wrong
elsewhere: `.workout-head` `.days-start` `.day-head` `.sets` `.set-*` `.previous`
`.exercise-title` `.muscle-*` `.lift-chips` `.target-*` `.streak-*` `.heat-*`
`.heatmap*` `.pr-banner` `.login-*` `.prefs-*` `.unit-*` `.export-btn`.

## Where the truth lives

- `_ds_bundle.css` — the real, complete stylesheet. Read it before styling anything.
- `guidelines/DESIGN.md` — the design system's own rationale: type scale, the amber
  decision, the muscle palette's scope rules, motion, and an explicit anti-slop list
  (no purple gradients, no gradient CTAs, no icon-in-circle grids, no "health green").

## Idiomatic example

```html
<div class="container">
  <h1>Entreno de hoy</h1>
  <div class="card">
    <div class="row">
      <div class="field">
        <label for="peso">Peso</label>
        <div class="stepper">
          <button type="button" class="stepper-btn">−</button>
          <input id="peso" class="stepper-field" value="82.5" inputmode="decimal" />
          <button type="button" class="stepper-btn">+</button>
        </div>
      </div>
    </div>
    <p class="hint">Tu mejor marca: <span style="font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;">80 kg × 5</span></p>
    <button class="btn-full">Guardar serie</button>
  </div>
</div>
```
