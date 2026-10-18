# Design System — Fitit

> Read this before any visual or UI change. Fitit is a **training instrument**, not a
> wellness app. Every choice serves one thesis: *lean on purpose*.

## Product Context
- **What this is:** Personal workout tracker. Log sets; when you pick an exercise, see
  your previous marks so you know what to beat.
- **Who it's for:** A serious lifter tracking progressive overload. Solo use, no social feed.
- **Space/industry:** Strength-training / gym logging (peers: Hevy, Strong, Fitbod).
- **Project type:** Android app (Capacitor) que también se instala como PWA. Used
  one-handed, in the gym, between sets. Desde 2026-10-02 la referencia es la app nativa,
  no la web: ver **Sistema v2** más abajo.
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

## Marca
El kit vive en `brand/` (SVG, PNG y su propio `README.md` con la regla, el aire y
los tamaños mínimos). Es la fuente; lo que se sirve se genera desde ahí.

- **El isotipo es "la celda".** Retícula de cuadrados que crecen hacia la esquina
  superior derecha; la de arriba a la derecha llega al 100 % y es la única en
  ámbar. Es la misma idea que la app ya dibuja en cada pantalla —progresión que
  se lee de un vistazo— y no una mancuerna, que es lo que dibuja todo el sector.
- **Tinta y ámbar, nunca más.** Sin degradados, sin sombras, sin segunda tinta.
  Los valores del kit son exactamente los tokens de este documento (`--text` /
  `--accent` en cada tema), así que la marca en pantalla se pinta con tokens y no
  con hex: `currentColor` para la tinta, `var(--accent)` para la celda ámbar.
- **Qué versión a qué tamaño.** 4×4 hasta 24 px; por debajo, 3×3; a 16 px, el
  favicon 2×2. El lockup del header cae en la banda de 20 px, así que lleva la
  3×3 — la 4×4 ahí es una mancha de puntos.
- **El nombre va en una sola caja y una sola tinta:** `fitit`, Space Grotesk 700,
  tracking −0.055em. Sin la I capital que llevaba antes: echoaba la mancuerna y
  la mancuerna ya no está.
- **Aire mínimo alrededor = una celda** (21 % del isotipo). El lockup horizontal
  no baja de 96 px de ancho.
- Los PNG servidos (`icon-*`, `favicon.png`, `badge-96.png`) los rasteriza
  `frontend/tools/make_icons.py` leyendo los SVG del kit. No se editan a mano: si
  cambia la marca, se vuelve a correr.

## Typography
> **Desde 2026-10-18 los titulares son Bricolage Grotesque** (ver **Marcador**). Lo que
> sigue sobre Space Grotesk queda como historia; Geist y Geist Mono no cambian.

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
  | Display figure | 2.6rem / 41.6px | 400 | Geist Mono | -0.02em, tabular-nums |
  | Hero (h1) | 1.6rem / 25.6px | 700 | Space Grotesk | -0.03em |
  | Title (h2) | 1.15rem / 18.4px | 600 | Space Grotesk | -0.01em |
  | Body | 1rem / 16px | 400 | Geist | 0 |
  | Data (numbers) | 1rem / 16px | 500 | Geist Mono | 0, tabular-nums |
  | Big stat (PR/1RM) | 1.4rem / 22.4px | 600 | Geist Mono | 0, tabular-nums |
  | Meta/small | 0.85rem / 13.6px | 400 | Geist | 0 |
  | Label | 0.8rem / 12.8px | 600 | Geist | 0.01em |
  | Micro (stamp) | 0.7rem / 11.2px | 600 | Geist Mono | 0.06–0.14em, uppercase |
- **Below Label there is exactly one step, and it is not for reading.** The stylesheet had
  drifted to nine distinct sizes under 12.8px — 12.48, 12.0, 11.84, 11.52, 11.2, 11.0,
  10.88, 10.5, 10.4 — which is not a scale, it is the absence of one. Two different things
  were hiding in that drift, and they want opposite answers:
  - **Prose that had simply been shrunk** — a hint, a caption, the list of muscles a week
    still owes. There is no case for setting a sentence below the smallest step the scale
    defines: on paper, `--muted` at 11.84px is where a label stops being quiet and starts
    being unread. **Anything read as a sentence is Label 12.8px or larger, no exceptions.**
    If prose seems to need less than 12.8px, the prose is too long, not the type too big.
  - **Stamps** — uppercase, letterspaced marks that annotate a figure instead of being read
    as words: the `SER` after a set count, `ESTA SEMANA`, `VIE · DESCANSO`. An instrument
    needs these, and it needs them below the reading sizes: a gauge's tick labels are
    smaller than anything you read off it, and a unit set at the same size as its quantity
    turns `15 SER` from one reading into two tokens of equal weight. So **Micro exists, and
    only for uppercase letterspaced non-prose stamps** — a unit, a column head, a section
    rule. It is not an escape hatch: if it has a lowercase letter in it, it is not a stamp.
  A **nav caption is not a stamp** — `Días`, `Progreso` are words you read, so the bottom
  tabs sit at Label, not Micro. They fit: the tab's 56px `min-height` governs the bar's
  height, so the caption grows inside a box that does not move.
- **Display figure is one number per screen**, the one read from arm's length: today's
  target in the workout, what's left of the day's kcal, the cold-start stat. If a screen
  wants two, one of them is a Big stat.
- **Glyphs are not type.** A chevron, a `×`, a `⋯`, a `✓` or the stepper's `−`/`+` are
  sized to the box they sit in, like an icon, and sit outside the scale. They are listed
  by selector in `frontend/src/typeScale.test.js`; anything else with a `font-size` off
  this table fails that test. So does any size under Label that isn't Micro, and a
  `fontSize` attribute in the Progreso chart — SVG text takes its size from the stylesheet
  (`.chart-point-label`, `.chart-tick`), where the test can see it.

## Color
> **Desde 2026-10-18 los valores son los de Marcador** (más abajo): neutros Carbón/Hueso
> y Tiza/Carbón, récord en oro, rojo nuevo. El razonamiento de este apartado (una sola
> acción en ámbar, tinta sobre el ámbar, ámbar-como-texto más hondo en claro) sigue.

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
  - **There is no success or warning hue.** Both were listed here and neither was ever
    a token: a saved set confirms in `--text`, and nothing in the app warns without being
    either destructive (`--danger`) or a note (`--muted`). A green tick would be a second
    accent on the one screen whose accent means effort. Add one only with a use for it.
  - error / destructive: dark `#F87171` / light `#CE1F1F` (true red reserved for destructive)
    - Measured on the surface it is actually painted on, hover veil included. The old
      pair failed AA in **both** themes: dark `#EF4444` gave 4.345 on `--surface-raised`
      and 3.676 under the 6% `--text` hover wash; light `#DC2626` gave 4.319 on warm
      paper `#F4F2EE` and 4.276 on hover. 16px/600 is not "large text" under WCAG, so
      the floor is 4.5, not 3. The new pair: dark 5.911 at rest / 5.001 on hover;
      light 5.469 on white, 4.891 on paper, 4.842 on hover.
  - info: muted text, no dedicated hue
- **Focus ring:** `color-mix(in srgb, <accent> 30%, transparent)`, 3px.
- **Dark mode strategy:** dark is the primary surface (design here first); light is a
  warm-paper inversion, reduce accent saturation ~10% for contrast on light.
  The theme follows the phone by default and can be pinned in **Perfil → Apariencia →
  Tema** (`Sistema` / `Claro` / `Oscuro`). The stylesheet reads only
  `<html data-theme>`, never `prefers-color-scheme`; `src/theme.js` sets it.
- **Contrast:** text on bg and accent-on-surface must pass WCAG AA (4.5:1 body, 3:1 large).

### Color por músculo (categorical — deliberate exception)
Explicit, user-approved exception to "one accent only": muscle groups get a full
categorical palette so Progreso can be organized and read by muscle. Scope rules:
- **For data encoding only**, never for brand/CTA/state. Amber stays the sole
  brand/effort/PR accent and is **not** in this palette (so "record" keeps meaning).
- **Color rides a mark, not text.** A muscle is shown as a colored dot/line beside
  its name; labels/values stay in ink. Color is never the only cue.
- **Fixed 10-group set**, assigned in canonical order (below). A colour per
  individual muscle would be an unreadable rainbow — ten is the ceiling, and the
  hue wheel is full: the tenth (Glúteo, 2026-10-02) only fit as a dark,
  low-chroma copper, and in dark mode it clears its neighbour Cuádriceps by
  ΔE 15.2 against a floor of 15. An eleventh group is not a new hue: fold it
  into an existing one.
- **The four leg groups sit adjacent in the order** (Cuádriceps · Glúteo ·
  Femoral · Gemelo), because that is the pairlist the validation was run
  against. Reordering them re-opens the check.
