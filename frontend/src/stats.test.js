import {
  dailySetCounts,
  heatmapGrid,
  lastTime,
  muscleByDay,
  muscleHeatmapGrid,
  recordLadder,
  sessionsPerPeriod,
  setsPerMuscle,
  trainingStats,
  weightPrs,
} from './stats.js'

const day = (date, ...setCounts) => ({
  date,
  workouts: setCounts.map((n) => ({ sets: Array.from({ length: n }, (_, i) => ({ id: i })) })),
})

describe('dailySetCounts', () => {
  it("sums sets across a day's workouts", () => {
    expect(dailySetCounts([day('2026-07-16', 3, 2)])['2026-07-16']).toBe(5)
  })
})

describe('heatmapGrid', () => {
  const grid = heatmapGrid([day('2026-07-16', 12)], { weeks: 15, endDate: '2026-07-16' })

  it('is `weeks` columns of 7 days', () => {
    expect(grid).toHaveLength(15)
    expect(grid.every((col) => col.length === 7)).toBe(true)
  })

  it('buckets a set count into a heat level (12 sets -> level 3)', () => {
    const cell = grid.flat().find((c) => c.date === '2026-07-16')
    expect(cell.count).toBe(12)
    expect(cell.level).toBe(3)
    expect(cell.future).toBe(false)
  })

  it('flags days after the end date as future with no heat', () => {
    const after = grid.flat().filter((c) => c.date > '2026-07-16')
    expect(after.every((c) => c.future && c.level === 0)).toBe(true)
  })

  it('ends on the week that contains the end date', () => {
    const lastCol = grid[grid.length - 1]
    expect(lastCol.some((c) => c.date === '2026-07-16')).toBe(true)
  })

  it('marks exactly one cell as today', () => {
    const todays = grid.flat().filter((c) => c.today)
    expect(todays).toHaveLength(1)
    expect(todays[0].date).toBe('2026-07-16')
  })
})

describe('trainingStats', () => {
  it('counts total days and the streak of consecutive days ending at the most recent', () => {
    const days = [
      { date: '2026-07-14' },
      { date: '2026-07-13' },
      { date: '2026-07-12' },
      { date: '2026-07-09' },
    ]
    expect(trainingStats(days)).toEqual({ total: 4, streak: 3 })
  })

  it('is zero for no days and one for a single day', () => {
    expect(trainingStats([])).toEqual({ total: 0, streak: 0 })
    expect(trainingStats([{ date: '2026-07-01' }])).toEqual({ total: 1, streak: 1 })
  })
})

// --- What you trained, when, and what you beat -------------------------------
// Everything below reads the same tree `GET /days` already returns, so none of
// it needs a round trip of its own.

let seq = 0
const uid = () => (seq += 1)

// `n` sets of one muscle group, as the API hands them over.
const group = (name, n, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: uid(),
    muscle_group: name,
    exercise_name: 'Press banca',
    set_index: i,
    weight: 60,
    reps: 8,
    ...extra,
  }))

const trained = (date, ...blocks) => ({ date, workouts: [{ id: uid(), sets: blocks.flat() }] })

// Newest first, the order /days uses. 26 jul 2026 is a Sunday, so the current
// week is 20–26 jul and the one before it 13–19.
const LOG = [
  trained('2026-07-22', group('Espalda', 5)),
  trained('2026-07-20', group('Pecho', 4), group('Tríceps', 2)),
  trained('2026-07-15', group('Pecho', 2)),
  trained('2026-06-30', group('Cuádriceps', 3)),
]
const SUNDAY = '2026-07-26'

describe('muscleByDay', () => {
  it('counts the sets each group took on each day', () => {
    expect(muscleByDay(LOG)['2026-07-20']).toEqual({ Pecho: 4, Tríceps: 2 })
  })

  it('leaves out sets whose exercise has no group — there is no colour for them', () => {
    const days = [trained('2026-07-20', group('Pecho', 2), group(null, 3))]
    expect(muscleByDay(days)['2026-07-20']).toEqual({ Pecho: 2 })
  })
})

