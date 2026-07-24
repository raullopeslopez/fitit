import { displayWeight } from './units.js'

// A logged set, read back in the unit you currently prefer rather than the one
// that happened to be selected when you logged it.
export function formatSet(set, unit = 'kg') {
  return `${displayWeight(set.weight_kg, unit)} ${unit} x ${set.reps}`
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

// "2026-07-16" -> "JUE 16 JUL". The day list is a logbook rule, not prose, so
// the stamp is mono and uppercase (DESIGN.md: dates are data) and loses the
// comma. The year is the one token the row can't spare, so it's printed only
// when it isn't the year you're in.
export function formatDayShort(iso, today = new Date()) {
  const [y, m, d] = iso.split('-').map(Number)
  const weekday = DIAS[new Date(y, m - 1, d).getDay()]
  const stamp = `${weekday} ${d} ${MESES[m - 1]}`
  return (y === today.getFullYear() ? stamp : `${stamp} ${y}`).toUpperCase()
}

// Cardio metrics. Duration is entered as "mm:ss" (or "h:mm:ss"), or a plain
// number read as minutes; parseDuration returns whole seconds, or null if invalid.
export function parseDuration(input) {
  const s = String(input ?? '').trim()
  if (s === '') return null
  if (s.includes(':')) {
    const parts = s.split(':')
    if (parts.length < 2 || parts.length > 3) return null
    const nums = parts.map((p) => Number(p))
    if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null
    const [ss, mm] = [nums.pop(), nums.pop()]
    const hh = nums.pop() ?? 0
    if (ss >= 60 || mm >= 60) return null
    return hh * 3600 + mm * 60 + ss
  }
  const minutes = Number(s)
  if (!Number.isFinite(minutes) || minutes < 0) return null
  return Math.round(minutes * 60)
}

const pad = (n) => String(n).padStart(2, '0')

export function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return ''
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

// mm:ss with a padded minute, for a live countdown. Unlike formatDuration this
// never drops the leading zero — a readout that reflows from 1:00 to 59 while
// you're staring at it between sets is noise. Clamped at zero, so an overrun
// deadline reads 00:00 rather than going negative.
export function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds ?? 0))
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
}

// The clock time a set was logged, in the viewer's own zone — "18:04". Local
// on purpose: what matters is the hour you were under the bar, not UTC.
export function formatTime(iso) {
  if (!iso) return ''
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return ''
  return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

// Pace = time per one distance unit, e.g. "4:43/km". Null without a distance.
export function formatPace(seconds, distance, unit) {
  if (!distance || distance <= 0 || seconds == null) return null
  const perUnit = Math.round(seconds / distance)
  return `${Math.floor(perUnit / 60)}:${pad(perUnit % 60)}/${unit}`
}

export function formatCardioSet(set) {
  const dur = formatDuration(set.duration_seconds)
  if (!set.distance) return dur
  return `${dur} · ${set.distance} ${set.distance_unit} · ${formatPace(
    set.duration_seconds,
    set.distance,
    set.distance_unit,
  )}`
}
