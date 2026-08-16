// The wait that only exists when there is one.
//
// The backend sleeps on Render's free tier, so the first request of the day can
// take the better part of a minute while the container wakes. Every other
// launch answers in a few hundred milliseconds. A loading screen shown on every
// open would tax the normal case to explain the rare one, so this module does
// two things: it decides *whether* there is a wait at all (nothing is drawn
// until the first request has been out for 800 ms), and it builds what the
// screen says while it lasts — the user's own session, marks and volume, read
// from a summary cached the last time the log loaded.
//
// The screen never names the cause. "El servidor está arrancando" is our
// problem stated as the user's; the session they came to log is theirs.

import { useCallback, useEffect, useRef, useState } from 'react'

import { checkHealth } from './api.js'
import { formatDuration, isoWeekStart } from './format.js'
import { cachedBootSummary } from './offline.js'
import { showKg } from './units.js'

// How long the first request gets before the wait is worth naming. Under this,
// the app just opens; a screen that flashes for 300 ms is worse than no screen.
export const COLD_AFTER_MS = 800

// The whole budget. Past this the wait has stopped being a wait and become a
// failure, and saying so beats a bar that never ends.
export const MAX_WAIT_MS = 60000

// When the way out appears. Long enough that it isn't a second CTA competing
// with the wait, short enough to still save the session.
export const ESCAPE_AFTER_MS = 12000

// How long each card holds the screen.
export const ROTATE_MS = 4500

// The bar's asymptote. It is not a percentage of anything — we don't know how
// long the wake takes — so it must never arrive: a full bar with nothing behind
// it is the one lie the screen can't afford.
export const PROGRESS_CEILING = 94
const PROGRESS_TAU_MS = 13000

const MAX_RETRY_MS = 60000

// 1s, 2s, 4s, 8s… capped at a minute, which the 60s budget reaches first.
export function retryDelay(failures) {
  return Math.min(MAX_RETRY_MS, 1000 * 2 ** failures)
}

export function progressPct(elapsedMs) {
  return PROGRESS_CEILING * (1 - Math.exp(-Math.max(0, elapsedMs) / PROGRESS_TAU_MS))
}

// --- The gate ----------------------------------------------------------------

// Phases: `probing` (first 800 ms, nothing drawn), `waiting` (the screen is up),
// `ready` (the backend answered — let the app through), `failed` (budget spent),
// `local` (the user chose to log on the device and not wait).
export function useColdStart({ enabled = true, probe = checkHealth } = {}) {
  const [phase, setPhase] = useState('probing')
  const [attempt, setAttempt] = useState(0)
  const [stopped, setStopped] = useState(false)
  const probeRef = useRef(probe)
  probeRef.current = probe

  useEffect(() => {
    if (!enabled) {
      setPhase('ready')
      return undefined
    }
    // No signal at all is not a cold start, and there is nothing to wait for:
    // the app already logs offline, so gating it behind a wake that cannot
    // happen would lock the user out of their own session in a basement gym.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setPhase('local')
      return undefined
    }
    if (stopped) return undefined

    let settled = false
    const timers = []
    const controller = new AbortController()

    // Only ever promotes the silent probe into a visible wait — once the
    // backend has answered, this is a no-op.
    timers.push(
      setTimeout(() => {
        setPhase((p) => (p === 'probing' ? 'waiting' : p))
      }, COLD_AFTER_MS),
    )
    timers.push(
      setTimeout(() => {
        settled = true
        controller.abort()
        setPhase((p) => (p === 'probing' || p === 'waiting' ? 'failed' : p))
      }, MAX_WAIT_MS),
    )

    async function run(failures) {
      try {
        await probeRef.current({ signal: controller.signal })
        if (settled) return
        settled = true
        setPhase('ready')
      } catch {
        if (settled) return
        timers.push(setTimeout(() => run(failures + 1), retryDelay(failures)))
      }
    }
    run(0)

    return () => {
      settled = true
      controller.abort()
      timers.forEach(clearTimeout)
    }
  }, [enabled, stopped, attempt])

  // A retry knows what the first attempt didn't: this backend is cold. So it
  // goes straight back to the waiting screen rather than through the 800 ms of
  // blank the first probe earns.
  const retry = useCallback(() => {
    setPhase('waiting')
    setStopped(false)
    setAttempt((n) => n + 1)
  }, [])

  const goLocal = useCallback(() => {
    setStopped(true)
    setPhase('local')
  }, [])

  return { phase, attempt, retry, goLocal }
}

