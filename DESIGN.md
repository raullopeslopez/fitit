# Design System — Fitit

> Read this before any visual or UI change. Fitit is a **training instrument**, not a
> wellness app. Every choice serves one thesis: *lean on purpose*.

## Product Context
- **What this is:** Personal workout tracker. Log sets; when you pick an exercise, see
  your previous marks so you know what to beat.
- **Who it's for:** A serious lifter tracking progressive overload. Solo use, no social feed.
- **Space/industry:** Strength-training / gym logging (peers: Hevy, Strong, Fitbod).
- **Project type:** Mobile-first PWA (installable). Used one-handed, in the gym, between sets.
- **Design thesis:** An instrument, not a lifestyle brand. Numbers are the product, and the
  product is measured in **taps to a logged set**. Design for the hand that is holding a
  phone one-handed, mid-set, between two working sets — not for the moment of triumph.
  Records, streaks and history are real features and stay; they just don't get to set the
  layout. When a rare action and a per-set action compete for the same space, the per-set
  action wins, every time.

## Aesthetic Direction
- **Direction:** Industrial / utilitarian with editorial numeric hierarchy.
- **Decoration level:** minimal → intentional (type and numbers do the work; one subtle
  ruled-line "logbook" texture allowed, nothing more).
- **Mood:** Precise, confident, zero filler. Feels like a tool a serious lifter reaches
  for between sets, not a brand trying to be liked.
- **Anti-slop:** no purple/violet gradients, no 3-column icon-in-circle grids, no gradient
  CTAs, no decorative blobs, no generic "health green" as identity.

## Typography
All three faces are free (Google Fonts) and share an engineered/technical feel.
- **Display/Hero:** Space Grotesk — headings, workout names. Weights 600/700, tracking -0.01 to -0.03em.
- **Body/UI:** Geist — labels, buttons, running text. Weight 400/600.
- **Data/Numbers:** **Geist Mono** — weight, reps, estimated 1RM, dates. Always
  `font-variant-numeric: tabular-nums`. This is the signature: the log reads like an
  instrument readout, not a feed.
- **Code:** Geist Mono (same as data).
- **Loading:** `https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap`
- **Scale** (16px root):
  | Role | Size | Weight | Font | Tracking |
  |------|------|--------|------|----------|
  | Hero (h1) | 1.6rem / 25.6px | 700 | Space Grotesk | -0.03em |
  | Title (h2) | 1.15rem / 18.4px | 600 | Space Grotesk | -0.01em |
  | Body | 1rem / 16px | 400 | Geist | 0 |
  | Data (numbers) | 1rem / 16px | 500 | Geist Mono | 0, tabular-nums |
  | Big stat (PR/1RM) | 1.4rem / 22.4px | 600 | Geist Mono | 0, tabular-nums |
  | Meta/small | 0.85rem / 13.6px | 400 | Geist | 0 |
  | Label | 0.8rem / 12.8px | 600 | Geist | 0.01em |

## Color
- **Approach:** restrained — monochrome instrument palette + a single "effort" accent.
  Color is rare and meaningful. Dark-first (gyms, night, OLED); full light mode too.
- **Accent (amber "effort"):** brand, CTAs, active/focus, links. Replaces the old
  generic health-green. Amber = heat, chalk-and-iron, the burn.
  - dark: `#FF6A2C` · light: `#E4571B`
- **Text on the amber fill:** near-black ink (`--on-accent` `#16181B`), not white. White on
  amber fails AA (3.70 light, 2.86 dark); ink passes both (5.8 / 6.23) and reads industrial.
- **Amber *as text*** (links, active tab, badges, the stepper `+`) goes deeper on light so it
  clears AA on paper: `--accent-ink` `#C2440F` (light) / `#FF6A2C` (dark). Fills, borders and the
  record keep `--accent`.
- **PR / record:** the earned moment only, and it is **not one colour**. Since 2026-07-26
  it is spent on the `PR peso` label and the summary deltas — the glow and the highlight
  behind the headline number are gone with the readout they sat on.
  - dark: `#FFA733` (accent at full intensity) — brighter than the accent.
  - light: `#A83208` — *deeper* than the accent.
  - Why they differ: on paper you cannot get louder than the accent by going brighter.
    `#FFA733` scores **1.94** on white, under the 3.0 floor for large text. The range
    above `#E4571B` collapses toward white, so on light the record goes hotter-iron
    rather than brighter-flame. Verified worst case across every `--pr` use: **5.35**.
  - Same reason the treatment differs: a 24px amber glow is invisible on white. Dark
    emits light; paper takes ink.
- **The accent is never spent on static labels.** A label that never changes wearing the
  effort colour leaves the record beneath it looking like more of the same. Labels are
  muted; amber means something happened.
- **Neutrals (dark, default):**
  - bg `#0B0C0E` · surface `#15171A` · surface-raised `#1D2024`
  - text `#F2F3F5` · muted `#9BA1A9` · border `#24272C`
- **Neutrals (light — warm "paper", not cold):**
  - bg `#F4F2EE` · surface `#FFFFFF` · surface-raised `#FFFFFF`
  - text `#16181B` · muted `#616875` · border `#E6E2DA`
- **Semantic:**
  - success (saved/valid, quiet): dark `#34D399` / light `#059669` — ticks only, never brand
  - warning: dark `#FBBF24` / light `#D97706`
  - error / destructive: dark `#EF4444` / light `#DC2626` (true red reserved for destructive)
  - info: muted text, no dedicated hue
