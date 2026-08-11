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
// Measured against three real weeks of the user's log, the damage was not
// theoretical: Bíceps read 29.5 sets one week off 16 direct and 13.5 collected
// from rows and pulldowns, and Bíceps, Tríceps and Hombro all reported "sobre"
// in weeks where their direct work sat comfortably inside the band. The screen
// would have said "cut your biceps volume" to somebody doing a normal amount of
// direct bicep work.
//
// So it is corrected, and without inventing an assumed press volume: the log
// already knows exactly how many half-sets landed on a group indirectly, week by
// week. `setsInWindow` reports them, and everything below judges
//
//     direct = total − indirect
//
// against RP's published band, which is the one comparison the landmarks were
// written for. No constant, no assumption, no averaging across weeks.
//
// Fractional counting stays as the app's unit — the user's call, and the reason
// is that the total is a real quantity the log went to some trouble to compute.
// So a row keeps printing the fractional total while its *state* answers RP's
// question about direct work. `effectiveBand` exists for the seam that opens
// between those two: it restates the band in total-units (band + indirect), so a
// row printing 29.5 can print a band of 21.5–33.5 beneath it and have the two
// agree. Whether a row shows the raw band, the effective band, or neither is a
// display decision and belongs to the row, not here.
//
// One thing this does not fix, and cannot: the four inflated groups still have
// a *noisier* number than the five clean ones, because half a set is a coarser
// instrument than a whole one. It changes what the number is worth, not whether
// it is right.

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
//   0 → mev   the shortfall runway, 0…MEV_AT. The one segment that is *not*
//             normalised per muscle — it runs on a shared absolute sets scale,
//             see RUNWAY_SETS below, so the tail is the missing work at full
//             size. Gets the widest segment because it is the only region
//             carrying an actionable number (the gap), and it needs enough
//             resolution that one missing set is visible.
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

// How many missing sets the runway spans, end to end. The zone and the tail are
// normalised per muscle because their job is to be comparable *as positions* —
// "inside" means the same thing on nine different bands. The runway's job is
// the opposite: it is the only place on the track carrying a quantity you can
// act on, and the quantity is a number of sets, so it gets an absolute scale
// shared by all nine rows. A gap of four draws the same length wherever it is.
//
// Normalising it too was the bug this constant fixes. `sets / mev` put every
// muscle at zero on the identical pixel — the picture that is true five days
// out of seven carried no information at all — and it ranked a shortfall of 4
// on Femoral (mev 4, so the whole runway) ahead of one of 5 on Bíceps (mev 8,
// so five eighths of it), which is the drawing contradicting the digit printed
// beside it.
//
// The value is the largest MEV in the table — Espalda's 10 — and it is read out
// of BANDS rather than typed, so it cannot drift. That is the worst real case:
// a shortfall is `mev - direct` with direct floored at zero, so it can never
// exceed the group's own MEV, and therefore never exceeds this. Reading the max
// out of the table rather than fixing it at 10 is what keeps that true when a
// band moves. Should something ever hand in a shortfall past the end anyway,
// `clamp01` pins the mark at the foot of the track: two rows owing 11 and 14
// would draw the same maximal tail, which understates the worse one rather
// than drawing it outside the track — the safe direction, and `faltan N` still
// separates them in words.
export const RUNWAY_SETS = Math.max(...Object.values(BANDS).map((b) => b.mev))

const round1 = (n) => Math.round(n * 10) / 10
const clamp01 = (n) => Math.min(1, Math.max(0, n))

// The landmarks for a group, or null for anything outside the nine — cardio and
// unclassified lifts have no band, and saying so is different from saying zero.
export function bandFor(group) {
  return Object.prototype.hasOwnProperty.call(BANDS, group) ? BANDS[group] : null
}

// The band restated in the units a row actually prints. RP bands direct work;
// a Fitit row prints direct + indirect. Adding the week's own indirect volume to
// both bounds puts them on the same scale as the printed number, so a row
// showing 29.5 can show 21.5–33.5 beside it without the two contradicting
// each other. Purely a presentation helper — `bandState` does not use it,
// because `total >= mev + indirect` and `direct >= mev` are the same statement
// and the second one is the one worth writing down.
export function effectiveBand(group, indirect = 0) {
  const band = bandFor(group)
  if (!band) return null
  const i = Math.max(0, indirect)
  return { mv: round1(band.mv + i), mev: round1(band.mev + i), mrv: round1(band.mrv + i) }
}

// Where a week's work sits against the group's band.
//
// `sets` is the fractional total the row prints; `indirect` is how much of it
// arrived as another lift's secondary group (`setsPerMuscle` reports it per
// row). The judgement is made on the difference, because that is the only
// quantity RP's landmarks describe.
//
// `gap` is the only number on a row you can act on in the next session, so it is
// reported only where it exists — under MEV — and it counts **direct sets**,
// which is also the only kind you can decide to add. Ten more sets of rows will
// not close a bicep gap, and a gap that could be closed by accident would be
// advice nobody can follow.
//
// Both bounds are inclusive: MEV is the minimum *effective* volume, so being at
// it is being in the band, and MRV is the most you can recover from, so being at
// it is still recoverable.
export function bandState(group, sets, indirect = 0) {
  const band = bandFor(group)
  if (!band) return { state: 'sin-banda', gap: 0, band: null, direct: 0 }
  // Compared unrounded and reported rounded. Rounding first would promote 5.96
  // direct sets to 6 and call a shortfall "en zona" — the exact hair's-breadth
  // case the 0.1 floor below exists to keep honest.
  const exact = Math.max(0, sets - Math.max(0, indirect))
  const direct = round1(exact)
  if (exact > band.mrv) return { state: 'sobre', gap: 0, band, direct }
  if (exact >= band.mev) return { state: 'zona', gap: 0, band, direct }
  // Floored at 0.1: a hair under MEV rounds to a gap of zero, and "+0 al mínimo"
  // reads as "you are there" on the one row that is not.
  return { state: 'bajo', gap: Math.max(0.1, round1(band.mev - exact)), band, direct }
}

// 0..1 along the track, with the band pinned to MEV_AT…MRV_AT on every group.
// See the comment on those constants for why. 0 for a group with no band: there
// is nothing to fill against.
//
// Fills on **direct** sets, the same quantity `bandState` judges, so the mark
// and the word under it can never disagree. The alternative — filling on the
// printed total against the effective band — puts a row with zero direct work
// a quarter of the way up its runway, which reads as progress toward a minimum
// that pulling and pressing do not move you toward.
export function bandPosition(group, sets, indirect = 0) {
  const band = bandFor(group)
  if (!band) return 0
  const { mev, mrv } = band
  sets = Math.max(0, sets - Math.max(0, indirect))
  if (sets <= mev) {
    // Below the minimum the mark is placed by the **shortfall in sets**, on the
    // scale every row shares (see RUNWAY_SETS). So the tail the mark drags back
    // to the band edge is the missing work drawn at full size, and the five
    // rows of a blank Monday fan out into a staircase instead of stacking on
    // one pixel. mev === 0 (Core) needs no special case any more: zero sets
    // already meets the minimum, the shortfall is zero, and the mark lands on
    // MEV_AT without anything dividing by mev.
    return clamp01(MEV_AT * (1 - (mev - sets) / RUNWAY_SETS))
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