// --- What the screen has to say ----------------------------------------------

const pad = (n) => String(n).padStart(2, '0')

function todayIso() {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function shiftDays(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + delta)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

function daysBetween(from, to) {
  const [ay, am, ad] = from.split('-').map(Number)
  const [by, bm, bd] = to.split('-').map(Number)
  return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 86400000)
}

const setsOf = (day) => day.workouts.reduce((n, w) => n + w.sets.length, 0)

function dominantMuscle(day) {
  const counts = {}
  for (const workout of day.workouts) {
    for (const set of workout.sets) {
      if (!set.muscle_group) continue
      counts[set.muscle_group] = (counts[set.muscle_group] || 0) + 1
    }
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return ranked.length > 0 ? ranked[0][0] : null
}

function lastSession(days) {
  const day = days[0]
  if (!day) return null
  return {
    date: day.date,
    name: day.workouts[0]?.name ?? null,
    sets: setsOf(day),
    muscle: dominantMuscle(day),
  }
}

// The heaviest set ever logged. Weight first, reps to break the tie — the same
// order the record ladder reads in, so the mark named here is the mark Progreso
// would name.
function bestMark(days) {
  let best = null
  for (const day of days) {
    for (const workout of day.workouts) {
      for (const set of workout.sets) {
        if (!Number.isFinite(set.weight) || !Number.isFinite(set.reps)) continue
        const better =
          !best || set.weight > best.weight || (set.weight === best.weight && set.reps > best.reps)
        if (better) best = { name: set.exercise_name, weight: set.weight, reps: set.reps, date: day.date }
      }
    }
  }
  return best
}

// Consecutive ISO weeks with at least one session, counted back from the most
// recent one trained. Weeks, not days: nobody lifts seven days a week, so a
// day streak reads as a broken one on a perfectly kept schedule.
function weekStreak(days) {
  if (days.length === 0) return 0
  const weeks = new Set(days.map((d) => isoWeekStart(d.date)))
  let week = isoWeekStart(days[0].date)
  let streak = 1
  while (weeks.has(shiftDays(week, -7))) {
    week = shiftDays(week, -7)
    streak += 1
  }
  return streak
}

// Sets in the last complete week against the one before it. The running week is
// deliberately left out: comparing a Tuesday against a finished week always
// reads as a collapse.
function weekVolume(days, today) {
  const lastWeek = shiftDays(isoWeekStart(today), -7)
  const weekBefore = shiftDays(lastWeek, -7)
  const count = (start) =>
    days.filter((d) => isoWeekStart(d.date) === start).reduce((n, d) => n + setsOf(d), 0)
  const sets = count(lastWeek)
  if (sets === 0) return null
  const previous = count(weekBefore)
  return { sets, deltaPct: previous > 0 ? Math.round(((sets - previous) / previous) * 100) : null }
}

// The small, boring object the waiting screen is built from. Cached rather than
// the raw log: the log is hundreds of sets and growing, and this is five
// numbers that a screen with no network still has to be able to read.
export function buildBootSummary(days, { today = todayIso() } = {}) {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? 1 : -1))
  return {
    at: Date.now(),
    session: lastSession(sorted),
    best: bestMark(sorted),
    weekStreak: weekStreak(sorted),
    volume: weekVolume(sorted, today),
  }
}