- **Focus ring:** `color-mix(in srgb, <accent> 30%, transparent)`, 3px.
- **Dark mode strategy:** dark is the primary surface (design here first); light is a
  warm-paper inversion, reduce accent saturation ~10% for contrast on light.
- **Contrast:** text on bg and accent-on-surface must pass WCAG AA (4.5:1 body, 3:1 large).

### Color por músculo (categorical — deliberate exception)
Explicit, user-approved exception to "one accent only": muscle groups get a full
categorical palette so Progreso can be organized and read by muscle. Scope rules:
- **For data encoding only**, never for brand/CTA/state. Amber stays the sole
  brand/effort/PR accent and is **not** in this palette (so "record" keeps meaning).
- **Color rides a mark, not text.** A muscle is shown as a colored dot/line beside
  its name; labels/values stay in ink. Color is never the only cue.
- **Fixed 7-group set**, assigned in canonical order (below). A colour per
  individual muscle would be an unreadable rainbow — keep it to these 7.
- Validated colorblind-safe on the *adjacent* pairlist in both modes via the
  dataviz `validate_palette.js` (light surface #fff, dark #15171A). Re-run it if
  you touch these hues.

  | Grupo | dark | light |
  |-------|------|-------|
  | Pecho | `#3987e5` | `#2a78d6` |
  | Espalda | `#008300` | `#008300` |
  | Pierna | `#d55181` | `#e87ba4` |
  | Hombro | `#c98500` | `#eda100` |
  | Bíceps | `#199e70` | `#1baf7a` |
  | Tríceps | `#9085e9` | `#4a3aa7` |
  | Core | `#e66767` | `#e34948` |

## Spacing
- **Base unit:** 4px.
- **Density:** comfortable-compact — data rows tighter, cards breathe.
- **Scale:** 2xs(2) xs(4) sm(8) md(12) lg(16) xl(24) 2xl(32) 3xl(48) 4xl(64).

## Layout
- **Approach:** grid-disciplined, single-column, mobile-first (this is correct for the
  use case — do not add multi-column dashboards).
- **Grid:** one column. Content max-width **480px**, centered.
- **Touch targets:** minimum 44px on all interactive controls (one-handed, gym use).
- **Set list = spec sheet:** numbers right-aligned, Geist Mono, tabular. Exercise/label
  left, values right.
- **Newest first, everywhere.** Days, workouts within a day, exercises within a workout.
  The thing you are doing now is the thing at the top. Order is settled on load and then
  frozen for the session: nothing re-sorts under your thumb while you are logging.
- **Cards fold.** Only the newest exercise starts open; the rest collapse to a single
  spec-sheet row. Many can be open at once, because supersets are real. The whole header
  is the control (full width, 44px), not a small chevron you have to aim at one-handed.
- **A folded row still answers "what did I do here":** exercise name alone on the left; the
  muscle tag rides the top-right (not glued to the name), with the digest right below it —
  a tidy right column. The digest is Geist Mono, always shaped `N series · [tope] weight ×
  reps`. It names one *real*
  working set, never decoupled reps/weight ranges (with `4 × 8–12 · 50–60 kg` you can't
  tell which weight went with which reps). When every set matched, that set speaks for all
  (`4 series · 25 kg × 15`). When they varied, show the hardest — the **top set by est.
  1RM**, the same set the PR logic tracks — labelled `tope` so a single pair isn't read as
  the whole exercise (`4 series · tope 60 kg × 8`). Full per-set detail is one tap away in
  the open card. Cardio reports time, not reps. **Emphasis is by hierarchy, not colour:**
  the headline figure — the working weight (cardio: the time) — is lifted to ink while the
  count, `tope` tag and `× reps` stay muted, so the number reads first. Amber is never
  spent here; it belongs to the PR alone.
- **One number per idea, and it has to be a number you lift.** The headline on an open
  card is `Última vez · hace 3 días` over the heaviest set of that session — `82.5` large,
  `kg × 5` beside it in muted mono. Not an estimated 1RM: nobody walks to the rack
  thinking "96.3 theoretical single". The record is marked where it happens, on the row
  that took it (`PR peso`), and nowhere else — no banner, no glow. A banner covers the log
  for a moment and leaves nothing behind; the label survives a reload.
- **Three surfaces, so a screen of cards says which one you're in.** *hero* (the exercise
  you're logging: `--surface-raised` under a 7% accent wash, border at 26% accent — the
  only card wearing amber, and only as a wash), *raised* (the one card a screen is about),
  *quiet* (already done — sunk toward the background rather than framed). On dark every
  card takes `inset 0 1px 0 rgba(255,255,255,.045)`: there's no light to cast a shadow, so
  the top edge catches it instead.
- **The primary action is pinned to the bottom, never the top.** One-handed, the top
  corners are the hardest reach on the screen and the bottom edge is where the thumb
  already rests. Días pins its start/continue CTA directly above the tab bar; the list
  scrolls under it.
- **Rare actions do not take content-weight controls.** Export, logout, delete and rename
  are weekly-or-rarer, and delete is irreversible and sits next to rows a thumb aims at.
  They go behind the `⋯` overflow (delete armed by a second tap), or onto Progreso, which
  is the screen you visit deliberately. Días carries only what you touch mid-session.
  **Sticky preferences count as rare actions**: weight unit is chosen once ever and rest
  once a session, so they live in the overflow too, never pinned above the cards.
- **Ask a question only when it has something to decide.** The Fuerza/Cardio choice
  applies to a name the backend has never seen; an autocompleted exercise keeps its
  stored kind. A control that is inert nineteen times out of twenty is not shown those
  nineteen times.
