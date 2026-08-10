// Per-muscle weekly volume landmarks, and where a set count sits inside them.
//
// Fitit judged every muscle against one flat reference — 4 minimum, 10–20 the
// zone, the same nine times — which is what made the band question
// unanswerable: ten sets of calves and ten sets of back are not the same news.
// Renaissance Periodization publish a landmark set per muscle instead, and this
// module is that set, mapped onto Fitit's nine groups.
//
// ---------------------------------------------------------------------------
// The landmarks
// ---------------------------------------------------------------------------
//
//   MV   maintenance volume  — keeps what you have
//   MEV  minimum effective volume — the least that grows anything
//   MRV  maximum recoverable volume — the most you can recover from
//
// MAV is deliberately absent. Every one of the eleven RP articles below states
// it as a *per-session* figure ("no lower than 4 and no higher than 12 working
// sets per session"), identical boilerplate on all of them, so it is not a
// weekly threshold and cannot be drawn on a weekly track.
//
// MRV is frequency-dependent and every article lists it at 2 / 3 / 4 / 5–6
// weekly sessions. **These are the 2-session figures** — RP's own baseline, the
// first one every page names, the lowest of the four, and the modal frequency
// for a lifter training 3–4 days a week. Taking a higher-frequency MRV would
// raise the ceiling to a place nothing ever reaches, and a state that never
// fires is not a state.
//
// Where an article gives a range, the low end is taken. RP's own instruction:
// "We recommend starting on the low end and tracking your recovery from week to
// week" (quad guide, below).
//
// Sources — one RP Help Center article per muscle, all the same vintage and all
// phrased in sets per week:
//   Chest      https://help.rpstrength.com/hc/en-us/articles/32433153518359-Chest
//              MV "around 4 sets per week" · MEV "at least 6 sets of direct
//              chest work per week" · MRV "with 2 sessions … around 20 sets"
//   Back       https://help.rpstrength.com/hc/en-us/articles/32433434201879-Back
//              MV 6 · MEV "at least 10 sets of direct back work" · MRV 2×: 20
//   Quads      https://help.rpstrength.com/hc/en-us/articles/32433057672599-Quads
//              MV 6 · MEV "at least 8 sets of direct quad work" · MRV 2×: 18
//   Hamstrings https://help.rpstrength.com/hc/en-us/articles/32432689278999-Hamstrings
//              MV "around 3 sets" · MEV "at least 4 sets" · MRV 2×: 12
//   Glutes     https://help.rpstrength.com/hc/en-us/articles/32433132961431-Glutes
//              MV none ("just doing squats … is more than enough to maintain
//              glute gains") · MEV "actually ZERO sets per week" · MRV 2×: 12
//   Calves     https://help.rpstrength.com/hc/en-us/articles/32433232143895-Calves
//              MV 6 · MEV "at least 8 sets of direct calf work" · MRV 2×: 16
//   Side delts https://help.rpstrength.com/hc/en-us/articles/32432645007255-Side-Delts
//              MV 6 · MEV "at least 8 sets of direct side delt work" · MRV 2×: 25
//   Front delts https://help.rpstrength.com/hc/en-us/articles/32433236733591-Front-Delts
//              MV "legitimately no direct work" · MEV none ("great front delt
//              gains with NO direct front delt work") · MRV 2×: ~12
//   Rear delts https://help.rpstrength.com/hc/en-us/articles/32432607796631-Rear-Delts
//              MV none ("sustained with no direct work so long as pulling work
//              … is still done") · MEV "at least 6 sets" · MRV 2×: 18
//   Biceps     https://help.rpstrength.com/hc/en-us/articles/32433083158295-Biceps
//              MV "around 4 sets" · MEV "at least 8 sets of direct bicep work"
//              · MRV 2×: 20
//   Triceps    https://help.rpstrength.com/hc/en-us/articles/32433338498967-Triceps
//              MV "around 4 sets … ON TOP OF the pressing from chest work" ·
//              MEV "at least 6 sets … ON TOP OF normal chest pressing" ·
//              MRV 2×: 16
//   Abs        https://help.rpstrength.com/hc/en-us/articles/32433381453463-Abs
//              MV "no ab training at all can maintain the abs" · MEV "Zero sets
//              per week. Yep." · MRV "above 25 sets per week, no matter how many
//              sessions"
// Definitions and the "start on the low end" rule:
//   https://rpstrength.com/blogs/articles/quad-hypertrophy-training-tips
//   https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth
//
// The quad blog guide above carries a second, lower table (MV 2–4, MEV 4–6,
// MRV 14–18). It is not used: the Help Center Quads article is the same vintage
// and the same wording as the other ten, so taking it keeps all nine rows on one
// consistent scale. Mixing two revisions would make Cuádriceps incomparable with
// its neighbours, which is the exact failure this module exists to fix.
//
// ---------------------------------------------------------------------------
// Mapping RP's muscles onto Fitit's nine groups
// ---------------------------------------------------------------------------
//
// RP does not use Fitit's partition, so three rows need a decision. The rule for
// all three: **take one RP muscle wholesale rather than build a franken-band out
// of two.** A band assembled from two muscles' halves is a number no article
// says, which is the thing this module is here to stop doing.
//
// * **Femoral** = hamstrings + glutes (DESIGN.md, 2026-08-01: "Glutes ride with
//   the hamstrings under Femoral"). Takes the **hamstring** landmarks. The glute
//   article supplies only zeros at the bottom — MV none, MEV "ZERO sets per
//   week", because squatting maintains and grows them — so hamstrings are the
//   only source of a nonzero floor either way. The ceiling is the one real
//   choice: 12 (either muscle alone) or 24 (the sum). **12, the conservative
//   read.** Both muscles happen to sit at 12 at two sessions, and hamstrings are
//   the pair's recovery bottleneck — RP note their MRV barely rises with
//   frequency "because the hamstrings take so long to recover", while glute MRV
//   swings from 8 to triple depending on exercise. A ceiling of 24 assumes the
//   row's volume split perfectly between two muscles, which the row cannot see
//   and usually is not true.
//
// * **Hombro** = front + side + rear delts, which RP bands very differently.
//   Takes the **side delt** landmarks. It is the only one of the three heads
//   whose growth depends entirely on direct work: RP say front delts need none
//   at all if you press, and rear delts are sustained by back work. So the side
//   delt is the head the row is really asking about. Two consequences, both
//   deliberate. (a) The floor is 8, not the 14 a side+rear sum would demand — a
//   sum would manufacture a deficit on a row that cannot prove one. (b) The
//   ceiling is 25, not the front delt's 12, even though 12 is the first ceiling
//   the row's volume could hit: `setsInWindow` posts half a set to Hombro for
//   every chest press, so a 12 ceiling would read "sobre" on any week with
//   pressing in it. This is the one place the conservative choice is refused,
//   and the reason is that it would fire on everybody. **The cost, stated: the
//   row cannot see a rear-delt shortfall.** 20 sets of lateral raises and no
//   face pulls reads "en zona", and is wrong about the rear delt.
//
// * **Core** = abs. No merge, and the honest number is zero: RP put ab MEV at
//   "Zero sets per week. Yep." and ab MV at no training at all. **So Core can
//   never read "bajo".** That is not an oversight, it is RP's position, and it
//   is strictly better than the flat reference it replaces, which told you that
//   you owed your abs ten sets. It does mean one of the nine rows only ever has
//   two of the three states available to it.
//
// Traps and forearms have RP articles too. Fitit has no such groups and
// DESIGN.md caps the palette at nine ("a tenth group is not a new hue"), so they
// are out of scope; trap work lands in Espalda by the classifier's `shrug` /
// `trapecio` keywords, under a back band that does not describe it.
//
// ---------------------------------------------------------------------------
// The unit problem, which is real and is not solved here
// ---------------------------------------------------------------------------
//
// `setsInWindow` in stats.js counts **fractionally**: the primary muscle of a
// lift takes a whole set, each secondary takes half (Pelland et al. 2026). RP's
// landmarks are written for **direct sets only**, with the indirect stimulus
// already discounted out of the number — stated outright in their landmarks
// overview: "when we say '18 sets is the MRV for triceps', we mean direct
// triceps work only. We've already factored in the indirect volume from pressing
// movements, reducing our estimates to account for this additional stimulus."
// The triceps and chest articles say the same thing in words: their figures are
// "ON TOP OF normal chest pressing".
//
// So for any group that receives indirect volume, this compares two different
// quantities and our row reads high. Reading `_SECONDARY_RULES` in
// backend/app/muscles.py, exactly four groups are affected, and the rest are
// never anybody's secondary:
//
//   never inflated   Pecho · Espalda · Cuádriceps · Gemelo · Core
//   inflated by      Tríceps  +0.5 per chest press, dip and overhead press
//                    Hombro   +0.5 per chest press and dip
//                    Bíceps   +0.5 per pulldown, pull-up and row
//                    Femoral  +0.5 per squat/press/lunge and per deadlift
//
// Nothing here corrects for it, because correcting means inventing an assumed
// weekly press/pull volume and no source gives one. What it means in practice:
// on those four rows the fill sits a little further right than RP would draw it,
// so "bajo" is under-reported and "sobre" over-reported. Femoral is the sharpest
// case — a squat-and-deadlift week can push it past 12 on indirect volume alone.
// Flagged rather than fudged; fixing it properly is its own piece of work.