describe('muscleHeatmapGrid', () => {
  const grid = muscleHeatmapGrid(LOG, { weeks: 6, endDate: SUNDAY })
  const cell = (date) => grid.flat().find((c) => c.date === date)

  it('is `weeks` columns of 7 days, ending on the week of the end date', () => {
    expect(grid).toHaveLength(6)
    expect(grid.every((col) => col.length === 7)).toBe(true)
    expect(grid.at(-1)[0].date).toBe('2026-07-20')
  })

  it('ranks a day’s groups by volume, so the cell knows its dominant colour', () => {
    expect(cell('2026-07-20').groups).toEqual([
      { group: 'Pecho', sets: 4 },
      { group: 'Tríceps', sets: 2 },
    ])
  })

  it('keeps the level buckets of the old heatmap (6 sets -> level 2)', () => {
    expect(cell('2026-07-20').total).toBe(6)
    expect(cell('2026-07-20').level).toBe(2)
    expect(cell('2026-07-21').total).toBe(0)
    expect(cell('2026-07-21').level).toBe(0)
  })

  it('counts an ungrouped set as volume even though it colours nothing', () => {
    const days = [trained('2026-07-20', group('Pecho', 2), group(null, 3))]
    const only = muscleHeatmapGrid(days, { weeks: 1, endDate: SUNDAY }).flat()
    const day = only.find((c) => c.date === '2026-07-20')
    expect(day.total).toBe(5)
    expect(day.groups).toEqual([{ group: 'Pecho', sets: 2 }])
  })

  it('flags today and the rest of the week as future', () => {
    expect(cell(SUNDAY).today).toBe(true)
    expect(cell('2026-07-25').future).toBe(false)
    const later = muscleHeatmapGrid(LOG, { weeks: 6, endDate: '2026-07-22' })
    expect(later.flat().find((c) => c.date === '2026-07-25').future).toBe(true)
  })
})

describe('sessionsPerPeriod', () => {
  it('counts training days per week, newest first, back to the first one ever', () => {
    const weeks = sessionsPerPeriod(LOG, 'week', { endDate: SUNDAY })
    expect(weeks.map((w) => [w.start, w.sessions])).toEqual([
      ['2026-07-20', 2],
      ['2026-07-13', 1],
      ['2026-07-06', 0],
      ['2026-06-29', 1],
    ])
  })

  it('averages per week over the part of the month that has happened', () => {
    // July is 3 sessions over the 26 days elapsed (3.71 weeks) -> 0.8/week.
    const months = sessionsPerPeriod(LOG, 'month', { endDate: SUNDAY })
    expect(months[0]).toMatchObject({ start: '2026-07-01', end: '2026-07-31', sessions: 3 })
    expect(months[0].perWeek).toBeCloseTo(0.8, 1)
    expect(months[1]).toMatchObject({ start: '2026-06-01', sessions: 1 })
  })

  it('is a single empty period when nothing has been logged', () => {
    expect(sessionsPerPeriod([], 'week', { endDate: SUNDAY })).toEqual([
      { start: '2026-07-20', end: '2026-07-26', sessions: 0, weeks: 1, perWeek: 0 },
    ])
  })
})

