import { estimatedOneRm } from './format.js'
import { MUSCLE_GROUPS } from './muscles.js'

const pad = (n) => String(n).padStart(2, '0')

function isoOf(dt) {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

function shiftDay(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number)
  return isoOf(new Date(y, m - 1, d + delta))
}

function todayIso() {
  return isoOf(new Date())
}

// Whole days from `from` to `to`. Rounded because a DST boundary makes one of
// them 23 or 25 hours long.
function daysBetween(from, to) {
  const [ay, am, ad] = from.split('-').map(Number)
  const [by, bm, bd] = to.split('-').map(Number)
  return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 86400000)
}

const round1 = (n) => Math.round(n * 10) / 10

// Monday (ISO week start) of the week containing an ISO date.
function mondayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7 // 0=Mon … 6=Sun
  return shiftDay(iso, -dow)
}

// How many sets were logged each day: { 'YYYY-MM-DD': n }. A set is a set —
// strength or cardio — so a hard day counts higher regardless of exercise kind.
export function dailySetCounts(days) {
  const counts = {}
  for (const day of days) {
    counts[day.date] = day.workouts.reduce((n, w) => n + w.sets.length, 0)
  }
  return counts
}

// Buckets of daily set count → amber intensity 0–4 (0 = rest day).
function heatLevel(count) {
  if (count <= 0) return 0
  if (count <= 4) return 1
  if (count <= 9) return 2
  if (count <= 14) return 3
  return 4
}

// A GitHub-style grid: `weeks` columns × 7 rows (Mon…Sun), most recent week last.
// Each cell is { date, count, level, future }. Days after `endDate` are `future`.
export function heatmapGrid(days, { weeks = 15, endDate } = {}) {
  const counts = dailySetCounts(days)
  const end = endDate ?? todayIso()
  const firstMonday = shiftDay(mondayOf(end), -(weeks - 1) * 7)
  const cols = []
  for (let c = 0; c < weeks; c++) {
    const col = []
    for (let r = 0; r < 7; r++) {
      const date = shiftDay(firstMonday, c * 7 + r)
      const count = counts[date] || 0
      col.push({
        date,
        count,
        level: heatLevel(count),
        future: date > end,
        today: date === end,
      })
    }
    cols.push(col)
  }
  return cols
}

// Which sets in a session are records worth flagging: a set qualifies only if
// its estimated 1RM beats everything before it — the mark you walked in with
// AND every set you've already done today. The bar rises as you lift, so a
// session can only ever produce a rising sequence of flags.
//
// `priorBest` of null means there is no mark to beat yet: the first set sets
// the baseline silently rather than calling itself a record.
export function prSetIds(sets, priorBest = null) {
  const ids = new Set()
  let peak = priorBest
  for (const set of sets) {
    // Cardio sets carry duration/distance, not weight/reps — no 1RM to compare.
    if (set.weight == null || set.reps == null) continue
    // Kilos throughout: `priorBest` comes from the API in kilos, and a set
    // logged in pounds must not win on the strength of its bigger number.
    const oneRm = estimatedOneRm(set.weight, set.reps)
    if (peak != null && oneRm > peak) ids.add(set.id)
    if (peak == null || oneRm > peak) peak = oneRm
  }
  return ids
}

// --- What you trained --------------------------------------------------------

// The muscle groups a day worked and how many sets each took:
// { '2026-07-16': { Pecho: 8, Tríceps: 4 } }. Sets whose exercise has no group
// are left out — an unrecognized name has no colour to give the cell. They
// still count as volume, which is why the grid below reads its totals from
// `dailySetCounts` rather than from these buckets.
export function muscleByDay(days) {
  const byDate = {}
  for (const day of days) {
    const counts = {}
    for (const workout of day.workouts) {
      for (const set of workout.sets) {
        if (!set.muscle_group) continue
        counts[set.muscle_group] = (counts[set.muscle_group] || 0) + 1
      }
    }
    byDate[day.date] = counts
  }
  return byDate
}

// Heaviest group first. Ties break on the canonical order so a cell's colour
// never depends on the order the sets happened to come back in.
function rankGroups(counts) {
  return Object.entries(counts)
    .map(([group, sets]) => ({ group, sets }))
    .sort(
      (a, b) =>
        b.sets - a.sets ||
        MUSCLE_GROUPS.indexOf(a.group) - MUSCLE_GROUPS.indexOf(b.group),
    )
}

