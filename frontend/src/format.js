export function formatSet(set) {
  return `${set.weight} ${set.unit} x ${set.reps}`
}

// Estimated 1-rep max (Epley). Used to compare sets for personal records.
export function estimatedOneRm(weight, reps) {
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}

// "2026-07-16" -> "Thu, Jul 16, 2026". Built from parts (not new Date(iso)) so
// the date doesn't shift a day across timezones.
export function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
