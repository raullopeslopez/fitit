// Dev-only bench data for the per-muscle volume row (`?harness=volume`).
//
// A week engineered to hold every state the row can be in at once, because the
// row is only judgeable against all of them side by side: one muscle well over
// its band, one barely over, three comfortably inside, one sitting on the
// bottom edge, two under, and one at flat zero this week after a real week
// before it. Plus cardio and a couple of lifts the classifier can't place, so
// the "sin músculo asignado" footnote has something to say.
//
// The counts below are what `setsPerMuscle` must *end up* with, not how many
// set rows to write. Counting is fractional — a set gives its primary group a
// whole set and every secondary half of one (see `setsInWindow` in stats.js) —
// so the compound lifts are laid down first and the rest is topped up with
// single-group filler. Cuádriceps ends on `.5` on purpose: it is the one row
// that has to land exactly on the bottom edge of its band, and half-sets are
// the only way a real log gets there.
//
// Everything is dated off `new Date()` at import, so the fixture always lands
// in the week the card opens on, whatever day you run it.

const pad = (n) => String(n).padStart(2, '0')
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const shift = (date, delta) => {
  const out = new Date(date)
  out.setDate(out.getDate() + delta)
  return out
}

const today = new Date()
// 0 = Monday … 6 = Sunday, the week stats.js counts in.
const dow = (today.getDay() + 6) % 7
const monday = shift(today, -dow)

// Fractional sets per group this week, read against the mev–mrv bands in
// volume.js: Pecho 6–20, Espalda 10–20, Cuádriceps 8–18, Femoral 4–12,
// Gemelo 8–16, Hombro 8–25, Bíceps 8–20, Tríceps 6–16, Core 0–25.
const TARGETS = {
  Hombro: 32, // well past 25 — the row that has to shout
  Gemelo: 17, // one set past 16 — the one that must not read as "inside"
  Espalda: 16, // comfortably inside
  Pecho: 14, // comfortably inside
  Core: 12.5, // comfortably inside (abs have no floor: RP put ab MEV at zero)
  Cuádriceps: 8.5, // sitting on the bottom edge of 8
  Tríceps: 4.5, // under 6, by a fraction — the gap the row prints is 1.5
  Bíceps: 3, // well under 8
  Femoral: 0, // untouched this week, trained last — the silent row
}

// The compound lifts, written first because they are what makes the counting
// fractional. `[name, primary, secondaries, howMany]`.
const COMPOUNDS = [
  ['Press banca', 'Pecho', ['Tríceps', 'Hombro'], 2],
  ['Remo con barra', 'Espalda', ['Bíceps'], 2],
  ['Press militar', 'Hombro', ['Tríceps', 'Core'], 1],
  ['Elevación de talones', 'Gemelo', ['Cuádriceps'], 1],
]

// One filler lift per group, so the exercise names on the bench look like a log
// and not like a spreadsheet.
const FILLER = {
  Pecho: 'Aperturas en polea',
  Espalda: 'Jalón neutro',
  Cuádriceps: 'Prensa',
  Femoral: 'Curl femoral',
  Gemelo: 'Gemelo en máquina',
  Hombro: 'Elevaciones laterales',
  Bíceps: 'Curl con mancuerna',
  Tríceps: 'Extensión en polea',
  Core: 'Rueda abdominal',
}

let nextId = 1000

function strengthSet(name, group, secondaries) {
  return {
    id: (nextId += 1),
    exercise_id: 1,
    exercise_name: name,
    kind: 'strength',
    muscle_group: group,
    secondary_groups: secondaries,
    set_index: 0,
    reps: 10,
    weight: 40,
    rpe: null,
    note: null,
    duration_seconds: null,
    distance: null,
    created_at: `${isoOf(today)}T09:00:00.000000Z`,
  }
}

function cardioSet(name, seconds, km) {
  return {
    id: (nextId += 1),
    exercise_id: 2,
    exercise_name: name,
    kind: 'cardio',
    muscle_group: null,
    secondary_groups: [],
    set_index: 0,
    reps: null,
    weight: null,
    rpe: null,
    note: null,
    duration_seconds: seconds,
    distance: km,
    created_at: `${isoOf(today)}T09:00:00.000000Z`,
  }
}

