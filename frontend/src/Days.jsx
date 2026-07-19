import { useEffect, useState } from 'react'

import { createWorkout, deleteDay, listDays, listExercises } from './api.js'
import { downloadCsv } from './csv.js'
import { formatDate } from './format.js'
import { MUSCLE_GROUPS, muscleColor } from './muscles.js'
import { trainingStats } from './stats.js'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function Days({ onOpenWorkout }) {
  const [days, setDays] = useState(null)
  const [date, setDate] = useState(todayISO())
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [backfill, setBackfill] = useState(false)
  const [muscleByName, setMuscleByName] = useState({}) // name -> muscle group
  const [error, setError] = useState('')

  useEffect(() => {
    listDays()
      .then(setDays)
      .catch(() => setError('No se pudieron cargar tus días.'))
  }, [])

  useEffect(() => {
    // Best-effort: powers the per-session muscle dots; a failure just hides them.
    listExercises()
      .then((list) =>
        setMuscleByName(Object.fromEntries(list.map((e) => [e.name, e.muscle_group]))),
      )
      .catch(() => {})
  }, [])

  // The distinct muscle groups a workout trained, in canonical order.
  const musclesOf = (workout) =>
    MUSCLE_GROUPS.filter((m) =>
      workout.sets.some((s) => muscleByName[s.exercise_name] === m),
    )

  // Starting today's session is one intent: one button, no form.
  async function startToday() {
    setError('')
    setCreating(true)
    try {
      const workout = await createWorkout({ date: todayISO(), name: null })
      onOpenWorkout(workout.id)
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
      onOpenWorkout(workout.id)
    } catch {
      setError('No se pudo empezar el entreno.')
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteDay(id) {
    setError('')
    try {
      await deleteDay(id)
      setDays((list) => list.filter((d) => d.id !== id))
    } catch {
      setError('No se pudo borrar ese día.')
    }
  }

  return (
    <section>
      <div className="days-start">
        <button
          type="button"
          className="btn-full btn-log"
          onClick={startToday}
          disabled={creating}
        >
          {creating ? 'Empezando…' : 'Empezar entreno de hoy'}
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

      {backfill && (
        <form className="card" onSubmit={handleCreate}>
          <h2>Registrar otra fecha</h2>
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

      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}

      {days && days.length > 0 && (
        <div className="days-toolbar">
          {(() => {
            const { streak, total } = trainingStats(days)
            return (
              <p className="streak">
                Racha {streak} {streak === 1 ? 'día' : 'días'} · {total} entrenado
                {total === 1 ? '' : 's'}
              </p>
            )
          })()}
          <button
            type="button"
            className="secondary export-btn"
            onClick={() => downloadCsv(days)}
          >
            Exportar CSV
          </button>
        </div>
      )}

      {days === null ? (
        <p className="hint">Cargando…</p>
      ) : days.length === 0 ? (
        <p className="hint">Aún no hay días. Empieza un entreno arriba.</p>
      ) : (
        days.map((day) => (
          <div className="card" key={day.id}>
            <div className="day-head">
              <h2>{formatDate(day.date)}</h2>
              <button
                type="button"
                className="secondary set-action"
                onClick={() => handleDeleteDay(day.id)}
              >
                Borrar día
              </button>
            </div>
            <ul className="sets">
              {day.workouts.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    className="link-row"
                    onClick={() => onOpenWorkout(w.id)}
                  >
                    <span>{w.name || 'Entreno'}</span>
                    {musclesOf(w).length > 0 && (
                      <span className="muscle-dots" aria-hidden="true">
                        {musclesOf(w).map((m) => (
                          <span key={m} className="dot" style={{ '--chip': muscleColor(m) }} />
                        ))}
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
    </section>
  )
}