- **Optional inputs fold, and folded means empty.** RPE and nota are untouched in a
  straight-sets session, so they sit behind a text toggle instead of costing two input
  rows above the log button. Collapsing clears them — a value you cannot see must never
  ride onto the set you are about to log.
- **A control's position must not depend on how much you have logged.** `+1 serie` sat
  under the set list and sank a row per set, so the quickest control on the screen was
  off-screen by the fifth set. Anything you press repeatedly gets a fixed home.
- **Content above the mechanism that produces it.** Progreso stacked three selectors and
  a submit button on top of the chart, so a phone had to scroll the whole apparatus to
  reach what the screen is for. The chart leads; the picker sits directly under the thing
  it drives.
- **One path per job.** Chips charted a lift on tap while the text field demanded a second
  tap on `Ver progreso` — the same act with and without a confirmation step. Picking a
  known lift now charts it either way, and the button is gone.
- **Don't fetch what the previous screen already handed you.** `/days` returns every
  workout with every set — the same shape `/workouts/{id}` does — so Días passes the
  workout itself, not just its id, and Entreno draws before the network answers. It still
  refetches, so a stale hand-off self-corrects; the seed only removes the blank frame.
- **Nothing may claim a record before it knows what the record is.** An absent set of
  previous marks means "not fetched yet", which is not "there are none". Both the PR
  badge and the celebration wait for that difference — otherwise the comparison falls
  back to the session's own running peak and set 2 wins a record for beating set 1.
- **A preference you never change but *can* flip silently is not a preference.**
  The kg/lb toggle was sticky, invisible once set, and one tap away at all times — so a
  mid-session flip turned a 90 lb pulldown into 90 kg and manufactured a record that
  never happened. The relabel tool built to undo that couldn't: it hid itself whenever a
  block mixed units, which is exactly the shape a flip produces. Kilos and kilometres,
  full stop. When the only fix for a control is another control, remove the first one.
- **A search box must search.** Substring, case- and accent-folded, with the matches
  listed as tappable rows under the field. Exact-match-only meant typing `gemelo` did
  nothing whatsoever for `Gemelo Máq.` — no results, no filtering, no message. Native
  `<datalist>` is not a search: the browser surfaces it when it feels like it, and on a
  phone that is never.
- **An empty result must name the right failure.** "No data to chart" for a name that was
  never logged blames the log for a typo. A known lift with no curve and an unknown name
  are different sentences.
- **Say a thing once.** A search box holds what you are typing, not what you already
  found — the card title and the active chip already state that. One state serving as
  both query and selection is how the same name ends up printed three times on one
  screen, twice within a thumb's width.
- **A filter may hide behind a swipe; content may not.** The seven muscle groups are a
  closed set the user knows by heart, so that row scrolls on one line and costs nothing.
  A row of exercise names is the opposite — it *is* what you are looking for, so it can
  neither scroll (hidden) nor wrap (taller than the chart it drives). It was removed
  instead: tapping a muscle charts its top lift, and the search box reaches the rest.
  Two rows of identical pills doing two different jobs read as one control repeated
  anyway. A half-cut chip at the edge is the signal that there is more.
- **Tapping a thing edits that thing; menus are only for actions that aren't "edit this".**
  A set row opens its own editor, the workout title opens its rename, the chart title
  opens the exercise rename. An overflow holding only `Editar` and `Borrar` was a menu
  standing between you and the row you had already pointed at. `Borrar` rides inside the
  editor it belongs to; menus keep what genuinely isn't editing — `Borrar día`,
  `Borrar entreno`, `Repetir`, and the settings.
  - **Exception: exercise card headers in Entreno.** That surface is already the fold
    control, full-width and 44px so it can be hit one-handed. One surface cannot mean two
    things, which is why renaming an exercise lives in Progreso instead.
  - The cost is a real one: a tappable row with no frame around it is an invisible
    affordance. It is paid once, and repaid on every edit — and the press state is what
    answers the finger. Cardio rows keep their `⋯`, because there is no editor to open.
- **Print only figures a decision depends on.** Per-exercise tonnage (`1050 kg volumen`)
  was arithmetically true and physically meaningless — nobody changes the next set
  because a sum reads 1050. The series count stays, because that one is read between
  sets. Cardio keeps `Total 24:30 · 5 km`: time and distance are measured, not derived.
- **A day is a ruled logbook entry, not a card.** A card spends ~100px of border, padding
  and shadow to carry one row: three days filled a phone. Ruled — mono date, hairline to
  the overflow, sessions hanging under it — seven do. Cards are for things you *work
  inside* (an exercise), not things you *scan past* (a past day).
- **Dates are data**, so the day list stamps them in Geist Mono, uppercase, no comma
  (`JUE 16 JUL`), and drops the year when it's the current one. Prose dates
  (`jue, 16 jul 2026`) stay inside a workout, where there's one of them.
