import { useEffect, useRef, useState } from 'react'

import {
  deleteSet,
  deleteWorkout,
  editSet,
  getPreviousMarks,
  getWorkout,
  listExercises,
  logSet,
  recentlyTrained,
  renameWorkout,
  setExerciseMuscle,
  setExerciseNote,
} from './api.js'
import { getToken } from './auth.js'
import {
  daysAgoLabel,
  estimatedOneRm,
  fold,
  formatCardioSet,
  formatClock,
  formatDate,
  formatDuration,
  formatSet,
  formatTime,
  parseDuration,
  sessionLength,
} from './format.js'
import { MUSCLE_GROUPS, muscleColor, UNGROUPED } from './muscles.js'
import { RetagConfirm, RetagUndo } from './MuscleRetag.jsx'
import {
  cacheMarks,
  cacheWorkout,
  cachedMarks,
  cachedWorkout,
  dropQueued,
  enqueueSet,
  queuedFor,
  readQueue,
  retryable,
} from './offline.js'
import {
  announceRestNotice,
  askForNotifications,
  claimLockScreenSets,
  notificationState,
  onLockScreenSets,
  startRestNotice,
  stopRestNotice,
} from './notify.js'
import { weightPrs } from './stats.js'
import {
  REST_OPTIONS,
  getLockLogging,
  getRepeatTemplate,
  getRestSeconds,
  getRestUntil,
  getScreenAwake,
  setLockLogging,
  setRestSeconds,
  setRestUntil,
  setScreenAwake,
} from './prefs.js'
import { showKg } from './units.js'
import { holdScreenAwake } from './wakelock.js'

// Mirror the backend's SetIn bounds so bad input fails fast with a clear message
// instead of a generic request error. Returns { reps, weight } or { error }.
//
// An empty weight is a set with no weight — dominadas, fondos, abdominales —
// and travels as null, not 0. Logged as 0 it became a number: it charted, it
// could take a record, and the row read "0×12". Reps are what make it a set, so
// those are still required.
function validateSet(reps, weight) {
  const r = Number(reps)
  if (!Number.isInteger(r) || r < 1) {
    return { error: 'Introduce reps: un número entero de 1 o más.' }
  }
  let w = null
  if (String(weight ?? '').trim() !== '') {
    w = Number(weight)
    if (!Number.isFinite(w) || w < 0) {
      return { error: 'Introduce un peso de 0 o más, o déjalo vacío si es sin peso.' }
    }
  }
  return { reps: r, weight: w }
}

// Seed the steppers from the last previous mark so a straight repeat is one tap
// on the "Registrar" button; fall back to empty for a never-logged exercise.
const WEIGHT_STEP = 2.5

// A card per exercise the workout already has sets for, most recently worked
// first: the exercise you last put a set into is the one you're still on.
//
// Ranked by each exercise's LAST set and settled once, never re-sorted — a card
// that moves while your thumb is on the phone is how you tap the wrong thing
// mid-session. Spec: tests/features/newest_first.feature
//
// No `previous` key on purpose: absent means "marks not fetched yet", which is
// not the same as "this lift has no history". Anything that claims a record has
// to wait for the difference.
function exercisesFromWorkout(workout) {
  if (!workout) return []
  const lastSeen = new Map()
  workout.sets.forEach((s, index) => lastSeen.set(s.exercise_name, index))
  return [...lastSeen.keys()]
    .sort((a, b) => lastSeen.get(b) - lastSeen.get(a))
    .map((name) => {
      const first = workout.sets.find((s) => s.exercise_name === name)
      return { name, kind: first?.kind ?? 'strength' }
    })
}

// The server's sets plus whatever is still sitting in the outbox for this
// workout. The queue is the single source of "pending", which is what makes a
// reload rebuild the unsent rows for free — and why this strips pending sets
// before re-adding them, so calling it twice can't duplicate anything.
function withQueued(workout) {
  if (!workout) return workout
  return {
    ...workout,
    sets: [
      ...workout.sets.filter((s) => !s.pending),
      ...queuedFor(workout.id).map((e) => ({ id: e.tmpId, pending: true, ...e.payload })),
    ],
  }
}

