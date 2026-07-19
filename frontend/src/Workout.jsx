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
import { getWeightUnit, setWeightUnit } from './prefs.js'

// Mirror the backend's SetIn bounds so bad input fails fast with a clear message
// instead of a generic request error. Returns { reps, weight } or { error }.
function validateSet(reps, weight, rpe) {
  const r = Number(reps)
  const w = Number(weight)
  if (!Number.isInteger(r) || r < 1) {
    return { error: 'Introduce reps: un número entero de 1 o más.' }
  }
  if (!Number.isFinite(w) || w < 0) {
    return { error: 'Introduce un peso de 0 o más.' }
  }
  let rpeValue = null
  if (rpe != null && String(rpe).trim() !== '') {
    const rp = Number(rpe)
    if (!Number.isFinite(rp) || rp < 1 || rp > 10) {
      return { error: 'El RPE debe estar entre 1 y 10.' }
    }
    rpeValue = rp
  }
  return { reps: r, weight: w, rpe: rpeValue }
}

// Seed the steppers from the last previous mark so a straight repeat is one tap
// on the "Registrar" button; fall back to empty for a never-logged exercise.
const WEIGHT_STEP = 2.5

function bump(current, delta, min) {
  const base = Number(current)
  const next = Number.isFinite(base) ? base : 0
  // Keep one decimal so 2.5 kg jumps stay clean instead of drifting to 82.49999.
  const bumped = Math.max(min, Math.round((next + delta) * 10) / 10)
  return String(bumped)
}

