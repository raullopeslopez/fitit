import { useEffect, useState } from 'react'

import {
  correctExerciseUnit,
  deleteSet,
  deleteWorkout,
  editSet,
  getPreviousMarks,
  getWorkout,
  listExercises,
  logSet,
  renameWorkout,
  setExerciseMuscle,
} from './api.js'
import {
  estimatedOneRm,
  formatCardioSet,
  formatClock,
  formatDate,
  formatDuration,
  formatSet,
  formatTime,
  parseDuration,
} from './format.js'
import { MUSCLE_GROUPS, muscleColor } from './muscles.js'
import { prSetIds } from './stats.js'
import {
  REST_OPTIONS,
  getDistanceUnit,
  getRestSeconds,
  getRestUntil,
  getWeightUnit,
  setDistanceUnit,
  setRestSeconds,
  setRestUntil,
  setWeightUnit,
} from './prefs.js'
import { displayWeight, toKg } from './units.js'

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

function ExerciseCard({
  name,
  muscle,
  previous,
  sets,
  weightUnit,
  onLogSet,
  onEditSet,
  onDeleteSet,
  onCorrectUnit,
  onChangeMuscle,
  open = true,
  onToggle,
}) {
  const seed = previous?.found ? previous.sets?.[0] : null
  const [reps, setReps] = useState(seed ? String(seed.reps) : '')
  const [weight, setWeight] = useState(
    seed ? String(displayWeight(seed.weight_kg, weightUnit)) : '',
  )
  const [rpe, setRpe] = useState('')
  const [note, setNote] = useState('')
  const [logging, setLogging] = useState(false)
  // Every figure below is in kilos, the unit the API compares in; it's only
  // converted on the way to the screen. The number to beat is the server's best
  // est. 1RM, or derived from the previous marks so the target block always
  // shows a figure when one exists.
  const seededBest =
    previous?.best_one_rm ??
    (previous?.sets?.length
      ? Math.max(...previous.sets.map((s) => estimatedOneRm(s.weight_kg, s.reps)))
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
      const oneRm = estimatedOneRm(toKg(valid.weight, weightUnit), valid.reps)
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
    // Edited in the unit you're reading in, not the one it was logged in — the
    // row above the form says 135 lb, so the field has to say 135 too.
    setEditWeight(String(displayWeight(set.weight_kg, weightUnit)))
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

  // The unit these sets were *logged* in is otherwise invisible: the readout is
  // in whichever unit you're reading in. Stating it here is what makes the
  // correction discoverable — you can't fix a mislabel you can't see. Null when
  // a block somehow mixes units, where a single relabel would be a guess.
  const loggedUnit = sets.length && sets.every((s) => s.unit === sets[0].unit)
    ? sets[0].unit
    : null
  const correctedUnit = loggedUnit === 'kg' ? 'lb' : 'kg'

  async function handleCorrectUnit() {
    setError('')
    try {
      await onCorrectUnit(sets[0].exercise_id, correctedUnit)
    } catch {
      setError('No se pudo cambiar la unidad.')
    }
  }

  const volumeKg = sets.reduce((total, s) => total + s.weight_kg * s.reps, 0)
  const bestOneRm = sets.length
    ? Math.max(...sets.map((s) => estimatedOneRm(s.weight_kg, s.reps)))
    : 0
  // What a folded card still has to answer: did I do this, and what did I hit.
  // It names one real working set — not decoupled reps/weight ranges, where you
  // couldn't tell which weight went with which reps. When every set matched,
  // that one set speaks for all ("4 series · 25 kg × 15"). When they varied,
  // show the hardest — the top set by est. 1RM, the same one the PR logic
  // tracks — labelled "tope" so a single pair isn't read as the whole exercise
  // ("4 series · tope 60 kg × 8"). Full per-set detail is one tap away, open.
  const shownPair = (s) => `${displayWeight(s.weight_kg, weightUnit)}×${s.reps}`
  const varied = sets.length ? !sets.every((s) => shownPair(s) === shownPair(sets[0])) : false
  const topSet = sets.length
    ? sets.reduce((best, s) =>
        estimatedOneRm(s.weight_kg, s.reps) > estimatedOneRm(best.weight_kg, best.reps) ? s : best,
      )
    : null
  // The count and framing stay muted; the weight — the "what did I hit" figure —
  // is lifted to ink so it reads first. Emphasis is by hierarchy, never amber:
  // amber is spent only on the PR, so a static readout can't borrow it.
  const digest = sets.length ? (
    <>
      {`${sets.length} ${sets.length === 1 ? 'serie' : 'series'} · `}
      {varied && <span className="d-tope">tope</span>}
      {varied && ' '}
      <span className="d-key">{`${displayWeight(topSet.weight_kg, weightUnit)} ${weightUnit}`}</span>
      {` × ${topSet.reps}`}
    </>
  ) : (
    'sin series'
  )
  // The single 1RM readout: the mark you walked in with, and where you are now.
  const todayBest = sets.length ? bestOneRm : null
  const beatIt = seededBest != null && todayBest != null && todayBest > seededBest
  // Which rows earn the PR badge. Derived from the log against the mark you
  // walked in with, so unlike the transient banner it survives a reload.
  const prIds = prSetIds(sets, seededBest)

  const ready = reps !== '' && weight !== ''

  return (
    <div className={`card${open ? '' : ' is-folded'}`}>
      {/* The whole header is the fold control: a wide target for a thumb, and
          when folded it carries the digest so the row still says what you did. */}
      <h2 className="exercise-title">
        <button type="button" className="card-toggle" aria-expanded={open} onClick={onToggle}>
          <span className="card-name">{name}</span>
          {muscle && (
            <span className="muscle-tag">
              <span className="dot" aria-hidden="true" style={{ '--chip': muscleColor(muscle) }} />
              {muscle}
            </span>
          )}
          {!open && <span className="card-digest">{digest}</span>}
          <span className="card-chevron" aria-hidden="true" />
        </button>
      </h2>

      {!open ? null : (
        <>
      {/* The classifier's guess is only a default; re-tag it here, and the
          folded header dot follows. Sits at the top of the open card so it's
          out of the way of logging but reachable without leaving Entreno. */}
      {onChangeMuscle && (
        <div className="muscle-edit">
          <span className="dot" aria-hidden="true" style={{ '--chip': muscleColor(muscle) }} />
          <span className="muscle-edit-heading">Grupo muscular</span>
          <select
            className="muscle-edit-select"
            aria-label={`Grupo muscular de ${name}`}
            value={muscle ?? ''}
            onChange={(e) => onChangeMuscle(name, e.target.value)}
          >
            <option value="">Sin grupo</option>
            {MUSCLE_GROUPS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      )}
      {/* One 1RM readout, not two: the mark you walked in with and where you are
          now. Two separate numbers twelve lines apart is how you read neither. */}
      {seededBest != null || todayBest != null ? (
        <div className="target">
          <div className="target-label">A batir · 1RM est.</div>
          {/* Only a real comparison gets an arrow. A first-ever exercise has
              nothing on the left of it, and "— → 41.3" reads as a stray dash
              plus a comparison that doesn't exist. */}
          <div className="target-line">
            {seededBest != null && todayBest != null && (
              <>
                <span className="target-prev">{displayWeight(seededBest, weightUnit)}</span>
                <span className="target-arrow" aria-hidden="true">
                  →
                </span>
              </>
            )}
            <span className={`target-today${beatIt ? ' is-pr' : ''}`}>
              {displayWeight(todayBest ?? seededBest, weightUnit)}
            </span>
          </div>
          {previous?.found && (
            <div className="target-meta">
              {previous.sets.map((s) => formatSet(s, weightUnit)).join(', ')}
            </div>
          )}
        </div>
      ) : (
        <p className="previous muted">Sin marcas anteriores. Marca la referencia.</p>
      )}

      {pr && (
        <p className="pr-banner">
          ¡Nuevo récord! 1RM estimado {displayWeight(best, weightUnit)}
        </p>
      )}

      <form onSubmit={handleLogSet}>
        <div className="row">
          <div className="field stepper-field">
            <label htmlFor={`weight-${name}`}>Peso · {weightUnit}</label>
            <div className="stepper">
              <button
                type="button"
                className="stepper-btn"
                aria-label={`Restar ${weightUnit}`}
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
                aria-label={`Sumar ${weightUnit}`}
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
          {sets.length} {sets.length === 1 ? 'serie' : 'series'} ·{' '}
          {displayWeight(volumeKg, weightUnit)} {weightUnit} volumen
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
                    {formatSet(set, weightUnit)}
                    {set.rpe ? ` · RPE ${set.rpe}` : ''}
                    {prIds.has(set.id) && (
                      <span className="pr-flag" title="Récord al registrarla">
                        PR
                      </span>
                    )}
                  </span>
                  <span className="set-index">
                    S{index + 1}
                    {set.created_at ? ` · ${formatTime(set.created_at)}` : ''}
                  </span>
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
        {loggedUnit && (
          <button type="button" className="unit-fix" onClick={handleCorrectUnit}>
            Registradas en {loggedUnit} · corregir a {correctedUnit}
          </button>
        )}
        </>
      ) : (
        <p className="hint">Aún no hay series.</p>
      )}
        </>
      )}
    </div>
  )
}