// Sets whose exercise the classifier never placed: real volume, no row to land
// in. They are the reason the card carries a "sin músculo asignado" line.
function unplacedSet(name) {
  const set = strengthSet(name, null, [])
  return set
}

// Lay the compounds down, tally what they already gave each group, then top up
// with single-group filler until every target is met. Anything that does not
// come out whole is a fixture bug and says so rather than drawing a row that
// quietly means something else.
function weekSets() {
  const sets = []
  const have = {}
  const add = (group, n) => {
    have[group] = (have[group] || 0) + n
  }

  for (const [name, primary, secondaries, count] of COMPOUNDS) {
    for (let i = 0; i < count; i += 1) {
      sets.push(strengthSet(name, primary, secondaries))
      add(primary, 1)
      for (const group of secondaries) add(group, 0.5)
    }
  }

  for (const [group, target] of Object.entries(TARGETS)) {
    const need = Math.round((target - (have[group] || 0)) * 10) / 10
    if (need < 0 || need % 1 !== 0) {
      throw new Error(
        `fixture: ${group} needs ${need} more sets, which no whole set can supply`,
      )
    }
    for (let i = 0; i < need; i += 1) sets.push(strengthSet(FILLER[group], group, []))
  }

  sets.push(cardioSet('Cinta', 1500, 4.2))
  sets.push(cardioSet('Bici estática', 1200, 8))
  sets.push(cardioSet('Remo ergómetro', 900, 2.5))
  sets.push(unplacedSet('Face pull en cruce'))
  sets.push(unplacedSet('Face pull en cruce'))
  sets.push(unplacedSet('Paseo del granjero'))

  return sets
}

// Spread the week over as many training days as the week has actually had, up
// to four — a hundred sets on one Monday is not a week anybody trained.
function thisWeek() {
  const sets = weekSets()
  const slots = Math.min(4, dow + 1)
  const names = ['Push', 'Pull', 'Pierna', 'Full body']
  const days = []
  for (let slot = 0; slot < slots; slot += 1) {
    const date = isoOf(shift(monday, Math.round((slot * dow) / Math.max(slots - 1, 1))))
    const mine = sets.filter((_, i) => i % slots === slot).map((s, i) => ({ ...s, set_index: i }))
    days.push({
      id: 900 + slot,
      date,
      workouts: [{ id: 900 + slot, date, name: names[slot], sets: mine }],
    })
  }
  // Two slots can land on the same date when the week is one or two days old;
  // merge them so the feed never carries a duplicate date, which `/days` can't.
  const merged = []
  for (const day of days) {
    const seen = merged.find((d) => d.date === day.date)
    if (seen) seen.workouts.push(...day.workouts)
    else merged.push(day)
  }
  return merged
}

// The week before: enough of everything that the deltas mean something, and
// Femoral present so its zero this week keeps a row instead of vanishing.
function lastWeek() {
  const spec = {
    Pecho: 10,
    Espalda: 12,
    Cuádriceps: 12,
    Femoral: 10,
    Gemelo: 6,
    Hombro: 14,
    Bíceps: 6,
    Tríceps: 6,
    Core: 8,
  }
  const sets = []
  for (const [group, n] of Object.entries(spec)) {
    for (let i = 0; i < n; i += 1) sets.push(strengthSet(FILLER[group], group, []))
  }
  // Two sessions, and one of them on last week's Monday: a week in progress is
  // compared against the *matching stretch* of the week before, which on a
  // Monday is one day long. Put nothing there and the whole delta column
  // disappears from the bench on one day in seven.
  return [-7, -4].map((offset, slot) => {
    const date = isoOf(shift(monday, offset))
    const mine = sets
      .filter((_, i) => i % 2 === slot)
      .map((s, i) => ({ ...s, set_index: i, created_at: `${date}T09:00:00.000000Z` }))
    return {
      id: 890 + slot,
      date,
      workouts: [{ id: 890 + slot, date, name: 'Full body', sets: mine }],
    }
  })
}

