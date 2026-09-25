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