import { MUSCLE_GROUPS } from './muscles.js'

// Sets per week. See the sourcing block above for every number.
export const BANDS = {
  Pecho: { mv: 4, mev: 6, mrv: 20 }, // RP Chest
  Espalda: { mv: 6, mev: 10, mrv: 20 }, // RP Back
  Cuádriceps: { mv: 6, mev: 8, mrv: 18 }, // RP Quads
  Femoral: { mv: 3, mev: 4, mrv: 12 }, // RP Hamstrings (glutes contribute 0/0/12)
  Gemelo: { mv: 6, mev: 8, mrv: 16 }, // RP Calves
  Hombro: { mv: 6, mev: 8, mrv: 25 }, // RP Side Delts (of front/side/rear)
  Bíceps: { mv: 4, mev: 8, mrv: 20 }, // RP Biceps
  Tríceps: { mv: 4, mev: 6, mrv: 16 }, // RP Triceps
  Core: { mv: 0, mev: 0, mrv: 25 }, // RP Abs — MEV is genuinely zero
}

// Where the band sits on every row's track, as a fraction of its width.
//
// This is the decision that lets the screen be read without reading it. The
// track is *not* linear in sets — a linear track would put Femoral's zone at
// 4–12 and Hombro's at 8–25, so nine rows would draw nine differently-placed
// bands and comparing them would mean decoding each one first. Instead the
// mapping is piecewise-linear with fixed anchors: **mev always lands at MEV_AT
// and mrv always at MRV_AT, on every row.** The zone is therefore the same
// stretch of every track, the two marks can be drawn as two static ticks in one
// straight column down the card, and the only thing that moves between rows is
// the fill edge. Same fraction, same meaning, nine rows deep.
//
// The three segments and what they are worth:
//   0 → mev   the shortfall runway, 0…MEV_AT. Gets the widest segment because it
//             is the only region carrying an actionable number (the gap), and it
//             needs enough resolution that one missing set is visible.
//   mev → mrv the productive zone, MEV_AT…MRV_AT.
//   mrv → ∞   the tail, MRV_AT…1, full at one further band-width past mrv. The
//             smallest segment: it is unbounded, and per DESIGN.md over the zone
//             is a position and not an error, so it does not need resolution.
//
// The two values themselves are inherited from the row builder's placeholder so
// the row's tick marks do not have to move. Any change to them is a change to
// the drawn layout, not just to this file.
export const MEV_AT = 0.38
export const MRV_AT = 0.74

