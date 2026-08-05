import { showKg } from './units.js'

// Nobody types "Máq." with the accent on a phone keyboard, and nobody
// capitalises a search. Fold both away before comparing.
export const fold = (s) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

// A logged set. Kilos, because that is the only unit there is — unless there is
// no weight at all (dominadas, fondos, abdominales), which is not the same as
// zero: 0 is a number someone typed, null is a set that never had one.
export function formatSet(set) {
  if (set.weight == null) return `Corporal x ${set.reps}`
  return `${showKg(set.weight)} kg x ${set.reps}`
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

const MESES_LARGOS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

// "2026-07-01" -> "julio". Lowercase, because it is a word: the one place it
// titles a card capitalises it there, rather than shouting everywhere else.
export function formatMonth(iso) {
  return MESES_LARGOS[Number(iso.slice(5, 7)) - 1]
}

// A period, as short as it can be said: "20–26 jul" inside one month, "29 jun –
// 5 jul" across two. Naming the month twice when it hasn't changed is noise.
export function formatRange(startIso, endIso) {
  const [, sm, sd] = startIso.split('-').map(Number)
  const [, em, ed] = endIso.split('-').map(Number)
  if (sm === em) return `${sd}–${ed} ${MESES[sm - 1]}`
  return `${sd} ${MESES[sm - 1]} – ${ed} ${MESES[em - 1]}`
}

// How long ago, in the words you'd use out loud: "hoy", "ayer", "hace 3 días".
// Takes an API timestamp (UTC) and compares calendar days in the viewer's own
// zone — 23:00 last night is "ayer" even though it's fifteen hours back.
export function daysAgoLabel(timestamp, today = new Date()) {
  // A bare `YYYY-MM-DD` — which is what a training day is — would be parsed by
  // `new Date()` as UTC midnight, landing on the day before anywhere west of
  // Greenwich. Read the parts instead, so the date means the same local day it
  // names. Full timestamps still go through Date: they carry their own zone.
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(timestamp ?? ''))
  let then
  if (parts) {
    const [y, m, d] = parts.slice(1).map(Number)
    then = new Date(y, m - 1, d)
    // `new Date(2026, 12, 99)` doesn't throw, it rolls forward into next year.
    // A date that doesn't come back as the one it was given never existed.
    if (then.getMonth() !== m - 1 || then.getDate() !== d) return null
  } else {
    then = new Date(timestamp)
  }
  if (Number.isNaN(then.getTime())) return null
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOf(today) - startOf(then)) / 86400000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  return `hace ${days} días`
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

// Pace = time per kilometre, e.g. "4:43/km". Null without a distance.
export function formatPace(seconds, distance) {
  if (!distance || distance <= 0 || seconds == null) return null
  const perKm = Math.round(seconds / distance)
  return `${Math.floor(perKm / 60)}:${pad(perKm % 60)}/km`
}

export function formatCardioSet(set) {
  const dur = formatDuration(set.duration_seconds)
  if (!set.distance) return dur
  return `${dur} · ${set.distance} km · ${formatPace(set.duration_seconds, set.distance)}`
}

// The gap that closes a session, mirroring the backend's own (see
// `app/session_length.py`). Here it answers a different question: not "what
// counts as training" but "is this session over" — which is what decides
// whether there is a total to print at all. Same number for the same reason:
// sets are logged in bursts, so an hour of silence is a session still running,
// and printing a total then would print it mid-workout.
const SESSION_GAP_MS = 90 * 60 * 1000

// How long a session took, as a line you'd say out loud: "1h 05", "45 min".
// Empty string for every case where there is nothing to say, so a caller can
// drop it into a template without a conditional around it.
//
// It stays quiet while you are still training. The backend will happily report
// the span so far, but a total that grows each time you look at it is a clock,
// and the session card deliberately hasn't got one — you asked for the number
// at the end, not during. Once the last set is older than a rest could be, the
// session is closed and the total appears.
export function sessionLength(workout, now = Date.now()) {
  const seconds = workout?.duration_seconds
  if (!seconds || !Number.isFinite(seconds)) return ''
  const last = (workout.sets ?? [])
    .map((s) => Date.parse(s.created_at))
    .filter((t) => Number.isFinite(t))
    .reduce((latest, t) => (t > latest ? t : latest), -Infinity)
  if (now - last < SESSION_GAP_MS) return ''
  // Under a minute is two sets logged back to back — a correction, a false
  // start. Rounding it up to "1 min" would put a session's worth of framing
  // around something that never happened.
  if (seconds < 60) return ''
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}`
}
