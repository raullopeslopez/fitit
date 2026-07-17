import { useEffect, useState } from 'react'

import { createWorkout, deleteSet, editSet, getPreviousMarks, logSet } from './api.js'

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
  const [editingId, setEditingId] = useState(null)
  const [editReps, setEditReps] = useState('')
  const [editWeight, setEditWeight] = useState('')

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

  function startEdit(set) {
    setError('')
    setEditingId(set.id)
    setEditReps(String(set.reps))
    setEditWeight(String(set.weight))
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function handleSaveEdit(set) {
    setError('')
    try {
      const updated = await editSet(set.id, {
        exercise_name: set.exercise_name,
        reps: Number(editReps),
        weight: Number(editWeight),
        unit: set.unit,
      })
      setWorkout((w) => ({
        ...w,
        sets: w.sets.map((s) => (s.id === updated.id ? updated : s)),
      }))
      setEditingId(null)
    } catch {
      setError('Could not update that set.')
    }
  }

  async function handleDeleteSet(setId) {
    setError('')
    try {
      await deleteSet(setId)
      setWorkout((w) => ({ ...w, sets: w.sets.filter((s) => s.id !== setId) }))
    } catch {
      setError('Could not delete that set.')
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
                  {editingId === set.id ? (
                    <form
                      className="set-edit"
                      onSubmit={(e) => {
                        e.preventDefault()
                        handleSaveEdit(set)
                      }}
                    >
                      <input
                        aria-label="Edit reps"
                        inputMode="numeric"
                        value={editReps}
                        onChange={(e) => setEditReps(e.target.value)}
                      />
                      <input
                        aria-label="Edit weight"
                        inputMode="decimal"
                        value={editWeight}
                        onChange={(e) => setEditWeight(e.target.value)}
                      />
                      <button type="submit">Save</button>
                      <button type="button" className="secondary" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <span>{formatSet(set)}</span>
                      <span className="set-index">Set {index + 1}</span>
                      <button
                        type="button"
                        className="secondary set-action"
                        onClick={() => startEdit(set)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="secondary set-action"
                        onClick={() => handleDeleteSet(set.id)}
                      >
                        Delete
                      </button>
                    </>
                  )}
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