// Newest first, the order `/days` returns.
export const days = [...thisWeek(), ...lastWeek()].sort((a, b) => (a.date < b.date ? 1 : -1))

// The case above flatters, and in one specific way: it packs a whole week of
// volume into however many days the week has had, so on a Monday the card says
// `1 de 7 días` over needles spread the width of the track. That is not a
// Monday. A real one is one session, ~15 sets, and it is the picture this
// design has to survive five days out of seven — eight needles stacked at the
// far left, eight tails of almost the same length, and the two or three groups
// you actually trained the only ones anywhere near their band.
//
// `?harness=volume&case=monday`. Separate export on purpose: `days` is what the
// other benches are pinned to and it does not move.
const MONDAY = [
  ['Press banca', 'Pecho', ['Tríceps', 'Hombro'], 4], // Pecho 4, Tríceps 2, Hombro 2
  ['Press militar', 'Hombro', ['Tríceps', 'Core'], 3], // Hombro 3, Tríceps 1.5, Core 1.5
  ['Elevaciones laterales', 'Hombro', [], 4], // Hombro 4
  ['Extensión en polea', 'Tríceps', [], 4], // Tríceps 4
]

function mondayWeek() {
  const sets = []
  for (const [name, primary, secondaries, count] of MONDAY) {
    for (let i = 0; i < count; i += 1) sets.push(strengthSet(name, primary, secondaries))
  }
  const date = isoOf(monday)
  return [
    {
      id: 800,
      date,
      workouts: [
        {
          id: 800,
          date,
          name: 'Push',
          sets: sets.map((s, i) => ({ ...s, set_index: i, created_at: `${date}T09:00:00.000000Z` })),
        },
      ],
    },
  ]
}

// A full week behind it, so every group still holds a row: without it the six
// untrained muscles vanish and the bench stops showing the thing it is for.
export const mondayDays = [...mondayWeek(), ...lastWeek()].sort((a, b) =>
  a.date < b.date ? 1 : -1,
)
// --- The week with nothing in it (`?harness=volume&caso=vacia`) --------------
//
// Not a variant of the bench above: that one is engineered to hold nine band
// states at once, and the whole point here is that a week with nothing in it
// has no states to hold. What it needs instead is a *plausible* week behind it,
// because the empty state is judged on what it hands over — four sessions, 44
// sets, and two groups that genuinely finished under their band (Cuádriceps 4
// against a floor of 8, Gemelo 4 against 8). Everything else closed inside.
//
// This is the live state of the author's own account on the morning of 10 Aug
// 2026, and it is the state roughly one day in seven is in.
const PREVIOUS = [
  // [name, primary, secondaries, sets]
  [
    ['Press banca', 'Pecho', ['Tríceps', 'Hombro'], 4],
    ['Press militar', 'Hombro', ['Tríceps', 'Core'], 3],
    ['Elevaciones laterales', 'Hombro', [], 3],
    ['Extensión en polea', 'Tríceps', [], 3],
  ],
  [
    ['Jalón neutro', 'Espalda', ['Bíceps'], 4],
    ['Remo con barra', 'Espalda', ['Bíceps'], 4],
    ['Curl con mancuerna', 'Bíceps', [], 3],
  ],
  [
    ['Prensa', 'Cuádriceps', ['Femoral'], 4],
    ['Curl femoral', 'Femoral', [], 3],
    ['Gemelo en máquina', 'Gemelo', [], 4],
  ],
  [
    ['Press banca', 'Pecho', ['Tríceps', 'Hombro'], 3],
    ['Remo con barra', 'Espalda', ['Bíceps'], 3],
    ['Rueda abdominal', 'Core', [], 3],
  ],
]

