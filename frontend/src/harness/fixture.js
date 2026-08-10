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

export default days
