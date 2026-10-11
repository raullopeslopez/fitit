import { storage } from './platform/storage.js'

// Which weeks you have marked as a deload, stamped by their Monday.
//
// Local to the device on purpose. This is an annotation, not training data:
// losing it loses no sets, and a deloaded week still reads as a light one
// straight from the log. Putting it behind an endpoint would buy syncing across
// devices, which is a thing one phone does not need, at the cost of a table, a
// migration and two routes. Promote it if that ever changes — nothing outside
// this file knows where it is kept.
const KEY = 'fitit_deload_weeks'

function read() {
  try {
    const raw = JSON.parse(storage.getItem(KEY))
    // Anything that isn't the shape we wrote is treated as nothing. A corrupt
    // key must not take the summary card down with it.
    return Array.isArray(raw) ? raw.filter((w) => typeof w === 'string') : []
  } catch {
    return []
  }
}

const isoOf = (dt) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate(),
  ).padStart(2, '0')}`

// The week a deload can be switched on for: the one you are in, Monday to
// Sunday. Perfil only ever offers this one — a deload is planned, not filed
// afterwards — so it needs the dates without having the log.
export function currentWeek(today = new Date()) {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: isoOf(monday), end: isoOf(sunday) }
}

export function deloadWeeks() {
  return read()
}

export function isDeload(weekStart) {
  return read().includes(weekStart)
}

// Flips the mark and hands back the new list, so the caller can hold it in
// state rather than reading storage again on every render.
export function toggleDeload(weekStart) {
  const weeks = read()
  const next = weeks.includes(weekStart)
    ? weeks.filter((w) => w !== weekStart)
    : [...weeks, weekStart]
  try {
    storage.setItem(KEY, JSON.stringify(next))
  } catch {
    // A full or blocked store is not worth losing the screen over; the mark
    // just doesn't survive the reload.
  }
  return next
}