function ExerciseCard({ name, previous, sets, weightUnit, onLogSet, onEditSet, onDeleteSet }) {
  const seed = previous?.found ? previous.sets?.[0] : null
  const [reps, setReps] = useState(seed ? String(seed.reps) : '')
  const [weight, setWeight] = useState(seed ? String(seed.weight) : '')
  const [rpe, setRpe] = useState('')
  const [note, setNote] = useState('')
  const [logging, setLogging] = useState(false)
  // The number to beat: the server's best est. 1RM, or derive it from the
  // previous marks so the target block always shows a figure when one exists.
  const seededBest =
    previous?.best_one_rm ??
    (previous?.sets?.length
      ? Math.max(...previous.sets.map((s) => estimatedOneRm(s.weight, s.reps)))
      : null)
  const [best, setBest] = useState(seededBest)
  const [pr, setPr] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editReps, setEditReps] = useState('')
  const [editWeight, setEditWeight] = useState('')
  const [editRpe, setEditRpe] = useState('')
  const [editNote, setEditNote] = useState('')
  const [error, setError] = useState('')

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
        unit: weightUnit,
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
      setError('No se pudo registrar la serie.')
    } finally {
      setLogging(false)
    }
  }

  async function handleRepeatLast() {
    const last = sets[sets.length - 1]
    if (!last) return
    setError('')
    try {
      await onLogSet(name, {
        reps: last.reps,
        weight: last.weight,
        unit: last.unit,
        rpe: last.rpe ?? null,
        note: last.note ?? null,
      })
    } catch {
      setError('No se pudo registrar la serie.')
    }
  }

  function startEdit(set) {
    setError('')
    setOpenMenuId(null)
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
      setError('No se pudo actualizar la serie.')
    }
  }

  async function handleDelete(setId) {
    setError('')
    try {
      await onDeleteSet(setId)
    } catch {
      setError('No se pudo borrar la serie.')
    }
  }

  const volume = sets.reduce((total, s) => total + s.weight * s.reps, 0)
  const bestOneRm = sets.length
    ? Math.max(...sets.map((s) => estimatedOneRm(s.weight, s.reps)))
    : 0

  const ready = reps !== '' && weight !== ''

  return (
    <div className="card">
      <h2>{name}</h2>

      {/* The number to beat is the biggest thing on the card — the target, not a
          sentence buried in a tinted box. */}
      {previous && previous.found ? (
        <div className="target">
          <div className="target-main">
            <div className="target-label">A batir · 1RM est.</div>
            <div className={`target-value${pr ? ' is-pr' : ''}`}>{best ?? '—'}</div>
          </div>
          <div className="target-meta">{previous.sets.map(formatSet).join(', ')}</div>
        </div>
      ) : (
        <p className="previous muted">Sin marcas anteriores. Marca la referencia.</p>
      )}

      {pr && (
        <p className="pr-banner">¡Nuevo récord! 1RM estimado {best}</p>
      )}

      <form onSubmit={handleLogSet}>
        <div className="row">
          <div className="field stepper-field">
            <label htmlFor={`weight-${name}`}>Peso · {weightUnit}</label>
            <div className="stepper">
              <button
                type="button"
                className="stepper-btn"
                aria-label="Restar kg"
                onClick={() => setWeight((w) => bump(w, -WEIGHT_STEP, 0))}
              >
                −
              </button>
              <input
                id={`weight-${name}`}
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
              <button
                type="button"
                className="stepper-btn stepper-plus"
                aria-label="Sumar kg"
                onClick={() => setWeight((w) => bump(w, WEIGHT_STEP, 0))}
              >
                +
              </button>
            </div>
          </div>
          <div className="field stepper-field">
            <label htmlFor={`reps-${name}`}>Reps</label>
            <div className="stepper">
              <button
                type="button"
                className="stepper-btn"
                aria-label="Restar rep"
                onClick={() => setReps((r) => bump(r, -1, 1))}
              >
                −
              </button>
              <input
                id={`reps-${name}`}
                inputMode="numeric"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
              />
              <button
                type="button"
                className="stepper-btn stepper-plus"
                aria-label="Sumar rep"
                onClick={() => setReps((r) => bump(r, 1, 1))}
              >
                +
              </button>
            </div>
          </div>
        </div>
        <div className="row">
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
          <div className="field">
            <label htmlFor={`note-${name}`}>Nota</label>
            <input
              id={`note-${name}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="opcional"
            />
          </div>
        </div>
        {/* The button states exactly what it will log, so a repeat is one tap. */}
        <button type="submit" className="btn-full btn-log" disabled={logging}>
          {logging
            ? 'Registrando…'
            : ready
              ? `Registrar ${weight} × ${reps}`
              : 'Registrar serie'}
        </button>
      </form>

      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}

      {sets.length > 0 ? (
        <>
        <p className="set-summary">
          Volumen {volume} {sets[0].unit} · Mejor 1RM {bestOneRm}
        </p>
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
                    aria-label="Editar reps"
                    inputMode="numeric"
                    value={editReps}
                    onChange={(e) => setEditReps(e.target.value)}
                  />
                  <input
                    aria-label="Editar peso"
                    inputMode="decimal"
                    value={editWeight}
                    onChange={(e) => setEditWeight(e.target.value)}
                  />
                  <input
                    aria-label="Editar RPE"
                    inputMode="decimal"
                    placeholder="RPE"
                    value={editRpe}
                    onChange={(e) => setEditRpe(e.target.value)}
                  />
                  <input
                    aria-label="Editar nota"
                    className="set-edit-note"
                    placeholder="nota"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                  />
                  <button type="submit">Guardar</button>
                  <button type="button" className="secondary" onClick={() => setEditingId(null)}>
                    Cancelar
                  </button>
                </form>
              ) : (
                <>
                  <span>
                    {formatSet(set)}
                    {set.rpe ? ` · RPE ${set.rpe}` : ''}
                  </span>
                  <span className="set-index">Serie {index + 1}</span>
                  {/* Rare actions live behind an overflow so the readout stays clean. */}
                  <button
                    type="button"
                    className="secondary set-action set-menu-btn"
                    aria-label={`Más acciones · serie ${index + 1}`}
                    aria-expanded={openMenuId === set.id}
                    onClick={() =>
                      setOpenMenuId((id) => (id === set.id ? null : set.id))
                    }
                  >
                    ⋯
                  </button>
                  {openMenuId === set.id && (
                    <div className="set-menu">
                      <button
                        type="button"
                        className="secondary set-action"
                        onClick={() => startEdit(set)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="secondary set-action"
                        onClick={() => handleDelete(set.id)}
                      >
                        Borrar
                      </button>
                    </div>
                  )}
                  {set.note ? <span className="set-note">{set.note}</span> : null}
                </>
              )}
            </li>
          ))}
        </ol>
        <button type="button" className="secondary" onClick={handleRepeatLast}>
          +1 serie
        </button>
        </>
      ) : (
        <p className="hint">Aún no hay series.</p>
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
  // kg/lb is a workout-wide preference, remembered across sessions.
  const [weightUnit, setWeightUnitState] = useState(getWeightUnit())

  function chooseWeightUnit(unit) {
    setWeightUnit(unit)
    setWeightUnitState(unit)
  }

  useEffect(() => {
    getWorkout(workoutId)
      .then((w) => {
        setWorkout(w)
        // Seed a card per exercise already logged in this workout, in order.
        const names = [...new Set(w.sets.map((s) => s.exercise_name))]
        setExercises(names.map((name) => ({ name, previous: null })))
      })
      .catch(() => setError('No se pudo cargar el entreno.'))
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
      setError('No se pudieron cargar las marcas anteriores.')
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
      setError('No se pudo renombrar el entreno.')
    }
  }

  async function handleDeleteWorkout() {
    setError('')
    try {
      await deleteWorkout(workout.id)
      onExit()
    } catch {
      setError('No se pudo borrar el entreno.')
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
      <p className="hint">Cargando…</p>
    )
  }

  return (
    <section>
      <div className="workout-head">
        <button type="button" className="secondary" onClick={onExit}>
          ← Días
        </button>
        {renaming ? (
          <form className="workout-rename" onSubmit={handleRename}>
            <input
              aria-label="Nombre del entreno"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Nombre del entreno"
            />
            <button type="submit" className="secondary set-action">
              Guardar nombre
            </button>
            <button
              type="button"
              className="secondary set-action"
              onClick={() => setRenaming(false)}
            >
              Cancelar
            </button>
          </form>
        ) : (
          <div className="workout-title">
            <strong>{workout.name || 'Entreno'}</strong>
            <span className="set-index"> · {formatDate(workout.date)}</span>
            <button
              type="button"
              className="secondary set-action"
              onClick={startRename}
            >
              Renombrar
            </button>
            <button
              type="button"
              className="secondary set-action"
              onClick={handleDeleteWorkout}
            >
              Borrar entreno
            </button>
          </div>
        )}
      </div>

      <div className="prefs-bar">
        <span className="prefs-label">Peso</span>
        <div className="unit-toggle" role="group" aria-label="Unidad">
          {['kg', 'lb'].map((u) => (
            <button
              key={u}
              type="button"
              className="unit-option"
              aria-pressed={weightUnit === u}
              onClick={() => chooseWeightUnit(u)}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      <form className="card" onSubmit={handleAddExercise}>
        <div className="field">
          <label htmlFor="exercise">Ejercicio</label>
          <input
            id="exercise"
            list="exercise-options"
            value={exerciseInput}
            onChange={(e) => setExerciseInput(e.target.value)}
            placeholder="p. ej. Press banca"
          />
          <datalist id="exercise-options">
            {known.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <button type="submit" className="btn-full" disabled={adding}>
          {adding ? 'Comprobando…' : 'Añadir ejercicio'}
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
          weightUnit={weightUnit}
          onLogSet={logSetFor}
          onEditSet={editSetFor}
          onDeleteSet={deleteSetFor}
        />
      ))}
    </section>
  )
}
