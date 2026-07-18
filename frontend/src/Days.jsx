import { useEffect, useState } from 'react'

import { createWorkout, deleteDay, listDays } from './api.js'
import { formatDate } from './format.js'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function Days({ onOpenWorkout }) {
  const [days, setDays] = useState(null)
  const [date, setDate] = useState(todayISO())
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listDays()
      .then(setDays)
      .catch(() => setError('Could not load your days.'))
  }, [])

  async function handleCreate(event) {
    event.preventDefault()
    setError('')
    setCreating(true)
    try {
      const workout = await createWorkout({ date, name: name.trim() || null })
      onOpenWorkout(workout.id)
    } catch {
      setError('Could not start a workout.')
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
      setError('Could not delete that day.')
    }
  }

  return (
    <section>
      <form className="card" onSubmit={handleCreate}>
        <h2>New workout</h2>
        <div className="row">
          <div className="field">
            <label htmlFor="workout-date">Date</label>
            <input
              id="workout-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="workout-name">Name (optional)</label>
            <input
              id="workout-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Push"
            />
          </div>
        </div>
        <button type="submit" className="btn-full" disabled={creating}>
          {creating ? 'Starting…' : '+ New workout'}
        </button>
      </form>

      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}

      {days === null ? (
        <p className="hint">Loading…</p>
      ) : days.length === 0 ? (
        <p className="hint">No days yet. Start a workout above.</p>
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
                Delete day
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
                    <span>{w.name || 'Workout'}</span>
                    <span className="set-index">
                      {w.sets.length} set{w.sets.length === 1 ? '' : 's'}
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