function previousWeek() {
  const names = ['Push', 'Pull', 'Pierna', 'Full body']
  // Mon / Wed / Fri / Sat of the week before this one.
  return [-7, -5, -3, -2].map((offset, slot) => {
    const date = isoOf(shift(monday, offset))
    const sets = []
    for (const [name, primary, secondaries, count] of PREVIOUS[slot]) {
      for (let i = 0; i < count; i += 1) {
        sets.push({
          ...strengthSet(name, primary, secondaries),
          set_index: sets.length,
          created_at: `${date}T18:30:00.000000Z`,
        })
      }
    }
    return {
      id: 800 + slot,
      date,
      workouts: [{ id: 800 + slot, date, name: names[slot], sets }],
    }
  })
}

export const emptyWeekDays = previousWeek().sort((a, b) => (a.date < b.date ? 1 : -1))

// --- The week you ran in and did not lift in (`?harness=volume&caso=cardio`) --
//
// The state no bench case covered, and the one that could only be found by
// importing `stats.js` into Node: a week with real sets in it and no
// *classified* volume. Cardio has no muscle group by design, so `counts` comes
// back empty — but a lifter who trained in the previous eight weeks still gets
// all nine rows seeded at zero, and `sets` is above zero because the runs are
// sets. The card therefore satisfied every "is this empty" test it had and drew
// nine deficit runways over a week in which something plainly happened.
//
// Same previous week as `vacia`, because the handover is the same handover: the
// only figures on screen that are real and final are last week's. The
// difference is entirely in the current week, which is the point.
function cardioWeek() {
  // Monday always exists; today only differs from it after Monday. Two runs
  // rather than one so the sessions count is not the singular that hides a
  // plural bug.
  const dates = [...new Set([isoOf(monday), isoOf(today)])]
  return dates.map((date, slot) => ({
    id: 850 + slot,
    date,
    workouts: [
      {
        id: 850 + slot,
        date,
        name: 'Cardio',
        sets: [
          { ...cardioSet('Cinta', 1800, 5.4), set_index: 0, created_at: `${date}T07:10:00.000000Z` },
          { ...cardioSet('Bici estática', 1200, 8), set_index: 1, created_at: `${date}T07:40:00.000000Z` },
        ],
      },
    ],
  }))
}

export const cardioOnlyDays = [...cardioWeek(), ...previousWeek()].sort((a, b) =>
  a.date < b.date ? 1 : -1,
)

// --- The muscle nobody touched (`?harness=volume&caso=intacto`) --------------
//
// The one row RP's landmarks put a floor of zero under. Core at literally no
// sets is `en zona` by the arithmetic — abs need no direct work and the number
// is right — so the card used to draw it with a needle on the band's near edge
// and nothing to read, which is exactly what eight sets of squats draws. Two
// opposite facts, one picture, and no bench case produced it: `llena` gives
// Core 12.5 and `lunes` gives it 1.5.
//
// Three weeks, because the row has to be judgeable in both tenses: this one
// running with Core at zero, the one before it *closed* with Core at zero
// (press ‹), and one further back holding 8 sets of it — without that the group
// falls out of the eight-week window and there is no row at all to look at.
const QUIET_CORE = {
  Pecho: 14,
  Hombro: 12,
  Bíceps: 9,
  Espalda: 8, // under 10 — a deficit tail above Core
  Tríceps: 7,
  Femoral: 6,
  Cuádriceps: 5, // under 8
  Gemelo: 4, // under 8
}

function flatWeek(id, offset, spec) {
  const date = isoOf(shift(monday, offset))
  const sets = []
  for (const [group, n] of Object.entries(spec)) {
    for (let i = 0; i < n; i += 1) {
      sets.push({
        ...strengthSet(FILLER[group], group, []),
        set_index: sets.length,
        created_at: `${date}T18:30:00.000000Z`,
      })
    }
  }
  return { id, date, workouts: [{ id, date, name: 'Full body', sets }] }
}

export const quietCoreDays = [
  flatWeek(870, 0, QUIET_CORE),
  flatWeek(871, -7, QUIET_CORE),
  flatWeek(872, -14, { ...QUIET_CORE, Core: 8 }),
].sort((a, b) => (a.date < b.date ? 1 : -1))

// An account that has never logged anything. `[]` is the whole fixture, and
// that is the point: the first screen has to be designed for it, because it is
// the only screen every single user sees.
export const noHistoryDays = []

export default days