- **The session may reach outside the app, but only where it is already running.** The
  session gets an Android notification carrying `+1 serie`, so a straight set costs one
  tap on a locked phone instead of a wake, an unlock and two hunts. The rest countdown
  *rides on* that notification when there is one — end time in the title, a buzz when it
  runs out — but it is not what the notification is for, and the two are separate
  settings. "I don't time my rests" and "I don't want to log from my pocket" are different
  sentences; one control answering both meant choosing `Sin descanso` silently took the
  lock screen away. Untimed, the same notification stands with the exercise as its title
  and no clock anywhere. Rules it has to obey:
  it is **never marked `silent`** — Android files silent notifications away from the lock
  screen on several skins, and the shade is the one place this is useless; the quiet comes
  from `renotify: false`, so a replacement under the same tag updates without re-alerting
  and it sounds once a session; it **arrives again on the first hide after each set** —
  because a locked screen draws what arrives while locked and redraws nothing already
  sitting in the shade, and the page being hidden is the phone being pocketed — but
  **once per set and no more**, since hidden also means "switched to WhatsApp" and an
  arrival has to make a sound to count as one; it **names the set it would write**
  (`Press banca ·
  60 kg x 8`) because a button you press without unlocking has to say what it does; and it
  **states an end time, never a countdown**, since notification text is written once and can
  sit there for ten minutes. It survives the rest running out — that is the moment its
  button is about to be used — and is closed only by a skip or by leaving the session.
  Android allows **two actions and no more**, so they go to the two things that can only
  happen there: `+1 serie` (the straight set) and a text field for a different one
  (`32.5x12`). `Saltar` gave its slot up — a swipe already dismisses the notification and
  the countdown runs out by itself, while a drop set had no way in at all. One field is
  all the platform offers, so the parser takes every shape of the same sentence
  (`32,5 x 12`, `30kg x 8`, `60 5`) — but never guesses: a lone number could be reps or
  weight, and a set invented from a coin flip is worse than one not logged.
- **A feature whose output lands outside the app has to report back inside it.** The
  lock-screen notification is produced by another thread and displayed by the platform, so
  the app can see none of it: a worker that never woke, a worker that threw, a permission
  revoked behind our back, and Android silently dropping the notification all look
  identical from the menu — like nothing happening. So the handover is a round trip, and
  one muted line under the toggle says which of those it was, with the time of the last
  successful one. It is not debug output; it is the only evidence the user can have.
- **Border radius:** controls 6px · cards 8px · banners 8px · pill 9999px. (Sharper than
  the old 12–16px — instrument, not toy.)

## Motion
- **Approach:** minimal-functional. One expressive moment only: the PR.
- **Easing:** enter `ease-out` · exit `ease-in` · move `ease-in-out`.
- **Duration:** micro 80ms · short 150ms · medium 250ms · long 400ms.
- **PR celebration:** amber pulse + count-up on the number (~400ms). Everything else is
  instant and quiet — the user is mid-workout.
- **Respect `prefers-reduced-motion`:** drop the PR animation to a static state.