function CardioCard({
  name,
  previous,
  sets,
  distanceUnit,
  onChooseDistanceUnit,
  onLogSet,
  onDeleteSet,
  open = true,
  onToggle,
}) {
  const seed = previous?.found ? previous.sets?.[0] : null
  const [duration, setDuration] = useState(
    seed?.duration_seconds ? formatDuration(seed.duration_seconds) : '',
  )
  const [distance, setDistance] = useState(seed?.distance ? String(seed.distance) : '')
  const [note, setNote] = useState('')
  const [logging, setLogging] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [error, setError] = useState('')

  async function handleLog(event) {
    event.preventDefault()
    const seconds = parseDuration(duration)
    if (seconds == null || seconds < 1) {
      setError('Introduce una duración (mm:ss).')
      return
    }
    let dist = null
    if (distance.trim() !== '') {
      const d = Number(distance)
      if (!Number.isFinite(d) || d < 0) {
        setError('Introduce una distancia de 0 o más.')
        return
      }
      dist = d
    }
    setError('')
    setLogging(true)
    try {
      await onLogSet(name, {
        kind: 'cardio',
        duration_seconds: seconds,
        distance: dist,
        distance_unit: dist != null ? distanceUnit : null,
        note: note.trim() || null,
      })
      setDuration('')
      setDistance('')
      setNote('')
    } catch {
      setError('No se pudo registrar la serie.')
    } finally {
      setLogging(false)
    }
  }

  async function handleDelete(setId) {
    setError('')
    setOpenMenuId(null)
    try {
      await onDeleteSet(setId)
    } catch {
      setError('No se pudo borrar la serie.')
    }
  }

  const totalSeconds = sets.reduce((t, s) => t + (s.duration_seconds || 0), 0)
  const totalDistance = Math.round(sets.reduce((t, s) => t + (s.distance || 0), 0) * 10) / 10
  const seconds = parseDuration(duration)
  const ready = seconds != null && seconds >= 1
  const logLabel = ready
    ? distance.trim() !== ''
      ? `Registrar ${distance} ${distanceUnit} · ${formatDuration(seconds)}`
      : `Registrar ${formatDuration(seconds)}`
    : 'Registrar serie'

  // Folded, a cardio block reports time on feet, not sets × reps. Same emphasis
  // as strength: the count stays muted, the headline figure — here the total
  // time — is lifted to ink so the folded list reads with one visual language.
  const digest = sets.length ? (
    <>
      {`${sets.length} ${sets.length === 1 ? 'serie' : 'series'} · `}
      <span className="d-key">{formatDuration(totalSeconds)}</span>
    </>
  ) : (
    'sin series'
  )

  return (
    <div className={`card${open ? '' : ' is-folded'}`}>
      <h2 className="exercise-title">
        <button type="button" className="card-toggle" aria-expanded={open} onClick={onToggle}>
          <span className="card-name">{name}</span>
          {!open && <span className="card-digest">{digest}</span>}
          <span className="card-chevron" aria-hidden="true" />
        </button>
      </h2>

      {!open ? null : (
        <>
      {previous && previous.found ? (
        <div className="target">
          <div className="target-label">Última vez</div>
          <div className="target-meta">{previous.sets.map(formatCardioSet).join(' · ')}</div>
        </div>
      ) : (
        <p className="previous muted">Sin marcas anteriores. Marca la referencia.</p>
      )}

      <form onSubmit={handleLog}>
        <div className="row">
          <div className="field">
            <label htmlFor={`dur-${name}`}>Duración</label>
            <input
              id={`dur-${name}`}
              inputMode="numeric"
              placeholder="mm:ss"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`dist-${name}`}>Distancia · {distanceUnit}</label>
            <input
              id={`dist-${name}`}
              inputMode="decimal"
              placeholder="opcional"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
            />
          </div>
        </div>
        <div className="prefs-bar">
          <span className="prefs-label">Unidad</span>
          <div className="unit-toggle" role="group" aria-label="km o mi">
            {['km', 'mi'].map((u) => (
              <button
                key={u}
                type="button"
                className="unit-option"
                aria-pressed={distanceUnit === u}
                onClick={() => onChooseDistanceUnit(u)}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor={`cnote-${name}`}>Nota</label>
          <input
            id={`cnote-${name}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="opcional"
          />
        </div>
        <button type="submit" className="btn-full btn-log" disabled={logging}>
          {logging ? 'Registrando…' : logLabel}
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
            Total {formatDuration(totalSeconds)}
            {totalDistance ? ` · ${totalDistance} ${distanceUnit}` : ''}
          </p>
          <ol className="sets">
            {sets.map((set, index) => (
              <li key={set.id}>
                <span>{formatCardioSet(set)}</span>
                <span className="set-index">
                    S{index + 1}
                    {set.created_at ? ` · ${formatTime(set.created_at)}` : ''}
                  </span>
                <button
                  type="button"
                  className="secondary set-action set-menu-btn"
                  aria-label={`Más acciones · serie ${index + 1}`}
                  aria-expanded={openMenuId === set.id}
                  onClick={() => setOpenMenuId((id) => (id === set.id ? null : set.id))}
                >
                  ⋯
                </button>
                {openMenuId === set.id && (
                  <div className="set-menu">
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
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="hint">Aún no hay series.</p>
      )}
        </>
      )}
    </div>
  )
}

// The between-sets countdown. Ticks off an absolute deadline rather than
// decrementing a counter, so a backgrounded phone doesn't slow it down.
function RestBar({ endsAt, total, onSkip }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    // Sub-second so the readout never visibly sticks on a number.
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [endsAt])

  const remaining = Math.max(0, (endsAt - now) / 1000)
  const left = total > 0 ? Math.min(100, (remaining / total) * 100) : 0

  return (
    <div className="rest-bar" role="timer" aria-label={`Descanso ${formatClock(remaining)}`}>
      <span className="rest-label">Descanso</span>
      <span className="rest-num">{formatClock(remaining)}</span>
      <button type="button" className="secondary" onClick={onSkip}>
        Saltar
      </button>
      <div className="rest-track" aria-hidden="true">
        <span style={{ width: `${left}%` }} />
      </div>
    </div>
  )
}

export default function Workout({ workoutId, onExit }) {
  const [workout, setWorkout] = useState(null)
  const [exerciseInput, setExerciseInput] = useState('')
  const [exercises, setExercises] = useState([]) // [{ name, previous }], newest worked first
  // Which cards the user has explicitly opened or shut this session. Absent
  // means "use the default": only the newest card starts open, so the screen
  // shows what you're doing rather than everything you've already done.
  const [toggled, setToggled] = useState({})
  const [known, setKnown] = useState([]) // known exercise names for autocomplete
  const [muscleByName, setMuscleByName] = useState({}) // name -> muscle group
  const [idByName, setIdByName] = useState({}) // name -> exercise id, for re-tagging
  const [renaming, setRenaming] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  // Units are workout-wide preferences, remembered across sessions.
  const [weightUnit, setWeightUnitState] = useState(getWeightUnit())
  const [distanceUnit, setDistanceUnitState] = useState(getDistanceUnit())
  // Kind for a brand-new exercise; ignored when the exercise already exists.
  const [newKind, setNewKind] = useState('strength')
  // Rest countdown. `restEndsAt` resumes from storage, so leaving Entreno
  // mid-rest and coming back picks the clock up where it actually is.
  const [restSeconds, setRestSecondsState] = useState(getRestSeconds)
  const [restEndsAt, setRestEndsAt] = useState(getRestUntil)

  function endRest() {
    setRestUntil(null)
    setRestEndsAt(null)
  }

  function startRest() {
    if (restSeconds <= 0) return
    const until = Date.now() + restSeconds * 1000
    setRestUntil(until)
    setRestEndsAt(until)
  }

  function chooseRestSeconds(seconds) {
    setRestSeconds(seconds)
    setRestSecondsState(seconds)
    // Turning rest off should stop the clock you're looking at, not just the
    // next one.
    if (seconds <= 0) endRest()
  }

  // Retire the bar the moment it runs out, without waiting for the next tick.
  useEffect(() => {
    if (restEndsAt == null) return undefined
    const ms = restEndsAt - Date.now()
    if (ms <= 0) {
      endRest()
      return undefined
    }
    const id = setTimeout(endRest, ms)
    return () => clearTimeout(id)
  }, [restEndsAt])

  function chooseWeightUnit(unit) {
    setWeightUnit(unit)
    setWeightUnitState(unit)
  }

  function chooseDistanceUnit(unit) {
    setDistanceUnit(unit)
    setDistanceUnitState(unit)
  }

  useEffect(() => {
    getWorkout(workoutId)
      .then((w) => {
        setWorkout(w)
        // A card per exercise already logged here, most recently worked first:
        // the exercise you last put a set into is the one you're still on.
        //
        // Ranked by each exercise's LAST set, and settled once, here on load.
        // Nothing re-sorts afterwards — a card that moves while your thumb is
        // on the phone is how you tap the wrong thing mid-session.
        // Spec: tests/features/newest_first.feature
        const lastSeen = new Map()
        w.sets.forEach((s, index) => lastSeen.set(s.exercise_name, index))
        setExercises(
          [...lastSeen.keys()]
            .sort((a, b) => lastSeen.get(b) - lastSeen.get(a))
            .map((name) => {
              const first = w.sets.find((s) => s.exercise_name === name)
              return { name, previous: null, kind: first?.kind ?? 'strength' }
            }),
        )
      })
      .catch(() => setError('No se pudo cargar el entreno.'))
  }, [workoutId])

  useEffect(() => {
    // Autocomplete is best-effort; a failure here shouldn't break logging.
    listExercises()
      .then((list) => {
        setKnown(list.map((e) => e.name))
        setMuscleByName(Object.fromEntries(list.map((e) => [e.name, e.muscle_group])))
        setIdByName(Object.fromEntries(list.map((e) => [e.name, e.id])))
      })
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
      // A known exercise keeps its stored kind; a new one takes the toggle's choice.
      const kind = previous.kind ?? newKind
      // To the top: you just added it, so it's what you're about to do.
      setExercises((list) =>
        list.some((e) => e.name === name) ? list : [{ name, previous, kind }, ...list],
      )
      setExerciseInput('')
    } catch {
      setError('No se pudieron cargar las marcas anteriores.')
    } finally {
      setAdding(false)
    }
  }

  async function logSetFor(name, fields) {
    // fields carry either strength (reps/weight/…) or cardio (duration/…) metrics.
    const updated = await logSet(workout.id, { exercise_name: name, ...fields })
    setWorkout(updated)
    // The rest starts when the set lands, not when you tapped — a failed
    // request shouldn't leave you resting on a set you never logged.
    startRest()
  }

  async function editSetFor(set, { reps, weight, rpe, note }) {
    // The edit field was seeded in the unit being read, so that's the unit the
    // typed number is in — not whatever the set was originally logged as.
    const updated = await editSet(set.id, {
      exercise_name: set.exercise_name,
      reps,
      weight,
      unit: weightUnit,
      rpe,
      note,
    })
    setWorkout((w) => ({
      ...w,
      sets: w.sets.map((s) => (s.id === updated.id ? updated : s)),
    }))
  }

  async function correctUnitFor(exerciseId, unit) {
    setWorkout(await correctExerciseUnit(workout.id, exerciseId, unit))
  }

  // Override the muscle group (empty clears it back to the classifier's guess).
  // Update the name→group map so the header dot recolours without a reload.
  async function changeMuscleFor(name, group) {
    const id = idByName[name] ?? setsFor(name)[0]?.exercise_id
    if (id == null) return
    setError('')
    try {
      const updated = await setExerciseMuscle(id, group || null)
      setMuscleByName((m) => ({ ...m, [name]: updated.muscle_group }))
    } catch {
      setError('No se pudo cambiar el grupo muscular.')
    }
  }

  // Many cards may be open at once: folding one shut when you open another
  // would fight supersets, where you're genuinely working two lifts together.
  const isOpen = (name, index) => toggled[name] ?? index === 0
  const toggleCard = (name, index) =>
    setToggled((t) => ({ ...t, [name]: !(t[name] ?? index === 0) }))

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

      {restEndsAt != null && (
        <RestBar endsAt={restEndsAt} total={restSeconds} onSkip={endRest} />
      )}

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

      <div className="prefs-bar">
        <span className="prefs-label">Descanso</span>
        <div className="unit-toggle" role="group" aria-label="Descanso entre series">
          {REST_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="unit-option"
              aria-pressed={restSeconds === s}
              onClick={() => chooseRestSeconds(s)}
            >
              {s === 0 ? 'Sin descanso' : `${s}s`}
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
        <div className="prefs-bar">
          <span className="prefs-label">Tipo</span>
          <div className="unit-toggle" role="group" aria-label="Fuerza o cardio">
            {[
              ['strength', 'Fuerza'],
              ['cardio', 'Cardio'],
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                className="unit-option"
                aria-pressed={newKind === k}
                onClick={() => setNewKind(k)}
              >
                {label}
              </button>
            ))}
          </div>
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

      {exercises.map((ex, index) =>
        ex.kind === 'cardio' ? (
          <CardioCard
            key={ex.name}
            name={ex.name}
            previous={ex.previous}
            sets={setsFor(ex.name)}
            distanceUnit={distanceUnit}
            onChooseDistanceUnit={chooseDistanceUnit}
            onLogSet={logSetFor}
            onDeleteSet={deleteSetFor}
            open={isOpen(ex.name, index)}
            onToggle={() => toggleCard(ex.name, index)}
          />
        ) : (
          <ExerciseCard
            key={ex.name}
            name={ex.name}
            muscle={muscleByName[ex.name] ?? null}
            previous={ex.previous}
            sets={setsFor(ex.name)}
            weightUnit={weightUnit}
            onLogSet={logSetFor}
            onEditSet={editSetFor}
            onDeleteSet={deleteSetFor}
            onCorrectUnit={correctUnitFor}
            onChangeMuscle={changeMuscleFor}
            open={isOpen(ex.name, index)}
            onToggle={() => toggleCard(ex.name, index)}
          />
        ),
      )}
    </section>
  )
}