const round1 = (n) => Math.round(n * 10) / 10
const clamp01 = (n) => Math.min(1, Math.max(0, n))

// The landmarks for a group, or null for anything outside the nine — cardio and
// unclassified lifts have no band, and saying so is different from saying zero.
export function bandFor(group) {
  return Object.prototype.hasOwnProperty.call(BANDS, group) ? BANDS[group] : null
}

// Where `sets` sits against the group's band.
//
// `gap` is the only number on a row you can act on in the next session, so it is
// reported only where it exists — under MEV — and in the same fractional unit
// the row prints, since a bench press deposits 0.5 into two other rows.
//
// Both bounds are inclusive: MEV is the minimum *effective* volume, so being at
// it is being in the band, and MRV is the most you can recover from, so being at
// it is still recoverable.
export function bandState(group, sets) {
  const band = bandFor(group)
  if (!band) return { state: 'sin-banda', gap: 0, band: null }
  if (sets > band.mrv) return { state: 'sobre', gap: 0, band }
  if (sets >= band.mev) return { state: 'zona', gap: 0, band }
  // Floored at 0.1: a hair under MEV rounds to a gap of zero, and "+0 al mínimo"
  // reads as "you are there" on the one row that is not.
  return { state: 'bajo', gap: Math.max(0.1, round1(band.mev - sets)), band }
}

// 0..1 along the track, with the band pinned to MEV_AT…MRV_AT on every group.
// See the comment on those constants for why. 0 for a group with no band: there
// is nothing to fill against.
export function bandPosition(group, sets) {
  const band = bandFor(group)
  if (!band) return 0
  const { mev, mrv } = band
  if (sets <= mev) {
    // mev === 0 (Core) makes the runway zero-width — zero sets already meets the
    // minimum, so the fill starts at the mark rather than dividing by zero.
    return mev > 0 ? clamp01((sets / mev) * MEV_AT) : MEV_AT
  }
  const width = mrv - mev
  if (sets <= mrv) return MEV_AT + ((sets - mev) / width) * (MRV_AT - MEV_AT)
  return clamp01(MRV_AT + ((sets - mrv) / width) * (1 - MRV_AT))
}

// Every group has a band. Guards the two files against drifting apart: a tenth
// group, or a rename, would otherwise ship a row with no reference and no error.
if (import.meta.env?.DEV) {
  const missing = MUSCLE_GROUPS.filter((g) => bandFor(g) === null)
  if (missing.length > 0) {
    console.warn(`volume.js: no band for ${missing.join(', ')}`)
  }
}
