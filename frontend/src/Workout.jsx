import { useEffect, useState } from 'react'

import {
  createWorkout,
  deleteSet,
  editSet,
  getPreviousMarks,
  listExercises,
  logSet,
} from './api.js'

function formatSet(set) {
  return `${set.weight} kg x ${set.reps}`
}

function ExerciseCard({ name, previous, sets, onLogSet, onEditSet, onDeleteSet }) {
  const [reps, setReps] = useState('')
  const [weight, setWeight] = useState('')
  const [logging, setLogging] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editReps, setEditReps] = useState('')
  const [editWeight, setEditWeight] = useState('')
  const [error, setError] = useState('')

  async function handleLogSet(event) {
    event.preventDefault()
    setError('')
    setLogging(true)
    try {
      await onLogSet(name, { reps: Number(reps), weight: Number(weight) })
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

  async function handleSaveEdit(set) {
    setError('')
    try {
      await onEditSet(set, { reps: Number(editReps), weight: Number(editWeight) })
      setEditingId(null)
    } catch {
      setError('Could not update that set.')
    }
  }

  async function handleDelete(setId) {
    setError('')
    try {
      await onDeleteSet(setId)
    } catch {
      setError('Could not delete that set.')
    }
  }

  return (
    <div className="card">
      <h2>{name}</h2>

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
            <label htmlFor={`reps-${name}`}>Reps</label>
            <input
              id={`reps-${name}`}
              inputMode="numeric"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`weight-${name}`}>Weight (kg)</label>
            <input
              id={`weight-${name}`}
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

      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}

      {sets.length > 0 ? (
        <ol className="sets">
          {sets.map((set, index) => (
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
                  <button type="button" className="secondary" onClick={() => setEditingId(null)}>
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
                    onClick={() => handleDelete(set.id)}
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
  )
}

export default function Workout() {
  const [workout, setWorkout] = useState(null)
  const [exerciseInput, setExerciseInput] = useState('')
  const [exercises, setExercises] = useState([]) // [{ name, previous }] in the order added
  const [known, setKnown] = useState([]) // known exercise names for autocomplete
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    createWorkout()
      .then(setWorkout)
      .catch(() => setError('Could not start a workout. Check your connection.'))
  }, [])

  useEffect(() => {
    // Autocomplete is best-effort; a failure here shouldn't break logging.
    listExercises()
      .then((list) => setKnown(list.map((e) => e.name)))
      .catch(() => {})
  }, [])

  async function handleAddExercise(event) {
    event.preventDefault()
    const name = exerciseInput.trim()
    if (!name) return
    setError('')
    setAdding(true)
    try {
      const previous = await getPreviousMarks(name)
      setExercises((list) =>
        list.some((e) => e.name === name) ? list : [...list, { name, previous }],
      )
      setExerciseInput('')
    } catch {
      setError('Could not load previous marks.')
    } finally {
      setAdding(false)
    }
  }

  async function logSetFor(name, { reps, weight }) {
    const updated = await logSet(workout.id, {
      exercise_name: name,
      reps,
      weight,
      unit: 'kg',
    })
    setWorkout(updated)
  }

  async function editSetFor(set, { reps, weight }) {
    const updated = await editSet(set.id, {
      exercise_name: set.exercise_name,
      reps,
      weight,
      unit: set.unit,
    })
    setWorkout((w) => ({
      ...w,
      sets: w.sets.map((s) => (s.id === updated.id ? updated : s)),
    }))
  }

  async function deleteSetFor(setId) {
    await deleteSet(setId)
    setWorkout((w) => ({ ...w, sets: w.sets.filter((s) => s.id !== setId) }))
  }

  const setsFor = (name) =>
    workout ? workout.sets.filter((s) => s.exercise_name === name) : []

  return (
    <section>
      <form className="card" onSubmit={handleAddExercise}>
        <div className="field">
          <label htmlFor="exercise">Exercise</label>
          <input
            id="exercise"
            list="exercise-options"
            value={exerciseInput}
            onChange={(e) => setExerciseInput(e.target.value)}
            placeholder="e.g. Bench Press"
          />
          <datalist id="exercise-options">
            {known.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
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

      {exercises.map((ex) => (
        <ExerciseCard
          key={ex.name}
          name={ex.name}
          previous={ex.previous}
          sets={setsFor(ex.name)}
          onLogSet={logSetFor}
          onEditSet={editSetFor}
          onDeleteSet={deleteSetFor}
        />
      ))}
    </section>
  )
}
