# design-sync notes — Fitit

Repo-specific gotchas for `/design-sync`. Read before re-syncing.

## Shape: this is an app, not a component library

Fitit has no design-system package — `frontend/` is a private Vite app with no `dist/`,
no Storybook, and no exported primitives. The `.jsx` files are screens (`App`, `Days`,
`Workout`, `Progress`, `Login`, `Heatmap`), stateful and wired to `api.js`/`auth.js`.

The sync therefore runs the converter's **tokens-only** path
(`lib/source-kit.mjs:100-106`: no component exports + a `cfg.cssEntry` → `tokensOnly`).
`components: 0` and `[ZERO_MATCH] … treating as tokens-only DS` are the **expected,
correct** output here, not a misconfiguration to chase.

- `frontend/design-sync-entry.js` exists only to give the bundler an entry that exports
  nothing, so `_ds_bundle.js` is deliberately empty. Vite never imports it. Without it
  the converter synthesizes an entry from `src/` and bundles the whole app.
- It must live **inside `frontend/`**: `package-build.mjs:159-174` derives `PKG_DIR` by
  walking up from the entry to the nearest `package.json` with a `name`. There is no
  root `package.json`, so an entry at the repo root resolves `PKG_DIR` to the wrong
  directory and the build dies in `lib/dts.mjs` with ENOENT on `package.json`.

## Build command

Run from the repo root (not `frontend/`):

```sh
node .ds-sync/resync.mjs --config .design-sync/config.json \
  --node-modules frontend/node_modules --entry ./frontend/design-sync-entry.js \
  --out ./ds-bundle --no-render-check [--remote .design-sync/.cache/remote-sync.json]
```

`--no-render-check` is deliberate: there are zero component previews, so the headless
render check would open nothing. Installing playwright (~200MB) buys no verification
here. Confirmed with the user on 2026-07-20.

## Fonts

`frontend/index.html` loads Space Grotesk / Geist / Geist Mono from Google's CDN via
`<link>`, so nothing in the repo satisfied `[FONT_MISSING]`. Resolved by self-hosting:
`.design-sync/fonts/` holds 18 woff2 (3 families × 3 weights × latin + latin-ext) plus a
generated `fonts.css`, wired through `cfg.extraFonts`. All three faces are SIL OFL 1.1,
so redistribution is fine. Committed on purpose — do not gitignore.

Regenerate (weights must stay in step with `frontend/index.html`) by re-running the
fetch script recorded in the sync session; it pulls the same `css2?family=…` URL with a
Chrome UA (woff2 is only served to UAs that advertise support), keeps the `latin` and
`latin-ext` subsets, and rewrites each `url()` to a local `./*.woff2`.

Note `cfg.extraFonts` only harvests `@font-face` rules — a remote `@import` in the
stylesheet does **not** satisfy it. Self-hosting is the only route that works here.

## Known render warns

- `[FONT_MISSING] "Cascadia Mono"` — expected and correct. It is a Windows *fallback*
  in `--font-mono`'s stack (`ui-monospace, 'SFMono-Regular', 'Cascadia Mono', monospace`),
  not a brand face, and is never meant to ship. Ignore.
- `[RENDER_SKIPPED]` — expected, see the build command above.
- `[DTS_REACT] @types/react not found` — harmless. It only matters for prop extraction,
  and there are no components to extract props from.

## Re-sync risks

- **`conventions.md` drifts silently.** It enumerates real class names and tokens from
  `frontend/src/styles.css`. If that file is refactored — classes renamed, a token added
  or dropped — the conventions doc keeps asserting the old vocabulary and the design
  agent writes CSS that no longer resolves. Re-validate every name in it against the
  fresh `ds-bundle/_ds_bundle.css` on each sync. The reusable-vs-app-specific split is a
  **judgement call made by hand**, not derived by any script: new classes land in
  neither list until someone classifies them.
- **The whole app stylesheet ships**, not a curated token file. `styles.css` →
  `_ds_bundle.css` is a verbatim copy of `frontend/src/styles.css`, screen-specific
  classes included. That is intentional (ship what exists, no reimplementation), and the
  conventions header is the only thing telling the agent which half to reuse.
- **Fonts are a network-fetched asset**, pinned by nothing. The woff2 files came from
  Google's CDN at sync time; Google re-cuts them occasionally. They will not update
  themselves, which is fine — but if `frontend/index.html` changes families or weights,
  `.design-sync/fonts/` must be regenerated or the design system ships the wrong type.
- **No visual verification happened at all.** No previews exist to render, so nothing in
  this sync was machine-checked for appearance. The tokens and stylesheet are verified
  structurally only (validate's CSS/import/token/font gates).
- If Fitit ever grows a real component library, this config is the wrong shape — delete
  the tokens-only scaffolding (`design-sync-entry.js`, the `cssEntry` pin) and let the
  converter discover components normally.
