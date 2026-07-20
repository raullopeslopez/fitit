# Design System — Fitit

> Read this before any visual or UI change. Fitit is a **training instrument**, not a
> wellness app. Every choice serves one thesis: *lean on purpose*.

## Product Context
- **What this is:** Personal workout tracker. Log sets; when you pick an exercise, see
  your previous marks so you know what to beat.
- **Who it's for:** A serious lifter tracking progressive overload. Solo use, no social feed.
- **Space/industry:** Strength-training / gym logging (peers: Hevy, Strong, Fitbod).
- **Project type:** Mobile-first PWA (installable). Used one-handed, in the gym, between sets.
- **Design thesis:** An instrument, not a lifestyle brand. Numbers are the product. The
  emotional payload is the PR — you beat your previous mark.

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
- **PR / record glow:** `#FFA733` (accent at full intensity) — the earned moment only.
- **Neutrals (dark, default):**
  - bg `#0B0C0E` · surface `#15171A` · surface-raised `#1D2024`
  - text `#F2F3F5` · muted `#9BA1A9` · border `#24272C`
- **Neutrals (light — warm "paper", not cold):**
  - bg `#F4F2EE` · surface `#FFFFFF` · surface-raised `#FFFFFF`
  - text `#16181B` · muted `#6B7280` · border `#E6E2DA`
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
| 2026-07-20 | Consistency heatmap uses the amber ramp, not green | Every contribution grid ships green; a heat map of effort should literally be heat. Intensity = sets logged that day (works for cardio too, where volume doesn't), built with `color-mix(in srgb, var(--accent) N%, transparent)` so it tracks light/dark for free. Level 0 stays neutral, never a faint amber. |
