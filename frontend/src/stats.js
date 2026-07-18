function shiftDay(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + delta)
  const pad = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
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
