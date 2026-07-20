function shiftDay(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + delta)
  const pad = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

function todayIso() {
  const dt = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

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
      col.push({ date, count, level: heatLevel(count), future: date > end })
    }
    cols.push(col)
  }
  return cols
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