## Migration Notes (from current styles.css)
The current implicit system is competent but generic. To adopt this:
1. Swap `--accent` green (#16a34a / #22c55e) → amber (#E4571B / #FF6A2C); add `--pr` glow.
2. Warm the light neutrals (#f6f7f9 → #F4F2EE); introduce the dark-first palette above.
3. Load Geist + Geist Mono; set `--font-body: 'Geist'`, add `--font-mono: 'Geist Mono'`.
4. Apply `--font-mono` + tabular-nums to all numeric data (sets, 1RM, dates, streak).
5. Tighten `--radius` 12→8, card radius 16→8, control radius 10→6.
6. Keep 44px targets, focus rings, light/dark — only the values change.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-18 | Initial design system created | /design-consultation, from design knowledge (no competitor research). Formalizes the implicit styles.css system and gives Fitit an identity. |
| 2026-07-18 | Amber accent replaces health-green | Every lifting app is red/green/blue; amber = effort/heat, differentiates and makes PRs feel earned. Green demoted to quiet success semantic. |
| 2026-07-18 | Geist Mono for all numeric data | Numbers are the product; mono readout = instrument feel, reinforces "lean on purpose". |
| 2026-07-18 | Dark-first + sharper radius (16→8) | Gym/night/OLED context; sharper shape reads as serious tool, not wellness toy. |
| 2026-07-19 | Categorical muscle-group palette (7 colors) | User-approved exception to single-accent: lets Progreso be organized/read by muscle. Data-encoding only (dot/line, not text/CTA); amber stays reserved for effort/PR. Validated colorblind-safe (adjacent) both modes. See "Color por músculo". |
| 2026-07-21 | Light mode gets its own PR colour (`#A83208`) and its own PR treatment | Light shipped `--pr` equal to `--accent`, so the record was indistinguishable from a CTA, and every small-text use of it (`.pr-flag` 0.68rem, `.bests .delta` 0.78rem, the chart's 10px PR label, `.target-label`) sat at 3.10–3.70 against a 4.5 requirement. Failing AA on the one moment the product exists for. The dark glow can't be reused: `#FFA733` is 1.94 on white. |
| 2026-07-21 | Newest first at every level; order frozen after load | The app was newest-first for days but oldest-first for workouts and exercises, so the set you are mid-way through sank to the bottom of the screen. Freezing the order after load is the other half: a card that reorders itself while your thumb is on the phone is how you tap the wrong thing between sets. |
| 2026-07-21 | Exercise cards fold; only the newest starts open | A five-exercise session was a five-card scroll with the active lift anywhere in it. Folded cards keep a spec-sheet digest so nothing is hidden, only quieted. Accordion (one-open) was rejected: it fights supersets. |
| 2026-07-21 | One 1RM readout (`76 → 81.7`) replaces two | The card printed "A batir · 1RM est. 76" and "Mejor 1RM 88" twelve lines apart, both about 1RM. Merging them keeps the PR as the emotional payload (today's number is the large one, amber when it passes) while removing a competing figure. |
| 2026-07-20 | Consistency heatmap uses the amber ramp, not green | Every contribution grid ships green; a heat map of effort should literally be heat. Intensity = sets logged that day (works for cardio too, where volume doesn't), built with `color-mix(in srgb, var(--accent) N%, transparent)` so it tracks light/dark for free. Level 0 stays neutral, never a faint amber. |
| 2026-07-26 | Heatmap colour = muscle, opacity = volume; the amber ramp goes | The amber grid measured one thing — how many sets that day — and so answered "have I been consistent?", a question about discipline. The question worth a card on Progreso is "have I touched legs this month?". Colour now carries the muscle group (the categorical palette, which is exactly the data-encoding use it was approved for), opacity carries volume in the same four steps, and a day split between two groups splits the cell on a 135° diagonal. The streak hero and the intensity legend go with it. |
| 2026-07-26 | The mark to beat is the last set, not an estimated 1RM; PR banner → row label | An e1RM is a number nobody has ever lifted, printed at 2.6rem as the thing to beat. Replaced by "Última vez · hace 3 días" over the top set of that session. The record moves with it: `PR peso` on the row, defined as more kilos than ever at that rep count *or more* — so a heavy single can no longer outrank a hard set of eight on a formula. The banner and the amber glow on the headline are gone: "momento PR discreto" from the redesign handoff. |
| 2026-07-26 | Three-level surface hierarchy (hero / raised / quiet) | Every card was one surface, so a five-card session gave the eye nothing to fix on. The active exercise now carries a 7% accent wash — the only non-CTA use of amber, and it earns it by being the thing you are actually doing. |
| 2026-07-26 | Progreso drops "Mejores marcas" and the estimated-1RM curve for a record ladder | The curve interpolated through days you were only maintaining, which reads as progress that did not happen; the leaderboard listed your own lifts against nobody. Evolución draws steps through confirmed weight records only, so every corner is a day you did it, and a period summary answers "am I training what I think I'm training" with sets per muscle and a delta. |
| 2026-07-26 | Brand mark B3: a loaded bar that suggests an F, replacing the F that was only an F | Three rounded rectangles — two plate stacks in amber, the sleeve in muted — on a 64 canvas, drawn programmatically (`frontend/scripts/make_icons.py`). The old icon was a white F bled to the edges of an amber square, which silhouettes as a square and says nothing about lifting. Wordmark `fitIt`: second i capitalised at weight 400 against 700, echoing the tall plate. |
| 2026-07-23 | White CTA text → dark ink on amber; new `--accent-ink` for amber-as-text; light `--muted` `#6B7280`→`#616875` | /design-review. White-on-amber failed AA in both themes (3.70 light, **2.86** dark) on the primary button — the same class already fixed for `--pr`, never applied to `--accent`. Amber used as text sat at 3.2–3.7 on paper; `--muted` was 4.32 on the paper bg. Hues unchanged: buttons take near-black `--on-accent` ink (5.8/6.23), amber text takes deeper `--accent-ink` `#C2440F` on light, muted deepened to `#616875` (5.01 on paper). |
| 2026-07-24 | Thesis moves from "the payload is the PR" to **taps to a logged set** | User: *"no me interesa batir marcas sino registrarlas de manera ágil"*. The old thesis was steering every layout call toward the moment of triumph, and Días showed the bill: five chrome buttons (Salir, Exportar, Borrar día ×3) against three rows of content, the primary CTA in the least reachable corner, and no persistence — reopening the PWA mid-workout landed on the day list, one tap and one fetch from the set you were mid-way through. Records/streaks/heatmap all stay as features; they stop setting the layout. |
| 2026-07-24 | Días redesigned around resume, reach and rules | Concretely: the open workout survives a relaunch for 4h (`fitit_open_workout`, restamped each launch); the CTA is pinned above the tab bar and reads `Continuar entreno · Push` once today exists, so a session can't get split in two; racha and Exportar CSV move to Progreso, which already fetches days and already renders the streak hero; Borrar día moves behind a per-day `⋯` with a two-tap arm; Repetir creates today's workout with the same name and hands Entreno the exercise list so the cards are standing with their previous marks loaded; day cards become ruled logbook entries with mono dates. |
| 2026-07-24 | Entreno gets the same treatment as Días: 12 controls above the first exercise card, 0 of them logging | Same audit, next screen. Peso (kg/lb) and Descanso were pinned above every card for choices made once ever and once a session; the Fuerza/Cardio toggle was asked on every add and answered by one in twenty; `Grupo muscular` — a once-per-exercise correction of a classifier guess — sat between the card header and the numbers; RPE and nota cost two permanent input rows above `Registrar`; and `+1 serie` sank a row per set logged. Settings to the header `⋯`, kind toggle only for unknown names, re-tag down beside the unit correction (both are corrections), extras folded, repeat pinned with the log button. |
| 2026-07-25 | Días hands the workout to Entreno; PR badges wait for the marks | Last item of the Entreno audit. Opening a session refetched data Días already had in memory, so it cost a blank frame for nothing. Días now passes the workout object (with the day's date attached, so the header renders too) and Entreno seeds from it, still refetching behind. The audit turned up a blocker on the way: with the cards up before the previous marks arrive, `prSetIds` had nothing to compare against and fell back to the session's own peak — a false `PR` on set 2, flashing on every open. Already true before the seed, just briefly. Fixed by making an absent `previous` mean "unknown" rather than "none", and gating both the badge and the banner on it. That also fixed a quieter one: `best` was state seeded once at mount, so a card built from the log never celebrated a genuine record even after its marks landed; it is derived now. |
| 2026-07-25 | The schema follows: `unit`, `weight_kg` and `distance_unit` dropped | Removing the toggles left the columns they served, which is dead weight the user called out directly ("si quito el toggle se queda código muerto porque dejaría de usar el resto de lógica"). Migration `e3b9c07f5a21` copies `weight_kg` into `weight` — from the canonical column, not a fresh conversion, so records already on screen don't move — converts mile distances, and drops all three columns. `weight` is kilos and `distance` kilometres, stated in the field name and nowhere else. Gone with them: `app/units.py`, `Unit`/`DistanceUnit`, `toKg`/`fromKg`/`displayWeight` (now a lone `showKg` that only rounds), and the `unidad`/`unidad_dist`/duplicate-`peso` CSV columns. The migration carries its own test, because it is the one change in the app that cannot be undone by re-running it: it destroys the provenance in the same transaction that reads it. |
| 2026-07-25 | The kg/lb and km/mi toggles are removed; everything is kilos | The toggle corrupted real data: on 21 Jul a mid-session flip stored a 90 lb pulldown as 90 kg, which showed up in Mejores marcas as `Jalón Neutro 90 kg × 15 · +87.4 kg` — a record that never happened, sitting on top of a genuine 40→55→70→90 lb progression. `weight_units.feature` had *predicted* it in its own opening line ("the toggle is sticky, so sooner or later I log a whole exercise in the wrong one") and answered with a relabel tool instead of removing the toggle — a tool that then hid itself whenever units were mixed, i.e. precisely after a flip. User: *"creo que es una feature que aporta más ruido que utilidad porque yo siempre registro en kg"*. Gone: both toggles, the sticky prefs, the relabel endpoint and its two scenarios. Kept for now: the `unit`/`weight_kg` columns, so the pounds already in the log stay readable — dropping them is a follow-up migration. |
| 2026-07-25 | The box actually searches, and Mejores marcas rows are the picker | User: *"cuando escribo dentro del box no pasa nada… escribir gemelo, y no pasa nada"*. Correct, and it was mine, accumulated: the field only fired on an exact full-name match, so `gemelo` never reached `Gemelo Máq.`; the only suggestion mechanism was a native `<datalist>`, which a phone never shows; and pressing go called the API with a name that does not exist, getting `[]` back and printing "no data to chart" — blaming the log for a typo. Dropping the chip row the day before removed the last way to browse without ever building the way to search. Now: substring matching with accents and case folded, matches listed as tappable rows, the right message for an unknown name, and — the user's own observation, *"abajo se renderiza todo"* — the Mejores marcas rows chart their lift on tap, so the list already on screen is the way in. |
| 2026-07-25 | Progreso drops the exercise-chip row: muscles filter, the box finds | User, on the scrolling rows shipped the day before: *"el scroll horizontal no deja ver los ejercicios"*. Correct, and the previous fix had applied one rule to two different things. Seven muscle groups are a closed memorised set — swiping past them costs nothing. Exercise names are what you are hunting for, so scrolling hides them and wrapping makes the picker taller than the chart it drives. Neither is acceptable, so the row goes: tapping a muscle already charts its top lift, and the search box reaches everything. Third and last representation of the same choice, removed. |
| 2026-07-24 | Progreso's search box stops mirroring the selection; chip rows scroll on one line | User: *"veo chips repetidos"*. `Progress.jsx` held one `name` state commented "search box + the currently charted lift" — two jobs, one variable — so the charted lift was printed as the card title (added the same day), as the field's value and as the active chip. Splitting `query` from `name` states it once. The wrapped chip rows were the other half: seven muscle chips and six lift chips piling into six rows of identical pills doing two different jobs, taller than the chart they drive. One swipeable line each. Same commit fixes a defect introduced with the tap-to-edit surfaces: they were missing from the `button:hover` opt-out list, so a set row filled amber under a mouse — exactly what `1efc3df` fixed for `.link-row`. |
| 2026-07-24 | Direct manipulation: tapping a thing edits it | User: *"puedo ahorrarme acciones de botones pulsando en los campos para editar directamente… y así con todo"*. The per-row `⋯` only ever held `Editar` and `Borrar` — a menu standing between the user and the row they had already pointed at, plus a permanent control on every row. Editing a set goes 2 taps → 1, `Borrar` moves inside the editor it belongs to, and the row gets its width back. Same for the workout title and the chart title. Exercise card headers are the documented exception: that surface belongs to the fold. Also fixes a regression from the Progreso reorder — folding the corrections had taken the exercise name with them, leaving the chart card untitled. |
| 2026-07-24 | Progreso: chart first, picker under it, one path per job, corrections folded | Third screen, same audit. The chart sat below muscle chips + a text field + lift chips + a `Ver progreso` button, so the mechanism outranked the content it produces. The button was also half-dead: chips already charted on tap, so only free-typed names needed it — two paths for one job, one with a confirmation step. Picking a known lift now charts it immediately (the form still submits on Enter for a name nothing knows), and rename + Grupo fold behind `Corregir`, matching the exercise card. Export moves to the foot: it is the rarest thing on the screen. |
| 2026-07-24 | `previous marks` takes an `exclude_workout_id`; cards rebuilt on load fetch their marks | Only the add-exercise path ever fetched previous marks, so a workout reopened mid-session rebuilt every card with `previous: null` — "A batir" disappeared, and `prSetIds` fell back to comparing each set against the session's own running peak, awarding a PR to set 2 for beating set 1 while sitting far under the real record. A wrong record is worse than no record, and the Días resume work made reopening mid-workout the normal path rather than a rarity. The naive fix (just call the endpoint) is also wrong: it counts today's sets, so the mark to beat becomes today's best and nothing can ever beat it. Hence the exclusion, server-side. |
| 2026-07-22 | Folded digest names one real working set (`N series · [tope] W × R`), not ranges | First attempt made reps/weight independent ranges (`4 × 8–12 · 50–60 kg`), but decoupling them loses the pairing — you can't tell which weight went with which reps. Instead name a single real set: when all sets match, that pair speaks for all (`4 series · 25 kg × 15`); when they vary, show the hardest (top set by est. 1RM, the PR set) labelled `tope` so it isn't mistaken for the whole exercise (`4 series · tope 60 kg × 8`). Every token is real and paired; the full per-set breakdown lives in the open card. Same commit fixed the folded header so the digest always sits on its own right-aligned line under the name, instead of inline for short names and wrapped for long ones. |
| 2026-07-25 | Sets land on screen before the server answers; a pending set gets a muted dot, never a warning | Direct consequence of the *taps to a logged set* thesis: the taps were already down to one, but a `fetch` sat between the tap and the row, and the gym is a basement on a free tier that sleeps. The row now renders instantly and the rest clock starts on the tap. The new visual state is deliberately quiet — every set is pending for a second or two, so it is the normal case, not an error: full-strength numbers, no border, no banner, a 5px `--muted` dot that pulses (static under `prefers-reduced-motion`). Amber stays spent on the PR. A pending set is not editable (no server id yet) and the log button no longer disables itself, because a second tap means a second set. A failed request rolls the row back and says so; the retry queue that removes the rollback is the next step. |
| 2026-07-25 | One arrival per set, not one per app switch | The re-announcement shipped the day before fired on every `visibilitychange → hidden`, and hidden is not only "phone locked" — it is also "opened WhatsApp", "checked the music", "pulled down the shade". Re-arriving has to make a sound to count as an arrival, so the fix for an invisible notification became a banner interrupting whatever else the phone was doing. User: *"ni siquiera le he dado al botón y me salta mientras hago otras cosas"*. The right unit is the set, not the app switch: logging one buys exactly one arrival, spent by the first hide that follows, and the next has to be earned by lifting something. The cost is real and accepted — leave the app twice between sets and the second lock has no card on it, because the platform will not redraw what is already in the shade. Better a control that is missing sometimes than an alarm that fires while you are answering a message. |
| 2026-07-25 | The notification badge stops being the app icon | The small monochrome slot (status bar, and the circle on the notification itself) was pointed at `icon-192.png`, which is a full-bleed amber square with a white F knocked out of it. Android does not draw a badge as an image: it keeps the alpha silhouette, discards the colour and tints what is left. A square that is opaque edge to edge silhouettes as a square, so the F was never in it — a grey block sat where the mark should be. `badge-96.png` is the same F, white on transparent, nothing else, inset to the middle ~60% so a circular crop cannot clip it, and one notch bolder than the app icon because a hairline stem vanishes at 24dp. The large `icon` stays as it was: that slot *is* drawn as an image, and the amber square is the mark. |
| 2026-07-25 | The notification arrives a second time when the app is hidden | Last symptom standing, and the status line from the previous entry is what isolated it: with `Descanso: Sin` the notification was reported present (`ok`, `shown: 1`), sat in the shade with both buttons, and never appeared on the lock screen — while `Descanso terminado` always did. The difference between them is not the content, it is the *arrival time*: MIUI (user's Xiaomi 12 Pro) draws on a locked screen what arrives while locked and redraws nothing already in the shade. The end-of-rest alert qualified by accident; the notification born the instant you tap Registrar never could, since the phone is by definition unlocked and in your hand at that moment. So the page posts `rest-announce` on `visibilitychange → hidden` and the worker re-shows under the same tag with `renotify: true`. Hiding *is* the pocketing — no timer guessing at how long somebody takes to put a phone away, and no re-announcement when they never do. A rest that already ran out keeps saying `Descanso terminado` rather than having a passed deadline written back over it. |
| 2026-07-25 | The lock-screen notification reports back into the app | Three rounds of "it doesn't appear" and three different causes, none of them visible from the phone: a stale service worker, `silent: true`, and then nothing at all. The common factor was that the app could see none of its own feature — the notification is built on another thread and shown by the platform, so *worker never woke*, *worker threw*, *permission revoked*, and *Android dropped it* were four different bugs wearing the same face. The handover became a round trip (`MessageChannel`), the worker answers `{ ok, shown }` — `shown` from `getNotifications`, so `ok: true, shown: 0` isolates "the platform kept nothing" from every worker-side failure — and one muted line under the toggle names it, with the time of the last good one. Debug output would have been a console log nobody on a phone can read; this is the only evidence available to the person actually holding the device. |
| 2026-07-25 | The rest notification stops being `silent`; `renotify` carries the quiet instead | User, after it worked once: the notification reached the shade but never the lock screen, while YouTube Music's did. `silent: true` was the cause, and it was mine — set on the reasoning that every set puts this on screen, so it is the normal case rather than news. Android takes that literally: several skins (One UI among them) hide silent notifications from the lock screen by default, which is the one surface where this feature exists at all. `renotify: false` does the same job better — a replacement under the same tag does not re-alert, so it sounds once when it first appears in a session and then updates in silence, set after set, while `done` and the typed-set receipt still ask to be heard. Wanting it fully mute is a real preference and it belongs in Android's own per-site channel, not in a flag that costs the lock screen. General rule: politeness that hides a control is not politeness. |
| 2026-07-25 | Rest and lock-screen logging become two settings, not one | User: *"igual no quiero trackear los segundos de descanso pero sí quiero poder registrar las series sin entrar a la app"*. Correct, and the coupling was mine: the notification *was* the rest, so `Descanso: Sin` silently removed the `+1 serie` button as well. They are different wants. `Aviso de descanso` becomes **`Registrar sin abrir`** and stands on its own; the rest only decides whether the notification also carries a countdown and a buzz. `endsAt: null` is a first-class case in the worker, not a degraded one: the exercise becomes the title, the body is just the set, no timestamp, no alarm. Two consequences worth stating: skipping the rest no longer closes the notification (skipping a rest is not leaving the session, and the button is the reason it is there) — it is re-sent without its clock; and the wording moved off the wire entirely, since the worker has to rewrite it anyway the moment a different set is typed in. The old preference key is read once as the new one's default so nobody has to switch it on twice. |
| 2026-07-25 | The notification's second action becomes a text field; `Saltar` is dropped | Verified on the user's Android that the two buttons render, then: *"¿podría meter peso y repeticiones custom desde la notificación?"*. Yes — Chrome/Android supports `type: 'text'` actions, with the typed string arriving as `event.reply`. But `Notification.maxActions` is 2, so it costs a slot, and `Saltar` is the one that can be spared: swiping already dismisses the notification and the countdown ends by itself, whereas a pyramid or a drop set previously had no lock-screen path at all. The platform gives one field, not two, so the parser is deliberately generous about separators and deliberately unwilling to guess — a lone `12` is ambiguous between reps and weight, and an invented set is worse than a missing one. A rejection answers with the format, in a notification, because that is the only channel back to someone holding a locked phone. The typed set also becomes what `+1 serie` repeats from then on: on the way down a drop set, the next repeat is the weight you just named. |
| 2026-07-25 | The rest goes to the lock screen, and the screen stops going dark | Latency and signal were the first bottleneck (#47/#48) and they are gone; the one left is physical — pocket, wake, unlock, find the app, find the card, tap, pocket. So the rest timer becomes a notification with a `+1 serie` button, and a straight set is one tap on a locked phone. It has to live in the service worker, because the page is exactly what stops running when the screen goes off: the page hands over the set to repeat, the token and its own unsent count, and the worker owns the notification from there. Two rules keep the log honest — the worker **writes the set to disk before it goes near the network** (same order the outbox uses), and it **will not send while the page still has older sets queued**, because `set_index` is assigned in arrival order and a lock-screen set overtaking one from the app rewrites the session. Unsent sets are handed back to the page on the way in; the page's outbox stays the only thing allowed to drain. The other half is a screen Wake Lock while a session is open (on by default, off in the overflow), which removes the trip entirely while you're standing at the rack. Cardio is deliberately excluded: the interval you just ran is not the one you are about to run. Storage is the Cache API rather than IndexedDB — two small JSON blobs, the same eviction bucket, forty fewer lines. |
| 2026-07-25 | Nothing in a session may depend on the network being up right now | The optimistic row was honest only while the request eventually succeeded; underneath it, a set logged in a basement was still lost. Three caches make the session self-sufficient: an **outbox** (sets queued FIFO on disk before they are on screen, drained on launch / `online` / app-forward, never on a polling timer), a **workout cache** (one slot — without it `getWorkout` fails on reopen and the screen dead-ends while the queue holds sets for a session you can no longer see), and a **previous-marks cache**. Adding an exercise no longer fails on a dead network either. Two rules keep it honest: a set the server *judged and refused* (4xx that isn't 401) is dropped out loud, because retrying a 422 forever blocks every set behind it; and **cached marks may never award a record** — they were fetched excluding a different session, so they understate history, and a PR against an understated mark is a PR that never happened. The card shows the numbers and withholds the badge, with one muted line saying why. |
| 2026-07-26 | Cardio gets an amber-ring dot where a muscle dot would go | User: *"el círculo del ejercicio de cardio tiene que tener un borde color ámbar"*. Cardio has no muscle group, so the exercise-card header and the Días session row simply drew no dot at all for it — the one exercise kind with no colour cue. A second explicit exception to "amber is effort/PR only" (the first being the categorical muscle palette): `.dot-cardio` is a transparent circle with an amber *border*, not a fill, so it doesn't compete with the PR or CTA amber. Shown in the Entreno card header (`Workout.jsx`) and, since a cardio-only day still needs a mark, in the Días session row (`Days.jsx`) alongside the muscle dots. |
| 2026-08-01 | The period summary compares equal spans, and never averages a week it hasn't lived | User: *"veo las series y veo en negativo"*, on the 1st of a month. The card measured a period in progress against a finished one — one day of August against four weeks of July — so every group read as a collapse, which is a statement about the calendar and not about training. Three fixes, one idea: the comparison window is now the *matching stretch* of the previous period (nine days of month against the first nine of the month before, Wednesday against Wednesday), whole against whole only once both are closed; `weeksElapsed` floors at one **day** instead of one week, because taking the three days a month has managed and dividing them by seven was the arithmetic behind the collapse; and a month reports plain counts until it holds a full week, since 12 sets on the 1st extrapolates to 84/week — a number nobody has done. The subtitle names the span the numbers came from ("3.7 semanas", "6 días") while the period is open, and the footer says which stretch it compared against. Two silences went with it: a muscle you stopped training now holds its row at zero (*Espalda 0 series, −6*) instead of vanishing from the one card that asks "am I training what I think I'm training", and the sets no group claims — cardio by design, unrecognised lifts by accident — are stated under the bars, because otherwise they are volume in the total that colours no row and the arithmetic just looks broken. |