- Validated colorblind-safe on the *adjacent* pairlist in both modes via the
  dataviz `validate_palette.js` (light surface #fff, dark #15171A). Re-run it if
  you touch these hues.

  | Grupo | dark | light |
  |-------|------|-------|
  | Pecho | `#3987e5` | `#2a78d6` |
  | Espalda | `#008300` | `#008300` |
  | Cuádriceps | `#d55181` | `#e87ba4` |
  | Glúteo | `#a16336` | `#7d3f17` |
  | Femoral | `#8046c8` | `#8b4bc0` |
  | Gemelo | `#0093a8` | `#0089a0` |
  | Hombro | `#c98500` | `#eda100` |
  | Bíceps | `#199e70` | `#1baf7a` |
  | Tríceps | `#9085e9` | `#4a3aa7` |
  | Core | `#e66767` | `#e34948` |

  Light mode carries a contrast WARN on `#e87ba4`, `#eda100` and `#1baf7a`
  (below 3:1 on white). It is dismissable here and only here because the rule
  above already forces relief: every mark in this palette sits beside its
  muscle's name in ink, so colour is never carrying identity alone.

  **The palette now renders on four surfaces, not two, and the light figures get
  worse on the fourth.** Días draws these dots with no card under them, so they
  sit on the page background — `#0B0C0E` on dark and warm paper `#F4F2EE` on
  light — rather than on `#15171A` / `#FFFFFF`. Re-run on all four: lightness
  band, chroma floor, CVD separation and the normal-vision floor pass
  everywhere, and the worst adjacent pair is unchanged (`#199e70 ↔ #c98500`
  ΔE 8.4 protan on dark, `#0089a0 ↔ #8b4bc0` ΔE 8.8 deutan on light). What moves
  is the light WARN, because paper is darker than white:

  | hue | grupo | on `#FFFFFF` (card) | on `#F4F2EE` (Días) |
  |-----|-------|--------------------|---------------------|
  | `#e87ba4` | Cuádriceps | 2.69 | 2.41 |
  | `#eda100` | Hombro | 2.17 | **1.94** |
  | `#1baf7a` | Bíceps | 2.82 | 2.52 |

  So Hombro's real floor is 1.94, not the 2.17 this section used to imply. The
  dismissal still stands for the same reason and no other — on Días every dot is
  7px of colour sitting immediately left of its muscle's name in ink at 15.9:1 —
  but the number a reader should be arguing with is 1.94. **Do not "fix" this by
  darkening the hues**: the lightness band is what the CVD separation was solved
  inside, and moving a hue out of it re-opens the whole pairlist.

  **A muscle dot must never be readable as a band mark**, since Días puts both in
  one row. They are kept apart on three axes at once and it only takes one:
  the dot is round (7×7, `border-radius: 50%`) and every band mark is a straight
  edge (1px zone rule, 2px tail, 3×16 needle); the dot lives in the name column
  and the band marks live in the track, so they never share an x; and — the axis
  that cannot degrade — **every band mark is achromatic** (`--text` at 18 / 55 /
  100%, channel spread ≤ 5) while every hue in this palette clears the chroma
  floor by a wide margin (lowest spread 131, `#008300`). Grey is the band's
  vocabulary and colour is the muscle's, and neither may borrow from the other.

### Color por comida (categorical — segunda excepción deliberada)
> **RETIRADO el 2026-10-18 (Marcador).** Las comidas van sin color: el nombre y el orden
> del día ya las distinguen, y con color Desayuno se confundía con Hombro. El color es de
> los músculos. `data-slot` se queda en el marcado para decir qué comida es, sin estilo.

Segunda excepción aprobada a «one accent only», y a la regla propia de Comida de
que **el color codifica progreso, no categoría**: las cuatro comidas del día
llevan tono propio para poder barrer el scroll sin leer. Igual que la paleta de
músculos, vive dentro de una frontera, y aquí la frontera es más estrecha:

- **El tono es marca, nunca dato.** Tiñe la banda del nombre de la comida al
  24 % sobre el fondo (era el 20 % sobre la tarjeta: desde 2026-10-10 el diario
  no va en tarjetas, y contra `--bg` oscuro el 20 % se quedaba en 1,15), pinta el punto de 7 px que va antes del nombre y el filete que cierra la
  banda. **No toca una cifra, no toca una barra, no toca el héroe.** El contrato
  de color de la cabecera de macros —el anillo y las barras se llenan al comer,
  en ámbar la proteína y en tinta las kcal, los hidratos y la grasa, `--pr` al
  cerrar— no lo toca el tono.
- **El suelo es 3:1, no 4,5.** Es el de un elemento no textual, que es lo único
  que el tono pinta. No es una rebaja: es la consecuencia de la regla anterior.
  Si el tono tiñera el subtotal habría que subirlo hasta pasar AA como texto
  sobre las dos superficies, y **no existe ninguna luminosidad que haga eso y
  siga por debajo del ámbar** — medido barriendo L y C en los dos temas. O el
  tono se calla, o hay dos colores peleándose por decir qué importa.
- **El ámbar sigue mandando.** Ningún tono llega al contraste de `--accent-ink`
  contra su superficie. Es la línea que separa «marca de categoría» de «segundo
  acento», y `comida.browser-test.jsx` la mide en los dos temas.
- **El montón «Sin asignar» no lleva tono.** No es una comida que elegiste, es lo
  que se quedó sin elegir; darle color lo pondría a competir con las cuatro que
  sí decidiste. En el DOM se marca por ausencia: las cuatro llevan `data-slot`,
  ese montón no lleva el atributo.
- **Un hueco no pesa más que lo registrado.** La comida vacía se tiñe al 12 %,
  la mitad que una con contenido. Al 20 % la tarjeta entera pesaba más que una
  comida con tres cosas dentro.

  | Comida | token | valor | oklch |
  |--------|-------|-------|-------|
  | Desayuno | `--slot-desayuno` | `#4e925e` | `oklch(0.60 0.105 150)` |
  | Comida | `--slot-comida` | `#3c88b8` | `oklch(0.60 0.105 240)` |
  | Cena | `--slot-cena` | `#8573b8` | `oklch(0.60 0.105 295)` |
  | Snack | `--slot-snack` | `#aa6694` | `oklch(0.60 0.105 340)` |

  Misma luminosidad y misma croma; sólo cambia el matiz. **Un único juego para
  los dos temas**, que no lo tiene ningún otro color de esta hoja, y sale porque
  la banda entera cabe bajo el ámbar por los dos lados: 4,31–5,22 contra la
  tarjeta oscura (acento 6,29) y 3,36–4,17 contra la clara (`--accent-ink` 5,09).

  **Esta paleta no pasa la validación de daltonismo, y es a propósito.** Con
  deuteranopia, Comida y Cena caen a 0,01 de distancia en oklab: el mismo color.
  Es el precio de la misma luminosidad, y es el precio correcto porque **aquí el
  color no identifica** — el nombre de la comida está escrito en la tarjeta, en
  Space Grotesk a 16 px, y el tono sólo sirve para barrer. Es justo al revés que
  «Color por músculo», donde el dot acompaña al nombre pero también viaja solo, y
  por eso aquella sí va escalonada en luminosidad y ésta no. Escalonar ésta
  arreglaría el daltonismo y costaría que las cuatro dejasen de leerse como una
  familia; además, en tema claro no existe un juego escalonado que además esquive
  el ámbar, `--pr` y `--danger` —se buscó y no hay ninguno—.

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
  scrolls under it. **A pinned bar over a scrolling list owes that list a fade.** The
  bar's top edge is opaque, so whatever the scroll position happens to be, it cuts one
  row somewhere — and a session name sliced in half horizontally, with no gradient and no
  mask, reads as a rendering fault rather than as "there is more below". 28px of the page
  colour, hanging above the bar and outside its box, so nothing inside the bar moves and
  the fade never eats a tap.
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
- **An optional input that nobody fills is not optional, it is absent.** RPE and nota were
  folded behind a toggle rather than removed, and the log answered the question: 1 set in
  277 carried an RPE, 6 carried a note. The log form asks for reps and weight and nothing
  else. What a note usually said was true of the lift rather than of that set, so the note
  moved to the exercise, where it is read before the first rep; the per-set note survives
  only inside a set's own editor, reached by tapping the set it is about.
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
  A set row opens its own editor and the workout title opens its rename. The chart title
  did too, until `Editar ejercicio` became the one door onto the exercise; a second,
  invisible door to the same sheet is one too many. An overflow holding only `Editar` and `Borrar` was a menu
  standing between you and the row you had already pointed at. `Borrar` rides inside the
  editor it belongs to; menus keep what genuinely isn't editing — `Borrar día`,
  `Borrar entreno`, `Repetir`, and the settings.
  - **Exception: exercise card headers in Entreno.** That surface is already the fold
    control, full-width and 44px so it can be hit one-handed. One surface cannot mean two
    things, which is why renaming an exercise lives behind `Editar ejercicio` — a line at
    the foot of the open card, and the same line on Progreso — and never on the header.
  - The cost is a real one: a tappable row with no frame around it is an invisible
    affordance. It is paid once, and repaid on every edit — and the press state is what
    answers the finger. Cardio rows keep their `⋯`, because there is no editor to open.
- **Print only figures a decision depends on.** Per-exercise tonnage (`1050 kg volumen`)
  was arithmetically true and physically meaningless — nobody changes the next set
  because a sum reads 1050. The series count stays, because that one is read between
  sets. Cardio keeps `Total 24:30 · 5 km`: time and distance are measured, not derived.
- **A day is a ruled logbook entry, not a card.** A card spends ~100px of border, padding
  and shadow to carry one row: three days filled a phone. Ruled, seven do. Cards are for
  things you *work inside* (an exercise), not things you *scan past* (a past day).
  **The margin is a left gutter, and the hairline goes over the whole block.** The first
  version ran the rule *across* the row, from the date to the overflow, which put a
  horizontal cut between a date and its own session — so the line read as a divider above
  the session rather than as its stamp. The date now sets in a 3.6rem mono gutter (one
  token per line: `SÁB 8` in ink / `AGO` muted, the year taking a third line on the rare
  day that needs it) with the session hanging to its right, and the rule separating one day
  from the next sits over date and session together, which is the only place it means
  "new day". That rule is `color-mix(in srgb, var(--text) 17%, transparent)`, not
  `--border`: at `--border` the boundary between two *days* weighed exactly the same as the
  boundary between two sets of the same exercise, so nothing said which scale you were on.
- **The list is cut into weeks, and the days you didn't train are drawn.** A week is the
  unit a lifter plans in, and "how much have I done this week" was answerable only by
  counting rows. A mono rule per week — `ESTA SEMANA` in ink, `3 DÍAS · 50 SERIES` muted,
  no surface, one line of type — turns a scroll into a report. Rest days get a dashed amber
  hairline with a mono label (`VIE · DESCANSO`, or `4 DÍAS SIN ENTRENAR` for a run), and
  **only inside the current week**: a gap you can still act on is information, a gap in
  March is decoration. Their own rule stays at `--border`, weaker than a day's, because a
  rest is subordinate to the day it sits under.
- **A session row is two lines of constant height.** Naming every muscle group wrapped to
  two or three lines, so a full-body day stood twice as tall as a push day and the list
  lost the rhythm you scan it by — and once four groups sat at similar counts, lifting the
  biggest to ink stopped saying anything. The breakdown becomes a **56×4px proportional
  seam** (one segment per group, `flex-grow` = its set count, widest first) with the main
  group named in ink beside it and the rest collapsed to `+N`. Cardio's segment is striped
  in `--muted` rather than coloured: it has no muscle group by design. Colour still rides a
  mark and never text, which is the whole scope the muscle palette was approved for.
- **Today is marked once.** It carried three cues for one fact — accent hairline, ink date,
  and a `HOY` chip that added a third line to the gutter and made today's row taller than
  every other. The chip is gone; the hairline goes to `2px solid var(--accent)` and the
  date stays in ink. The attention it freed goes to the one state the list could not
  express: `● EN CURSO` on the session still running, in the slot the duration would take.
  The two are mutually exclusive by construction — an open session has no length to report.
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

## Fuera de la app: widgets y notificación nativa (APK)
Lo que se ve sin abrir Fitit en Android: los widgets de la pantalla de inicio y la
notificación del entreno. La notificación **web** de la PWA sigue las reglas de «Layout»
de arriba; esto es la app nativa. Especificación y fases: `docs/widgets-entreno.md`.
Vistas previas aprobadas: `~/.gstack/projects/raullopeslopez-fitit/designs/widgets-20260926/`
(`preview-v9` a `v17`).

- **Tesis: una serie, un toque.** Cada superficie tiene **un solo relleno ámbar**, el toque
  que registra (`+1`) o el que empieza (`Empezar entreno`). Lo raro —terminar, cambiar de
  pantalla— va apagado. Es la misma regla del ámbar de la app, llevada a donde el usuario
  mira de reojo entre series: un único color de acento se encuentra sin buscarlo; dos se
  anulan (congestión visual, Rosenholtz). Máximo tres bloques de información a la vista.
- **Tamaños.** 4×2 (358 dp de ancho) y 3×2 (≈253 dp medidos en el launcher del Xiaomi
  del usuario; se había diseñado a ≈270), con el mismo diseño. **El alto de dos filas no
  es 200 dp**: en ese launcher es ≈176, y a esa altura el diseño de abajo perdía la fila
  de reps. Por eso hay dos medidas del mismo diseño, y la elige el alto que da el
  launcher:
  - **300 dp de ancho y 190 de alto, o más:** lo que se describe abajo, en tres partes
    (nombre, tiempo, fila de ajuste de dos marcos). Es el 4×2.
  - **Compacto (< 300 de ancho o < 190 de alto; APK 0.19.0):** ahí la fila de dos marcos
    no cabe, y es un layout aparte (`widget_session_4x2_compact`) con el diseño anterior:
    el tiempo en la línea del nombre, a la derecha, en Mono 24sp (a 30 no cabía ni
    `Press banca` en 253 dp); el bloque apilado de dos filas de 44 dp —el mínimo de
    toque— con 8 dp encima, y los márgenes de arriba y abajo a 10 dp. Estrecho además
    (< 300 dp), mientras corre el tiempo se quita `· 4 series`: el nombre entero pesa más
    que el número. Es siempre el caso del 3×2 (≈253 × 176 dp en el Xiaomi). Hasta la
    0.18.0 el compacto era sólo por alto; un 3×2 de 270 × 200 llevaba el diseño entero.
  El 4×1 tiene diseño propio (abajo, «El 4×1»). Toques de 44 dp como mínimo, siempre,
  aunque el icono sea menor.
- **Tipos y color.** Nombre del ejercicio en Geist 600 15sp; lo secundario en Geist 13sp
  `--muted`; toda cifra en Geist Mono con tabulares, **también dentro de una frase**:
  en `· 4 series` el `4` va en Mono (un texto de widget no mezcla fuentes propias, así
  que son tres textos, `widget_series`). Colores de `widget_colors.xml`, que son los de
  este documento; claro y oscuro los elige el sistema. Los grupos musculares tienen los
  suyos (`widget_m_pecho` … `widget_m_core`, los `--m-*` claro y oscuro), **sólo para
  marcar, nunca para texto**.
- **Nada que se deslice a los lados.** El launcher se queda ese gesto para cambiar de página;
  un widget no lo recibe. Lo que cambia de pantalla se **toca**.

### Estados del 4×2 y el 3×2
Un solo estado activo cada vez. Tocar cualquier zona sin botón (nombre, series) abre Fitit
en ese entreno: **añadir o cambiar de ejercicio se hace dentro de la app**, no en el widget.

- **Sin entreno — pestañas** (APK 0.19.0; antes, dos o tres pantallas con puntitos).
  Arriba, `Pasos`, `Comida`, `Entreno` en Geist 600 13sp, 18 dp entre ellas; la fila
  mide 40 dp a la vista y 44 de toque, que se mete en el margen de arriba (4 dp). La
  elegida va en `--text` con un subrayado de 2 dp en `--text` del ancho de la palabra;
  las otras, en `--muted`. Debajo, un filete de 1 dp `--border`. Tocar una pestaña la
  elige y el widget **la recuerda por su nombre**, también al reiniciar: si mañana
  desaparece `Pasos`, quien estaba en Entreno sigue en Entreno. Sin pasos de hoy no hay
  `Pasos`; sin objetivo de proteína no hay `Comida`; `Entreno` está siempre. Márgenes
  4 16 0. **El aire se reparte por igual** (space-evenly): el mismo hueco entre el
  filete, cada bloque y el borde de abajo, y lo que no está se lleva su hueco.
  - **Pasos:** `8.432` en Mono 44sp y, a su línea base y 10 dp detrás, `faltan 1.568`
    (Geist 13sp `--muted`, la cifra en Mono `--text`); una barra de 6 dp, radio 3,
    `--accent` sobre `--border`; y `Media semanal 7.910` en 12sp `--muted` (cifra en Mono).
    Sin objetivo no hay `faltan` ni barra; cumplido, `faltan` desaparece y la barra se
    queda llena. La barra dibuja un dato, no un tiempo: se repinta cuando cambian los
    pasos, nunca cada segundo. Tocarla abre Fitit.
  - **Comida** (anillos al estilo de los de actividad de un reloj): a la izquierda, dos
    bloques a 14 dp: el sello `PROTEÍNA` (Mono 600 11sp, espaciado 0,1, `--muted`) y
    `118` Mono 24sp + `/202` Mono 15sp + ` G` Mono 600 11sp, todo en `--accent-ink`; y el
    sello `KCAL` con `1460/2569 KCAL` igual, en `--text`. A la derecha, los anillos
    (`FoodRings`, un bitmap) de **136 dp**: fuera, 20 dp de `--accent` sobre un carril del
    mismo ámbar al 22 %; 3 dp de hueco; dentro, 20 dp de `--text` sobre la tinta al 14 %.
    Extremos redondos y **nada en el centro: cada cifra sale una vez** (antes, lo que
    faltaba iba en el centro y las cifras otra vez a la derecha). Cerrada la proteína,
    su anillo y su cifra pasan a `--pr`. Sin objetivo de kcal, ni anillo de dentro ni
    bloque `KCAL`. Tocarla abre Comida.
    - **En el 3×2** (≈253 dp) `1460/2569 KCAL` no deja sitio al anillo: se quitan ` G` y
      ` KCAL` (la unidad ya la dice el sello) y el anillo mide lo que queda, unos 100 dp
      (nunca menos de 88). Sólo se quitan si eso le da más anillo.
    - Los datos los manda la app al abrirse y al volver a primer plano (`syncFood`), y
      Comida al cargar hoy (`publishFood`); el widget no consulta el servidor, por
      decisión del usuario (y porque despertaría a Render cada vez). Al instalar una APK
      nueva y al encender el teléfono se repinta con lo guardado
      (`WidgetRefreshReceiver`).
    - El día de comida corta a las 04:00: a esa hora el widget se repinta solo y, si lo
      guardado es de otro día, sale vacío con los mismos objetivos (`—/202 G`).
  - **Entreno:** una franja vertical de 4 dp (radio 2) del color del grupo muscular del
    último entreno y, 12 dp a su derecha, `2` en Mono 40sp + `días` en Geist 600 15sp;
    6 dp debajo, `desde el último · Pierna` en 13sp `--muted` con el grupo en 600
    `--text`. Con dos grupos, la franja va partida en dos mitades y dice
    `Pierna · Core`; si no caben (en el 3×2 `Cuádriceps · Core` no cabe), se nombra
    sólo el principal y la franja sigue con los dos colores. `1 día`; hoy, `Hoy` en Geist
    600 en lugar del número, sin `días`, y debajo `último entreno · Pierna`. Cardio o un
    grupo sin color: franja en `--border-strong`. Sin último entreno, sólo el botón.
    Debajo, `Empezar entreno`, 44 dp a lo ancho, radio 12, `--accent`: el único relleno.
- **Entrenando** (APK 0.19.0, «se lee como la serie»). Márgenes 14 16 16 y tres partes:
  arriba `Press banca` (600, `--text`) `· 4 series` (`--muted`); en medio, una fila que
  ocupa el alto que sobra, centrada en vertical, con el tiempo a la izquierda y, a la
  derecha, el aro de pausa (margen derecho 4) y el de Terminar (margen derecho −5, para
  que el aro de 34 quede en el borde); abajo, la **fila de ajuste** de 46 dp. Tocar el
  nombre o el tiempo abre la app en ese entreno.
- **Descansando.** El tiempo, `01:23` en Geist Mono 500 **40sp**, ocupa el ancho libre de
  la fila de en medio. Sin descanso no hay tiempo, y Terminar se queda a la derecha.
- **Pasado de tiempo.** Al llegar a cero, el mismo número pasa a `--accent-ink` y cuenta
  hacia arriba con signo: `+00:12`, `+02:47`. No hay botón de saltar en ningún sitio:
  registrar ya empieza la serie aunque quede descanso. **No se añade un amarillo**: no hay
  tono de aviso en el sistema a propósito y el ámbar ya significa «ha pasado algo»; además
  un amarillo sobre blanco no se lee. Contraste medido del ámbar como texto: 5,09 en claro
  y 6,29 en oscuro.
- **En pausa** (4×2 y 3×2; 2026-10-04). Descansando, a la izquierda de Terminar hay un
  segundo aro, del mismo tamaño (34 dp, borde 1,5 dp, toque de 44) pero en
  `--border-strong` y no en `--danger`, porque pausar se deshace; dentro, ❚❚ en
  `--text`. Al tocarlo, el tiempo se queda quieto en `--muted` con lo que quedaba
  (`01:23`) y el glifo pasa a ▶; tocarlo otra vez sigue desde ahí. Pasado de tiempo o
  sin descanso, el aro no está. **También en el 3×2 estrecho y bajo** (el compacto del
  Xiaomi, ≈253 × 176 dp), aunque ahí el nombre se corta con «…» mientras se descansa
  (`Pre…`): en la 0.14.0 el botón era tocar el tiempo, sin icono, y el usuario no lo
  encontró; sobre el render eligió el aro antes que un tiempo más pequeño (0.15.0).
  **Y en la notificación**, cerrada y desplegada: el mismo aro a la derecha del tiempo. `+1` en pausa registra y empieza un descanso nuevo,
  corriendo. El 4×1 no tiene botón, pero enseña el tiempo quieto igual; y Entreno, `En pausa` con `Reanudar` junto a `Saltar`. En pausa no vibra: la
  alarma del fin se quita y vuelve al reanudar.
- **Sin enviar.** La línea del ejercicio dice `5 series · 1 sin enviar`, con `1 sin enviar`
  en `--accent-ink`. Se va sola al llegar las series al servidor.
- **Sesión caducada.** `Sesión caducada` / `Abre Fitit para volver a entrar. Tus series
  siguen guardadas.` y un botón con borde, **sin relleno**, `Abrir Fitit`: no registra nada,
  así que no lleva ámbar.

### El bloque de ajuste
- **La fila de dos marcos** (4×2 y notificación desplegada; APK 0.19.0): 46 dp de alto,
  `[marco peso]` 6 dp `[marco reps]` 6 dp `[+1]`. **Se lee como la serie**: `32,5 kg`
  y `× 12`, juntos `32,5 kg × 12`, sin la palabra `reps`.
  - **Cada marco**: 1 dp `--border-strong`, radio 14; `−` y `+` son zonas de toque de
    44 dp en los extremos, y el valor va centrado sobre el marco entero. **Encima, no
    entre ellas**: cada marco mide ≈129 dp y entre dos zonas de 44 no cabía `32,5 kg`; el
    valor no se toca, así que un toque sobre él cae en la zona de debajo. Medido: hay al
    menos 4 dp entre el valor y su glifo, también con `102,5 kg`.
  - Peso: `32,5` Mono 16sp + 3 dp + `kg` Geist 11sp `--muted`, a la misma línea base.
    Reps: `×` Mono 14sp `--muted` + 3 dp + `12` Mono 16sp.
  - **`+1`**: 56 dp de ancho, todo el alto, radio 14, `--accent`, `+1` en Mono 600 18sp
    `--on-accent`. Es el único relleno ámbar.
  - **Sin peso** (dominadas): sólo el marco de reps, a lo ancho, y el `+1`.
- **El bloque apilado** (el compacto: 3×2 y widgets bajos). Una sola pieza: las dos
  filas de 44 dp apiladas (`− 32,5 kg +`, `− × 12 +`, con las mismas leyendas que la
  fila, a la línea base de su cifra) y el `+1` como su extremo derecho, **56 dp**, a 6 dp
  de las filas; marco común de 1 dp `--border-strong`, radio 14, y filete de 1 dp
  `--border` entre filas.
- **`−` y `+`**: glifos en `--text` (no ámbar: el ámbar es del `+1`). **Al pulsar**, su
  zona se tiñe (`#FBE6DC` claro / `#3A2216` oscuro) y el glifo pasa a `--accent-ink`.
  Suave y no sólido: sólido, el `+` de los kilos se fundía con el `+1` de al lado. Zonas
  de 44 dp en los dos diseños (la 0.17.0 las había subido a 52 en el bloque apilado del
  4×2; con la fila de marcos, el 4×2 ya no lo usa).
- **Terminar**: un aro de 34 dp con borde 1,5 dp en `--danger` y un ■ de 14 dp dentro,
  arriba a la derecha, zona de toque de 44 dp. Rojo porque terminar no se deshace. Riesgo
  conocido: ■ es el símbolo universal de «parar» y está al lado de un cronómetro; si se lee
  como «parar el descanso», la alternativa aprobada es una bandera de meta en el mismo aro.

### El 4×1
`Sin entreno en curso` + `Empezar`; `Sesión caducada` + `Abrir`. Entrenando (358 × 84 dp,
radio 22), márgenes 0 12 0 18 y una fila centrada: a la izquierda, `01:23` en Mono 500
28sp + 10 dp + `Press banca` en Geist 600 15sp (con `…` si no cabe) y, 3 dp debajo,
`32,5 kg × 12` en Mono 13sp `--text` + ` · 4 series` en 13sp `--muted` (el `4` en Mono);
a la derecha, el `+1` de 60 × 56 dp, radio 14, `--accent`, Mono 600 20sp. El pasado de
tiempo sigue la misma regla del ámbar.

- **Descansando, el fondo es el descanso** (APK 0.17.0, «el descanso se vacía», opción 2a
  de la maqueta). Una capa en `#FBE6DC` claro / `#3A2216` oscuro (la de la zona pulsada)
  ocupa todo el alto y se retira de derecha a izquierda según lo que queda: llena al
  registrar, vacía en el cero. A la izquierda sigue la esquina del widget; a la derecha,
  corte recto. Encima, como antes: el tiempo en Mono **28sp** + `Press banca`, debajo
  `32,5 kg × 12 · 4 series`, y el `+1` a la derecha.
- **Pasado de tiempo o sin descanso, la barra no está.** En pausa se queda quieta con lo
  que quedaba.
- **Se mueve a saltos de 5 s.** Un widget sólo se actualiza solo con el cronómetro, así
  que la barra se repinta cada 5 s mientras el descanso corre (5 % de un descanso de 90), con
  una alarma inexacta que no despierta al teléfono. Acabado, en pausa, sin descanso o sin
  4×1 puesto, no hay repintados.

### La notificación del entreno
- **Diseño propio, no plantilla.** Cabecera y marco los pone Android (`Fitit · Entreno`);
  lo de en medio es nuestro. Es una renuncia consciente: una notificación con diseño propio
  **no puede ser «Live Update»**, así que no sube a la isla de HyperOS ni al chip de la
  barra de estado. Se eligió tener el tiempo grande ya (HyperOS 3.0.3.0 aún no abre la isla
  a terceros; llega con la 3.1). El tamaño de la tarjeta de YouTube Music no está al alcance:
  es la plantilla multimedia, reservada a quien reproduce audio.
- **Cerrada** (≈64 dp de contenido; APK 0.19.0): a la izquierda `Press banca` (Geist 600
  15sp) / `32,5 kg × 12 · 4 series` (13sp; la serie en Mono `--text`, el resto `--muted`);
  a la derecha, el tiempo en Mono 500 **30sp** y detrás el aro de pausa de 44 dp (▶ en
  pausa; sin aro pasado de tiempo o sin descanso). Cabe en los 48 dp que da HyperOS.
- **Desplegada**: la línea `Press banca · 4 series` y debajo **lo mismo que el 4×2**: el
  tiempo en Mono 40sp con el aro de pausa, y la fila de ajuste de dos marcos y `+1`. **Sin
  Terminar**: terminar no se deshace y se hace en el widget o en la app. La línea se
  queda (el encargo decía «b + c») porque es lo único que dice qué ejercicio es y lo
  único que abre la app.
- **El cuerpo no abre la app** (APK 0.17.0). Lo único que abre Fitit es la línea del
  ejercicio (cerrada: `Press banca` / `32,5 kg × 12 · 4 series`; desplegada: `Press banca ·
  4 series`); un toque en cualquier otro sitio que no sea un botón no hace nada. Antes el
  cuerpo abría la app, y con el móvil bloqueado un `−`/`+` que caía en él mientras la
  tarjeta se repintaba pedía el código de desbloqueo.
- **Toques seguidos en `−`/`+` se pintan una vez**: el peso y las reps cambian en cada
  toque, pero la tarjeta y los widgets se repintan 300 ms después del último. El `+1` no
  espera: registra con lo último y pinta al momento.
- **Sin botones del sistema.** Desaparecen `+1 serie`, `Otra serie` y `Otro ejercicio`, y con
  ellos **escribir desde fuera de la app** (`Remo 40x10`, `35x10`): Android sólo deja campos
  de texto en sus propios botones, y el bloque ocupa ese sitio. Una serie distinta se ajusta
  antes con `−`/`+`; otro ejercicio, dentro de la app.
- El tiempo sigue la misma regla que en el widget: texto mientras baja, `--accent-ink` y
  `+00:12` al pasarse.
- **La tarjeta no suena; al acabar el descanso vibra ella misma, con cuenta atrás**
  (APK 0.15.0; antes, dos pulsos en el cero). Antes del cero se publica en
  el canal «Fin del descanso», todavía bajando, y **cuenta con toques cortos** (APK
  0.18.0): `pi pi pi · pi pi · pi · piiiii`, tres toques de 80 ms en el 3, dos en el 2,
  uno en el 1 (cada grupo al empezar su segundo) y uno de 500 ms que **acaba** en el cero.
  Antes: en la 0.16.0, un toque por segundo que crecía (100, 250, 500 y 800 ms), y el
  largo del 1 no llegaba entero en el Xiaomi; en la 0.15.0, toques iguales. Sin sonido y sin aviso aparte. Pasado el cero
  se repinta en positivo en el canal mudo. Si la cuenta atrás llega más de medio segundo
  tarde, no vibra; en pausa o saltado, tampoco.

### El aviso de la revisión semanal
- **Canal** `fitit_review`, «Revisión semanal», importancia normal (suena como una
  notificación cualquiera: es el único aviso que Fitit da por iniciativa propia).
- **Texto.** Título `Revisión semanal`; cuerpo `Tu semana está lista. ¿Ajustamos el
  objetivo?`. Se cierra al tocarla, y tocarla abre Comida, donde está la tarjeta de la
  revisión.
- **Cuándo.** Una comprobación al día, a las 9:00 locales y con red. Avisa sólo si el
  servidor dice que la revisión está pendiente **y** su día es hoy: pendiente sigue
  siendo cierto el lunes, y un «tu semana está lista» tres días tarde es ruido, no
  recordatorio. Sin sesión, o con un fallo de red, no hace nada y no reintenta.
- **Por qué una sola vez.** Se apunta la fecha de la revisión avisada: ni un segundo
  disparo el mismo día ni un reintento repiten el aviso. Si no la abres, la tarjeta
  espera en Comida; insistir sería regañar.

## Marcador (desde 2026-10-18)
Sistema del lienzo «Fitit sin tarjetas» (página *Sistema de diseño*), aprobado por el
usuario el 2026-10-18 con cuatro decisiones: **piel primero, navegación después**,
**Bricolage** para titulares, **comidas sin color**, **récord en oro**. Manda sobre lo
anterior donde choca; lo que no dice, sigue.

### Paleta
| Token | Oscuro (por defecto) | Claro | Uso |
|---|---|---|---|
| `--bg` | Carbón `#101113` | Tiza `#F5F3EE` | fondo |
| `--surface` | Grafito `#1C1D20` | Papel `#FFFFFF` | hojas, barra |
| `--surface-raised` | `#26272B` | `#FFFFFF` | botón secundario, relieve |
| `--text` | Hueso `#F3F0E8` | Carbón `#101113` | tinta y cifras |
| `--muted` | Ceniza `#9A9890` | Ceniza honda `#66645D` | sellos y etiquetas, **nunca cifras** |
| `--accent` | Mandarina `#FF6A2C` | `#E4571B` | la acción: un sitio por pantalla |
| `--accent-ink` | `#FF6A2C` | `#B83F0C` | mandarina como texto |
| `--pr` | Oro `#FFC53D` | Oro hondo `#8A5A00` | sólo récords y avisos |
| `--danger` | `#FF5A5F` | `#C62828` | borrar de verdad; texto rojo, nunca relleno |
| `--border` | `#2A2B2F` | `#E2DFD8` | la línea entre filas |

Todo texto pasa AA sobre las superficies donde cae (peor caso: `--danger` oscuro sobre
`--surface-raised`, 4,89). El coral del hidrato (`--carbs`) se queda.

### Tipografía
Tres caras, cada una un trabajo: **Bricolage Grotesque 800** para titulares (pantalla 54,
sección 28, fila 19, tracking negativo), **Geist** para el cuerpo y las etiquetas,
**Geist Mono** para toda cifra (Display 72, una por pantalla). Etiqueta mínima 12,8; el
sello en Mono 11,2 mayúsculas sigue siendo la única talla por debajo.

### Reglas
1. **Sin tarjetas.** Se separa por tamaño (un titular abre bloque), por una línea de 1 px
   entre filas, por aire (24–28 px entre bloques) y, como mucho una vez por pantalla, por
   una **banda a sangre** del color de lo que trata.
2. **Cada dato tiene su casa:** entero donde se cambia, resumido en el resto.
3. **Un concepto, un dibujo** en toda la app.
4. **Se cuenta lo que falta**, siempre igual (`−12`, «faltan 62 g de proteína»).
5. **El estado se dice una vez:** forma o color, no además una palabra. Discontinuo =
   previsto; oro = récord.
6. **La unidad, en la cabecera**, una vez por columna.
7. **Dos sellos por pantalla** como mucho.
8. **Total o partes, no los dos:** el total a la vista, el desglose al tocar.

### Formas
Píldora para todo lo que se toca (botón principal 60 px de alto, secundario 48, mínimo
44); 12 px para muestras de categoría; discontinuo para lo previsto; banda a sangre para
lo importante. El stepper es la cifra sin caja, `−` en contorno y `+` relleno.

### Migración
**Piel primero, navegación después.** Los tokens y la tipografía cambiaron de golpe en toda
la app (2026-10-18). Lo demás —quitar tarjetas, bandas, tallas nuevas— va pantalla a
pantalla con las cinco pestañas de hoy. La barra flotante Hoy / Semana / Historial /
Progreso / Tú se decide al final, con las pantallas ya hechas. Pendiente también: la paleta
de músculos pastel con su versión honda (llega con Días y Progreso), el kit de marca
(`brand/`, aún en Space Grotesk) y los colores del widget nativo (APK).

| Pantalla | Marcador |
|---|---|
| Toda la app | tokens, Bricolage, récord en oro, comidas sin color (2026-10-18) |
| Comida | «Hoy» como titular de pantalla (Bricolage 800, 54 px = `3.375rem`, nuevo paso de la escala) con la fecha en sello a su derecha; cada comida, titular de fila (Bricolage 800, 1,4rem); lo previsto, discontinuo de 1,5 px sin fondo; «Lo comí» en Hueso (`--text` de relleno, `--bg` de letra), porque el único mandarina de la pantalla es «Añadir comida». También en «Sin decir». Toques: los mismos (2026-10-19) |

## Sistema v2 — Material tonal (desde 2026-10-02)
La app se usa como APK, y la piel heredada de la PWA no lo parecía: formularios con un
«Guardar» al pie, datos del servidor escritos en frases pequeñas en `--muted`, y ninguna
de las piezas que en Android dicen «esto se toca». El usuario eligió la dirección
«Material 3 tonal» entre tres maquetas. Este apartado **se suma** al documento: lo que no
dice aquí sigue igual (tres tipografías, una sola tinta de acento, Geist Mono para toda
cifra, la escala tipográfica, 44px de objetivo táctil, `NULL` se pinta `—`).

**Se migra pantalla a pantalla.** Una pantalla está en v2 o no lo está; no hay
interruptor viejo/nuevo, y durante unas semanas convivirán las dos pieles.

| Pantalla | Estado |
|---|---|
| Perfil | migrada (H1, 2026-10-02) |
| Comida | migrada (H2 y revisión semanal, 2026-10-02). La tarjeta de macros mantiene la proteína como cifra grande: decisión del usuario. Con objetivo son dos anillos (proteína fuera, 12 de trazo; kcal dentro, 7) con su leyenda al lado, e hidratos y grasa en barra de 6 px a pares debajo |
| Comida (v3, 2026-10-10) | Diario sin tarjetas: título «Hoy»/«Ayer»/día con la fecha en sello, tira de la semana en vez de flechas, resumen de macros sin caja, comidas como secciones a todo el ancho con el `+` en su banda, y lo planificado dentro de su comida en un recuadro discontinuo |
| Comida (v4, 2026-10-18) | Con plan y mientras cumples, sin anillos ni subtotales: la tira del día arriba (kcal por comida, P/H/G dentro, lo comido apagado). Fuera del plan, vuelven los anillos y la comida dice cuánto descuadra |
| Plan (2026-10-10) | Pestaña nueva: «Esta semana / La que viene» en control segmentado, la semana en tarjetas por día, la revisión y generar en la que viene |
| Plan v2 (2026-10-13) | «Esta semana» sólo para seguir: tira de siete días fija arriba (letra, número y «3/4» en mono; un día sin plan es «—»; la letra de hoy en `--accent-ink`) que salta a cada día, la semana entera debajo, «· Lo siguiente» en tinta en la próxima comida de hoy, y de cómo va sólo «Donde se cae es …» en tarjeta tonal. «La que viene» es el domingo: «¿Ya compraste? · Subir ticket» en tarjeta tonal arriba mientras la lista mandada a Taski espera su ticket, luego revisión, generar, lista de la compra, tus platos y, al pie, subir o pegar una pauta. Diseño y decisiones en `docs/designs/plan-tab.md` |
| Entreno (en curso, desde 2026-10-11) | Un ejercicio a la vez. **Los de hoy, en una tira de chips bajo la cabecera (2026-10-16):** punto del músculo, nombre y `1/3` (o `3 ✓` llegado a las de la última vez), el de pantalla con borde ámbar y velo tonal, un toque para ir a cualquiera; sólo con dos o más. El pie, pegado encima de la barra, guarda `Siguiente ›` (el siguiente sin empezar después del de pantalla), lo que sueles hacer, `Terminar entreno` y el buscador para añadir. La serie que toca: «N.ª serie» con la marca de la última vez y «A batir · … · una rep más». Peso y reps en fichas grandes rellenas con lo previsto. El descanso es un anillo en el centro con −15 s · Saltar · +15 s, y mientras corre las fichas se compactan. **Excepción a «una cifra Display por pantalla»:** sin descanso, las dos fichas llevan la cifra a tamaño Display (son lo que vas a registrar); descansando, sólo el anillo. Pack de diseño y decisiones en el lienzo «Fitit · Editar ejercicio». **Corregir una serie (2026-10-15):** tocar la fila la abre en su sitio con dos steppers en el orden de las fichas (kg \| reps), «+ Nota» y «Borrar serie»; sin «Guardar»: cerrar la fila (o abrir otra) guarda, y cerrarla sin cambios no manda nada. Lienzo «Fitit · Entreno: saltar entre ejercicios». **Terminar y nombrar (2026-10-15, alternativa C):** sin nombre puesto, el entreno se llama por sus dos músculos con más series («Pecho · Tríceps») con un sello `AUTO`, también en Días; tocar el título (o ⋯ › «Cambiar nombre») abre una hoja de un campo con tus nombres de otros días en chips, y cerrarla guarda (vacío = el automático). Empezar ya no pregunta el nombre. Con todo lo de hoy hecho, «Terminar entreno ✓» es el atajo principal del pie y lleva a Días. Lienzo «Terminar y nombrar entreno» |
| Días (historial, 2026-10-12) | La lista se pliega con la edad: esta semana, la anterior y la de tu último entreno enteras; el resto del mes y del anterior, una fila por semana (siete casillas lunes–domingo con el color del músculo principal del día) bajo el nombre del mes, que se queda fijo arriba al bajar; antes, una fila por mes y otra por año. Cada fila se abre en su sitio. Los músculos de una sesión son **diez celdas fijas** en orden canónico, encendidas según sus series (sustituyen a la raya y al «Pecho +2»); una semana cerrada lleva una vez, bajo su regla, las diez celdas con nombre y cifra — no la que está en curso. Cabecera, tira de la semana y botón flotante, pendientes |
| Progreso | fuera de esta tanda |

### Reglas nuevas
- **Un dato del servidor es una cifra, no una frase.** Si el backend devuelve un número,
  la pantalla lo pinta en Geist Mono a tamaño Data o mayor y en `--text`, y lo que lo
  explica va al lado como etiqueta. «ESTIMADO CON UNA FÓRMULA» en mono gris de 11px era
  el caso tipo: la procedencia es un **chip**, no un pie de foto.
- **Se edita en una hoja, no en un formulario.** Un ajuste es una fila (`ListRow`) con su
  valor a la derecha; tocarla abre una hoja con ese único campo, y cerrarla con
  «Guardar» lo guarda. Desaparecen los botones «Guardar mis datos» al pie de una tarjeta.
- **La acción principal de la pantalla es un botón flotante extendido** (`Fab`): icono +
  verbo, abajo a la derecha, encima de la barra de pestañas. Uno por pantalla como mucho.
  Sigue la regla de siempre —la acción va abajo, donde está el pulgar— con la forma que
  Android ya enseña a buscar.
- **Lo que se elige es un chip.** Una opción, un filtro, un día: `Chip`, con
  `aria-pressed` si es seleccionable. Un chip con `›` abre algo (la línea del plan).
- **Superficies tonales.** Además de *hero*, *raised* y *quiet*, hay `--surface-tonal`:
  la superficie con un 8 % de ámbar, para la tarjeta que pide una respuesta (la revisión
  semanal) y la cabecera de una pantalla (el peso en Perfil). El ámbar sigue siendo una
  sola tinta: aquí es un velo, no un color nuevo. Sobre ella el texto es `--text`.
- **Radios v2:** tarjeta 20px (`--radius-card`), hoja 24px arriba (`--radius-sheet`),
  chip y botón flotante 16px (`--radius-pill`). Las pantallas v1 conservan 8/6.

- **La barra de pestañas lleva iconos de trazo** (SVG en `currentColor`, 1,8 de
  trazo) dentro de una píldora de 56×30; la activa se marca llenando la píldora
  con el ámbar al 18 % y pasando la etiqueta a tinta. Sustituye a los glifos
  `▮▮ ↗ ◒ ◍`, que no tenían uno para Plan. Cinco pestañas: Días, Progreso,
  Comida, Plan, Perfil.
- **Elegir entre dos vistas de lo mismo es un control segmentado**, no dos chips:
  «Esta semana / La que viene» en Plan. Un chip sigue siendo una opción o un
  filtro suelto.

### Componentes (`frontend/src/ui/`)
Cuatro, porque son los que piden Comida y Perfil. Un componente nuevo entra aquí cuando
lo usan **dos** pantallas; antes vive en la suya.

| Componente | Qué es | Notas |
|---|---|---|
| `Sheet` | hoja inferior modal | Asa, título, `role="dialog"`, `aria-modal`. Se cierra con el velo y con Escape. Reutiliza `.sheet-scrim` / `.sheet` y les añade `.ui-sheet`. |
| `Fab` | botón flotante extendido | Icono + verbo. Fijo sobre la barra de pestañas, con el inset seguro. |
| `Chip` | opción, filtro o atajo | `aria-pressed` sólo si `selected` está definido; con `onClick` y sin `selected` es un atajo. |
| `ListRow` | fila de ajuste | Etiqueta (+ pista opcional) a la izquierda, valor en mono a la derecha, `›`. Es un `button` de 56px. |

## Motion
- **Approach:** minimal-functional. One expressive moment only: the PR.
- **Easing:** enter `ease-out` · exit `ease-in` · move `ease-in-out`.
- **Duration:** micro 80ms · short 150ms · medium 250ms · long 400ms.
- **PR celebration:** amber pulse + count-up on the number (~400ms). Everything else is
  instant and quiet — the user is mid-workout.
- **Respect `prefers-reduced-motion`:** drop the PR animation to a static state.
- **Third exception, Ritmo (2026-10-12):** opening a muscle drops its last session in and
  fills its calendar week by week, its days popping in. Same rule: off under
  `prefers-reduced-motion`.
- **Second exception, Series por músculo (2026-10-11):** opening its ten rows grows each
  bar from zero (400 ms `ease-out`, 30 ms between rows). The growth is the reading — which
  bars stop short of their rule — not decoration. Off under `prefers-reduced-motion`.

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
| 2026-10-18 | Marcador: paleta, Bricolage, récord en oro y comidas sin color en toda la app | Usuario, «Ponte con la UI», y en cuatro preguntas: piel primero y navegación después, Bricolage Grotesque en vez de Space Grotesk, comidas sin color (el color es de los músculos) y récord en oro (`#FFC53D` / `#8A5A00`) para que el mandarina sea sólo la acción. Los tokens cambian en un PR; la quita de tarjetas, pantalla a pantalla. |
| 2026-10-18 | Días cuidados: un punto en la franja de Comida y una tarjeta en Progreso → Ritmo | Épica de cuatro comidas, fase 7: la cifra norte. Un día cuenta si dijiste lo que comiste (diario o comida del plan contestada) o entrenaste (al menos una serie). En la franja de la semana de Comida, un punto de 6 px bajo el número del día cuidado, en `currentColor` (sigue la tinta del día, también el elegido); no una segunda fila de cuadros: un concepto, un dibujo. Accesible como descripción («Día cuidado»), no en el nombre del botón. En Progreso → Ritmo, arriba, la tarjeta `Días cuidados` con `47 de 56` en Mono 1,6rem y `días cuidados en 8 semanas`, y cinco barras por mes (la del mes en curso en `--text`, las demás al 25 %) con su cifra encima. Nunca racha: ni «seguidos» ni nada que se rompa. |
| 2026-10-18 | Plan → Cambiar este plato: barra de tres tramos, ideas para esa comida y «Aquí no» | Épica de cuatro comidas, fase 6. Bajo lo propuesto, una barra de 12 px en tres tramos (proteína `--text`, hidrato `--carbs`, grasa `--text` al 35 %) por kcal, con sus gramos debajo en Mono (el del hidrato en `--carbs-ink`); sin una de las tres cifras no se dibuja. Botón secundario `Ideas para el desayuno` (artículo por comida): pide tres a la IA con la comida como dato; vuelven bajo el sello `Propuesta`, cada una con sus ingredientes, una barra fina de 6 px y `Elegir` (primario, 1 toque: cambia el plato del día) y `Aquí no` (enlace). `Aquí no` se sustituye en su sitio por `No volverá en desayunos.` con `Deshacer`. «No en desayunos» pasa a usar el mismo «Aquí no», que se recuerda para el modelo. Sin nada que proponer, la frase de siempre de las propuestas (cuota, sin despensa…). No hay etiqueta «IA»: la idea se juzga por si encaja, no por quién la hizo. |
| 2026-10-18 | Comida v4: sin cifras mientras cumples, tira del día y coral para el hidrato | Épica de cuatro comidas, fase 3; el usuario eligió las dos cosas («Ocultar si cumples», «Coral nuevo para hidrato»). Con plan, mientras lo apuntado es lo del plan (comida dicha `done` con su plato, o fuera confirmada), Comida no pinta los dos anillos ni la línea de cierre ni el subtotal de cada comida: arriba va la **tira del día**, cuatro columnas cuyo ancho son las kcal de cada comida del plan y, dentro, proteína (`--text`), hidrato (`--carbs`) y grasa (`--text` al 35 %) apilados por kcal, con lo comido al 40 % de opacidad. La única cifra de la tira es el hidrato que movió el entreno (`+40 g` en `--carbs-ink`, `−40 g` en `--muted`). Lo apuntado fuera del plan devuelve los anillos y dice en su comida `Fuera del plan · +150 kcal` (raya si no hay kcal medidas). Dentro de la comida planificada, `+40 g de hidrato · por el entreno`. Sin plan, nada cambia. **Token nuevo**, única desviación: `--carbs` (#f08a68 claro / #ff9b7a oscuro) y `--carbs-ink` (#b04a25 claro, 4,88 sobre papel / #ff9b7a oscuro). Contradice a propósito la decisión del 2026-10-02 de anillos siempre visibles: el usuario aprobó en la exploración «Fitit sin tarjetas» quitar las cifras siempre visibles. |
| 2026-10-12 | Evolución: la línea de cada sesión, con los récords en anillo, sustituye a la escalera de récords | Layout de la C del lienzo: el nombre en grande, `Serie más pesada` como cifra del día (`85` + `kg × 5`, `+5 kg desde julio` en `--pr`), una línea en tinta por la serie más pesada de **cada sesión** con anillos `--pr` sólo en los récords, tres cifras (`Récords · Sesiones · Desde la última`) y `Marcas` escritas. La regla del 2026-07-26 sigue en pie: nada interpolado ni 1RM estimado — cada punto es un día que lo hiciste y una bajada es un día que levantaste menos, que es justo lo que la escalera escondía. |
| 2026-10-12 | Progreso en pestañas (`Series · Ritmo · Evolución`); Ritmo pasa a una frase por músculo que se abre en su última sesión y su calendario | Usuario, iterando en el lienzo: de tres maquetas de layout eligió las pestañas, una tarjeta por vista, para que la que vienes a mirar tenga la pantalla para ella. Ritmo era una cuadrícula de 28 días por fila que necesitaba leyenda; tras probar cuadrícula afinada, línea de tiempo, marcas por semana y tabla resaltada, el usuario se quedó con lo más intuitivo: `Core · 1 vez en 4 semanas · hace 11 días`, ordenado por lo más olvidado y en tinta lo que pasa de una semana. Cada fila se abre (una cada vez) en `Última vez · sáb 10 oct` con sus ejercicios y series, y en un calendario `L M X J V S D` de las 4 semanas con sus días en su color; la entrada del detalle se anima (tercera excepción de Motion, apagada con «reducir movimiento»). Los títulos de tarjeta quedan sólo para lectores de pantalla: la pestaña ya los dice. Toques: Series, 0; Ritmo y Evolución, 1 (antes, desplazarse); detalle de un músculo, +1. |
| 2026-10-11 | Series por músculo: la respuesta arriba, los diez músculos plegados y en series reales; la descarga pasa a Perfil | Usuario, iterando la tarjeta en el lienzo: la franja normalizada era la misma en las diez filas *"y al usuario no le aporta nada"*. Ahora arriba va la cifra `6 /10 EN ZONA` con un medidor de una celda por músculo, y debajo sólo lo que pide algo, en bloques con raya de tinta: `PENDIENTE` (gris mientras la semana corre) o `CERRÓ BAJO ZONA` (tinta), y `POR ENCIMA DEL MÁXIMO`; máximo tres por bloque y «y N más». `Ver los 10 músculos` despliega un *bullet graph* (Few) sobre un eje común en series reales: la zona de cada músculo en su sitio como fondo gris, una raya en el mínimo —no en el máximo: un techo no es una meta— y sin raya si el mínimo es 0; la barra desde 0, gris en zona y tinta fuera. Un marco vacío como zona se probó y se descartó: Core a cero parecía una deuda. Los rótulos van bajo el nombre porque al final de una barra larga no caben. La descarga se marcaba con un botón al pie de la tarjeta, que se lee a diario, para algo de una semana de cada seis u ocho: pasa a Perfil → Entreno, sólo la semana en curso, y la tarjeta lo dice en su cifra (`en objetivo de descarga`) y en su texto (`Se cambia en Perfil.`). Toques: ver lo pendiente, 0 (antes había que leer diez filas); ver los diez, +1; marcar la descarga, de 1 a 2 (pestaña Perfil + `Sí`). |
| 2026-10-11 | Tema elegible en Perfil → Apariencia: `Sistema` / `Claro` / `Oscuro` | Petición del usuario. Hasta hoy lo decidía sólo el teléfono, y quien lo tiene en claro no podía tener la app en oscuro en el gimnasio. Mismo control segmentado que Descanso y Pantalla activa, en sección propia al final, antes de `Salir`. La hoja deja de mirar `prefers-color-scheme` y pasa a mirar `<html data-theme>` (una sola fuente; los tokens oscuros no se duplican); un script en línea en `index.html` lo fija antes del primer pintado para que no haya fogonazo claro. Las reglas sueltas por tema van con `:where(...)` para no ganar especificidad: `.card.is-folded` tiene que seguir ganando al `.card` oscuro, como cuando vivían en la media query. La barra del navegador (`theme-color`) sigue al tema elegido. |
| 2026-10-10 | Plan sale de Comida a su pestaña; Comida pasa a diario sin tarjetas | Usuario: *"se mezclan funcionalidades… el plan y el registro"*. Eligió en el lienzo de diseño la separación y, con los cambios ya dibujados, *"todo de golpe"*: pestaña Plan (Esta semana / La que viene, con revisión, generar, lista y tus platos), lo planificado de hoy dentro de su comida con los tres botones de siempre (descartó el círculo + ⋯), botón flotante para añadir (descartó la búsqueda fija abajo), tira de la semana, título del día, resumen sin caja e iconos de trazo en las pestañas. La banda de cada comida sube del 20 al 24 % porque ahora se mide contra el fondo y no contra la tarjeta. |
| 2026-10-04 | Widgets 0.19.0: el 4×2 se lee como la serie, pestañas con nombre y anillos de reloj | Encargo del usuario con la maqueta cerrada. **4×2:** tres partes (nombre; tiempo en 40sp con los aros; fila de dos marcos `32,5 kg` `× 12` y `+1` de 56): el bloque apilado decía `12 reps` y se leía como un formulario; la fila se lee como la serie. El valor va **encima** de las zonas de 44, no entre ellas, porque entre dos zonas no cabía `32,5 kg` en un marco de 129 dp. **Compacto por ancho también** (< 300 dp): la fila no cabe en un 3×2, que se queda con el bloque apilado (con las leyendas nuevas) y el tiempo en la línea del nombre; hasta ahora el compacto era sólo por alto. **Sin entreno:** pestañas `Pasos` `Comida` `Entreno` en vez de puntitos, recordadas por nombre (por posición, al aparecer «Pasos» por la mañana quien miraba Entreno caía en Comida). **Comida:** anillos de 20 dp al estilo de un reloj, cada cifra una vez; en el 3×2 se quitan ` G` y ` KCAL` porque si no el anillo se quedaba en 73 dp. **Entreno:** días desde el último con la franja del color de su grupo; con dos grupos que no caben se nombra el principal. Colores de grupo nuevos en el widget, sólo para marcar. **Notificación:** cerrada a 30sp con la serie en tinta; desplegada como el 4×2 sin Terminar, conservando la línea del ejercicio (abrir la app). La barra del 4×1 se queda con su radio propio a la izquierda en vez de recortarla con el fondo: se ve igual (un rectángulo recortado por la esquina del fondo es eso mismo) y no depende de que el launcher recorte (`android:clipToOutline` sólo existe desde Android 12). |
| 2026-10-04 | La cuenta atrás se cuenta con toques cortos | Pedido del usuario: en la 0.16.0 (pi, pii, piiii) *"el tercero largo no sale"*. No se encontró la causa sin el teléfono conectado, y de las alternativas eligió contar con toques: tres en el 3, dos en el 2, uno en el 1 y uno largo en el cero. Dice cuánto queda sin mirar y sólo depende de toques cortos, que son los que llegan; el único largo, el del cero, es más corto que antes (500 ms frente a 800). |
| 2026-10-04 | El cuerpo de la notificación no abre la app, y −/+ seguidos se pintan una vez | Problema del usuario: con el móvil bloqueado, tocar varias veces −/+ en la notificación desplegada pedía el código. Los botones son broadcasts (no piden desbloquear), pero el cuerpo tenía un `contentIntent` de actividad: cada toque repintaba la tarjeta, y uno que caía mientras tanto (o con la tarjeta ya cerrada por HyperOS) llegaba al cuerpo. Se quita el `contentIntent` y abrir Fitit pasa a ser un toque concreto, la línea del ejercicio; se pierde «tocar en cualquier sitio abre la app», que es justo lo que pedía el código. Además, los ajustes se pintan agrupados (300 ms tras el último) para que haya menos repintados que pisar; el `+1` no se agrupa porque registra. |
| 2026-10-04 | −/+ de 52 dp y 6 dp entre el + de los kilos y el +1 | Mismo encargo: toques más grandes en el bloque, y cerrar el riesgo apuntado en «El bloque de ajuste». En el 3×2 compacto del Xiaomi (≈253 dp) las zonas se quedan en 44, medido: a 52 un `102,5 kg` pisaba el `−`. |
| 2026-10-04 | El 4×1: el descanso se vacía | Opción 2a de la maqueta, elegida por el usuario: el fondo del 4×1 es lo que queda de descanso. Un widget no anima nada salvo el cronómetro, así que la barra se repinta cada 5 s, con alarma inexacta y sin despertar al teléfono (con la pantalla apagada nadie la mira), y nunca con el descanso acabado, en pausa o sin el 4×1 puesto. |
| 2026-10-04 | El fin del descanso vibra 3, 2, 1 y el cero | Pedido del usuario: *"vibre en los tres segundos anteriores… 3, 2, 1, por cada segundo"*. Una sola notificación con un patrón que cubre los cuatro pulsos, y no cuatro avisos: Android suaviza los avisos seguidos de una app (Android 15+), y el del cero, el que importa, sería el más callado. El patrón es del canal, así que es fijo y no se adapta a una alarma tardía: por eso medio segundo tarde no vibra. El canal de dos pulsos de la 0.10.8 se retira (Android no deja cambiar el patrón de un canal), con lo que quien lo hubiera apagado lo vuelve a tener encendido una vez. |
| 2026-10-04 | Pausar el descanso desde el widget | Pedido del usuario: *"añadir un botón al widget para pausar el descanso"*. Eligió él el sitio (sólo el 4×2 y el 3×2: el 4×1 no tiene hueco), qué hace `+1` en pausa (registra y empieza uno nuevo, corriendo) y cómo se ve (el tiempo quieto en `--muted`, y Entreno con `Reanudar`). Es un aro gemelo del de Terminar y no un botón con texto: la fila ya tiene un aro y la regla de «un solo ámbar» deja fuera el relleno; en `--border-strong` porque no es destructivo. Va a la izquierda de Terminar, no junto al tiempo, para no cambiar el alto de la franja del reloj (11 dp arriba y abajo, medidos). Riesgo aceptado: dos aros juntos, uno rojo; si un toque desviado termina el entreno, se separan. |
| 2026-10-02 | Glúteo sale de Femoral: diez grupos, y la paleta pasa de 9 a 10 | Reversión explícita de «nueve es el techo» (2026-08-01), aprobada por el usuario. Femoral juntaba isquios y glúteo con el argumento de que las bisagras que entrenan uno entrenan el otro, y eso es cierto de las bisagras y falso de todo lo demás: la sentadilla hace crecer el glúteo y apenas los isquios (Kubo et al. 2019), así que cada sentadilla pagaba su media serie al único músculo de la pierna que no trabaja, y un hip thrust y un curl femoral caían en la misma fila. Ahora: hip thrust, puente, patada de glúteo y **abductor** (que hasta hoy no tenía grupo) son Glúteo; la bisagra sigue en Femoral y paga ½ a Glúteo; sentadilla, prensa y zancada pagan ½ a Glúteo en vez de a Femoral; el peso muerto paga ½ a cada uno. Banda RP de glúteo tal cual: mínimo 0, máximo 12, así que la fila, como Core, nunca dice «faltan». El color es un cobre (`#a16336` oscuro / `#7d3f17` claro), insertado entre Cuádriceps y Femoral para que la pierna siga junta. La rueda ya estaba llena y no había sitio para un tono vivo: es el único hueco que pasa el validador en los dos modos sin añadir un WARN de contraste, y en oscuro queda a ΔE 15,2 de Cuádriceps (suelo 15), el par adyacente más justo de la paleta en visión normal. Revalidado en las cuatro superficies; el peor par CVD no cambia. |
| 2026-10-02 | La vibración del fin del descanso la pone la tarjeta | Corrige la 0.10.7, que no vibraba en el Xiaomi: la vibración directa desde la alarma, con el teléfono bloqueado, se descarta. La de una notificación sí llega (se vio en la 0.10.6). Así que vibra la tarjeta que ya está, repintada una vez en un canal hermano que vibra, y no se añade ninguna notificación. De paso vuelve el interruptor en Ajustes, que la 0.10.7 había perdido. |
| 2026-10-02 | El fin del descanso sólo vibra | Corrige la del día anterior tras usarla: el usuario lleva el móvil en vibración y lo que le servía era la vibración; el aviso `Descanso terminado` era una segunda notificación para decir lo que la tarjeta ya dice al pasar a positivo. Se quitan el aviso y su canal, y el teléfono vibra directamente, como alarma (`USAGE_ALARM`), porque con la pantalla bloqueada Android ignora las demás vibraciones de una app en segundo plano. Se renuncia al interruptor del canal en Ajustes: no hay canal que apagar. Si alguien quiere callarlo, la respuesta hoy es `Descanso: Sin`. |
| 2026-10-01 | El fin del descanso suena, en un canal propio | Pedido por el usuario para el APK, y reabre el «ni sonido ni vibración» del 2026-09-25 sólo para ese momento. No se le pone sonido a la tarjeta: se reescribe con cada serie y tiene que seguir muda, y Android no deja cambiar el sonido de un canal ya creado. Es una notificación aparte, en `fitit_fin_descanso`, que se quita sola; callarla es apagar ese canal en Ajustes, la misma regla del 2026-07-25 (la preferencia de silencio vive en el canal, no en un interruptor). Y una salvedad que es de producto, no técnica: la alarma sigue siendo inexacta, y **si llega más de 60 s tarde no suena** — un pitido a destiempo da la hora equivocada, peor que no darla. |
| 2026-09-17 | Color por comida, y un solo borde izquierdo por tarjeta | **Segunda excepción categórica**, aprobada por el usuario: las cuatro comidas llevan tono propio (`--slot-*`, cuatro matices en oklch a igual L y C) para poder barrer la lista sin leerla. La frontera es que el tono sea **marca y nunca dato** —velo de la banda del nombre al 20 %, punto de 7 px y filete; ni una cifra, ni una barra, ni el héroe—, y de ahí sale que su suelo de contraste sea 3:1 y no 4,5. No es una rebaja: se barrió L y C en los dos temas y **no hay ninguna luminosidad que pase AA como texto y siga por debajo del ámbar**, así que teñir el subtotal habría costado un segundo acento. La paleta suspende a propósito la validación de daltonismo —Comida y Cena son el mismo color con deuteranopia— porque el nombre va escrito al lado y el tono no identifica; es la diferencia con «Color por músculo», cuyos dots sí viajan solos y por eso van escalonados. El montón «Sin asignar» se queda sin tono y sin `data-slot`: no es una comida que elegiste. **Y el alineamiento:** la fila de un alimento heredaba el `padding: .55rem .2rem` de `.link-row`, de cuando vivía suelta sobre la página, así que dentro de una tarjeta había tres sangrías —cabecera y «+ Añadir» a 1rem del canto, el nombre del alimento a 0,2rem— y la que se quedaba fuera era justo la columna que se barre. `padding-inline: 1rem` y las tres coinciden; el vertical no se toca, que lo gobierna el objetivo de 44 px. `comida.browser-test.jsx` mide las dos cosas sobre el color realmente pintado y sobre la caja realmente maquetada: que el velo se ve (>1,18 contra el cuerpo de la tarjeta) sin leerse como otra superficie (<1,6), que el punto pasa 3:1 y se queda por debajo de `--accent-ink`, que el rótulo sigue pasando AA sobre su propio velo, y que la tarjeta tiene un solo borde izquierdo. |
| 2026-08-31 | Tercera pestaña: `Comida`, y una raya que no es un cero | La app pasa de dos pantallas a tres. `Comida` entra en la barra inferior con caption a Label como las otras dos (56px de `min-height`, la barra no crece) y el isotipo `◒` en mono — se probó `◗`, que a 1rem se pinta como una astilla y no se ve. La pantalla es un instrumento como Progreso: total del día en display mono sobre la superficie *hero* (es lo que la pantalla mide), cuatro macros en rejilla con rótulo Micro, y sello de fecha mono entre dos pasos de día. **La decisión propia de esta pantalla es la raya.** Un nutriente que nadie ha medido vale `null`, no `0`, y en pantalla se imprime `—` **con la tinta de una cifra, no con `--muted`**: en muted se lee como «aquí no hay nada», que es lo contrario de lo que dice. Y como una raya sola sigue siendo ambigua, la tarjeta lleva pie: `— no es cero: 1 entrada sin fibra.` — que además señala cuántas entradas hay que corregir para que aparezca el número. `comida.browser-test.jsx` mide las dos mitades que jsdom no puede: que la raya se pinta con el mismo color y la misma altura de línea que la cifra de al lado, y que el pie pasa AA (4,5) en los dos temas sobre el color realmente pintado. La CTA `Añadir alimento` va al pie de la lista y **no** fija como la de Días: allí es `Continuar entreno` y la quieres a mano a mitad de sesión; aquí registras al terminar de comer, y una barra fija gasta 60px permanentes por un gesto que no interrumpe nada. Y `.comida` reserva 7rem de pie sobre las 4,5rem de `.container`: los paneles se abren al final de la lista, así que sin ese recorrido «Crear …» y «Cancelar» quedaban 24px debajo de la barra justo cuando hacen falta — medido, no estimado. |
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
| 2026-07-24 | Direct manipulation: tapping a thing edits it | User: *"puedo ahorrarme acciones de botones pulsando en los campos para editar directamente… y así con todo"*. The per-row `⋯` only ever held `Editar` and `Borrar` — a menu standing between the user and the row they had already pointed at, plus a permanent control on every row. Editing a set goes 2 taps → 1, `Borrar` moves inside the editor it belongs to, and the row gets its width back. Same for the workout title. (The chart title did too until 2026-08-20, when `Editar ejercicio` became the single door onto the exercise: tapping the title no longer renames.) Exercise card headers are the documented exception: that surface belongs to the fold. Also fixes a regression from the Progreso reorder — folding the corrections had taken the exercise name with them, leaving the chart card untitled. |
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
| 2026-08-01 | Series por músculo abre Progreso; el día se desglosa; la semana en curso se marca | Four changes, one idea: the weekly set count is the KPI and it was the hardest number on the app to reach. (1) The period summary moves from the foot of Progreso to the top — it was under the calendar, the ladder and the picker, three scrolls down on a phone, which is where you put something you don't expect to be read. (2) A Días session row stops being `nombre · ●● · 12 series` and becomes the same line over a per-muscle breakdown (`Pecho 6 · Tríceps 4 · Hombro 2`): the dots said *which* groups were touched and nothing about how much, so six sets of chest and one warm-up of shoulders drew the same mark as a real push session. Cardio and untagged sets keep their own entries, because the parts have to add up to the total on the row above. (3) The heatmap marks the column you are in with a 10% accent wash and its date in `--accent-ink` — today's cell was already outlined, but a 21px square cannot say which of ten weeks it belongs to, and the column *is* the unit. (4) The folded exercise digest drops "hoy" (`3 series · tope 80 kg × 8`): every card on that screen belongs to the session you are looking at, so the word separated nothing, and on a reopened or backfilled day it named the wrong one. It stays on the open card's set-list header, where its job is separating today's sets from the `Última vez` marks directly above them. |
| 2026-08-01 | Cada fila de series por músculo dice su banda, y lo que falta para la siguiente | The bar drew the reference — a tick at 10, full at 20 — but reading it meant decoding two tick positions against a fill, and every figure on the row was one you had already done. Each row now carries a state line under its bar: `en zona` (10–20), `sobre la zona` (>20), and when it is short, the gap rather than the total — `+4 a la zona`, `+2 al mínimo`. The gap is the only number here you can act on in the next session, and a muscle holding at zero finally says something (`+4 al mínimo`) instead of just drawing an empty bar. Stated in whatever unit the row prints, so a month's weekly average gets `+2.1 al mínimo` and not a monthly total measured against a weekly reference. No colour on it — a gap is neither a record nor a destructive act — so the rows with something owed are lifted to ink and the settled ones stay muted, the same hierarchy-not-colour rule the folded digest follows. It rides *inside* the bar's own column rather than on a second full-width line: a 8px bar in a row sized by its 0.8rem name has the slack, so nine rows cost ~45px instead of ~126. Nothing above 20 is called a peak or an excess — the research says returns fall off past the zone, not that more is wrong. |
| 2026-08-01 | Pierna se parte en Cuádriceps / Femoral / Gemelo, y la paleta pasa de 7 a 9 | Explicit reversal of the 2026-07-19 "keep it to these 7", approved by the user. The weekly-set reference needs a per-muscle number to mean something, and one "Pierna" bucket held squats, leg curls and calf raises at once: *Pierna 20 series* could be twenty sets of squats with the calves untouched — a figure you cannot hold against a reference and learn anything from. Glutes ride with the hamstrings under Femoral rather than taking a tenth slot, because the hinges that train one train the other and ten categorical hues stop separating cleanly. Two new hues (violet `#8046c8`/`#8b4bc0`, teal `#0093a8`/`#0089a0`); the old Pierna pink stays on Cuádriceps so the largest slice of existing history keeps its colour. Re-validated on the adjacent pairlist in both modes: all checks pass. |
| 2026-08-04 | El heatmap deja de ser un calendario: una fila por músculo, marcas binarias, ordenadas por abandono | User: *"importante también que la información que muestre en el heatmap y en la card de progreso no se solape"*. Las dos tarjetas codificaban la misma variable — series por músculo — y en la duplicada el resumen de periodo gana de calle: dice el número exacto, el objetivo y el delta, mientras la rejilla lo decía con opacidad, que no distingue 3 series de 6. Con el volumen fuera, los nueve tonos tenían que cargar solos con la identidad del músculo, lo que exige una leyenda de nueve chips que no cabe en una tarjeta de móvil (855px de scroll en 447 visibles, "Gemelo" cortado en el borde). La leyenda desbordada era el síntoma; la codificación, la causa. La dimensión categórica se va al eje Y, donde las etiquetas son gratis: una fila por músculo con su nombre en tinta, un día por columna. El color se queda (decisión del usuario) pero deja de ser portante — cabalga sobre una marca junto al nombre al que pertenece, que es exactamente el alcance para el que se aprobó la paleta. Las marcas son binarias porque "cuánto" es la dimensión de la otra tarjeta y decirlo dos veces es como acaban discrepando. Lo que queda es frecuencia, leída como densidad a lo largo de una fila, y el hueco al final de una — así que las filas se ordenan por ese hueco, el más largo arriba, y "qué entreno hoy" lo contesta el orden en vez de otro control. El track es de columnas `1fr`, no de celdas fijas: la ventana son semanas enteras cortadas en hoy (22–28 días según el día de la semana), y así llena el ancho de la tarjeta cualquiera que sea. Se van con ello la leyenda-filtro, la celda partida en diagonal, la rampa de opacidad `heat-v1..4` y el readout al tocar (el desglose por día ya vive en Días). Se queda intacto el subtítulo del resumen (`N entrenos · N series · 2 de 7 días`): con la rejilla ya no contando sesiones, `entrenos` no duplica nada, y `2 de 7 días` es el denominador de los números de su propia tarjeta, no una métrica de ritmo. |
| 2026-08-03 | El calendario empieza en tu primera semana entrenada, y se alinea a la izquierda | "Qué has entrenado" drew ten columns whether or not there was anything in them, so on a log that starts in July the card spent seven of its ten columns — most of its width on a phone — on weeks that predate the first workout. Ten weeks becomes a ceiling instead of a count: the leading run of untrained columns goes, the rest stays. Only the leading run, because a gap *between* two trained weeks is the answer to "did I skip one?", and closing it would sit non-adjacent weeks side by side while the hint under the grid still promises one column per week. An empty log keeps the current week alone — its today cell is the one you can still fill, and a card with no columns says nothing. The trim exposed a latent alignment bug: `.heat-cal` was `justify-content: center`, which cost nothing while the grid was always ten columns wide and filled the card, but floated a short grid into the middle of a card whose title, chips and hint are all flush left — opening a gutter where the weekday labels belong. Now `flex-start`. Centring a box of variable width against fixed left-aligned neighbours was the bug; the width was not. |
| 2026-08-04 | El entreno abre diciendo qué músculo sigue reciente, y "Última vez" fecha el día que entrenaste | Dos cambios sobre la misma pregunta: cuándo pasó esto. (1) Al abrir una sesión, una línea apagada sobre el formulario de añadir: `Entrenado hoy: Pecho · ayer: Femoral, Cuádriceps`. Va antes del formulario porque el momento de saberlo es antes de elegir qué añadir, no después. Sin color, sin icono y sin card — informa, no dictamina, la misma postura que toma la semana en curso; el ámbar sigue siendo de CTA y PR. Ausente del todo cuando no hay nada que decir, que es la mayoría de sesiones: un "todo recuperado" sería ruido en el sitio donde van los ejercicios. Agrupada por día en vez de por músculo, o una línea con todo de ayer repetiría la palabra por cada grupo. (2) La etiqueta `Última vez · hace 3 días` salía de `sets[0].created_at`, que es cuándo se escribió la fila, mientras el backend elegía esa sesión por `Day.date`. Coincidían mientras se registrara en el momento y se separaban en cuanto no. Contra datos reales el desfase era de 4 series sobre 277, todas de un día: latente, no visible, pero silencioso. `PreviousMarks` trae ahora `last_date`, el día del mismo `Day` con el que se eligió la sesión. La ventana de recuperación se define en días ("hoy o ayer") y no en horas por lo mismo: las 48 h de la evidencia son una aproximación, y calcularlas desde `created_at` habría comprado precisión falsa a cambio de un fallo silencioso cuando registras una sesión a posteriori. |
| 2026-08-05 | RPE se va, la nota sube al ejercicio, y `Corregir` pasa a ser `Editar ejercicio` | Usuario: *"los campos de RPE y Nota así como el de Corregir son poco útiles… el usuario apenas los ve y realmente no se usan"*. Los datos de producción lo confirman antes que ninguna opinión: sobre 277 series, **1** lleva RPE y **6** llevan nota. Y el RPE no alimentaba nada — se guardaba y ahí moría; `deload.js`, la barra de progreso y las marcas no lo miran. Un campo que nadie rellena y nada lee no es opcional, es peso muerto detrás de un desplegable. Fuera del formulario, fuera de la fila de serie, fuera del editor: la columna se queda en la BD y el CSV la sigue exportando, que es donde el único RPE histórico tiene sentido. La nota es otro caso: lo que la gente escribiría —el agarre, la altura del banco, el hombro que molesta— es verdad del ejercicio y no de una serie, así que escrita por serie desaparecía en el log de la semana siguiente. Sube a `exercises.note`, se muestra bajo el nombre en la tarjeta abierta, y se edita desde el mismo pliegue que corrige el músculo. Eso obliga a un desvío sobre el plan: `Corregir` iba a mostrarse solo en ejercicios sin clasificar, pero ahora es la única puerta a la nota, así que se queda siempre y se renombra `Editar ejercicio`, que es lo que hace. El saldo en pantalla es un control menos, no dos: la tarjeta abierta pierde la fila `+ RPE y nota` entera. La nota puntual sobrevive dentro del editor de la serie, que se abre tocando la serie de la que habla. |
| 2026-08-10 | La fila del día pierde el chevron: el borde derecho es sólo `⟳` | Desviación deliberada de la maqueta del handoff, que dibujaba `⟳ ›`. Medido en producción: el `›` era un `<span>` de 9×20 **fuera** del `<button>` de la fila, pegado a cero píxeles del `⟳` de 36×44. O sea, el único glifo que decía "entra por aquí" era la única zona muerta de la fila —nada al tocarla, la hoja de borrar al mantenerla— y fallar unos píxeles hacia la izquierda registraba un entreno. Una maqueta estática no puede enseñar eso: dibuja los dos glifos y ambos parecen controles. Quitarlo no cuesta función, sólo la pista de que la fila lleva a algún sitio, y **todas** las filas de esta lista llevan a algún sitio: la pista es redundante tras el primer uso, y quien contesta al dedo es el velo de `:active` — el mismo trato que este documento ya aceptó para las filas tocables de serie. El borde derecho pasa a tener un significado y uno solo. Con ello, la columna del `⟳` se reserva también donde no hay botón (`.day-repeat-empty`): sin el hueco, la fila de la sesión en curso se estiraba 48px más a la derecha que las demás y su contador se salía de una columna de cifras tabulares alineadas a la derecha, que es justo para lo que se ponen en mono. |
| 2026-08-08 | Días se lee como una semana de entrenamiento: 8 cambios del handoff de rediseño | Implementación de `design_handoff_dias_redesign`, sobre el cambio de la fila del día del mismo día. La pantalla estaba disciplinada pero le faltaba *estructura por encima de la fila*: nada decía en qué semana estabas, nada mostraba los días saltados, y la altura de cada fila dependía de cuántos grupos tocó, así que la lista no tenía ritmo que escanear. (1) Regla de semana con totales (`ESTA SEMANA · 3 DÍAS · 50 SERIES`), calculada en cliente sobre lo que ya devuelve `listDays()`; semana ISO lunes–domingo. (2) `HOY` se va: tres señales para un hecho, y el chip añadía una tercera línea al gutter. Quedan el filete —ahora `2px solid var(--accent)`— y la fecha en tinta; la atención liberada va a `● EN CURSO`, el único estado que la lista no sabía expresar, en el hueco de la duración. (3) Marcadores de descanso, ámbar discontinuo, sólo en la semana en curso. (4) El desglose pasa a *seam* proporcional de 56×4px: mismo dato, altura constante, y el color sigue cabalgando una marca. Cardio va rayado en `--muted` porque no es un músculo. (5) Un solo CTA (`Continuar entreno`, sin el nombre de la sesión, que ya lo dice la fila) y `Anotar otra fecha` como enlace quieto; el formulario de retro-fecha pasa a hoja inferior en vez de desplegarse sobre la lista. (6) `Repetir` sube a la fila como `⟳` de 44px y el `⋯` desaparece con su tercera columna; `Borrar día` pasa a pulsación larga, conservando los dos toques. (7) El filete de día sube a `color-mix(text 17%)` — a `--border` pesaba lo mismo que la línea entre dos series de un mismo ejercicio — y el sello de fecha parte tinta/apagado. (8) `Salir` de 13.6px `--muted` a 15px `--text` con área táctil de 44px: lo silencioso había llegado a ilegible, en la esquina más difícil de alcanzar con una mano. Dos añadidos de formato: `sessionMinutes` imprime `58′` / `64′` (minutos totales con primo) porque una columna de duraciones tiene que mantener un ancho y seguir siendo un número — `1h 05` se queda en la cabecera de la sesión, donde hay una sola; y `20 series` pasa a `20 SER`, porque la palabra repetida en cada fila era ruido. Tres defectos encontrados al verificarlo en el navegador y no en los tests: `.sets li` trae `flex-wrap: wrap` y `.link-row` es `width: 100%`, así que `⟳` y `›` caían a una segunda línea bajo cada día; anular `.link-row::after` empataba en especificidad y perdía por orden, dibujando dos chevrones; y `.sheet-item` no estaba en la lista de exclusión de `button:hover`, así que `Borrar día` se rellenaba de ámbar con el texto en rojo encima — tercera vez que esa lista hay que ampliarla para un botón fantasma nuevo. |
| 2026-08-10 | Una semana sin nada dentro no dibuja filas: dice lo que es y entrega el cierre de la anterior | Estado real de la cuenta un lunes por la mañana, que es uno de cada siete días. Con la semana a cero la tarjeta seguía dibujando las nueve filas —un músculo callado conserva su fila— y cada una imprimía toda su banda como déficit: `faltan 8`, `faltan 10`, `faltan 4`… nueve reproches sobre una semana que nadie ha vivido, justo lo que la entrada del 2026-08-05 prohíbe (*"nunca mientras la semana corre"*). Pero la alternativa obvia —no decir nada— es el otro fallo, y es el que estaba desplegado: la pantalla que existe para medir la semana no mencionaba la semana en la que estás. Así que las filas se van y en su hueco van tres frases, la primera en tinta: `La semana aún no tiene series.` Debajo, lo único que hay en pantalla que es real y definitivo — el cierre de la semana pasada (`La pasada cerró con 44 series en 4 entrenos.`) y qué músculos terminaron por debajo de su banda, con su punto de color al lado (`Cerraron bajo su zona ● Cuádriceps ● Gemelo`, las cuatro mayores y `y N más`). Esos dos son la respuesta a "qué toca hoy" y están dichos en la moneda de esta tarjeta —series contra banda—, que es lo que la separa de Ritmo por músculo, que contesta lo mismo con frecuencia. El subtítulo pierde los ceros (`0 entrenos · 0 series`) y conserva el denominador, `1 de 7 días`, que es la razón entera de que no se deba nada todavía. Una semana cerrada sin entrenar dice `Semana sin entrenar.` y pierde la línea `Semana corta`: cero series no es media semana típica, es ninguna. Y una cuenta sin historial no ve una semana en absoluto — sin flechas, sin `Mes`, sin subtítulo, sólo `Todavía no hay series registradas.` sobre una línea que dice en qué se va a convertir la tarjeta. Nueve pistas vacías son la peor primera pantalla posible y "le debes 6 series al pecho" es una frase rara que decirle a alguien que no ha registrado una serie en su vida. Se arregla de paso una mentira de carga: `days` es `[]` mientras la petición vuelve, la misma forma que tiene una cuenta nueva para siempre, así que la tarjeta espera a que el log conteste antes de declarar nada vacío. |
| 2026-08-10 | Un músculo callado conserva su fila ocho semanas, no una | La semilla de filas a cero salía del periodo inmediatamente anterior, así que un grupo que dejabas de entrenar aguantaba exactamente una semana de silencio y desaparecía a la segunda — que es la primera en la que la ausencia significa algo. La fila se esfumaba justo cuando adquiría algo que decir, de la única tarjeta que pregunta "¿estoy entrenando lo que creo que entreno?". Pasa a ocho semanas, la misma ventana que `typicalWeekSets` y `deloadTargets` ya llaman "tu normal reciente". Sigue acotada, y no "desde siempre", porque una serie mal etiquetada en marzo no puede clavar una fila vacía en la tarjeta para el resto de la vida del log; nueve grupos es el techo en cualquier caso. |
| 2026-08-08 | La fecha del día baja al margen izquierdo; el desglose señala el músculo dominante | Tres cosas sobre la misma fila. (1) Un defecto: `.day-sessions { margin-top: 0 }` estaba escrito 500 líneas por encima de `.sets { margin: 0.9rem 0 0 }` con la misma especificidad, así que perdía la cascada, y encima el padding de fila se pagaba dos veces (`.sets li` + `.link-row`). Eran ~32px de nada entre una fecha y su sesión, y en pantalla cabían 4 días donde caben 6. (2) La regla horizontal que iba de la fecha al `⋯` cortaba entre la fecha y lo que fecha, así que se leía como separador *sobre* la sesión. La fecha pasa a un gutter mono de 3.6rem, la sesión cuelga a su derecha y la línea que separa días va sobre el bloque entero — hoy la lleva en ámbar, que es lo que perdió al desaparecer `.day-line`. (3) Cuatro grupos impresos al mismo peso obligan a sumar para saber de qué fue el día: el mayor sube a tinta (`is-top`) y el resto se queda apagado, número incluido, porque etiqueta y cifra son un solo token. Nada sube cuando todos empatan — marcar todos es no marcar ninguno, y un día full body leyéndose plano es la lectura honesta. Jerarquía, no color: los puntos ya llevan el músculo. Se probó un `·` literal entre pares y se quitó: la fila envuelve, y un separador en todos menos el último deja uno colgando al final de la línea partida. La distancia es el separador (0.9rem entre pares contra 0.3rem dentro de uno). También `20 series · 41 min` deja de ser una cadena mono única: el contador es lo que se escanea a lo largo de una semana y va en tinta, la duración es contexto y baja a 0.75rem apagado. |
| 2026-08-05 | Una semana corta lo dice una vez, y la descarga también calla el delta | La tarjeta trataba cualquier semana floja como un suspenso repetido: `+7 a la zona` en cada fila más el delta rojo al lado, dieciocho marcas de fallo para una semana que igual fue gripe que dejadez — y ninguna accionable, porque la semana ya terminó. Dos arreglos. (1) La descarga silenciaba las palabras pero no el delta, que según este mismo documento es *lo único de la fila que lleva color* y por tanto la marca más ruidosa de las dos: se quitaba el reproche escrito y se dejaban nueve números rojos diciendo lo mismo. Además no informa de nada, porque una descarga está definida como menos que la semana anterior — ese delta reporta una decisión, no un resultado. (2) Una semana cerrada por debajo de la mitad de tu semana típica recibe una sola línea, `Semana corta · 9 series, la mitad de tu semana típica`, y las filas callan del todo: sin `faltan N` y sin delta. La fracción es la más cercana de cuatro (mitad / tercio / cuarto / menos de un cuarto) porque por construcción siempre está por debajo de la mitad y decir "la mitad" cuando es un cuarto sería falso. Umbral en la mitad y no en el tercio: el tercio es el número de la descarga, que es un plan, y esto solo describe. Un umbral visible es preferible a nueve implícitos, aunque cualquier umbral aquí sea una decisión de gusto. Nunca en el mes —cuatro o cinco semanas con una floja dentro es un mes—, nunca mientras la semana corre, y nunca sobre una descarga, que ya se explica con sus propias palabras. |
| 2026-08-10 | La fila de músculo invierte su jerarquía: el número manda, el nombre acompaña, y el delta se va | La tarjeta existe para decir cuántas series lleva ese músculo esta semana, y esa cifra era el token más pequeño y más apagado de la fila: `0.74rem` en `--muted` bajo un nombre de `0.82rem/600` en tinta, a ~250px de la aguja que la explica y con la columna del delta (74px, un 19% del ancho) en medio. Pasa a `1.4rem/600` en Geist Mono tabular, tinta, pegada al track por la derecha —orden de hoja de especificaciones: etiqueta a la izquierda, valor a la derecha, track detrás— y el nombre baja a Meta (`0.85rem/400`), que es lo que es: identidad, no titular. **El delta semana-contra-semana se va de la fila.** Contesta otra pregunta que la de la banda, se llevaba la columna más ancha de las tres —la mayor parte gastada en un encabezado que explicaba contra qué tramo comparaba— y a media semana se imprimía en gris justamente porque dos tramos sin cerrar no concluyen nada. Los 83px liberados van al track, que pasa de ~183 a 237px. La comparación sigue calculada en `stats.js`; sólo deja de dibujarse aquí. Con ella se van `.sum-delta`, `has-delta` y el encabezado `vs. …`. Tres arreglos más en la misma pasada. (1) **Contraste, medido y en los dos temas.** El borde de la franja y la cola son componentes no textuales que cargan con todo el mensaje, así que el suelo es 3:1 contra la tarjeta —la razón que nadie había medido, porque la ronda anterior optimizó relleno-contra-eje. Al 38%/34% daban 3.34/2.93 en oscuro y **2.40/2.16** en claro, y el claro no se había mirado nunca. Al 55% de la tinta miden 5.55 y 3.95. El relleno sube de 15% a 18% (sin suelo: los bordes llevan el límite). (2) **Escala tipográfica**: `0.74/0.66/0.62rem` no estaban en la escala de este documento, cuyo tamaño menor es Label 12.8px. Ahora `1.4rem` la cifra, `0.85rem` nombre y pies, `0.8rem` estado y encabezados. (3) **44px**: la flecha de periodo medía 32px de ancho y el chip `Mes` 30 de alto. | 
| 2026-08-10 | La aguja fuera de la franja lleva un caret; el pie deja de enseñar a leer el dibujo | Dos casos que la posición sola no puede resolver, y son los que produce una semana real: Cuádriceps a 8.5 contra un MEV de 8 cae ~3px dentro de la franja, y Gemelo a 17 contra un MRV de 16 cae ~4px fuera. Idénticos en pantalla, distinguibles sólo leyendo la cifra —que es exactamente el trabajo que la fila promete ahorrarte—, y la cola que los separaría mide menos que el ancho de la aguja. La aguja lo dice ahora ella misma: fuera de la franja le crece un caret apuntando de vuelta a la franja, forma y no distancia, legible con cualquier hueco, y encima redundante con la dirección. Sin color, tinta como todo lo demás del track. El pie pierde una de sus tres líneas: *"por debajo la marca se sale por la izquierda, por encima por la derecha"* enseñaba a leer un dibujo que ya has leído, y necesitarla es la acusación. Quedan dos frases, las dos cosas que el track no puede decir: que la franja es el margen de **ese** músculo y no un número compartido (`La franja es el margen productivo de ese músculo: cada uno tiene el suyo.`), y cómo cuenta un compuesto (`Un músculo secundario cuenta media serie.`). Corrección de documentación de la misma pasada: la entrada del 2026-08-05 decía que las filas de una semana corta caían a una forma neutra `9 de 10` "que la semana en curso ya usaba" — esa forma no existe ni existió en el código. La semana en curso imprime `faltan N` en apagado (el hueco es el único número accionable mientras la semana corre; el veredicto en tinta espera a que cierre) y una semana corta calla del todo. La entrada queda corregida a lo que hace el código. |
| 2026-08-11 | La cabecera dice de qué semana habla, y todo lo que hay en esa línea va en la unidad de las filas | El subtítulo soldaba tres hechos al mismo peso —`1 entreno · 109 series · 1 de 7 días`— y el tercero es el único que decide cómo leer los otros dos: sin él, nueve filas de cuentas se leen como una semana terminada. Era además el más apagado y el último de la línea. Pasa a una línea en dos registros: delante, en tinta y en Geist Mono tabular, **el denominador y nunca la unidad** (`Día 2 de 7` mientras la semana corre, `1.6 semanas` en el mes); detrás, apagado, las cuentas. `3 de 7 días` además mentía de forma sutil: pegado a `2 entrenos` se lee como tres días *entrenados*, y son días *transcurridos*. Lo que el marcador aporta y nada más en pantalla puede aportar es **la fracción** —un martes contra un domingo—, que es lo que decide cómo leer un `faltan 10`; se lo gana sobre todo en la semana en blanco, donde no hay filas que lo digan de otra forma. Con `Mes`, el marcador imprime el tramo (`1.6 semanas`) y no la palabra "media": el `/sem` que cabalga cada cifra y el encabezado `media/sem` sobre las filas ya lo dicen, y sobre las cifras en vez de al lado. **Las cuentas se imprimen en la unidad en la que se imprimen las filas.** Dejadas como totales del mes quedaban detrás de `Media de 1.6 semanas` unidas por el mismo `·` que las une entre sí, así que el modificador les alcanzaba hacia delante y `4 entrenos` se leía como cuatro sesiones *a la semana* cuando el ritmo real era 2.5. `193 series` se autocorrige por absurdo; cuatro entrenos por semana no —es una semana normal—. Ningún separador arregla eso de forma fiable, así que lo arregla el registro: con `/sem` en cada cifra no queda nada sobre lo que el marcador pueda alcanzar mal. Queda `1.6 semanas · 2.5 entrenos/sem · 122.8 series/sem`, una sola línea a 430px. Se va con ello el pie `Mes en curso — la referencia es por semana completa.`: era el tercer sitio de la misma tarjeta diciendo "esto son medias semanales" y el más débil de los tres, porque iba *detrás* de las filas que pretendía condicionar —el error del chip `HOY`, una pantalla más allá—. Una semana cerrada sigue sin marcador. **Dos correcciones al razonamiento de la ronda anterior, que estaba mal aunque la decisión fuera buena.** (1) No es el `›` deshabilitado lo que dice que una semana está cerrada: medido, el `›` se deshabilita en el índice 0, o sea sobre la semana **en curso**, y al 0.35 de alfa compone 1.93 en oscuro y 1.64 en claro —invisible en ambos—. Lo que carga con el cierre es el título de la nav pasando de `Esta semana` a `3–9 ago`, más los veredictos de las filas pasando de apagado a tinta. (2) `Día 2 de 7` no es "lo único que impide leer nueve filas de cuentas como una semana terminada": `Esta semana` en la nav lo dice también y `faltan N` es una tercera pista. Lo que aporta en exclusiva es la fracción, que es otra cosa. |
| 2026-08-11 | Una semana de solo cardio no son nueve reproches: es una frase y sus cuentas | Defecto encontrado bajo una resolución de merge, y sólo importando `stats.js` en Node —lo que lo convierte en la mejor prueba de que un estado sin caso de banco es un estado que nadie vuelve a mirar—. La tarjeta decidía "aquí no hay nada que dibujar" con `rows.length === 0 || sets === 0`, y una semana en la que sólo corriste no cumple ninguna de las dos: el cardio no tiene grupo muscular por diseño, así que `counts` vuelve vacío, pero cualquiera que haya levantado algo en las ocho semanas anteriores recibe las nueve filas sembradas a cero (2026-08-10, la ventana que P4 amplió de un periodo a ocho semanas —correcto para una semana normal y justo lo que hace absurda a ésta—), y `sets` está por encima de cero porque las series de cardio son series. Resultado: nueve carriles imprimiendo toda su banda como déficit sobre una semana en la que sí entrenaste. Exactamente los "nueve reproches" que prohíbe la entrada del 2026-08-10, por una puerta que esa entrada no cerró. La condición pasa a ser una sola y la que de verdad importa: **una fila se dibuja cuando tiene volumen dentro** (`rows.some(r => r.sets > 0)`). Cubre los tres casos —sin filas, sin series, y series sin clasificar— porque los tres son el mismo. "No se clasificó nada" y "no pasó nada" son frases distintas, así que la primera conserva sus cuentas: `Día 2 de 7 · 2 entrenos · 4 series` sobre `Ninguna serie con músculo asignado.`, y debajo el mismo traspaso que recibe cualquier semana sin filas (`La pasada cerró con 44 series en 4 entrenos.` y quién cerró bajo su zona). El pie `4 series sin músculo asignado` desaparece en ese caso: sin filas encima no es una nota al pie, es la misma frase dicha dos veces. Nace con su caso de banco, `?harness=volume&caso=cardio`. |
| 2026-08-11 | El dibujo se llevó su pie de foto: Días dice que la zona es de cada músculo | La pantalla que abre la app dibuja nueve carriles y la palabra `zona`, y la única frase que explica qué es esa franja vivía en Progreso, que es la pantalla a la que llegas *segundo*. Nueve rayas al mismo x sobre la misma rejilla de nueve filas se leen como un 10–20 compartido, y bajo esa lectura la semana normal se contradice sola: en `caso=lunes`, `Core 1.5` cae dentro de la franja y `Pecho 4` dice `faltan 2` —imposible si la escala fuera una—. Así que baja a Días la línea que ningún track puede dibujar, en la versión de una sola línea que cabe: **`La zona es la de cada músculo, no la misma para todos.`** Dice `zona` y no `franja` porque `zona` es la palabra impresa sobre el track de esa pantalla; la segunda frase del pie de Progreso (`Un músculo secundario cuenta media serie.`) se queda allí, porque es aritmética que se consulta y no cambia cómo se lee el dibujo. Y hace un segundo trabajo: **es la costura**. `.sum-rows` terminaba a 0px del primer `.day-block`, así que el `2px solid var(--accent)` de hoy —la única línea horizontal con color de la pantalla— se leía como el borde inferior de la tabla de volumen en vez de como el sello de fecha de ese día, y dos listas que se escanean a velocidades completamente distintas no tenían nada entre medias. Prosa en la cara de texto separa mejor que un hueco: cambia el registro, no sólo la distancia. Cuesta 36px, pegada arriba (0.4rem) y suelta abajo (0.625rem), y salen de la lista de días, que es el reparto que esta pantalla justifica. Ausente cuando no hay filas que anotar (semana en blanco, semana de solo cardio, cuenta nueva): un pie que explica un dibujo que no está es peor que ningún pie. En una semana marcada como descarga manda el texto de la descarga, porque la banda contra la que se mide no es la de referencia. | 
| 2026-08-11 | `● EN CURSO` pasa la AA en claro, y `Anotar otra fecha` mide 44px | Dos defectos de la misma pantalla, ambos medidos y ninguno visible en una captura. (1) **Contraste.** El chip `● EN CURSO` es texto pequeño —suelo 4.5:1— y en claro daba **3.76**: `--accent-ink` `#c2440f` sobre una píldora de ámbar al 16% que compone `#f1d9cc`. El relleno se estaba comiendo justo el contraste que `--accent-ink` compra: ese token está definido contra el fondo de papel, y teñir el suelo *hacia* la tinta es cómo se gasta. En claro la píldora deja de ser un lavado y pasa a ser una ficha: `--surface` de fondo (**5.09** contra la misma tinta) con el ámbar en el canto como anillo `inset` en vez de en el relleno —a plena intensidad y no al 45%, porque al 45% componía 1.79 contra los dos lados y un componente no textual tiene suelo de 3:1; `--accent` mide 3.70 contra la ficha y 3.31 contra el papel—. Oscuro no se toca: **5.64** sobre `#321b13`, y la regla se escribe como override en `prefers-color-scheme: dark` y no al revés, porque ese es el bloque que los bancos reinyectan para forzar tema. De paso el tamaño sube de `0.656rem` (10.5px, fuera de la escala de este documento por abajo) a Label 12.8px; con `line-height: 1` la píldora mide 14.8px contra los 15px de antes, así que la fila no se mueve (91.38px medidos antes y después; la entrada decía 93.06, que era una medida anterior a la pasada de tipografía y se quedó sin actualizar). (2) **44px.** `Anotar otra fecha` medía 398×36 clavado bajo la CTA, o sea un blanco corto en la esquina donde descansa el pulgar. Los 8px que faltaban salen del `padding-bottom` de la barra y no de su altura: la barra está anclada abajo, así que crecerla habría subido la CTA, que está medida en 780–832 en los seis casos. La etiqueta acaba 4px más abajo y más separada del botón de arriba, que es la otra mitad de la misma queja. **Corrección del registro:** el mensaje de commit de `7485996` dice que "las nueve filas y dos días caben sin hacer scroll" a 430x932. Es falso. Lo que cabe (84→603) son las nueve filas, la regla de semana y la cabecera; el `scrollHeight` medido antes de esta pasada era 1169 en `lunes` y 1262 en `llena` contra 932, y con el pie de foto dentro es 1201 / 1384 / 1240 (`lunes` / `llena` / `intacto`) —la cifra de `llena` se anotó mal la primera vez, 1298, y son 86px más—. La segunda sesión y la CTA no caben; la CTA parecía caber porque está fija. No es un defecto —el recorrido de scroll son ~330px y la pantalla se lee bien— pero la afirmación no era cierta. | 
| 2026-08-16 | La marca deja de ser una mancuerna y pasa a ser la retícula que crece | Llega el kit de marca (`brand/`) y con él una identidad que la app puede pintar con sus propios tokens en vez de con una imagen: cuadrados que crecen hacia la esquina superior derecha, la de arriba a la derecha al 100 % y en ámbar. Tres consecuencias en pantalla. (1) **El isotipo del header pasa a SVG en línea.** `mark.png` era un PNG de tinta fija, así que en tema oscuro dependía de que el recorte llevara ya el color correcto; ahora la tinta es `currentColor` (hereda `--text`) y la celda ámbar es `var(--accent)`, de modo que la marca cambia con el tema por construcción y no por tener dos ficheros. El kit y este documento comparten los mismos valores —`#16181b`/`#e4571b` en claro, `#f2f3f5`/`#ff6a2c` en oscuro—, que es lo que hace posible atarla a tokens sin desviarse de la marca. (2) **Va la retícula 3×3, no la 4×4.** El kit pone el suelo de la 4×4 en 24 px y el isotipo del header mide 20.2 medidos (0.79em sobre un `h1` de 25.6px, la proporción del lockup). A ese tamaño los cuadrados más pequeños de la 4×4 caen por debajo de 1.5px y la marca se lee como una mancha de puntos, que es exactamente lo que se vio en la primera pasada antes de mirarla en pantalla. (3) **Se va la I capital de `fitIt`.** Estaba ahí para que una letra hiciera eco del icono de barra y discos; muerto el icono, la letra sostiene un chiste que ya no existe, y el kit fija el nombre en una sola caja y un solo peso. El tracking pasa de −0.0375em a −0.055em, que es el del lockup. El lockup vivía copiado en App, Login y Register; ahora es `Wordmark.jsx`, una vez. Los PNG servidos se generan desde los SVG del kit con `frontend/tools/make_icons.py` (Pillow, sin cairo ni ImageMagick: los SVG son sólo rectángulos), y con ellos llega un icono `maskable` aparte: el del kit lleva esquinas redondeadas y Android le aplica encima su propia máscara, así que declararlo `any maskable` como estaba lo redondeaba dos veces y asomaba el fondo del lanzador. El favicon pasa a SVG con la tinta atada a `prefers-color-scheme` —en una barra de pestañas oscura el `#16181b` del kit desaparece— con el PNG de 64 como fallback. |
| 2026-08-24 | `--danger` sube en los dos temas: dark `#EF4444`→`#F87171`, claro `#DC2626`→`#CE1F1F` | El rojo destructivo llevaba meses suspendiendo la AA en los dos temas, y **peor al tocarlo que en reposo**. Medido sobre el color realmente pintado, no sobre el token: en oscuro `#EF4444` da **4,345** sobre `--surface-raised` y **3,676** bajo el velo de `:hover` (6 % de `--text`); en claro `#DC2626` da **4,319** sobre el papel. Lo de claro había pasado siempre porque se comprobó contra blanco puro (4,829) y el fondo de tema claro de este documento es papel cálido `#F4F2EE` — un token validado contra el fondo equivocado suspende en silencio. Y el suelo es 4,5 y no 3: `Eliminar ejercicio` va a 16 px/600, que no es «large text» para WCAG. Los nuevos: oscuro 5,911 en reposo y 5,001 en hover; claro 5,469 sobre blanco, 4,891 sobre papel y 4,842 en hover. Barrido de los ocho usos de `--danger`: seis son tinta sobre una superficie (`.set-delete`, `.head-menu-danger`, `.secondary.delete-exercise`, `.sheet-danger`, `.editor-row-danger`, `.alert`) y todos mejoran; dos son velos sin texto encima (fondos al 10–12 %, bordes al 25–35 %) y no cambian de veredicto. El único que empeora es el noveno sitio, el **relleno**: `.dialog-actions .danger`, blanco clavado sobre el rojo, que en oscuro cae de 3,769 a 2,766 — un uso que ya suspendía y que ninguna prueba miraba, porque vive en una hoja modal y las de contraste recorren el panel del editor. Se arregla con un token nuevo, `--on-danger`, hermano de `--on-accent`: blanco en claro (5,469 sobre `#CE1F1F`) y tinta `#0B0C0E` en oscuro (7,079 sobre `#F87171`, 5,233 sobre su hover). |
| 2026-09-26 | Escala tipográfica cerrada y vigilada; «← Días» deja de ser relleno | Auditoría de prod contra este documento: el color se cumplía entero, la tipografía no — 26 tamaños distintos en `styles.css` donde la tabla define 8, y texto en minúscula por debajo de Label en cuatro pantallas (etiqueta de músculo 11,52 px, chips de serie 12,48, `20 d` y meses del ritmo 11,52/10,88, `+ añadir` 12), más sellos a 10,4 en lugar de Micro. Se colapsan las 76 declaraciones: prosa pequeña a Label, sellos a Micro, la deriva de 14–15 px a Body o Meta según sea contenido o nota, 1,05–1,35 a Title o Big stat. Entra un paso nuevo, **Display figure 2,6rem**, porque ya existía dos veces (objetivo de hoy, kcal) y la cifra del arranque en frío estaba a 2,3 sin razón. Los glifos quedan fuera de la escala por nombre, y `typeScale.test.js` hace que el próximo tamaño suelto rompa el build en lugar de esperar a otra auditoría. La cifra de kcal pasa de `--accent` a `--accent-ink`: es texto, y en papel el ámbar como texto es el hondo. «← Días» deja el relleno ámbar que se le dio en #25: con él, la pantalla del entreno tenía tres rellenos ámbar y volver pesaba igual que registrar una serie; ahora es tinta ámbar con marco tenue. `success`/`warning` salen del documento: nunca fueron tokens. |
| 2026-09-26 | Widgets y notificación nativa rediseñados | Consulta de diseño con el usuario (17 iteraciones, vistas previas en `~/.gstack/.../widgets-20260926/`). Tesis «una serie, un toque»: un solo relleno ámbar por superficie. El ruido se midió y se redujo por agrupación, no quitando datos: los seis `−`/`+` sueltos pasan a un bloque de ajuste de una pieza con el `+1` como extremo (siete cajas con borde → cuatro, tres marcas ámbar → una). Sin botón de saltar: al pasarse del descanso el número pasa a `--accent-ink` y cuenta `+00:12`, sin añadir un tono de aviso. Terminar, aro `--danger`. «Sin entreno» gana una segunda pantalla de pasos contra un objetivo nuevo (`/ 10.000`, barra y `Media semanal`), y se cambia tocando los puntitos porque el launcher se queda el deslizamiento lateral. La notificación pasa a diseño propio con el mismo bloque (N4): se pierde escribir desde fuera de la app y la isla de HyperOS, a cambio del tiempo grande hoy. Se descartó convertir este archivo al formato abierto de gstack: la conversión automática inventaba tokens y recuperaba `#EF4444`, retirado por contraste. |
| 2026-09-27 | Cuarta pestaña: `Perfil`, y Comida se queda con el registro | Pedido del usuario al buscar el peso en el formulario del objetivo y no encontrarlo: «la pantalla de comida es solo registro; todo lo que sean ajustes, a una pestaña de perfil». Los ajustes estaban repartidos por tres sitios —el objetivo, el reparto de macros y `Tus reglas` en un cajón `Objetivo diario` de Comida; el peso en Progreso; el descanso y `Pantalla activa` en el `⋯` de Entreno— y Comida mezclaba registrar con ajustar. Ahora la barra tiene cuatro pestañas, `Días · Progreso · Comida · Perfil` (108 px cada una a 430, mismo alto de 56), con el isotipo `◍` en mono como los otros tres. Perfil apila, por este orden, la tarjeta `Peso` (entera: anotar y tendencia; sale de Progreso), `Objetivo` (la propuesta de kcal con sus datos y `Pasos al día`), `Reparto` (proteína, hidratos y grasa, con el total derivado; el botón pasa de `Guardar objetivos` a `Guardar reparto`), `Reglas` (el botón `Tus reglas`, que abre la misma pantalla) y `Entreno` (`Descanso` y `Pantalla activa`, los mismos segmentados que había en el menú), y al final `Salir`, que deja la cabecera: es lo más raro que se hace. Comida pierde la fila `Objetivo diario` y sus hojas; la tarjeta de macros sigue comparando con el objetivo del perfil y los avisos de reglas siguen saliendo, porque son registro. El `⋯` de Entreno se queda con lo que actúa sobre la sesión (`Terminar entreno`, `Borrar entreno`). Consecuencia aceptada: el descanso ya no se cambia a mitad de sesión sin salir de Entreno. |
| 2026-09-27 | `Reparto` pasa a `Macros`, y los gramos salen de la propuesta | El usuario no entendía «Reparto»: eran dos pasos sueltos —las kcal se aceptaban arriba y los gramos se tecleaban abajo— con un aviso de desfase entre ellos. Ahora la propuesta de Objetivo trae sus gramos en una línea mono bajo la procedencia (`Proteína 156 g · Hidratos 332 g · Grasa 72 g`: 2 g/kg de proteína, 25 % de las kcal en grasa, el resto hidratos; `reparto_macros` en `nutrition.py`) y `Aceptar` fija las kcal y los gramos a la vez. La tarjeta se llama `Macros`, lleva una línea que dice qué es (`Cuántos gramos de proteína, hidratos y grasa suman tus kcal.`) y su botón es `Guardar macros`; sigue siendo editable. El aviso de desfase sube su umbral de 1 a 10 kcal: por debajo es el redondeo a gramos enteros. En la tarjeta de peso, el campo pasa de `Peso de hoy` a `Peso`. |
| 2026-09-27 | Fuera la tarjeta `Macros`: se aceptan con las kcal | El usuario: «prefiero no decidir sobre los macros, con la tarjeta de arriba me vale». Tres tarjetas para una sola decisión (cuánto comer) eran dos de más: Objetivo ya enseña los gramos de la propuesta y `Aceptar` los fija con las kcal. Perfil queda en Peso · Objetivo · Reglas · Entreno · Salir. De paso, guardar un peso vuelve a pedir la propuesta (`Weight onSaved` → `Objetivo refresh`): sin eso, la cifra que había que aceptar era la del peso anterior hasta salir de Perfil. |
| 2026-09-27 | El editor de ejercicio vuelve a ser una hoja, y «Eliminar» en Entreno sólo quita de la sesión | El panel en sitio ganó a la hoja cuando la app era una PWA: no apagaba nada y no movía la columna. Para lograrlo medía la página en cada scroll y marcaba `inert` lo que tapaba, y en la APK esa medida peleaba con el sistema: el `<select>` del grupo abría el selector nativo, el viewport cambiaba, el panel se recolocaba y el selector se quedaba parpadeando. El usuario pidió rediseñarlo para nativo y eligió la hoja inferior. Ahora es la hoja de la casa (`.sheet-scrim`/`.sheet`): fija al pie, con fondo, lo de detrás `inert`, un solo paso (nombre, grupo, nota, eliminar) y asa para arrastrar. El grupo son diez fichas en vez de un `<select>`. Abrir no levanta el teclado; Intro en el nombre guarda y cierra. En Entreno, «Eliminar» quita el ejercicio **de esa sesión** (`DELETE /workouts/{id}/exercises/{id}`) y el borrado del ejercicio entero queda sólo en Progreso, la pantalla a la que se va a propósito. |
| 2026-09-27 | Los pasos, primera pantalla del widget sin entreno | El usuario, con una captura del 4×2: el objetivo `/ 10.000` salía cortado por abajo y quería los pasos «siempre la primera card». La cifra de 40sp llevaba un margen negativo abajo y `/ 10.000`, alineado a su línea base, quedaba medio fuera de la fila; el margen de abajo se quita (el de arriba sigue). Las pantallas cambian de orden: pasos, luego empezar; sin pasos de hoy sólo está la de empezar, como antes. La página recordada cambia de clave para que nadie aterrice en `Empezar entreno` por haber estado mirando los pasos. |
| 2026-09-27 | La marca dice dónde estabas y una línea debajo dice el paso siguiente; el RIR vuelve como una pregunta que alguien lee | El usuario quería elegir en Perfil qué referencia ver al registrar, y la pregunta de fondo era qué dice la evidencia. Dice que la vía da igual —subir reps o subir kilos da lo mismo (Plotkin 2022)— y que lo que manda es superar la última sesión y acercarse al fallo (Robinson 2024), así que `Última vez` se queda como está y el selector no se construye. Bajo la cifra entra `Objetivo · 60 kg × 9 · a 1–2 del fallo`, en tinta y a Meta: progresión doble (una rep más; en 12, +2,5 kg y vuelta a 8) más una lectura del RIR, que sube el peso ya si la última serie dejó 3 o más (`· sobraron 3+`). La regla vive en `progression.js`. El RIR vuelve **contra la regla del 2026-08-05**, y por eso no vuelve como campo: aquel RPE lo llevaba 1 serie de 277 y no lo leía nada. Ahora se pregunta después de registrar (`¿Cuántas te quedaban?` con `0 1 2 3+`, 44 px, el activo en tinta y no en ámbar), sólo por la última serie, sin ocupar el formulario, y lo lee el objetivo de la próxima sesión. Se guarda en la columna `rpe` como 10 − RIR (`3+` → 7), sin tocar el backend. La línea va en dos bloques que no se parten porque a 430 px partía «más» sola. Pendiente a propósito: tope, vuelta y salto son fijos; en mancuernas ligeras 2,5 kg es mucho salto. |
| 2026-09-27 | `Objetivo` enseña sólo la cifra, sin el porqué | Usuario, viendo `Objetivo · 22,5 kg × 8 · llegaste a 12`: *"es un poco confuso"*. El 12 al lado de un × 8 se lee como otra cifra que cuadrar, no como el motivo. Entre decir el porqué mejor y quitarlo, eligió quitarlo: la línea queda `Objetivo · 22,5 kg × 8`. La regla no cambia y sigue en `progression.js`; `reason` se calcula aunque no se pinte. |
| 2026-10-02 | Sistema v2 «Material tonal»: hojas, botón flotante, chips y filas de ajuste; los datos del servidor como cifra | Usuario, sobre Comida y Perfil: *"parece más una PWA que una aplicación nativa"* y *"información contenida en frases que apenas son visibles"*. Eligió la maqueta B de tres. Se suma al sistema en vez de sustituirlo y se migra pantalla a pantalla, empezando por Perfil y Comida. |
| 2026-10-02 | Las barras de macros se llenan al comer | Usuario, viendo Comida sin nada apuntado y las barras enteras en ámbar: *"no me cuadran las barras rellenadas si no tengo nada registrado"*. La regla «el cromo a lo que falta» pintaba el día vacío como completo. Ahora lo comido se llena (proteína en `--accent`, hidratos y grasa en tinta) y lo que falta es el carril vacío. `--pr` al cerrar no cambia. |
| 2026-10-02 | La tarjeta de macros pasa a dos anillos | Usuario, ante la tarjeta de barras: pidió alternativas, eligió la del anillo y echó en falta las calorías, que iban en una línea gris al pie. Eligió la B1 de tres: proteína en el anillo de fuera, kcal en el de dentro, cada uno con su cifra y su punto de color al lado («quedan 1109» o «200 de más», restado por el servidor). La jerarquía sigue siendo de grosor (12 / 7 / 6), como pidió al preferir barras de distinta altura. El carril del anillo va en `--border`: en papel, `--surface-raised` es blanco sobre blanco. |
| 2026-10-02 | Comida, tercera pantalla del widget sin entreno | Consulta de diseño con el usuario: pidió un widget de calorías y, al proponerle uno nuevo de 2×2, prefirió *"incluirlo como card dentro del que ya uso, que es el de 3×2"*. Repite la tarjeta B1 de la app (proteína manda, kcal acompaña), a contracorriente de MacroFactor, Cronometer y MyFitnessPal, que ponen las kcal por delante. Orden pasos · comida · empezar, para no tocar la decisión del 27-09. Se actualiza sólo al abrir la app: el usuario descartó la consulta horaria al servidor. |