describe('setsPerMuscle', () => {
  it('ranks the groups of a week and compares each with the week before', () => {
    const week = setsPerMuscle(LOG, { period: 'week', index: 0, endDate: SUNDAY })
    expect(week).toMatchObject({ start: '2026-07-20', end: '2026-07-26', sets: 11 })
    expect(week.rows).toEqual([
      { group: 'Espalda', sets: 5, perWeek: 5, delta: 5 },
      { group: 'Pecho', sets: 4, perWeek: 4, delta: 2 },
      { group: 'Tríceps', sets: 2, perWeek: 2, delta: 2 },
    ])
  })

  it('walks back a period at a time', () => {
    const before = setsPerMuscle(LOG, { period: 'week', index: 1, endDate: SUNDAY })
    expect(before.start).toBe('2026-07-13')
    expect(before.rows).toEqual([{ group: 'Pecho', sets: 2, perWeek: 2, delta: 2 }])
  })

  it('reports a weekly average in month mode, against the month before', () => {
    const july = setsPerMuscle(LOG, { period: 'month', index: 0, endDate: SUNDAY })
    expect(july.sets).toBe(13)
    // 6 chest sets over the 3.71 weeks elapsed.
    expect(july.rows.find((r) => r.group === 'Pecho').perWeek).toBeCloseTo(1.6, 1)
    // June only had legs, so July's chest delta is the whole of it.
    expect(july.rows.find((r) => r.group === 'Pecho').delta).toBeCloseTo(1.6, 1)
  })

  it('clamps an index past the start of the history', () => {
    const oldest = setsPerMuscle(LOG, { period: 'week', index: 99, endDate: SUNDAY })
    expect(oldest.start).toBe('2026-06-29')
  })

  it('counts the sets no muscle group claims, so the rows can be seen not to add up', () => {
    const days = [trained('2026-07-22', group('Pecho', 4), group(null, 3))]
    const week = setsPerMuscle(days, { period: 'week', index: 0, endDate: SUNDAY })
    expect(week.sets).toBe(7)
    expect(week.unclassified).toBe(3)
  })
})

// The reference the card draws (4 / 10–20) is written in fractional sets: the
// research behind it counted indirect work as half a set. Counting only direct
// work against it compared two different units.
describe('setsPerMuscle counting secondary muscles', () => {
  const press = (n) => group('Pecho', n, { secondary_groups: ['Tríceps', 'Hombro'] })

  it('gives a secondary muscle half a set', () => {
    const week = setsPerMuscle([trained('2026-07-22', press(4))], {
      period: 'week',
      endDate: SUNDAY,
    })
    // Tied at 2, so canonical order breaks it: Hombro precedes Tríceps.
    expect(week.rows).toEqual([
      { group: 'Pecho', sets: 4, perWeek: 4, delta: 4 },
      { group: 'Hombro', sets: 2, perWeek: 2, delta: 2 },
      { group: 'Tríceps', sets: 2, perWeek: 2, delta: 2 },
    ])
  })

  // The push day from the docs: five pressing exercises, three direct triceps
  // sets. Direct-only counting called that 3 — under the minimum dose. Counted
  // the way the reference was built, it is 9.5, at the edge of the zone.
  it('turns a push day from “below the minimum” into “nearly in the zone”', () => {
    const days = [
      trained(
        '2026-07-22',
        press(4), // press banca
        press(3), // press inclinado
        group('Hombro', 3, { secondary_groups: ['Tríceps'] }), // press militar
        press(3), // fondos
        group('Tríceps', 3), // extensiones en polea
      ),
    ]
    const week = setsPerMuscle(days, { period: 'week', endDate: SUNDAY })
    const triceps = week.rows.find((r) => r.group === 'Tríceps')
    expect(triceps.sets).toBe(9.5)
  })

  it('leaves the logged set count alone — only the muscle rows are fractional', () => {
    const week = setsPerMuscle([trained('2026-07-22', press(4))], {
      period: 'week',
      endDate: SUNDAY,
    })
    // Four sets went in; the rows hold 8 between them, and that is the point.
    expect(week.sets).toBe(4)
    expect(week.unclassified).toBe(0)
  })

  it('falls back to direct-only when a payload carries no secondaries', () => {
    const week = setsPerMuscle([trained('2026-07-22', group('Pecho', 4))], {
      period: 'week',
      endDate: SUNDAY,
    })
    expect(week.rows).toEqual([{ group: 'Pecho', sets: 4, perWeek: 4, delta: 4 }])
  })

  // Colour answers "what did I train that day", which is the direct work. If a
  // secondary could win the hue, every push day would be a Pecho+Tríceps split
  // and the calendar would stop showing the shape of the week.
  it('keeps the heatmap on direct work only', () => {
    const byDate = muscleByDay([trained('2026-07-22', press(4))])
    expect(byDate['2026-07-22']).toEqual({ Pecho: 4 })
  })
})

