import { dailySetCounts, heatmapGrid, prSetIds, trainingStats } from './stats.js'

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

describe('prSetIds', () => {
  // Weights are canonical kilos — that's the only thing the comparison reads.
  const set = (id, kg, reps) => ({ id, weight_kg: kg, reps })

  it('flags a set that beats the previous best', () => {
    // Epley: 82.5x5 -> 96.3, 85x5 -> 99.2. A prior best of 97 sits between them.
    const ids = prSetIds([set(1, 82.5, 5), set(2, 85, 5)], 97)
    expect([...ids]).toEqual([2])
  })

  it('does not flag anything when nothing beats the previous best', () => {
    expect(prSetIds([set(1, 60, 5), set(2, 62.5, 5)], 200).size).toBe(0)
  })

  it('raises the bar as it goes, so a later set must beat the earlier ones', () => {
    // 80x5 -> 93.3 beats the 90 you walked in with; 90x5 -> 105 beats that;
    // 85x5 -> 99.2 clears the original 90 but NOT the 105 already set today,
    // so it earns no flag. The bar is the running peak, not the starting mark.
    const ids = prSetIds([set(1, 80, 5), set(2, 90, 5), set(3, 85, 5)], 90)
    expect([...ids]).toEqual([1, 2])
    expect(ids.has(3)).toBe(false)
  })

  it('lets the first ever set set the baseline without calling it a record', () => {
    // No prior best means nothing to beat — flagging it would cheapen the badge.
    expect(prSetIds([set(1, 100, 5)], null).size).toBe(0)
  })

  it('ignores cardio sets, which have no weight or reps', () => {
    const cardio = { id: 9, duration_seconds: 1800, distance: 5 }
    expect(prSetIds([cardio, set(1, 120, 3)], 100).has(1)).toBe(true)
    expect(prSetIds([cardio], 100).size).toBe(0)
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
