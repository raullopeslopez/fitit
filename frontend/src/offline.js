// What lets the app work with no network. Gyms are basements and the free tier
// sleeps, so a set you have already done must never depend on a request
// succeeding right now.
//
// localStorage, not IndexedDB, on purpose: writes are synchronous, so a phone
// that dies the instant after you tap has the set on disk already. Sets are a
// few dozen bytes; the quota is not in play.

// ---------------------------------------------------------------------------
// The outbox: sets logged locally that the server has not acknowledged yet.
// ---------------------------------------------------------------------------

const OUTBOX_KEY = 'fitit_outbox'

// [{ tmpId, workoutId, payload }] in the order they were logged. Order is not
// cosmetic: set_index is assigned server-side on arrival, so a queue that
// drains out of order rewrites the session.
export function readQueue() {
  try {
    const stored = JSON.parse(localStorage.getItem(OUTBOX_KEY))
    return Array.isArray(stored) ? stored : []
  } catch {
    // A parse error must not be able to take the log screen down with it.
    return []
  }
}

function writeQueue(entries) {
  if (entries.length === 0) localStorage.removeItem(OUTBOX_KEY)
  else localStorage.setItem(OUTBOX_KEY, JSON.stringify(entries))
}

export function enqueueSet(entry) {
  writeQueue([...readQueue(), entry])
}

export function dropQueued(tmpId) {
  writeQueue(readQueue().filter((e) => e.tmpId !== tmpId))
}

export function clearQueued() {
  writeQueue([])
}

// An exercise renamed while sets are still unsent. The outbox names its
// exercise by string and the server takes that name at face value, so a queued
// set would quietly stand the old exercise back up on the next drain — the very
// duplicate the rename was there to get rid of.
export function renameQueued(from, to) {
  const entries = readQueue()
  if (!entries.some((e) => e.payload?.exercise_name === from)) return
  writeQueue(
    entries.map((e) =>
      e.payload?.exercise_name === from
        ? { ...e, payload: { ...e.payload, exercise_name: to } }
        : e,
    ),
  )
}

// The backlog belonging to one workout. Another session's unsent sets are still
// owed to the server, but they have no business on this card.
export function queuedFor(workoutId) {
  return readQueue().filter((e) => e.workoutId === workoutId)
}

// Is this failure worth keeping the set for? No status means fetch itself threw
// — no signal, the case the queue exists for. 5xx/429/408 are the server being
// down or busy, which passes. Any other 4xx is the server having judged the set
// and refused it: a 422 will be a 422 forever, and retrying it forever blocks
// every set behind it in the queue. That is how one bad row loses a session.
export function retryable(error) {
  const status = error?.status
  if (status == null) return true
  // A token that expired mid-session is the one 4xx worth waiting on: you log
  // back in and the queue drains. Dropping the set instead would punish the
  // user for the clock running out on a JWT.
  if (status === 401) return true
  return status >= 500 || status === 429 || status === 408
}

// ---------------------------------------------------------------------------
// The workout cache: one slot, so reopening the app with no signal isn't a
// dead end. Without it `getWorkout` fails, the screen renders its error state,
// and the queue below is holding sets for a session you can no longer see.
// One slot is enough — you can only be inside one workout at a time.
// ---------------------------------------------------------------------------

const WORKOUT_KEY = 'fitit_workout_cache'

export function cacheWorkout(workout) {
  if (workout?.id == null) return
  localStorage.setItem(WORKOUT_KEY, JSON.stringify(workout))
}

export function cachedWorkout(id) {
  try {
    const stored = JSON.parse(localStorage.getItem(WORKOUT_KEY))
    // A different workout's copy is not an answer about this one.
    return stored?.id === id && Array.isArray(stored.sets) ? stored : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// The previous-marks cache: what to show on a card opened with no signal.
// ---------------------------------------------------------------------------

const MARKS_KEY = 'fitit_marks_cache'

function readMarks() {
  try {
    const stored = JSON.parse(localStorage.getItem(MARKS_KEY))
    return stored && typeof stored === 'object' ? stored : {}
  } catch {
    return {}
  }
}

export function cacheMarks(name, marks) {
  localStorage.setItem(MARKS_KEY, JSON.stringify({ ...readMarks(), [name]: marks }))
}

// Flagged `stale` on the way out, and the caller has to honour it. The entry was
// fetched excluding some *other* session, so it can understate the real history
// — and a mark to beat that is lower than the truth manufactures records that
// never happened. Good enough to show as "última vez"; never good enough to
// award a PR against.
export function cachedMarks(name) {
  const hit = readMarks()[name]
  return hit ? { ...hit, stale: true } : null
}

// ---------------------------------------------------------------------------
// The boot summary: five numbers about the user, kept so the launch screen has
// something true to show while the first request is still out. Not the log
// itself — that is hundreds of sets and growing, and this is read on a launch
// where nothing has arrived yet.
// ---------------------------------------------------------------------------

const BOOT_KEY = 'fitit_boot_summary'

export function cacheBootSummary(summary) {
  if (!summary) return
  try {
    localStorage.setItem(BOOT_KEY, JSON.stringify(summary))
  } catch {
    // A full quota must never take down the screen that just loaded fine.
  }
}

export function cachedBootSummary() {
  try {
    const stored = JSON.parse(localStorage.getItem(BOOT_KEY))
    return stored && typeof stored === 'object' ? stored : null
  } catch {
    return null
  }
}
