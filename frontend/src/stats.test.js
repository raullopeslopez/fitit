import { dailySetCounts, heatmapGrid, trainingStats } from './stats.js'

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