// Previous marks, with the cache behind them: a card opened with no signal still
// says what you did last time. Every fresh answer refreshes the cache.
async function marksFor(name, workoutId) {
  try {
    const marks = await getPreviousMarks(name, workoutId)
    cacheMarks(name, marks)
    return marks
  } catch {
    return cachedMarks(name)
  }
}

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
  // The standing note on the exercise — how you do this lift, every session.
  // Null when there isn't one; the card then shows no line at all.
  note = null,
  // Sets already logged against this exercise, across the whole log — not just
  // this session, which is all this card can see. It comes from /exercises and
  // is what the re-tag confirmation counts out loud.
  setCount = 0,
  previous,
  sets,
  onLogSet,
  onEditSet,
  onDeleteSet,
  onChangeMuscle,
  onChangeNote,
  open = true,
  onToggle,
  // Unfolds the card without the toggle's "or fold it again": a chip has to
  // open the card it stands on, never close it.
  onOpen,
}) {
  const seed = previous?.found ? previous.sets?.[0] : null
  const [reps, setReps] = useState(seed ? String(seed.reps) : '')
  // Empty for a bodyweight seed too: the field says "no weight" by being empty,
  // which is exactly what you want to log again.
  const [weight, setWeight] = useState(
    seed && seed.weight != null ? String(showKg(seed.weight)) : '',
  )
  // Re-tagging the muscle and writing the standing note are both things you do
  // once in an exercise's life, so they share one fold on a card you open to log.
  const [showFixes, setShowFixes] = useState(false)
  // The standing note, being edited. Seeded from the exercise each time the fold
  // opens, so an abandoned edit doesn't survive as a draft nobody asked for.
  const [noteDraft, setNoteDraft] = useState(note ?? '')
  // A re-tag the user has asked for but not yet confirmed — `{ group }`, where
  // a null group means "Sin grupo". Null while nothing is pending. The select
  // stays controlled by `muscle` throughout, so backing out needs no undoing:
  // the next render puts it back on the group the exercise still has.
  const [pendingRetag, setPendingRetag] = useState(null)
  // The re-tag that just went through, kept so it can be walked back from the
  // same fold: `{ from }`, the group it held before.
  const [lastRetag, setLastRetag] = useState(null)
  // Every figure below is in kilos, the unit the API compares in; it's only
  // converted on the way to the screen.
  // Absent `previous` means the marks haven't arrived, not that there are none.
  // Nothing may claim a record before this is true: with no mark to beat, the
  // comparison silently falls back to the session's own peak and awards set 2 a
  // PR for beating set 1.
  const marksKnown = previous !== undefined
  // Cached marks are good enough to train against and not good enough to
  // celebrate against. They were fetched excluding some *other* session, so
  // they can understate the real history — and a mark to beat that is lower
  // than the truth manufactures records that never happened. A wrong record is
  // worse than no record, so offline the card shows the numbers and withholds
  // the badge until it has heard from the server.
  const marksTrusted = marksKnown && !previous?.stale
  const [editingId, setEditingId] = useState(null)
  const [editReps, setEditReps] = useState('')
  const [editWeight, setEditWeight] = useState('')
  const [editNote, setEditNote] = useState('')
  const [error, setError] = useState('')

  // Re-tagging reaches every set ever logged against this exercise, so it is
  // gated on saying how many — but only when there are any. A name added a
  // minute ago has nothing to move, and a dialog there would be ceremony for
  // its own sake.
  function requestRetag(group) {
    if (setCount > 0) {
      setPendingRetag({ group })
      return
    }
    applyRetag(group)
  }

  async function applyRetag(group) {
    const from = muscle ?? null
    setPendingRetag(null)
    // Only offer the way back if the change actually landed; the parent owns
    // the complaint when it didn't.
    if (await onChangeMuscle(name, group)) setLastRetag({ from })
  }

  async function undoRetag() {
    const { from } = lastRetag
    setLastRetag(null)
    // A failed undo leaves the new group in place, so the offer still stands.
    if (!(await onChangeMuscle(name, from))) setLastRetag({ from })
  }

  // An emptied field is how you take the note back, so "" travels as null — the
  // API stores no note either way, and the card has nothing to render.
  async function saveNote(event) {
    event.preventDefault()
    const next = noteDraft.trim()
    if (await onChangeNote(name, next || null)) setShowFixes(false)
  }

  async function handleLogSet(event) {
    event.preventDefault()
    const valid = validateSet(reps, weight)
    if (valid.error) {
      setError(valid.error)
      return
    }
    setError('')
    // Keep the weight and reps you just logged: straight sets are the common
    // case (3×25×15), so the next set should be one tap on the button, not a
    // re-entry into blank fields.
    try {
      await onLogSet(name, {
        reps: valid.reps,
        weight: valid.weight,
        // Neither is asked for while logging any more. A set can still carry a
        // note, written afterwards from the row itself; nothing writes an RPE.
        rpe: null,
        note: null,
      })
    } catch {
      setError('No se pudo registrar la serie.')
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
        rpe: null,
        note: null,
      })
    } catch {
      setError('No se pudo registrar la serie.')
    }
  }

  function startEdit(set) {
    setError('')
    setEditingId(set.id)
    setEditReps(String(set.reps))
    // Edited in the unit you're reading in, not the one it was logged in — the
    // row above the form says 135 lb, so the field has to say 135 too.
    setEditWeight(set.weight == null ? '' : String(showKg(set.weight)))
    setEditNote(set.note || '')
  }

  async function handleSaveEdit(set) {
    const valid = validateSet(editReps, editWeight)
    if (valid.error) {
      setError(valid.error)
      return
    }
    setError('')
    try {
      await onEditSet(set, {
        reps: valid.reps,
        weight: valid.weight,
        // Left as it was found. Nothing in the app writes an RPE any more, but
        // a set logged back when the field existed keeps the one it carries.
        rpe: set.rpe ?? null,
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

  // The mark to beat, said the way you'd think it: the heaviest set of the last
  // time you did this, and when that was. The estimated-1RM readout this
  // replaces was a number you never lift — you walk to the rack thinking "82.5
  // for 5", not "96.3 theoretical single".
  // Weighted sets first, because kilos are the mark. An exercise that never
  // carries any (dominadas, fondos) still has one — the most reps you did —
  // and without this it read "sin marcas anteriores" forever.
  const lastTop = previous?.found
    ? (previous.sets.reduce((best, s) => {
        if (s.weight == null || s.reps == null) return best
        if (best == null || s.weight > best.weight) return s
        return s.weight === best.weight && s.reps > best.reps ? s : best
      }, null) ??
      previous.sets.reduce((best, s) => {
        if (s.reps == null) return best
        return best == null || s.reps > best.reps ? s : best
      }, null))
    : null
  // The day trained, not `sets[0].created_at`. That one is when the row was
  // written: a session logged on another date dated three days of history as
  // today. `last_date` comes from the same Day the backend used to pick this
  // workout, so the label and the selection can no longer disagree.
  const lastWhen = previous?.last_date ? daysAgoLabel(previous.last_date) : null
  // What a folded card still has to answer: did I do this, and what did I hit.
  // It names one real working set — not decoupled reps/weight ranges, where you
  // couldn't tell which weight went with which reps. When every set matched,
  // that one set speaks for all ("4 series · 25 kg × 15"). When they varied,
  // show the hardest — the top set by est. 1RM, the same one the PR logic
  // tracks — labelled "tope" so a single pair isn't read as the whole exercise
  // ("4 series · tope 60 kg × 8"). Full per-set detail is one tap away, open.
  // No "hoy" in it: every card on this screen belongs to the session you are
  // looking at, so the word distinguished nothing here — and on a backfilled or
  // reopened day it named the wrong one. The open card's set-list header keeps
  // it, because there it separates today's sets from the previous marks above.
  const shownPair = (s) => `${s.weight == null ? 'Corporal' : showKg(s.weight)}×${s.reps}`
  const varied = sets.length ? !sets.every((s) => shownPair(s) === shownPair(sets[0])) : false
  // A weightless set ranks by reps alone (1RM of nothing is nothing), so a set
  // that does carry kilos always outranks it — which is right: it is the harder
  // one to have done.
  const topSet = sets.length
    ? sets.reduce((best, s) =>
        estimatedOneRm(s.weight ?? 0, s.reps) > estimatedOneRm(best.weight ?? 0, best.reps)
          ? s
          : best,
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
      <span className="d-key">
        {topSet.weight == null ? 'Corporal' : `${showKg(topSet.weight)} kg`}
      </span>
      {` × ${topSet.reps}`}
    </>
  ) : (
    'sin series'
  )
  // Which rows earn the badge: a real weight record, more kilos than you had
  // ever moved at that many reps or more. The estimated 1RM this replaces let a
  // heavy single outrank a hard set of eight on a formula nobody lifted.
  //
  // Seeded from `best_by_reps` — the heaviest ever at each rep count — and not
  // from `previous.sets`, which is the last session and only that. Against one
  // session the bar drops every time you have a light week, so the week after
  // it wore a badge on almost every row: records that were only ever "more than
  // last Tuesday". A badge that fires every session is a badge that says
  // nothing.
  const prIds = marksTrusted
    ? weightPrs(sets, { history: previous?.best_by_reps ?? [] })
    : new Set()

  // Reps alone make a set loggable: an empty weight field is the bodyweight
  // case, not an unfinished form.
  const ready = reps !== ''
  const logLabel = ready
    ? `Registrar ${weight === '' ? 'corporal' : weight} × ${reps}`
    : 'Registrar serie'

  return (
    <div className={`card ${open ? 'card-hero' : 'card-quiet is-folded'}`}>
      {/* The whole header is the fold control: a wide target for a thumb. */}
      {open && (
        <span className="card-eyebrow live">En curso</span>
      )}
      <h2 className="exercise-title">
        <button type="button" className="card-toggle" aria-expanded={open} onClick={onToggle}>
          {muscle && (
            <span className="muscle-tag">
              <span className="dot" aria-hidden="true" style={{ '--chip': muscleColor(muscle) }} />
              {muscle}
            </span>
          )}
          <span className="card-name">{name}</span>
          <span className="card-chevron" aria-hidden="true" />
        </button>
      </h2>

      {/* Folded, the card still has to answer "did I do this, and what did I
          hit" — the sets as chips, then one line naming the top one. Each chip
          is also the set it names: tapping one unfolds the card with that set
          already in the editor, so fixing a mistyped weight costs one tap from
          the folded list instead of unfold-find-tap. A pending set has no
          server id to edit through, so its chip stays inert — the same rule the
          open card's rows follow. */}
      {!open && (
        <>
          {sets.length > 0 && (
            <div className="set-chips" style={{ '--chip': muscleColor(muscle) }}>
              {sets.map((set, index) =>
                set.pending ? (
                  <span className="set-chip" key={set.id}>
                    {shownPair(set)}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="set-chip"
                    key={set.id}
                    aria-label={`Editar serie ${index + 1}`}
                    onClick={() => {
                      startEdit(set)
                      onOpen?.()
                    }}
                  >
                    {shownPair(set)}
                  </button>
                ),
              )}
            </div>
          )}
          <p className="hint card-digest">{digest}</p>
        </>
      )}

      {!open ? null : (
        <>
      {/* The standing note, read before the first rep — which is why it sits
          above the form rather than in it. It is the exercise's, not the
          session's, so it is here every time this card opens until you take it
          away. Nothing shows when there is none: an empty line under the name
          would be a field asking to be filled, and this one is worth nothing
          unless you actually had something to say. */}
      {note && <p className="exercise-note">{note}</p>}

      {/* Correcting the classifier's guess and writing that note are both things
          you do once in an exercise's life, so they share one fold on a card you
          open twenty times a session. Kept out of the header so the fold target
          stays full-width (DESIGN.md), but up top rather than under the set log —
          buried below a growing list of sets, it was practically unreachable by
          the time you'd actually want it. */}
      {onChangeMuscle && (
        <>
          <button
            type="button"
            className="unit-fix fixes-toggle"
            aria-expanded={showFixes}
            onClick={() =>
              setShowFixes((v) => {
                // Opening reseeds the draft from the exercise, so an edit you
                // walked away from doesn't sit there pretending to be saved.
                if (!v) setNoteDraft(note ?? '')
                return !v
              })
            }
          >
            Editar ejercicio
          </button>
          {showFixes && (
            <div className="card-fixes">
              <div className="muscle-edit">
                {/* No dot here: the header tag already carries the coloured
                    identity chip. This row is the control, not a second chip. */}
                <span className="muscle-edit-heading">Grupo muscular</span>
                <select
                  className="muscle-edit-select"
                  aria-label={`Grupo muscular de ${name}`}
                  value={muscle ?? ''}
                  onChange={(e) => requestRetag(e.target.value || null)}
                >
                  <option value="">{UNGROUPED}</option>
                  {MUSCLE_GROUPS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              {onChangeNote && (
                <form className="note-edit" onSubmit={saveNote}>
                  <label className="muscle-edit-heading" htmlFor={`exnote-${name}`}>
                    Nota
                  </label>
                  <input
                    id={`exnote-${name}`}
                    aria-label={`Nota de ${name}`}
                    maxLength={200}
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="agarre, altura del banco, molestias…"
                  />
                  {/* Explicit, not save-on-blur: on a phone the keyboard closing
                      is not the same gesture as deciding you meant it. */}
                  <button type="submit" className="secondary">
                    Guardar nota
                  </button>
                </form>
              )}
              {lastRetag && <RetagUndo group={muscle} onUndo={undoRetag} />}
            </div>
          )}
          {pendingRetag && (
            <RetagConfirm
              name={name}
              group={pendingRetag.group}
              setCount={setCount}
              onCancel={() => setPendingRetag(null)}
              onConfirm={() => applyRetag(pendingRetag.group)}
            />
          )}
        </>
      )}

      {/* The mark to beat, in the terms you'd think it in: what you last put on
          the bar, and how long ago. */}
      {lastTop ? (
        <div className="target">
          <div className="target-label">
            Última vez{lastWhen ? ` · ${lastWhen}` : ''}
          </div>
          <div className="target-line">
            {lastTop.weight == null ? (
              <>
                <span className="target-today">{lastTop.reps}</span>
                <span className="target-unit">reps · sin peso</span>
              </>
            ) : (
              <>
                <span className="target-today">{showKg(lastTop.weight)}</span>
                <span className="target-unit">kg × {lastTop.reps}</span>
              </>
            )}
          </div>
          {/* Says why no record can fire, once, quietly. Without it a set that
              plainly beat the number above looks like a bug. */}
          {previous?.stale && (
            <div className="target-stale">Marcas guardadas · sin conexión</div>
          )}
        </div>
      ) : (
        <p className="previous muted">Sin marcas anteriores. Marca la referencia.</p>
      )}

      <form onSubmit={handleLogSet}>
        <div className="row">
          <div className="field stepper-field">
            <label htmlFor={`weight-${name}`}>Peso · kg</label>
            <div className="stepper">
              <button
                type="button"
                className="stepper-btn"
                aria-label={`Restar kg`}
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
                aria-label={`Sumar kg`}
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
        {/* The button states exactly what it will log, so a repeat is one tap.
            It never disables itself waiting on the request: the set is already
            in the list below, and a second tap means a second set, which is
            what a straight-sets session is made of.

            Straight sets are the common case, so the repeat sits beside it, at
            a fixed place on the card. Under the list it sank a row per set
            logged — by the fifth, the quickest control on the screen was off
            the bottom of the phone. Grey, never a second amber button: there is
            one primary act here and this isn't it. */}
        <div className="log-actions">
          <button type="submit" className="btn-full btn-log">
            {logLabel}
          </button>
          {sets.length > 0 && (
            <button type="button" className="secondary repeat-set" onClick={handleRepeatLast}>
              <span className="rep-icon" aria-hidden="true">
                ↻
              </span>
              Repetir serie
            </button>
          )}
        </div>
      </form>

      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}

      {sets.length > 0 ? (
        <>
        {/* No header over the log. It said "Hoy · N series", then "Hoy", and
            each cut left it saying less until it was naming the obvious: these
            are the rows under the button you just pressed. What separates them
            from the "Última vez" marks is that those sit above the form and
            these below it — position already did the job the label claimed. */}
        <ol className="sets set-log">
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
                  {/* Borrar rides inside the editor: you are already looking at
                      the set you mean, and it saves the row a control. */}
                  <button
                    type="button"
                    className="secondary set-delete"
                    onClick={() => handleDelete(set.id)}
                  >
                    Borrar
                  </button>
                </form>
              ) : set.pending ? (
                /* On screen, not yet on the server. Editing routes through the
                   set's server id and it hasn't got one, so the row reads
                   exactly like a saved one minus the affordance. The dot is the
                   whole difference — a pending set is the normal case now, not
                   an error state, so it doesn't get amber or a banner. */
                <span className="set-row set-pending">
                  <span className="set-ix" aria-hidden="true">
                    S{index + 1}
                  </span>
                  <span className="set-val">
                    {formatSet(set)}
                  </span>
                  {prIds.has(set.id) && (
                    <span className="pr-flag" title="Más peso que nunca a estas reps">
                      PR peso
                    </span>
                  )}
                  <span className="pending-dot" role="img" aria-label="Sin guardar" />
                </span>
              ) : (
                <>
                  {/* The row is the control. Tapping a thing edits that thing —
                      an overflow holding only "Editar" and "Borrar" was a menu
                      standing between you and the row you already pointed at. */}
                  <button
                    type="button"
                    className="set-row"
                    aria-label={`Editar serie ${index + 1}`}
                    onClick={() => startEdit(set)}
                  >
                    <span className="set-ix" aria-hidden="true">
                      S{index + 1}
                    </span>
                    <span className="set-val">
                      {formatSet(set)}
                    </span>
                    {prIds.has(set.id) && (
                      <span className="pr-flag" title="Más peso que nunca a estas reps">
                        PR peso
                      </span>
                    )}
                  </button>
                  {set.note ? <span className="set-note">{set.note}</span> : null}
                </>
              )}
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

function CardioCard({
  name,
  previous,
  sets,
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
    // Cleared before the request, like the strength card: the row is already
    // in the list, so the form has nothing left to hold on to.
    setDuration('')
    setDistance('')
    setNote('')
    try {
      await onLogSet(name, {
        kind: 'cardio',
        duration_seconds: seconds,
        distance: dist,

        note: note.trim() || null,
      })
    } catch {
      setError('No se pudo registrar la serie.')
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
      ? `Registrar ${distance} km · ${formatDuration(seconds)}`
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
          <span className="muscle-tag">
            <span className="dot dot-cardio" aria-hidden="true" />
            Cardio
          </span>
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
            <label htmlFor={`dist-${name}`}>Distancia · km</label>
            <input
              id={`dist-${name}`}
              inputMode="decimal"
              placeholder="opcional"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
            />
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
        <button type="submit" className="btn-full btn-log">
          {logLabel}
        </button>
      </form>

      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}

      {sets.length > 0 ? (
        <>
          {/* Same as the strength card: no "Hoy" over the log. The Total line
              below is the header this section actually needed. */}
          <p className="set-summary">
            Total {formatDuration(totalSeconds)}
            {totalDistance ? ` · ${totalDistance} km` : ''}
          </p>
          <ol className="sets">
            {sets.map((set, index) => (
              <li key={set.id}>
                <span className={set.pending ? 'set-pending' : undefined}>
                  {formatCardioSet(set)}
                  {set.pending && (
                    <span className="pending-dot" role="img" aria-label="Sin guardar" />
                  )}
                </span>
                {/* Deleting routes through the server id a pending set hasn't
                    got yet, so the menu appears when the set lands. */}
                {!set.pending && (
                  <button
                    type="button"
                    className="secondary set-action set-menu-btn"
                    aria-label={`Más acciones · serie ${index + 1}`}
                    aria-expanded={openMenuId === set.id}
                    onClick={() => setOpenMenuId((id) => (id === set.id ? null : set.id))}
                  >
                    ⋯
                  </button>
                )}
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

// `initialWorkout` is the workout Días already had in hand — /days returns the
// same shape /workouts/{id} does, so waiting on a second round trip for it
// bought a blank screen and nothing else. Absent (a resume from storage, or a
// reload) the fetch below is the only source, exactly as before.
// The one-line recovery note: "Entrenado hoy: Pecho · ayer: Femoral, Cuádriceps".
// Bucketed by day rather than printed per group, or a line where everything
// landed yesterday would repeat the word for each muscle. Null when there is
// nothing to say, so the caller renders no element at all.
function recentNote(recent, today = new Date()) {
  const buckets = { hoy: [], ayer: [] }
  for (const row of recent ?? []) {
    const when = daysAgoLabel(row.last_date, today)
    if (when in buckets) buckets[when].push(row.group)
  }
  const parts = ['hoy', 'ayer']
    .filter((when) => buckets[when].length > 0)
    .map((when) => `${when}: ${buckets[when].join(', ')}`)
  return parts.length > 0 ? `Entrenado ${parts.join(' · ')}` : null
}

export default function Workout({ workoutId, onExit, initialWorkout = null, autoRename = false }) {
  const seed = initialWorkout?.id === workoutId ? initialWorkout : null
  const [workout, setWorkout] = useState(() => withQueued(seed))
  const [exerciseInput, setExerciseInput] = useState('')
  // [{ name, kind, previous? }], newest worked first. `previous` absent means
  // its marks are still in flight.
  const [exercises, setExercises] = useState(() => exercisesFromWorkout(seed))
  // Which cards the user has explicitly opened or shut this session. Absent
  // means "use the default": only the newest card starts open, so the screen
  // shows what you're doing rather than everything you've already done.
  const [toggled, setToggled] = useState({})
  const [known, setKnown] = useState([]) // known exercise names for autocomplete
  const [muscleByName, setMuscleByName] = useState({}) // name -> muscle group
  const [noteByName, setNoteByName] = useState({}) // name -> standing note
  const [idByName, setIdByName] = useState({}) // name -> exercise id, for re-tagging
  // name -> sets logged against it in the whole log. This card can only see the
  // session it is standing in, and a re-tag moves all of them.
  const [countByName, setCountByName] = useState({})
  // Muscle groups trained today or yesterday, most recent first — [] until the
  // answer lands, so nothing flashes on screen before it is known.
  const [recent, setRecent] = useState([])
  const recentLine = recentNote(recent)
  const [renaming, setRenaming] = useState(false)
  const [nameInput, setNameInput] = useState('')
  // The header overflow: rename and delete are both rare, and delete is
  // irreversible, so neither sits loose next to the title where a thumb lands.
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  // Kind for a brand-new exercise; ignored when the exercise already exists.
  const [newKind, setNewKind] = useState('strength')
  // Rest countdown. `restEndsAt` resumes from storage, so leaving Entreno
  // mid-rest and coming back picks the clock up where it actually is.
  const [restSeconds, setRestSecondsState] = useState(getRestSeconds)
  const [restEndsAt, setRestEndsAt] = useState(getRestUntil)
  // The two session aids: the screen staying lit while you are at the rack, and
  // a lock-screen notification with `+1 serie` on it for when the phone is in a
  // pocket. Both are once-a-session choices, so both live in the header
  // overflow (DESIGN.md: rare actions don't take content-weight controls).
  //
  // Deliberately independent of the rest above. They were one setting, which
  // meant choosing "Sin descanso" silently took the lock screen away too —
  // "I don't time my rests" and "I don't want to log from my pocket" are not
  // the same sentence. The rest now only decides whether that notification also
  // carries a countdown and a buzz.
  const [screenAwake, setScreenAwakeState] = useState(getScreenAwake)
  const [lockLogging, setLockLoggingState] = useState(getLockLogging)
  // What the worker said about the last handover. This is the one feature in
  // the app whose whole output happens where the app cannot see it — another
  // thread, then the platform's notification shade — so without this the only
  // way to know whether it works is to lock the phone and hope. `null` until
  // the first set: nothing has been asked of the worker yet.
  const [noticeState, setNoticeState] = useState(null)
  // Counter behind the local ids of sets the server hasn't acknowledged yet.
  const nextTmpId = useRef(0)
  // One drain at a time, or two triggers firing together send the same set twice.
  const flushing = useRef(false)

  // The rest is over. The lock-screen notification deliberately stays: it has
  // just turned into "Descanso terminado", and its `+1 serie` button is the
  // whole point — closing it here would take the button away at the exact
  // moment you are about to use it.
  function endRest() {
    setRestUntil(null)
    setRestEndsAt(null)
  }

  // Skipping is a decision, not the clock running out. The clock stops; the
  // notification stays, minus its countdown — it is the remote for the session,
  // and you have not left the session.
  function skipRest() {
    endRest()
    if (lastNotice.current) handOverSession(lastNotice.current, null)
    else stopRestNotice()
  }

  // The last set logged in this session, so the notification can be rebuilt
  // without one (skipping the rest, say). Null until the first set: `+1 serie`
  // has nothing to repeat before then, which is why the lock screen only shows
  // up once you have logged something from the card.
  const lastNotice = useRef(null)
  // Whether the notification still owes itself an arrival on a locked screen.
  // Spent by the first hide after each set — see the visibility handler.
  const announceOwed = useRef(false)

  // The countdown on screen. Independent of the notification below: the rest is
  // one thing you might want and logging from your pocket is another.
  function startRest() {
    if (restSeconds <= 0) return null
    const until = Date.now() + restSeconds * 1000
    setRestUntil(until)
    setRestEndsAt(until)
    return until
  }

  // Everything the tap will need while this page is frozen: which workout, the
  // set to repeat, the token to send it with — and how many sets are still
  // sitting in our own outbox, because those are older and set_index is
  // assigned in arrival order. `endsAt` null means there is no rest to show,
  // which is a full citizen here, not a degraded state.
  //
  // The two preferences are read from the store rather than from this render:
  // both are written synchronously when they change, and the toggles that
  // change them hand the session over again in the same breath — at which point
  // the React state is still a render behind, and would send the worker the
  // rest length you just turned off.
  function handOverSession(notice, endsAt) {
    lastNotice.current = notice
    // One arrival per set. See the visibility handler for why this is spent
    // rather than repeated.
    announceOwed.current = true
    if (!getLockLogging() || notificationState() !== 'granted') return
    startRestNotice({
      endsAt,
      seconds: getRestSeconds(),
      workoutId: workout.id,
      token: getToken(),
      pending: readQueue().length,
      ...notice,
    }).then((result) => setNoticeState({ at: Date.now(), ...result }))
  }

  // One muted line under the toggle, saying whether the thing is actually
  // alive. Four different failures used to look identical from here — the
  // worker never woke, the worker threw, Android dropped the notification, or
  // nothing had been handed over yet — and telling them apart meant guessing.
  function noticeSummary() {
    if (!lockLogging) return null
    if (!noticeState) return 'Se activa al registrar una serie.'
    if (!noticeState.ok) return `No se pudo enviar: ${noticeState.error}`
    // The worker did everything right and the platform kept nothing. That is
    // Android's own doing — almost always the per-site channel in Ajustes.
    if (noticeState.shown === 0) {
      return `Enviado a las ${formatTime(noticeState.at)}, pero Android no lo muestra.`
    }
    return `Activo · última a las ${formatTime(noticeState.at)}`
  }

  function chooseRestSeconds(seconds) {
    setRestSeconds(seconds)
    setRestSecondsState(seconds)
    // Turning rest off should stop the clock you're looking at, not just the
    // next one — and it must not take the lock screen with it.
    if (seconds <= 0) {
      endRest()
      if (lastNotice.current) handOverSession(lastNotice.current, null)
    }
  }

  function chooseScreenAwake(on) {
    setScreenAwake(on)
    setScreenAwakeState(on)
  }

  // The permission is asked for here and nowhere else: from a tap on the thing
  // that needs it, so the prompt has a question attached. A no leaves the
  // preference off — the browser only offers to ask once.
  async function chooseLockLogging(on) {
    if (!on) {
      setLockLogging(false)
      setLockLoggingState(false)
      stopRestNotice()
      return
    }
    const granted = notificationState() === 'granted' || (await askForNotifications())
    setLockLogging(granted)
    setLockLoggingState(granted)
    // Switched on mid-session: put it up now, against the last set logged,
    // rather than making you log another one to see whether it worked.
    if (granted && lastNotice.current) handOverSession(lastNotice.current, restEndsAt)
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

  useEffect(() => {
    // No signal: the last copy of this workout we saw is a session you can keep
    // logging into. Only a cold cache is a real dead end.
    getWorkout(workoutId)
      .then((w) => {
        cacheWorkout(w)
        return w
      })
      .catch((err) => {
        const cached = cachedWorkout(workoutId)
        if (cached) return cached
        throw err
      })
      .then(async (w) => {
        // The queued sets are folded back in before anything reads the workout,
        // so a card whose only sets are still unsent doesn't vanish on reload.
        const full = withQueued(w)
        setWorkout(full)
        const logged = exercisesFromWorkout(full)
        const loggedNames = new Set(logged.map((e) => e.name))

        // A repeated session arrives as a list of names. The ones you haven't
        // touched queue up *under* what you've logged: worked lifts still rise
        // to the top, and the rest read as what's left to do — in the order the
        // original session did them, so a fresh repeat opens on its first lift.
        const queued = (getRepeatTemplate(workoutId) ?? []).filter((n) => !loggedNames.has(n))
        setExercises([...logged, ...queued.map((name) => ({ name, kind: 'strength' }))])

        // Every card needs its marks, rebuilt ones included. Only the add path
        // used to fetch them, so reopening a workout lost the target on every
        // card and left the badge comparing each set against the session's own
        // running peak — flagging set 2 as a record for beating set 1. The
        // current workout is excluded server-side, or the answer is your own
        // sets from ten minutes ago.
        const names = [...logged.map((e) => e.name), ...queued]
        if (names.length === 0) return
        const marks = await Promise.all(names.map((n) => marksFor(n, workoutId)))
        const byName = new Map(names.map((n, i) => [n, marks[i]]))
        setExercises((list) =>
          list.map((ex) => {
            if (!byName.has(ex.name)) return ex
            // A failed lookup still resolves the question: null means "asked,
            // nothing there", which is what lets the card show a record again.
            const previous = byName.get(ex.name) ?? { found: false, sets: [] }
            return { ...ex, previous, kind: previous.kind ?? ex.kind }
          }),
        )
      })
      .catch(() => setError('No se pudo cargar el entreno.'))
      // Only once the session on screen exists. Absorbing first would race the
      // load: a set sent from here would be wiped by a response that was
      // already in flight before it went out.
      .finally(() => absorbLockScreen())
  }, [workoutId])

  // The three moments a phone in a basement gets its signal back: the app
  // starting, the browser noticing the network, and you bringing the app
  // forward. No polling timer — a countdown that wakes the radio every few
  // seconds is a battery cost paid by every session to help the rare one.
  //
  // Coming forward is also the moment to take back whatever was logged from the
  // lock screen while this page was frozen.
  useEffect(() => {
    const drain = () => absorbLockScreen()
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        absorbLockScreen()
        return
      }
      // Going away is the other half. The phone being hidden *is* the phone
      // being pocketed, and Android draws on a locked screen what arrives while
      // locked — a notification already in the shade is not redrawn. So this is
      // the moment to make it arrive again, and it beats any timer guessing at
      // how long somebody takes to put a phone away.
      //
      // Once per set, though, and no more. Hidden also means "switched to
      // WhatsApp", and re-arriving has to make a sound to count as an arrival —
      // so announcing on every hide turned a between-sets aid into a banner
      // that interrupted whatever else the phone was doing. One set logged buys
      // one arrival; the next one has to be earned by lifting something.
      if (announceOwed.current && lastNotice.current && getLockLogging()) {
        announceOwed.current = false
        announceRestNotice()
      }
    }
    // The app was awake when the notification was tapped (from the shade rather
    // than the lock screen): take the set, and the rest clock with it, or the
    // bar on screen and the notification disagree about the same countdown.
    const stopListening = onLockScreenSets(({ endsAt } = {}) => {
      if (endsAt != null) {
        setRestUntil(endsAt)
        setRestEndsAt(endsAt)
      }
      absorbLockScreen()
    })
    window.addEventListener('online', drain)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopListening()
      window.removeEventListener('online', drain)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutId])

  // The screen doesn't go dark between sets. Re-run on the preference, so
  // turning it off in the overflow lets go of the lock there and then.
  useEffect(() => {
    if (!screenAwake) return undefined
    return holdScreenAwake()
  }, [screenAwake])

  // Walking out of the session takes its notification with it: a `+1 serie`
  // button for a workout you have left would log into the wrong one.
  useEffect(() => () => stopRestNotice(), [workoutId])

  useEffect(() => {
    // Autocomplete is best-effort; a failure here shouldn't break logging.
    listExercises()
      .then((list) => {
        setKnown(list.map((e) => e.name))
        setMuscleByName(Object.fromEntries(list.map((e) => [e.name, e.muscle_group])))
        setNoteByName(Object.fromEntries(list.map((e) => [e.name, e.note ?? null])))
        setIdByName(Object.fromEntries(list.map((e) => [e.name, e.id])))
        setCountByName(Object.fromEntries(list.map((e) => [e.name, e.set_count ?? 0])))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    // Excluding this session, or it reports the sets you are logging right now
    // as a reason not to log them. Best-effort like the autocomplete above: a
    // failure costs one line of context, never the ability to train.
    recentlyTrained(workoutId)
      .then(setRecent)
      .catch(() => {})
  }, [workoutId])

  async function handleAddExercise(event) {
    event.preventDefault()
    // The go key takes the name you typed if it is one you have, then the first
    // thing you found — so a half-typed `gemelo` stands up `Gemelo Máq.` rather
    // than a second exercise called `gemelo`.
    await addExercise(knownExact ?? matches[0] ?? exerciseInput)
  }

  async function addExercise(rawName) {
    const name = rawName.trim()
    if (!name) return
    setError('')
    setAdding(true)
    // No longer able to fail: with no signal the marks come from the cache, and
    // failing that the card stands up with no history. Refusing to add the
    // exercise at all would have made a dead network stop the session.
    const previous = (await marksFor(name, workoutId)) ?? { found: false, sets: [] }
    // A known exercise keeps its stored kind; a new one takes the toggle's choice.
    const kind = previous.kind ?? newKind
    // To the top: you just added it, so it's what you're about to do.
    setExercises((list) =>
      list.some((e) => e.name === name) ? list : [{ name, previous, kind }, ...list],
    )
    setExerciseInput('')
    setAdding(false)
  }

  async function logSetFor(name, fields) {
    // fields carry either strength (reps/weight/…) or cardio (duration/…) metrics.
    //
    // On disk, then on screen, then — whenever it can — on the server. The gym
    // is a basement and the free tier sleeps, so a set you have already done
    // must not depend on a request succeeding right now. The set gets a string
    // id: nothing can mistake `tmp-3` for a server id and PATCH against it.
    // Spec: Workout.test.jsx "optimistic logging" / "logging with no signal".
    //
    // The moment rides with the set. The server stamps on arrival, and arrival
    // is when the phone next finds a network — which in a basement is an hour
    // after the lift, and is the number a session's length is measured from.
    const template = { exercise_name: name, ...fields }
    const payload = { ...template, performed_at: new Date().toISOString() }
    const tmpId = `tmp-${(nextTmpId.current += 1)}`
    enqueueSet({ tmpId, workoutId: workout.id, payload })
    setWorkout(withQueued)
    // Started on the tap, not on the round trip: resting is what you do *while*
    // the request is open, and offline there may not be a round trip for hours.
    //
    // The lock screen gets the same set to repeat that the card's `+1 serie`
    // would. Cardio is the one exclusion: an interval you just ran is not an
    // interval you are about to run.
    const endsAt = startRest()
    // The template, not the stamped payload: the worker repeats this set later,
    // and a repeat done at 19:40 is not a set performed at 19:20. It stamps its
    // own copy when the tap happens.
    const notice =
      fields.kind === 'cardio' ? null : { series: setsFor(name).length + 1, payload: template }
    if (notice) handOverSession(notice, endsAt)
    await flushQueue()
    // Again, now that the outbox has had its chance to drain: the worker holds
    // off sending anything of its own while sets older than it are still queued
    // here, and that count is only true once this is over.
    if (notice) handOverSession(notice, endsAt)
  }

  // Sets logged from the lock screen, taken back the moment this page is alive
  // again. The unsent ones join the outbox — which is the only thing allowed to
  // drain, so the session keeps one order — and anything the worker already
  // sent means the workout on screen is out of date.
  async function absorbLockScreen() {
    const { queued, sent } = await claimLockScreenSets()
    queued.forEach((entry) => enqueueSet(entry))
    if (queued.length > 0) {
      setWorkout(withQueued)
      // Normally the card is already standing — the worker only ever repeats a
      // set you logged from it. But a set on disk with no card is a set you
      // cannot see, so anything without one gets one, at the top, where the
      // work you just did belongs.
      setExercises((list) => {
        const standing = new Set(list.map((e) => e.name))
        const missing = [
          ...new Set(
            queued.map((e) => e.payload.exercise_name).filter((name) => !standing.has(name)),
          ),
        ]
        return missing.length === 0
          ? list
          : [...missing.map((name) => ({ name, kind: 'strength' })), ...list]
      })
    }
    await flushQueue()
    if (sent > 0) {
      // Best-effort: with no signal the rows are already on screen from the
      // queue, and the next visit will pick up the rest.
      await getWorkout(workoutId)
        .then((w) => {
          cacheWorkout(w)
          setWorkout(withQueued(w))
        })
        .catch(() => {})
    }
  }

  // Drain the outbox oldest-first. Nothing here throws at the card: a set that
  // couldn't be sent is not an error the lifter can act on, it is a set waiting
  // for signal, and the row already says so.
  async function flushQueue() {
    if (flushing.current) return
    flushing.current = true
    try {
      // Re-read the head every pass rather than iterating a snapshot: sets
      // logged *while* this drain is awaiting the network get picked up by it,
      // instead of sitting in the queue until the next trigger fires. Every
      // branch below either drops an entry or breaks, so this terminates.
      for (;;) {
        const [entry] = readQueue()
        if (!entry) break
        try {
          const updated = await logSet(entry.workoutId, entry.payload)
          dropQueued(entry.tmpId)
          cacheWorkout(updated)
          // Only this screen's workout gets redrawn; the queue can hold sets
          // from a session you have already walked out of.
          if (entry.workoutId === workoutId) setWorkout(withQueued(updated))
        } catch (err) {
          // Stop at the first thing worth retrying — set_index is assigned
          // server-side on arrival, so everything behind it keeps its place in
          // the queue or the session comes back reordered.
          if (retryable(err)) break
          // Judged and refused. Retrying a 422 forever would block every set
          // behind it, so it comes off the queue and off the screen, out loud:
          // this is the one case where a set really is gone.
          dropQueued(entry.tmpId)
          setWorkout(withQueued)
          setError('El servidor rechazó una serie. Vuelve a registrarla.')
        }
      }
    } finally {
      flushing.current = false
    }
  }

  async function editSetFor(set, { reps, weight, rpe, note }) {
    // Kilos, whatever the set was originally logged as: editing a set that came
    // in as pounds restates it in the only unit the app now speaks.
    const updated = await editSet(set.id, {
      exercise_name: set.exercise_name,
      reps,
      weight,
      rpe,
      note,
    })
    setWorkout((w) => ({
      ...w,
      sets: w.sets.map((s) => (s.id === updated.id ? updated : s)),
    }))
  }

  // Override the muscle group (empty clears it back to the classifier's guess).
  // Update the name→group map so the header dot recolours without a reload.
  // Answers whether it landed: the card only offers to undo a change that
  // actually happened, and only the parent knows the request failed.
  async function changeMuscleFor(name, group) {
    const id = idByName[name] ?? setsFor(name)[0]?.exercise_id
    if (id == null) return false
    setError('')
    try {
      const updated = await setExerciseMuscle(id, group || null)
      setMuscleByName((m) => ({ ...m, [name]: updated.muscle_group }))
      return true
    } catch {
      setError('No se pudo cambiar el grupo muscular.')
      return false
    }
  }

  async function changeNoteFor(name, note) {
    const id = idByName[name] ?? setsFor(name)[0]?.exercise_id
    if (id == null) return false
    setError('')
    try {
      const updated = await setExerciseNote(id, note)
      setNoteByName((n) => ({ ...n, [name]: updated.note ?? null }))
      return true
    } catch {
      setError('No se pudo guardar la nota.')
      return false
    }
  }

  // Many cards may be open at once: folding one shut when you open another
  // would fight supersets, where you're genuinely working two lifts together.
  const isOpen = (name, index) => toggled[name] ?? index === 0
  const toggleCard = (name, index) =>
    setToggled((t) => ({ ...t, [name]: !(t[name] ?? index === 0) }))
  // One-way: a set chip opens the card it lives on, and a chip on an open card
  // doesn't exist, so this can never be the thing that folds one shut.
  const openCard = (name) => setToggled((t) => ({ ...t, [name]: true }))

  async function deleteSetFor(setId) {
    await deleteSet(setId)
    setWorkout((w) => ({ ...w, sets: w.sets.filter((s) => s.id !== setId) }))
  }

  function closeMenu() {
    setMenuOpen(false)
    setConfirmingDelete(false)
  }

  function startRename() {
    setError('')
    setNameInput(workout.name || '')
    setRenaming(true)
    closeMenu()
  }

  // A workout just created with no name opens straight into naming it: the
  // whole reason "Empezar entreno" asks for nothing up front is that it's one
  // tap, but that shouldn't cost a second tap right after to say what it was.
  useEffect(() => {
    if (autoRename) startRename()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // How long this session took, from its own sets. Empty while it is still
  // running, so the header simply doesn't carry it yet.
  const took = sessionLength(workout)

  // A name nothing knows yet — the only case where the Fuerza/Cardio choice
  // has anything to decide.
  const typedName = exerciseInput.trim()
  const knownExact = known.find((n) => fold(n) === fold(typedName))
  const isNewExercise = typedName !== '' && knownExact === undefined
  // What you typed, matched by substring. The native <datalist> this replaces
  // was a suggestion the browser showed when it felt like it, and never on a
  // phone — so the field looked like it knew nothing you had ever lifted.
  // A lift already standing in this session is left out: its card is on screen,
  // and adding it again does nothing.
  const standing = new Set(exercises.map((e) => fold(e.name)))
  const matches = typedName
    ? known.filter((n) => fold(n).includes(fold(typedName)) && !standing.has(fold(n))).slice(0, 8)
    : []

  if (!workout) {
    // The way out matters more now that the app can reopen straight into a
    // workout: if that one is gone, an alert with no button is a dead end.
    return error ? (
      <>
        <p role="alert" className="alert">
          {error}
        </p>
        <button type="button" className="secondary head-back" onClick={onExit}>
          ← Días
        </button>
      </>
    ) : (
      <p className="hint">Cargando…</p>
    )
  }

  return (
    <section>
      {/* One toolbar, one row: back on the left, the workout (name + date) as the
          anchor, and the rare/destructive actions folded into an overflow on the
          right — instead of four buttons and a title staggered across the top. */}
      <div className="workout-head">
        <button type="button" className="secondary head-back" onClick={onExit}>
          ← Días
        </button>
        {renaming ? (
          <form className="workout-rename" onSubmit={handleRename}>
            <input
              aria-label="Nombre del entreno"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Nombre del entreno"
              autoFocus
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
          <>
            {/* The title is the rename control: tapping the name edits the
                name. Nothing else claims this surface, unlike an exercise
                card header, which belongs to the fold. */}
            <button
              type="button"
              className="workout-title"
              aria-label={`Renombrar el entreno ${workout.name || 'Entreno'}`}
              onClick={startRename}
            >
              <strong>{workout.name || 'Entreno'}</strong>
              {/* The length rides with the date, not on a line of its own: both
                  answer "which session is this", and the header is already two
                  rows tall. Empty string while the session is still running —
                  see sessionLength. */}
              <span className="workout-date">
                {formatDate(workout.date)}
                {took && ` · ${took}`}
              </span>
            </button>
            <div className="head-menu">
              <button
                type="button"
                className="secondary set-action head-menu-btn"
                aria-haspopup="true"
                aria-expanded={menuOpen}
                aria-label="Acciones del entreno"
                onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
              >
                ⋯
              </button>
              {menuOpen && (
                <div className="head-menu-pop">
                  {/* Rest is a once-a-session choice and was pinned above every
                      exercise card, ahead of the thing you came here to do. The
                      kg/lb toggle that used to sit beside it is gone: a sticky
                      unit you can flip mid-session corrupts the log. */}
                  <div className="menu-pref">
                    <span className="prefs-label">Descanso</span>
                    <div
                      className="unit-toggle"
                      role="group"
                      aria-label="Descanso entre series"
                    >
                      {REST_OPTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className="unit-option"
                          aria-pressed={restSeconds === s}
                          onClick={() => chooseRestSeconds(s)}
                        >
                          {s === 0 ? 'Sin' : `${s}s`}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* The screen not going dark is the cheap half of not making
                      the trip to the pocket; the lock-screen notice is the
                      other half, for when the phone goes in it anyway. */}
                  <div className="menu-pref">
                    <span className="prefs-label">Pantalla activa</span>
                    <div
                      className="unit-toggle"
                      role="group"
                      aria-label="Mantener la pantalla encendida"
                    >
                      {[
                        [true, 'Sí'],
                        [false, 'No'],
                      ].map(([on, label]) => (
                        <button
                          key={label}
                          type="button"
                          className="unit-option"
                          aria-pressed={screenAwake === on}
                          onClick={() => chooseScreenAwake(on)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Its own setting, not the rest's: "I don't time my rests"
                      and "I don't want to log from my pocket" are different
                      sentences. Hidden outright where the browser can't do it —
                      a control with nothing to decide isn't shown (DESIGN.md). */}
                  {notificationState() !== 'unsupported' && (
                    <div className="menu-pref">
                      <span className="prefs-label">Registrar sin abrir</span>
                      {notificationState() === 'denied' ? (
                        <p className="menu-note">Bloqueado en el navegador.</p>
                      ) : (
                        <>
                          <div
                            className="unit-toggle"
                            role="group"
                            aria-label="Registrar series desde la pantalla bloqueada"
                          >
                            {[
                              [true, 'Sí'],
                              [false, 'No'],
                            ].map(([on, label]) => (
                              <button
                                key={label}
                                type="button"
                                className="unit-option"
                                aria-pressed={lockLogging === on}
                                onClick={() => chooseLockLogging(on)}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          {noticeSummary() && (
                            <p className="menu-note" role="status">
                              {noticeSummary()}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {/* Two taps to delete: the first only arms it. Destructive gets
                      the true-red treatment DESIGN.md reserves for it. */}
                  {confirmingDelete ? (
                    <button
                      type="button"
                      className="secondary set-action head-menu-item head-menu-danger"
                      onClick={handleDeleteWorkout}
                    >
                      Sí, borrar entreno
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="secondary set-action head-menu-item head-menu-danger"
                      onClick={() => setConfirmingDelete(true)}
                    >
                      Borrar entreno
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {restEndsAt != null && (
        <RestBar endsAt={restEndsAt} total={restSeconds} onSkip={skipRest} />
      )}

      {/* What is still recovering, above the form so it lands before you choose
          what to add. Muted and uncoloured on purpose: it informs, it does not
          rule — the same stance the in-progress week takes. Absent entirely
          when there is nothing to say, since most sessions have nothing. */}
      {recentLine && <p className="recent-note">{recentLine}</p>}

      {/* The mechanism, not the log — dashed and unfilled so it reads as an
          empty slot rather than as one more exercise in the stack below it. */}
      <form className="card card-compose" onSubmit={handleAddExercise}>
        <div className="field">
          <label htmlFor="exercise">Ejercicio</label>
          <input
            id="exercise"
            value={exerciseInput}
            onChange={(e) => setExerciseInput(e.target.value)}
            placeholder="Buscar o escribir…"
          />
        </div>
        {matches.length > 0 && (
          <ul className="search-results">
            {matches.map((name) => (
              <li key={name}>
                <button type="button" className="set-row" onClick={() => addExercise(name)}>
                  <span
                    className="dot"
                    aria-hidden="true"
                    style={{ '--chip': muscleColor(muscleByName[name]) }}
                  />
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* Kind only decides anything for a name the backend has never seen —
            an autocompleted exercise keeps its stored kind. Shown always, it
            was a question asked on every add and answered by one in twenty. */}
        {isNewExercise && (
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
        )}
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
            note={noteByName[ex.name] ?? null}
            setCount={countByName[ex.name] ?? 0}
            previous={ex.previous}
            sets={setsFor(ex.name)}
            onLogSet={logSetFor}
            onEditSet={editSetFor}
            onDeleteSet={deleteSetFor}
            onChangeMuscle={changeMuscleFor}
            onChangeNote={changeNoteFor}
            open={isOpen(ex.name, index)}
            onToggle={() => toggleCard(ex.name, index)}
            onOpen={() => openCard(ex.name)}
          />
        ),
      )}
    </section>
  )
}
