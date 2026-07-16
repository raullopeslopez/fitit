import { useEffect, useState } from 'react'

import { createWorkout, getPreviousMarks, logSet } from './api.js'

function formatSet(set) {
  return `${set.weight} kg x ${set.reps}`
}

export default function Workout() {
  const [workout, setWorkout] = useState(null)
  const [exerciseInput, setExerciseInput] = useState('')
  const [currentExercise, setCurrentExercise] = useState('')
  const [previous, setPrevious] = useState(null)
  const [reps, setReps] = useState('')
  const [weight, setWeight] = useState('')
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [logging, setLogging] = useState(false)

  useEffect(() => {
    createWorkout()
      .then(setWorkout)
      .catch(() => setError('Could not start a workout. Check your connection.'))
  }, [])

  async function handleAddExercise(event) {
    event.preventDefault()
    const name = exerciseInput.trim()
    if (!name) return
    setError('')
    setAdding(true)
    setCurrentExercise(name)
    try {
      setPrevious(await getPreviousMarks(name))
    } catch {
      setError('Could not load previous marks.')
      setPrevious(null)
    } finally {
      setAdding(false)
    }
  }

  async function handleLogSet(event) {
    event.preventDefault()
    if (!workout || !currentExercise) return
    setError('')
    setLogging(true)
    try {
      const updated = await logSet(workout.id, {
        exercise_name: currentExercise,
        reps: Number(reps),
        weight: Number(weight),
        unit: 'kg',
      })
      setWorkout(updated)
      setReps('')
      setWeight('')
    } catch {
      setError('Could not log that set.')
    } finally {
      setLogging(false)
    }
  }

  const setsForCurrent = workout
    ? workout.sets.filter((s) => s.exercise_name === currentExercise)
    : []

  return (
    <section>
      <form className="card" onSubmit={handleAddExercise}>
        <div className="field">
          <label htmlFor="exercise">Exercise</label>
          <input
            id="exercise"
            value={exerciseInput}
            onChange={(e) => setExerciseInput(e.target.value)}
            placeholder="e.g. Bench Press"
          />
        </div>
        <button type="submit" className="btn-full" disabled={adding}>
          {adding ? 'Checking…' : 'Add exercise'}
        </button>
      </form>

      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}

      {currentExercise && (
        <div className="card">
          <h2>{currentExercise}</h2>

          {previous && previous.found ? (
            <p className="previous">
              <strong>Last time:</strong> {previous.sets.map(formatSet).join(', ')}
            </p>
          ) : (
            <p className="previous muted">No previous marks yet. Set the baseline.</p>
          )}

          <form onSubmit={handleLogSet}>
            <div className="row">
              <div className="field">
                <label htmlFor="reps">Reps</label>
                <input
                  id="reps"
                  inputMode="numeric"
                  value={reps}
                  onChange={(e) => setReps(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="weight">Weight (kg)</label>
                <input
                  id="weight"
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </div>
            </div>
            <button type="submit" className="btn-full" disabled={logging}>
              {logging ? 'Logging…' : 'Log set'}
            </button>
          </form>

          {setsForCurrent.length > 0 ? (
            <ol className="sets">
              {setsForCurrent.map((set, index) => (
                <li key={set.id}>
                  <span>{formatSet(set)}</span>
                  <span className="set-index">Set {index + 1}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="hint">No sets logged yet.</p>
          )}
        </div>
      )}
    </section>
  )
}
