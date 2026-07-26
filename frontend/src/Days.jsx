import { useEffect, useState } from 'react'

import { createWorkout, deleteDay, listDays } from './api.js'
import { formatDayShort } from './format.js'
import { MUSCLE_GROUPS, muscleColor } from './muscles.js'
import { setRepeatTemplate } from './prefs.js'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

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

  // The distinct muscle groups a workout trained, in canonical order. Every set
  // carries its own group, so this needs nothing the list didn't already fetch —
  // it used to cross-reference /exercises by name, a second request and a map
  // that went stale the moment you re-tagged a lift.
  const musclesOf = (workout) =>
    MUSCLE_GROUPS.filter((m) => workout.sets.some((s) => s.muscle_group === m))
  const hasCardio = (workout) => workout.sets.some((s) => s.kind === 'cardio')

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
      onOpenWorkout(workout.id, workout)
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
          <div className="day-block" key={day.id}>
            {/* A ruled line, not a card: the date is the margin note and the
                sessions hang off it. Cards cost ~100px of chrome per day. */}
            <div className="day-head">
              <h2 className="day-date">
                {formatDayShort(day.date)}
                {day.date === todayISO() && <span className="today-badge">HOY</span>}
              </h2>
              <span className="day-line" aria-hidden="true" />
              <div className="head-menu">
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
                    className="link-row"
                    onClick={() => onOpenWorkout(w.id, { ...w, date: day.date })}
                  >
                    <span>{w.name || 'Entreno'}</span>
                    {(musclesOf(w).length > 0 || hasCardio(w)) && (
                      <span className="muscle-dots" aria-hidden="true">
                        {musclesOf(w).map((m) => (
                          <span key={m} className="dot" style={{ '--chip': muscleColor(m) }} />
                        ))}
                        {hasCardio(w) && <span className="dot dot-cardio" />}
                      </span>
                    )}
                    <span className="set-index">
                      {w.sets.length} serie{w.sets.length === 1 ? '' : 's'}
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
