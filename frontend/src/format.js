export function formatSet(set) {
  return `${set.weight} ${set.unit} x ${set.reps}`
}

// Estimated 1-rep max (Epley). Used to compare sets for personal records.
export function estimatedOneRm(weight, reps) {
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// "2026-07-16" -> "jue, 16 jul 2026". Built from parts (not new Date(iso)) so
// the date doesn't shift a day across timezones, and with fixed Spanish labels
// so it's deterministic regardless of the runtime locale.
export function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const weekday = DIAS[new Date(y, m - 1, d).getDay()]
  return `${weekday}, ${d} ${MESES[m - 1]} ${y}`
}