// A period still running compared against a finished one is the calendar
// talking, not your training: on the 1st of the month every group collapses.
describe('setsPerMuscle over a period in progress', () => {
  // Wednesday of the current week. The week before holds a Tuesday inside the
  // matching stretch and a Friday past the end of it.
  const WEDNESDAY = '2026-07-22'
  const MIDWEEK = [
    trained('2026-07-22', group('Pecho', 4)),
    trained('2026-07-17', group('Pecho', 6)), // Fri — after the cut
    trained('2026-07-14', group('Pecho', 3), group('Cuádriceps', 5)), // Tue — inside it
  ]

  it('compares a week in progress against the same stretch of the week before', () => {
    const week = setsPerMuscle(MIDWEEK, { period: 'week', index: 0, endDate: WEDNESDAY })
    expect(week.inProgress).toBe(true)
    // 4 now against the 3 logged by the Wednesday of the week before — not
    // against all 9 of it, which would read −5 for a week that is up on itself.
    expect(week.rows.find((r) => r.group === 'Pecho')).toMatchObject({ sets: 4, delta: 1 })
  })

  it('keeps a group that went quiet on the board instead of dropping the row', () => {
    const week = setsPerMuscle(MIDWEEK, { period: 'week', index: 0, endDate: WEDNESDAY })
    expect(week.rows.find((r) => r.group === 'Cuádriceps')).toMatchObject({ sets: 0, delta: -5 })
  })

  it('compares two finished periods whole against whole', () => {
    const week = setsPerMuscle(MIDWEEK, { period: 'week', index: 1, endDate: '2026-07-26' })
    expect(week.inProgress).toBe(false)
    expect(week.start).toBe('2026-07-13')
    // The whole of 13–19: 3 + 6.
    expect(week.rows.find((r) => r.group === 'Pecho')).toMatchObject({ sets: 9 })
  })

  // 1 aug 2026 is a Saturday — the first day of the month, and the case that
  // started this: every row read deeply negative.
  const AUG = '2026-08-01'
  const NEW_MONTH = [
    trained('2026-08-01', group('Pecho', 5)),
    trained('2026-07-20', group('Pecho', 20)),
    trained('2026-07-01', group('Pecho', 4)),
  ]

  it('measures a month against the days elapsed, not a whole week of them', () => {
    const month = setsPerMuscle(NEW_MONTH, { period: 'month', index: 0, endDate: AUG })
    // One day in: 1/7 of a week, not the whole week the old floor assumed.
    expect(month.weeks).toBeCloseTo(0.14, 2)
    expect(month.perWeek).toBe(35)
  })

  it('does not report a collapse on the first day of a month', () => {
    const month = setsPerMuscle(NEW_MONTH, { period: 'month', index: 0, endDate: AUG })
    // 5 sets on this 1st against the 4 on the 1st of July — up, not down.
    expect(month.rows.find((r) => r.group === 'Pecho').delta).toBeGreaterThan(0)
  })

  it('reports plain counts until the month has a whole week to average', () => {
    const month = setsPerMuscle(NEW_MONTH, { period: 'month', index: 0, endDate: AUG })
    expect(month.averaged).toBe(false)
    // 5 against 4, not 35 against 28: one day is not a weekly rate.
    expect(month.rows.find((r) => r.group === 'Pecho').delta).toBe(1)
  })

  it('has nothing to compare with when the matching stretch is empty', () => {
    // Training starts on the 20th of July, so the 1st of August lines up with a
    // 1st of July that never happened. Every delta would be the row's own value
    // dressed as a gain.
    const late = [trained('2026-08-01', group('Pecho', 5)), trained('2026-07-20', group('Pecho', 9))]
    const month = setsPerMuscle(late, { period: 'month', index: 0, endDate: AUG })
    expect(month.comparable).toBe(false)
    // And the July it walks back to still compares against something real.
    const july = setsPerMuscle(late, { period: 'month', index: 1, endDate: AUG })
    expect(july.comparable).toBe(false)
  })

  it('has something to compare with as soon as the matching stretch has volume', () => {
    const month = setsPerMuscle(NEW_MONTH, { period: 'month', index: 0, endDate: AUG })
    expect(month.comparable).toBe(true)
  })

  // The matching stretch of a month one day old is one day long, so a muscle
  // you trained all last month but not on its 1st has nothing to keep its row
  // alive — it vanishes from the board on the day you most need to see it at
  // zero.
  it('keeps a muscle trained last period on the board, even outside the matching stretch', () => {
    const days = [
      trained('2026-08-01', group('Bíceps', 3)),
      trained('2026-07-20', group('Espalda', 8)),
      trained('2026-07-01', group('Bíceps', 4)),
    ]
    const month = setsPerMuscle(days, { period: 'month', index: 0, endDate: AUG })
    expect(month.rows.find((r) => r.group === 'Espalda')).toMatchObject({ sets: 0 })
    expect(month.rows.find((r) => r.group === 'Bíceps')).toMatchObject({ sets: 3 })
  })

  it('averages once a full week of the month has gone by', () => {
    const month = setsPerMuscle(NEW_MONTH, { period: 'month', index: 0, endDate: '2026-08-07' })
    expect(month.averaged).toBe(true)
    expect(month.weeks).toBe(1)
  })
})