function agoLabel(from, to) {
  const days = daysBetween(from, to)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  return `hace ${days} días`
}

// `tone` picks the ink on the number: `pr` for the record (the earned moment),
// `accent` for what is trending, plain text for everything else. The muscle
// palette never lands on type — it rides the dot beside the title and nowhere
// else.
export function bootCards(summary, { restSeconds = 0, today = todayIso() } = {}) {
  const s = summary || {}
  const cards = []

  if (s.session) {
    const isToday = s.session.date === today
    const sets = s.session.sets
    cards.push({
      id: 'session',
      kicker: isToday ? 'Hoy' : 'Tu última sesión',
      title: s.session.name || (isToday ? 'Sesión de hoy' : 'Sesión sin nombre'),
      body: isToday
        ? `Llevas ${sets} ${sets === 1 ? 'serie' : 'series'} anotadas. Sigues donde lo dejaste.`
        : `La cerraste ${agoLabel(s.session.date, today)} con ${sets} ${sets === 1 ? 'serie' : 'series'}.`,
      stat: String(sets),
      statLabel: sets === 1 ? 'serie' : 'series',
      tone: 'text',
      muscle: s.session.muscle,
    })
  }

  if (s.best) {
    cards.push({
      id: 'best',
      kicker: 'Tu marca a batir',
      title: s.best.name,
      body: `Tu mejor serie: ${showKg(s.best.weight)} kg × ${s.best.reps}. Igualarla con una repetición más es récord.`,
      stat: String(showKg(s.best.weight)),
      statLabel: `kg × ${s.best.reps}`,
      tone: 'pr',
    })
  }

  if (s.weekStreak >= 2) {
    cards.push({
      id: 'streak',
      kicker: 'Constancia',
      title: `${s.weekStreak} semanas seguidas`,
      body: 'No has dejado pasar una semana sin entrenar. Hoy la mantienes viva.',
      stat: String(s.weekStreak),
      statLabel: 'semanas seguidas',
      tone: 'accent',
    })
  }

  if (s.volume) {
    const { sets, deltaPct } = s.volume
    cards.push({
      id: 'volume',
      kicker: 'Volumen',
      title: `${sets} ${sets === 1 ? 'serie' : 'series'} la semana pasada`,
      body:
        deltaPct == null
          ? 'Es la referencia con la que se mide esta semana.'
          : deltaPct >= 0
            ? `Un ${deltaPct}% más que la anterior.`
            : `Un ${Math.abs(deltaPct)}% menos que la anterior.`,
      stat: deltaPct == null ? String(sets) : `${deltaPct >= 0 ? '+' : '−'}${Math.abs(deltaPct)}`,
      statLabel: deltaPct == null ? 'series' : '% vs. semana anterior',
      tone: 'accent',
    })
  }

  if (restSeconds > 0) {
    cards.push({
      id: 'rest',
      kicker: 'Descanso',
      title: `${formatDuration(restSeconds)} entre series`,
      body: 'El cronómetro se pone solo al guardar cada serie. En las pesadas, no lo acortes.',
      stat: formatDuration(restSeconds),
      statLabel: 'descanso sugerido',
      tone: 'text',
    })
  }

  // Nothing logged yet — a first launch has no history to show, and an empty
  // card would be worse than the one true thing we can say.
  if (!s.session && !s.best) {
    cards.unshift({
      id: 'first-run',
      kicker: 'Empiezas',
      title: 'Tu primera sesión',
      body: 'Anota la primera serie y Fitit lleva la cuenta: marcas, volumen por músculo y constancia.',
      stat: null,
      statLabel: null,
      tone: 'text',
    })
  }

  return cards
}

// What the screen actually renders, read off the cache. Split out so the
// component stays a component and this stays testable.
export function cardsForBoot({ restSeconds = 0, today = todayIso() } = {}) {
  return bootCards(cachedBootSummary(), { restSeconds, today })
}
