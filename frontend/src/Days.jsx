import { useEffect, useState } from 'react'

import { createWorkout, deleteDay, listDays } from './api.js'
import { formatDayShort, formatDayStamp, sessionLength } from './format.js'
import { MUSCLE_GROUPS, muscleColor, UNGROUPED } from './muscles.js'
import { setRepeatTemplate } from './prefs.js'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// Cardio has no muscle group by design, so it gets its own bucket in the day
// breakdown rather than falling in with the lifts nobody has tagged yet.
const CARDIO = 'Cardio'

// The exercises a session worked, each once, in the order they were worked.
// That order is the plan: repeat the session and you start where you started.
function exerciseNames(workout) {
  return [...new Set(workout.sets.map((s) => s.exercise_name))]
}

export default function Days({ onOpenWorkout }) {
  const [days, setDays] = useState(null)
  const [date, setDate] = useState(todayISO())
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [backfill, setBackfill] = useState(false)
  // Which day has its overflow open, and whether its delete is armed. Rare and
  // irreversible actions live in there rather than beside the row you tap.
  const [menuFor, setMenuFor] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listDays()
      .then(setDays)
      .catch(() => setError('No se pudieron cargar tus días.'))
  }, [])

  // What a session cost, per muscle, in canonical order. Every set carries its
  // own group, so this needs nothing the list didn't already fetch — it used to
  // cross-reference /exercises by name, a second request and a map that went
  // stale the moment you re-tagged a lift.
  //
  // The count is the point. A row of anonymous dots said *which* groups a day
  // touched and nothing about how much, so six sets of chest and one warm-up of
  // shoulders drew exactly the same mark as a real push session. Cardio and
  // untagged sets keep their own entries rather than being dropped: the parts
  // have to add up to the total beside the name, or the arithmetic looks broken
  // — the same rule the Progreso summary follows.
  // Four groups printed at one weight make you add them up to find out what the
  // day was, so the biggest is marked `top` and goes to ink while the rest stay
  // muted — hierarchy, not colour, the same rule the folded digest follows.
  // Nothing is marked when every group got the same: lifting all of them is
  // lifting none of them, and a full-body day reading flat is the honest one.
  function breakdownOf(workout) {
    const counts = {}
    for (const set of workout.sets) {
      const key = set.kind === 'cardio' ? CARDIO : (set.muscle_group ?? UNGROUPED)
      counts[key] = (counts[key] || 0) + 1
    }
    const parts = [...MUSCLE_GROUPS, CARDIO, UNGROUPED]
      .filter((key) => counts[key])
      .map((key) => ({ key, sets: counts[key] }))
    const most = Math.max(0, ...parts.map((p) => p.sets))
    const leaders = parts.filter((p) => p.sets === most)
    const flat = leaders.length === parts.length
    return parts.map((part) => ({ ...part, top: !flat && part.sets === most }))
  }

  function openMenu(dayId) {
    setConfirmingDelete(false)
    setMenuFor((current) => (current === dayId ? null : dayId))
  }

  // Today's session, if there is one. Its existence is what the primary button
  // reads: a second workout on a day you already trained is how a session ends
  // up split across two entries.
  const todayDay = days?.find((d) => d.date === todayISO())
  const todaySession = todayDay?.workouts?.[0]
    ? { ...todayDay.workouts[0], date: todayDay.date }
    : null

  // Starting today's session is one intent: one button, no form.
  async function startToday() {
    setError('')
    setCreating(true)
    try {
      const workout = await createWorkout({ date: todayISO(), name: null })
      onOpenWorkout(workout.id, workout, true)
    } catch {
      setError('No se pudo empezar el entreno.')
    } finally {
      setCreating(false)
    }
  }

  // The date+name form is only for backfilling a past session.
  async function handleCreate(event) {
    event.preventDefault()
    setError('')
    setCreating(true)
    try {
      const workout = await createWorkout({ date, name: name.trim() || null })
      onOpenWorkout(workout.id, workout)
    } catch {
      setError('No se pudo empezar el entreno.')
    } finally {
      setCreating(false)
    }
  }

  // The quickest session to log is one already written down: same name, same
  // exercises, standing and waiting in Entreno with their previous marks.
  async function handleRepeat(day) {
    const source = day.workouts[0]
    if (!source) return
    setError('')
    setMenuFor(null)
    setCreating(true)
    try {
      const workout = await createWorkout({ date: todayISO(), name: source.name ?? null })
      setRepeatTemplate(workout.id, exerciseNames(source))
      onOpenWorkout(workout.id, workout)
    } catch {
      setError('No se pudo repetir ese entreno.')
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteDay(id) {
    setError('')
    setMenuFor(null)
    try {
      await deleteDay(id)
      setDays((list) => list.filter((d) => d.id !== id))
    } catch {
      setError('No se pudo borrar ese día.')
    }
  }

  const ctaLabel = creating
    ? 'Empezando…'
    : todaySession
      ? `Continuar entreno${todaySession.name ? ` · ${todaySession.name}` : ''}`
      : 'Empezar entreno'

  return (
    <section className="days">
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}

      {days === null ? (
        <p className="hint">Cargando…</p>
      ) : days.length === 0 ? (
        <p className="hint">Aún no hay días. Empieza un entreno abajo.</p>
      ) : (
        days.map((day) => (
          <div
            className={`day-block${day.date === todayISO() ? ' is-today' : ''}`}
            key={day.id}
          >
            {/* A margin note, not a card and no longer a rule across the row:
                the date sets in a left gutter and the sessions hang off it.
                The rule it replaces ran from the date to the overflow, which
                put a horizontal cut between a date and its own session — so it
                read as a divider above the session rather than as its stamp.
                What separates one day from the next is now the hairline over
                the whole block, date included. */}
            <h2 className="day-date">
              {formatDayStamp(day.date).map((line) => (
                <span className="day-date-line" key={line}>
                  {line}
                </span>
              ))}
              {day.date === todayISO() && <span className="today-badge">HOY</span>}
            </h2>
            <div className="head-menu day-menu">
              <button
                type="button"
                className="secondary set-action head-menu-btn"
                aria-haspopup="true"
                aria-expanded={menuFor === day.id}
                aria-label={`Acciones del día ${formatDayShort(day.date)}`}
                onClick={() => openMenu(day.id)}
              >
                ⋯
              </button>
              {menuFor === day.id && (
                <div className="head-menu-pop">
                  <button
                    type="button"
                    className="secondary set-action head-menu-item"
                    disabled={creating || day.workouts.length === 0}
                    onClick={() => handleRepeat(day)}
                  >
                    Repetir
                  </button>
                  {/* Two taps to delete: the first only arms it. */}
                  {confirmingDelete ? (
                    <button
                      type="button"
                      className="secondary set-action head-menu-item head-menu-danger"
                      onClick={() => handleDeleteDay(day.id)}
                    >
                      Sí, borrar día
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="secondary set-action head-menu-item head-menu-danger"
                      onClick={() => setConfirmingDelete(true)}
                    >
                      Borrar día
                    </button>
                  )}
                </div>
              )}
            </div>
            <ul className="sets day-sessions">
              {day.workouts.map((w) => (
                <li key={w.id}>
                  {/* Hand the workout over, not just its id: this list already
                      holds every set, so Entreno can draw before it fetches.
                      The date comes from the day rather than the workout, so
                      the seed is renderable without depending on the nested
                      workout carrying a field it doesn't need here. */}
                  <button
                    type="button"
                    className="link-row day-session"
                    onClick={() => onOpenWorkout(w.id, { ...w, date: day.date })}
                  >
                    <span className="day-session-main">
                      <span className="day-session-top">
                        <span className="day-session-name">{w.name || 'Entreno'}</span>
                        {/* How many, and how long they took — two elements, not
                            one string, because they are not equally interesting.
                            The count is what you scan a week of days for; the
                            duration is context, so it sets smaller and muted.
                            It is absent altogether for a session still running
                            and for one typed in afterwards — see sessionLength. */}
                        <span className="set-index day-session-count">
                          {w.sets.length} serie{w.sets.length === 1 ? '' : 's'}
                        </span>
                        {sessionLength(w) && (
                          <span className="day-session-len">{sessionLength(w)}</span>
                        )}
                      </span>
                      {/* The breakdown under the name, not beside it: three or
                          four groups will not share a line with the name and
                          the total on a phone. */}
                      {w.sets.length > 0 && (
                        <span className="day-parts">
                          {breakdownOf(w).map((part) => (
                            <span
                              className={`day-part${part.top ? ' is-top' : ''}`}
                              key={part.key}
                            >
                              <span
                                className={`dot${part.key === CARDIO ? ' dot-cardio' : ''}`}
                                aria-hidden="true"
                                style={{ '--chip': muscleColor(part.key) }}
                              />
                              {part.key} <span className="day-part-n">{part.sets}</span>
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {/* The list scrolls; the way into a session doesn't. Pinned above the tab
          bar because that's where a thumb already is, one-handed, mid-gym. */}
      <div className="days-cta">
        {backfill && (
          <form className="backfill" onSubmit={handleCreate}>
            <div className="row">
              <div className="field">
                <label htmlFor="workout-date">Fecha</label>
                <input
                  id="workout-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="workout-name">Nombre (opcional)</label>
                <input
                  id="workout-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="p. ej. Empuje"
                />
              </div>
            </div>
            <button type="submit" className="btn-full" disabled={creating}>
              {creating ? 'Empezando…' : 'Crear entreno'}
            </button>
          </form>
        )}
        <div className="days-start">
          <button
            type="button"
            className="btn-full btn-log"
            onClick={todaySession ? () => onOpenWorkout(todaySession.id, todaySession) : startToday}
            disabled={creating}
          >
            {ctaLabel}
          </button>
          <button
            type="button"
            className="secondary"
            aria-expanded={backfill}
            onClick={() => setBackfill((v) => !v)}
          >
            Otra fecha
          </button>
        </div>
      </div>
    </section>
  )
}
