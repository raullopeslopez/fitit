// Sticky user preferences (localStorage). The weight unit is a choice you make
// once, not a per-set decision — so it lives here, not on every card.
const WEIGHT_UNIT_KEY = 'fitit_weight_unit'

export function getWeightUnit() {
  return localStorage.getItem(WEIGHT_UNIT_KEY) === 'lb' ? 'lb' : 'kg'
}

export function setWeightUnit(unit) {
  localStorage.setItem(WEIGHT_UNIT_KEY, unit === 'lb' ? 'lb' : 'kg')
}

// How long to rest between sets. 0 = don't count at all — plenty of sessions
// (and every cardio one) have no business being timed.
const REST_SECONDS_KEY = 'fitit_rest_seconds'
export const REST_OPTIONS = [0, 60, 90, 120]

export function getRestSeconds() {
  // Check for absence BEFORE coercing: Number(null) is 0, and 0 is a real
  // choice here ("Sin descanso"), so coercing first silently defaults every
  // first-run user to no timer at all.
  const stored = localStorage.getItem(REST_SECONDS_KEY)
  if (stored == null) return 90
  return REST_OPTIONS.includes(Number(stored)) ? Number(stored) : 90
}

export function setRestSeconds(seconds) {
  const n = REST_OPTIONS.includes(Number(seconds)) ? Number(seconds) : 90
  localStorage.setItem(REST_SECONDS_KEY, String(n))
}

// The running timer is stored as an absolute deadline, not a remaining count:
// a phone that sleeps mid-set, or a tab switch to Días and back, must not slow
// the clock down or restart it. A deadline already in the past is simply gone.
const REST_UNTIL_KEY = 'fitit_rest_until'

export function getRestUntil() {
  const stored = Number(localStorage.getItem(REST_UNTIL_KEY))
  return Number.isFinite(stored) && stored > Date.now() ? stored : null
}

export function setRestUntil(timestamp) {
  if (timestamp == null) localStorage.removeItem(REST_UNTIL_KEY)
  else localStorage.setItem(REST_UNTIL_KEY, String(timestamp))
}

// The workout you currently have open. Reopening the PWA between sets used to
// drop you on Días, one tap and one fetch from the set you were about to log —
// so the open workout survives a relaunch. Stamped with the last time the app
// had it open, and only honoured inside RESUME_WINDOW_MS: a session you walked
// out on yesterday is history, not something to resume into.
const OPEN_WORKOUT_KEY = 'fitit_open_workout'
const RESUME_WINDOW_MS = 4 * 60 * 60 * 1000

export function getOpenWorkout() {
  try {
    const stored = JSON.parse(localStorage.getItem(OPEN_WORKOUT_KEY))
    if (!Number.isFinite(stored?.id) || !Number.isFinite(stored?.at)) return null
    return Date.now() - stored.at < RESUME_WINDOW_MS ? stored.id : null
  } catch {
    return null
  }
}

export function setOpenWorkout(id) {
  if (id == null) localStorage.removeItem(OPEN_WORKOUT_KEY)
  else localStorage.setItem(OPEN_WORKOUT_KEY, JSON.stringify({ id, at: Date.now() }))
}

// Repeating a past session hands Entreno the exercises it should stand up, by
// name. One slot, not a queue: you can only be inside one workout at a time,
// and it's keyed by workout id so a template never bleeds into a different one.
// It is not cleared once consumed — reopening a half-logged repeat has to find
// the exercises you haven't got to yet still waiting.
const REPEAT_TEMPLATE_KEY = 'fitit_repeat_template'

export function setRepeatTemplate(workoutId, names) {
  localStorage.setItem(REPEAT_TEMPLATE_KEY, JSON.stringify({ workoutId, names }))
}

export function getRepeatTemplate(workoutId) {
  try {
    const stored = JSON.parse(localStorage.getItem(REPEAT_TEMPLATE_KEY))
    return stored?.workoutId === workoutId && Array.isArray(stored.names) ? stored.names : null
  } catch {
    return null
  }
}

const DISTANCE_UNIT_KEY = 'fitit_distance_unit'

export function getDistanceUnit() {
  return localStorage.getItem(DISTANCE_UNIT_KEY) === 'mi' ? 'mi' : 'km'
}

export function setDistanceUnit(unit) {
  localStorage.setItem(DISTANCE_UNIT_KEY, unit === 'mi' ? 'mi' : 'km')
}
