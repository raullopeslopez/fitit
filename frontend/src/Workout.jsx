import { useEffect, useState } from 'react'

import {
  deleteSet,
  deleteWorkout,
  editSet,
  getPreviousMarks,
  getWorkout,
  listExercises,
  logSet,
  renameWorkout,
} from './api.js'
import { estimatedOneRm, formatDate, formatSet } from './format.js'

// Mirror the backend's SetIn bounds so bad input fails fast with a clear message
// instead of a generic request error. Returns { reps, weight } or { error }.
function validateSet(reps, weight, rpe) {
  const r = Number(reps)
  const w = Number(weight)
  if (!Number.isInteger(r) || r < 1) {
    return { error: 'Enter reps as a whole number of 1 or more.' }
  }
  if (!Number.isFinite(w) || w < 0) {
    return { error: 'Enter a weight of 0 or more.' }
  }
  let rpeValue = null
  if (rpe != null && String(rpe).trim() !== '') {
    const rp = Number(rpe)
    if (!Number.isFinite(rp) || rp < 1 || rp > 10) {
      return { error: 'RPE must be between 1 and 10.' }
    }
    rpeValue = rp
  }
  return { reps: r, weight: w, rpe: rpeValue }
}

function ExerciseCard({ name, previous, sets, onLogSet, onEditSet, onDeleteSet }) {
  const [reps, setReps] = useState('')
  const [weight, setWeight] = useState('')
  const [unit, setUnit] = useState('kg')
  const [rpe, setRpe] = useState('')
  const [note, setNote] = useState('')
  const [logging, setLogging] = useState(false)
  const [best, setBest] = useState(previous?.best_one_rm ?? null)
  const [pr, setPr] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editReps, setEditReps] = useState('')
  const [editWeight, setEditWeight] = useState('')
  const [editRpe, setEditRpe] = useState('')
  const [editNote, setEditNote] = useState('')
  const [error, setError] = useState('')

  function repeatPrevious() {
    const last = previous?.sets?.[0]
    if (!last) return
    setError('')
    setReps(String(last.reps))
    setWeight(String(last.weight))
    setUnit(last.unit)
  }

  async function handleLogSet(event) {
    event.preventDefault()
    const valid = validateSet(reps, weight, rpe)
    if (valid.error) {
      setError(valid.error)
      return
    }
    setError('')
    setLogging(true)
    try {
      await onLogSet(name, {
        reps: valid.reps,
        weight: valid.weight,
        unit,
        rpe: valid.rpe,
        note: note.trim() || null,
      })
      const oneRm = estimatedOneRm(valid.weight, valid.reps)
      setPr(best != null && oneRm > best)
      setBest((b) => (b == null ? oneRm : Math.max(b, oneRm)))
      setReps('')
      setWeight('')
      setRpe('')
      setNote('')
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
    setEditRpe(set.rpe != null ? String(set.rpe) : '')
    setEditNote(set.note || '')
  }

  async function handleSaveEdit(set) {
    const valid = validateSet(editReps, editWeight, editRpe)
    if (valid.error) {
      setError(valid.error)
      return
    }
    setError('')
    try {
      await onEditSet(set, {
        reps: valid.reps,
        weight: valid.weight,
        rpe: valid.rpe,
        note: editNote.trim() || null,
      })
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
          <strong>Last time:</strong> {previous.sets.map(formatSet).join(', ')}{' '}
          <button type="button" className="secondary set-action" onClick={repeatPrevious}>
            Repeat
          </button>
        </p>
      ) : (
        <p className="previous muted">No previous marks yet. Set the baseline.</p>
      )}

      {pr && (
        <p className="pr-banner">🏆 New PR! Estimated 1RM {best}</p>
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
            <label htmlFor={`weight-${name}`}>Weight</label>
            <input
              id={`weight-${name}`}
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>
          <div className="field field-unit">
            <label htmlFor={`unit-${name}`}>Unit</label>
            <select
              id={`unit-${name}`}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            >
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </div>
          <div className="field field-unit">
            <label htmlFor={`rpe-${name}`}>RPE</label>
            <input
              id={`rpe-${name}`}
              inputMode="decimal"
              value={rpe}
              onChange={(e) => setRpe(e.target.value)}
              placeholder="1–10"
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor={`note-${name}`}>Note</label>
          <input
            id={`note-${name}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="optional — how did it feel?"
          />
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
                  <input
                    aria-label="Edit RPE"
                    inputMode="decimal"
                    placeholder="RPE"
                    value={editRpe}
                    onChange={(e) => setEditRpe(e.target.value)}
                  />
                  <input
                    aria-label="Edit note"
                    className="set-edit-note"
                    placeholder="note"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                  />
                  <button type="submit">Save</button>
                  <button type="button" className="secondary" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <span>
                    {formatSet(set)}
                    {set.rpe ? ` · RPE ${set.rpe}` : ''}
                  </span>
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
                  {set.note ? <span className="set-note">{set.note}</span> : null}
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

export default function Workout({ workoutId, onExit }) {
  const [workout, setWorkout] = useState(null)
  const [exerciseInput, setExerciseInput] = useState('')
  const [exercises, setExercises] = useState([]) // [{ name, previous }] in the order added
  const [known, setKnown] = useState([]) // known exercise names for autocomplete
  const [renaming, setRenaming] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    getWorkout(workoutId)
      .then((w) => {
        setWorkout(w)
        // Seed a card per exercise already logged in this workout, in order.
        const names = [...new Set(w.sets.map((s) => s.exercise_name))]
        setExercises(names.map((name) => ({ name, previous: null })))
      })
      .catch(() => setError('Could not load the workout.'))
  }, [workoutId])

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

  async function logSetFor(name, { reps, weight, unit, rpe, note }) {
    const updated = await logSet(workout.id, {
      exercise_name: name,
      reps,
      weight,
      unit,
      rpe,
      note,
    })
    setWorkout(updated)
  }

  async function editSetFor(set, { reps, weight, rpe, note }) {
    const updated = await editSet(set.id, {
      exercise_name: set.exercise_name,
      reps,
      weight,
      unit: set.unit,
      rpe,
      note,
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

  function startRename() {
    setError('')
    setNameInput(workout.name || '')
    setRenaming(true)
  }

  async function handleRename(event) {
    event.preventDefault()
    try {
      const updated = await renameWorkout(workout.id, nameInput.trim() || null)
      setWorkout((w) => ({ ...w, name: updated.name }))
      setRenaming(false)
    } catch {
      setError('Could not rename the workout.')
    }
  }

  async function handleDeleteWorkout() {
    setError('')
    try {
      await deleteWorkout(workout.id)
      onExit()
    } catch {
      setError('Could not delete the workout.')
    }
  }

  const setsFor = (name) =>
    workout ? workout.sets.filter((s) => s.exercise_name === name) : []

  if (!workout) {
    return error ? (
      <p role="alert" className="alert">
        {error}
      </p>
    ) : (
      <p className="hint">Loading…</p>
    )
  }

  return (
    <section>
      <div className="workout-head">
        <button type="button" className="secondary" onClick={onExit}>
          ← Days
        </button>
        {renaming ? (
          <form className="workout-rename" onSubmit={handleRename}>
            <input
              aria-label="Workout name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Workout name"
            />
            <button type="submit" className="secondary set-action">
              Save name
            </button>
            <button
              type="button"
              className="secondary set-action"
              onClick={() => setRenaming(false)}
            >
              Cancel
            </button>
          </form>
        ) : (
          <div className="workout-title">
            <strong>{workout.name || 'Workout'}</strong>
            <span className="set-index"> · {formatDate(workout.date)}</span>
            <button
              type="button"
              className="secondary set-action"
              onClick={startRename}
            >
              Rename
            </button>
            <button
              type="button"
              className="secondary set-action"
              onClick={handleDeleteWorkout}
            >
              Delete workout
            </button>
          </div>
        )}
      </div>

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