// The same grid as `heatmapGrid`, but each cell carries the muscles behind its
// volume: `{ date, total, groups, level, future, today }`. Colour comes from
// `groups`, opacity from `level` — one cell, two things said at once.
export function muscleHeatmapGrid(days, { weeks = 15, endDate } = {}) {
  const totals = dailySetCounts(days)
  const byDate = muscleByDay(days)
  const end = endDate ?? todayIso()
  const firstMonday = shiftDay(mondayOf(end), -(weeks - 1) * 7)
  const cols = []
  for (let c = 0; c < weeks; c++) {
    const col = []
    for (let r = 0; r < 7; r++) {
      const date = shiftDay(firstMonday, c * 7 + r)
      const total = totals[date] || 0
      col.push({
        date,
        total,
        groups: rankGroups(byDate[date] || {}),
        level: heatLevel(total),
        future: date > end,
        today: date === end,
      })
    }
    cols.push(col)
  }
  return cols
}

// --- Periods -----------------------------------------------------------------

// The week (Mon–Sun) or calendar month containing a date, as inclusive bounds.
function periodOf(iso, period) {
  if (period === 'month') {
    const [y, m] = iso.split('-').map(Number)
    const last = new Date(y, m, 0).getDate() // day 0 of next month = last of this
    return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` }
  }
  const start = mondayOf(iso)
  return { start, end: shiftDay(start, 6) }
}

function previousPeriod({ start }, period) {
  return periodOf(shiftDay(start, period === 'month' ? -1 : -7), period)
}

// How many weeks of a period have actually happened. A month still in progress
// is measured against the days elapsed, so the current one doesn't look thin
// next to a finished one just for being young.
function weeksElapsed({ start, end }, today) {
  const last = end > today ? today : end
  return Math.max(1, (daysBetween(start, last) + 1) / 7)
}

const dayTrained = (day) => day.workouts.some((w) => w.sets.length > 0)

// Every period from the one holding `endDate` back to the one holding the first
// day you ever trained, newest first — which is the line the ‹ › arrows walk.
// `sessions` counts training days, not workouts: two sessions on one date is a
// split entry, not twice the training.
export function sessionsPerPeriod(days, period = 'week', { endDate } = {}) {
  const end = endDate ?? todayIso()
  const trained = days.filter(dayTrained).map((d) => d.date)
  const earliest = trained.length > 0 ? [...trained].sort()[0] : null
  const periods = []
  let current = periodOf(end, period)
  for (;;) {
    const sessions = new Set(
      trained.filter((d) => d >= current.start && d <= current.end),
    ).size
    const weeks = round1(weeksElapsed(current, end))
    periods.push({ ...current, sessions, weeks, perWeek: round1(sessions / weeks) })
    if (earliest === null || current.start <= earliest) return periods
    current = previousPeriod(current, period)
  }
}

function setsInWindow(days, { start, end }) {
  const counts = {}
  let total = 0
  for (const day of days) {
    if (day.date < start || day.date > end) continue
    for (const workout of day.workouts) {
      for (const set of workout.sets) {
        total += 1
        if (!set.muscle_group) continue
        counts[set.muscle_group] = (counts[set.muscle_group] || 0) + 1
      }
    }
  }
  return { counts, total }
}

// One row per muscle group worked in a period, biggest first, each with the
// change against the same measure one period earlier. `index` is 0 for the most
// recent period and counts backwards; past the start of the history it clamps.
//
// Month mode reports a weekly average, because "61 sets in July" and "61 sets
// this week" are not the same sentence. `delta` compares whatever is displayed:
// the average in month mode, the raw count in week mode.
export function setsPerMuscle(days, { period = 'week', index = 0, endDate } = {}) {
  const periods = sessionsPerPeriod(days, period, { endDate })
  const at = Math.min(Math.max(index, 0), periods.length - 1)
  const current = periods[at]
  const before = previousPeriod(current, period)
  const end = endDate ?? todayIso()

  const now = setsInWindow(days, current)
  const then = setsInWindow(days, before)
  const nowWeeks = current.weeks
  const thenWeeks = round1(weeksElapsed(before, end))
  const shown = (sets, weeks) => (period === 'month' ? round1(sets / weeks) : sets)

  const rows = rankGroups(now.counts).map(({ group, sets }) => ({
    group,
    sets,
    perWeek: round1(sets / nowWeeks),
    delta: round1(shown(sets, nowWeeks) - shown(then.counts[group] || 0, thenWeeks)),
  }))

  return {
    start: current.start,
    end: current.end,
    sessions: current.sessions,
    weeks: nowWeeks,
    sets: now.total,
    perWeek: round1(now.total / nowWeeks),
    rows,
  }
}

// --- Real records ------------------------------------------------------------

const isStrength = (set) => set.weight != null && set.reps != null

// A weight record: more kilos than you had ever moved before at that many reps
// *or more*. `prSetIds` above answers a different, looser question — it compares
// estimated 1RMs, so a heavy single can beat a hard set of eight on paper. This
// one only ever says "you had never moved this much for this many".
//
// `history` seeds the marks to beat without being flagged itself. With no
// history at all the first set is a baseline rather than a record — the same
// restraint `prSetIds` shows, because a first mark isn't an achievement.
// `includeFirst` lifts that for the record ladder, where the first mark is the
// first step of the story.
export function weightPrs(sets, { history = [], includeFirst = false } = {}) {
  const ids = new Set()
  const prior = history.filter(isStrength)
  let seeded = prior.length > 0
  for (const set of sets) {
    if (!isStrength(set)) continue
    // The bar for this rep count: nothing lifted at this many reps or more
    // leaves it at -Infinity, so any weight clears it — which is right, you had
    // never done that many.
    const bar = prior.reduce(
      (max, p) => (p.reps >= set.reps && p.weight > max ? p.weight : max),
      -Infinity,
    )
    if ((seeded || includeFirst) && set.weight > bar) ids.add(set.id)
    prior.push(set)
    seeded = true
  }
  return ids
}

// The API normalizes names, so a lookup only has to survive stray whitespace
// and case.
const sameExercise = (a, b) =>
  String(a ?? '').trim().replace(/\s+/g, ' ').toLowerCase() ===
  String(b ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

// Every set of one exercise, oldest first, each carrying the day it was logged.
function historyOf(days, exerciseName) {
  const out = []
  const ordered = [...days].sort((a, b) => (a.date < b.date ? -1 : 1))
  for (const day of ordered) {
    const workouts = [...day.workouts].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    for (const workout of workouts) {
      const sets = [...workout.sets].sort((a, b) => (a.set_index ?? 0) - (b.set_index ?? 0))
      for (const set of sets) {
        if (sameExercise(set.exercise_name, exerciseName)) out.push({ ...set, date: day.date })
      }
    }
  }
  return out
}

// The rungs of one exercise's climb, oldest first. A rung is a set heavier than
// anything before it, or the same weight for more reps than you had ever done
// at it. No interpolation — every step is a day you actually did it.
//
// Deliberately not `weightPrs`: that one keeps a separate bar per rep count, so
// a first set at a new rep range counts even when it's lighter. Right for the
// banner mid-session, wrong here — it would draw a staircase that goes down.
export function recordLadder(days, exerciseName) {
  const rungs = []
  let bestWeight = -Infinity
  let bestReps = 0
  for (const set of historyOf(days, exerciseName)) {
    if (!isStrength(set)) continue
    const heavier = set.weight > bestWeight
    const longer = set.weight === bestWeight && set.reps > bestReps
    if (!heavier && !longer) continue
    bestWeight = set.weight
    bestReps = set.reps
    rungs.push({ date: set.date, weight: set.weight, reps: set.reps })
  }
  return rungs
}

// The last session that included this exercise: when it was, how long ago, its
// heaviest set (`top` — the mark to beat) and the one it ended on (`last`).
// Null when the exercise has never been logged.
export function lastTime(days, exerciseName, { today } = {}) {
  const sets = historyOf(days, exerciseName)
  if (sets.length === 0) return null
  const date = sets.at(-1).date
  const session = sets.filter((s) => s.date === date)
  const top = session.filter(isStrength).reduce((best, s) => {
    if (best == null) return s
    if (s.weight > best.weight) return s
    return s.weight === best.weight && s.reps > best.reps ? s : best
  }, null)
  return { date, daysAgo: daysBetween(date, today ?? todayIso()), top, last: session.at(-1) }
}

// total = distinct training days; streak = consecutive days ending at the latest.
export function trainingStats(days) {
  const dates = days.map((d) => d.date)
  if (dates.length === 0) return { total: 0, streak: 0 }
  const set = new Set(dates)
  let current = [...dates].sort().at(-1) // most recent
  let streak = 1
  while (set.has(shiftDay(current, -1))) {
    current = shiftDay(current, -1)
    streak += 1
  }
  return { total: set.size, streak }
}