describe('weightPrs', () => {
  const set = (id, kg, reps) => ({ id, weight: kg, reps })

  it('flags more kilos than ever at that many reps or more', () => {
    // 85x5 beats the 82.5x5 in the history; 82.5x5 only equals it.
    const ids = weightPrs([set(2, 82.5, 5), set(3, 85, 5)], { history: [set(1, 82.5, 5)] })
    expect([...ids]).toEqual([3])
  })

  it('reads a heavier set at fewer reps as a record too', () => {
    // Nothing was ever lifted at 3 reps or more that beat 100 kg.
    const ids = weightPrs([set(2, 100, 3)], { history: [set(1, 80, 8)] })
    expect(ids.has(2)).toBe(true)
  })

  it('does not let more reps at a lighter weight beat a heavier set', () => {
    // 80x8 is a hard set, but it is not a *weight* record: 100 kg stands.
    const ids = weightPrs([set(2, 80, 8)], { history: [set(1, 100, 8)] })
    expect(ids.size).toBe(0)
  })

  it('ignores the estimated 1RM entirely', () => {
    // On Epley, 90x3 (99) does not beat 85x5 (99.2) — a 1RM comparison would
    // stay quiet. As a weight record at 3 reps, 90 kg is new and it fires.
    const history = [set(1, 85, 5)]
    expect(weightPrs([set(2, 90, 3)], { history }).has(2)).toBe(true)
  })

  it('lets the very first set ever be a baseline, not a record', () => {
    expect(weightPrs([set(1, 100, 5)]).size).toBe(0)
  })

  it('counts that first set when asked — the ladder starts somewhere', () => {
    expect(weightPrs([set(1, 100, 5)], { includeFirst: true }).has(1)).toBe(true)
  })

  it('ignores cardio sets, which have no weight or reps', () => {
    const cardio = { id: 9, duration_seconds: 1800, distance: 5 }
    expect(weightPrs([cardio], { history: [set(1, 80, 5)] }).size).toBe(0)
  })
})

// Sets of one named exercise across several days, for the ladder and the readout.
const lift = (name, weight, reps) => ({
  id: uid(),
  exercise_name: name,
  muscle_group: 'Pecho',
  set_index: 0,
  weight,
  reps,
})

const BENCH = [
  trained('2026-07-20', [lift('Press banca', 85, 5), lift('Press banca', 80, 6)]),
  trained('2026-07-10', [lift('Press banca', 82.5, 5), lift('Dominadas', 0, 10)]),
  trained('2026-07-01', [lift('Press banca', 80, 5)]),
]

describe('recordLadder', () => {
  it('is the real records of one exercise, oldest first, first step included', () => {
    expect(recordLadder(BENCH, 'Press banca')).toEqual([
      { date: '2026-07-01', weight: 80, reps: 5 },
      { date: '2026-07-10', weight: 82.5, reps: 5 },
      { date: '2026-07-20', weight: 85, reps: 5 },
    ])
  })

  it('matches the name the way the API normalizes it', () => {
    expect(recordLadder(BENCH, '  press  banca ')).toHaveLength(3)
  })

  it('leaves out a back-off set at a rep range it had never touched', () => {
    // 80x6 after 85x5 is a first at six reps, but a staircase that steps down
    // is not a climb. The banner mid-session still calls it out; this doesn't.
    expect(recordLadder(BENCH, 'Press banca').at(-1)).toEqual({
      date: '2026-07-20',
      weight: 85,
      reps: 5,
    })
  })

  it('counts the same weight for more reps as a step up', () => {
    const days = [
      trained('2026-07-05', [lift('Remo', 60, 8)]),
      trained('2026-07-01', [lift('Remo', 60, 6)]),
    ]
    expect(recordLadder(days, 'Remo')).toEqual([
      { date: '2026-07-01', weight: 60, reps: 6 },
      { date: '2026-07-05', weight: 60, reps: 8 },
    ])
  })

  it('is empty for an exercise that was never logged', () => {
    expect(recordLadder(BENCH, 'Sentadilla')).toEqual([])
  })

  // A machine curl logged at 0 kg is a weight you didn't write down, not a
  // weight you lifted — and as the first rung it becomes the baseline the
  // caption measures the whole climb from.
  it('leaves out a 0 kg set on a lift that has carried weight', () => {
    const days = [
      trained('2026-07-25', [lift('Curl predicador', 10, 15)]),
      trained('2026-07-21', [lift('Curl predicador', 0, 15)]),
    ]
    expect(recordLadder(days, 'Curl predicador')).toEqual([
      { date: '2026-07-25', weight: 10, reps: 15 },
    ])
  })

  it('keeps 0 kg for a lift that has never carried any', () => {
    const days = [
      trained('2026-07-25', [lift('Dominadas', 0, 12)]),
      trained('2026-07-21', [lift('Dominadas', 0, 10)]),
    ]
    expect(recordLadder(days, 'Dominadas')).toEqual([
      { date: '2026-07-21', weight: 0, reps: 10 },
      { date: '2026-07-25', weight: 0, reps: 12 },
    ])
  })
})

describe('lastTime', () => {
  it('is the last session with that exercise, and how long ago', () => {
    expect(lastTime(BENCH, 'Press banca', { today: '2026-07-23' })).toMatchObject({
      date: '2026-07-20',
      daysAgo: 3,
    })
  })

  it('reads the top set of that session, not whatever came last', () => {
    // 85x5 then a back-off 80x6 — the mark to beat is the 85.
    const readout = lastTime(BENCH, 'Press banca', { today: '2026-07-23' })
    expect(readout.top).toMatchObject({ weight: 85, reps: 5 })
    expect(readout.last).toMatchObject({ weight: 80, reps: 6 })
  })

  it('is null for an exercise with no history', () => {
    expect(lastTime(BENCH, 'Sentadilla', { today: '2026-07-23' })).toBeNull()
  })
})
