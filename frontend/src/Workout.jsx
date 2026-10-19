import { useEffect, useRef, useState } from 'react'

import {
  deleteSet,
  deleteWorkout,
  editSet,
  getPreviousMarks,
  getWorkout,
  listDays,
  listExercises,
  logSet,
  nextExercises,
  recentlyTrained,
  removeExerciseFromWorkout,
  renameWorkout,
} from './api.js'
import { autoWorkoutName } from './daysHistory.js'
import { foodMomentIso } from './food.js'
import { focusEditorTrigger } from './EditTrouble.jsx'
import { DeleteConfirm } from './DeleteExercise.jsx'
import { ExerciseEditor } from './ExerciseEditor.jsx'
import {
  daysAgoLabel,
  estimatedOneRm,
  fold,
  formatCardioSet,
  formatClock,
  formatDate,
  formatDuration,
  formatSet,
  liveElapsed,
  parseDuration,
  sessionLength,
} from './format.js'
import { muscleColor, muscleFill } from './muscles.js'
import {
  beatenAt,
  doneSummary,
  lastRir,
  nextTarget,
  rirToRpe,
  rpeToRir,
  topSet as heaviestSet,
} from './progression.js'
import {
  answerIsFor,
  answersFor,
  cacheMarks,
  cacheWorkout,
  cachedMarks,
  cachedWorkout,
  checkInNativeQueue,
  dropAnswer,
  dropQueued,
  dropQueuedFor,
  enqueueSet,
  flushNatively,
  forgetWorkout,
  onNativeSend,
  queueAnswer,
  queuedFor,
  readQueue,
  renameQueued,
  retryable,
  sendsNatively,
} from './offline.js'
import { useWaitFlag, WorkoutSkeleton } from './Skeleton.jsx'
import { weightPrs } from './stats.js'
import {
  dropFromRepeatTemplate,
  forgetAddedExercise,
  getAddedExercises,
  getRepeatTemplate,
  rememberAddedExercise,
  renameAddedExercise,
  getRestSeconds,
  getRestUntil,
  getScreenAwake,
  setRestUntil,
} from './prefs.js'
import { showKg } from './units.js'
import { nativeSession, session } from './platform/session.js'
import { Chip, Sheet } from './ui'
import { holdScreenAwake } from './platform/wakelock.js'

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
//
// Lo mismo con las respuestas a «¿Cuántas te quedaban?» sin enviar: su RPE va
// encima de la serie, para que el chip siga marcado al reabrir sin señal.
function withQueued(workout) {
  if (!workout) return workout
  const answers = answersFor(workout.id)
  const answered = (s) => {
    const answer = answers.find((a) => answerIsFor(a, s))
    return answer ? { ...s, rpe: answer.rpe } : s
  }
  return {
    ...workout,
    sets: [
      ...workout.sets.filter((s) => !s.pending),
      ...queuedFor(workout.id).map((e) => ({ id: e.tmpId, pending: true, ...e.payload })),
    ].map(answered),
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

// Cardio: el − y el + de la duración mueven un minuto; los segundos que
// tecleaste se quedan. Nunca por debajo de cero.
const KM_STEP = 0.5
function bumpDuration(current, deltaSeconds) {
  const base = parseDuration(current) ?? 0
  return formatDuration(Math.max(0, base + deltaSeconds))
}

function ExerciseCard({
  name,
  muscle,
  // The standing note on the exercise — how you do this lift, every session.
  // Null when there isn't one; the card then shows no line at all.
  note = null,
  previous,
  sets,
  onLogSet,
  onEditSet,
  // Guarda la respuesta a «¿Cuántas te quedaban?». No falla: sin señal se
  // queda en su cola y sale cuando vuelva.
  onAnswerRir,
  onDeleteSet,
  // Los ejercicios a los que se pueden mudar las series de esta tarjeta, y la
  // mudanza. Ver `switchExerciseFor`.
  candidates,
  onSwitchExercise,
  // Quita el ejercicio de este entreno: sus series de hoy y la tarjeta. El
  // ejercicio y su historial se quedan; borrarlos es cosa de Progreso.
  onRemoveFromWorkout,
  open = true,
  onToggle,
  // Unfolds the card without the toggle's "or fold it again": a chip has to
  // open the card it stands on, never close it.
  onOpen,
  // El reloj del descanso, cuando es esta tarjeta la que descansa. Lo monta el
  // padre, que es quien tiene la hora de fin; aquí sólo se le da sitio.
  rest = null,
}) {
  const [reps, setReps] = useState('')
  // Empty for a bodyweight seed too: the field says "no weight" by being empty,
  // which is exactly what you want to log again.
  const [weight, setWeight] = useState('')
  // ¿Has tocado peso o reps a mano? Mientras no, los campos los rellena la
  // pantalla (ver la siembra más abajo); en cuanto sí, son tuyos.
  const touched = useRef(false)
  const editReps_ = (v) => {
    touched.current = true
    setReps(v)
  }
  const editWeight_ = (v) => {
    touched.current = true
    setWeight(v)
  }
  // ¿Está abierta la hoja del editor? Renombrar, reetiquetar y escribir la nota
  // son cosas que se hacen una vez en la vida de un ejercicio, así que comparten
  // una hoja que se pone encima de la tarjeta que abres veinte veces por sesión.
  const [editorOpen, setEditorOpen] = useState(false)
  // Lo escrito en el campo del nombre, que en Entreno es un buscador: elegir
  // un resultado muda las series de hoy (`onSwitchExercise`). Renombrar, el
  // grupo y la nota son del ejercicio entero, y eso se cambia en Progreso.
  const [nameDraft, setNameDraft] = useState(name)
  // El daño ya contado del borrado, que es también la señal de que el diálogo
  // está abierto: se cuenta antes de abrirlo (`clashTrouble` hace lo mismo con
  // el choque), porque una cifra que aparece bajo un botón irreversible medio
  // segundo después de que lo mires es peor que medio segundo de espera.
  const [confirmRemove, setConfirmRemove] = useState(false)
  // ── ¿Cuántas te quedaban? ─────────────────────────────────────────────────
  // Se pregunta sólo después de registrar aquí, nunca al abrir una sesión
  // vieja, y siempre por la última serie: es la que dice cómo acabaste y la
  // que lee el objetivo de la próxima vez. No contestar no rompe nada.
  const [askRir, setAskRir] = useState(false)
  // La respuesta entra en su propia cola en cuanto se da (offline.js), atada al
  // `client_id` de la serie si todavía no ha llegado al servidor. Sólo espera
  // aquí una serie en cola sin `client_id` —abierta por http plano, sin
  // `randomUUID`—, y ésa sí se pierde si la app se cierra antes de enviarla.
  const [rirAnswer, setRirAnswer] = useState(null)
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
  const [noteOpen, setNoteOpen] = useState(false)
  const [error, setError] = useState('')

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
        // Neither is asked for while logging. The RIR is asked right after,
        // below the form, and lands on the set as RPE; the note is written
        // afterwards from the row itself.
        rpe: null,
        note: null,
      })
      setAskRir(true)
      setRirAnswer(null)
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
      setAskRir(true)
      setRirAnswer(null)
    } catch {
      setError('No se pudo registrar la serie.')
    }
  }

  // Edited in the unit you're reading in, not the one it was logged in — the
  // row says 135 lb, so the field has to say 135 too.
  const weightField = (set) => (set.weight == null ? '' : String(showKg(set.weight)))

  // Opening a set closes the one that was open, and closing saves: moving on to
  // the next correction is not a reason to lose this one.
  function startEdit(set) {
    const open = editingId != null && editingId !== set.id && sets.find((s) => s.id === editingId)
    if (open && changedEdit(open)) {
      const valid = validateSet(editReps, editWeight)
      if (valid.error) {
        setError(valid.error)
        return
      }
      saveEdit(open, valid).catch(() => setError('No se pudo actualizar la serie.'))
    }
    setError('')
    setEditingId(set.id)
    setEditReps(String(set.reps))
    setEditWeight(weightField(set))
    setEditNote(set.note || '')
    setNoteOpen(Boolean(set.note))
  }

  function changedEdit(set) {
    return (
      editReps.trim() !== String(set.reps) ||
      editWeight.trim() !== weightField(set) ||
      editNote.trim() !== (set.note || '')
    )
  }

  function saveEdit(set, valid) {
    return onEditSet(set, {
      reps: valid.reps,
      weight: valid.weight,
      // Left as it was found: correcting reps doesn't change how many were
      // left, and only the RIR question writes it.
      rpe: set.rpe ?? null,
      note: editNote.trim() || null,
    })
  }

  // No «Guardar»: closing the row is the save. Closing one nobody touched sends
  // nothing, so opening a set to look at it costs no request.
  async function closeEdit(set) {
    if (!changedEdit(set)) {
      setError('')
      setEditingId(null)
      return
    }
    const valid = validateSet(editReps, editWeight)
    if (valid.error) {
      setError(valid.error)
      return
    }
    setError('')
    try {
      await saveEdit(set, valid)
      setEditingId(null)
    } catch {
      setError('No se pudo actualizar la serie.')
    }
  }

  async function handleDelete(setId) {
    setError('')
    try {
      await onDeleteSet(setId)
      setEditingId(null)
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
  // El paso siguiente a esa marca. La regla y su porqué viven en progression.js.
  const target = lastTop ? nextTarget(lastTop, lastRir(previous.sets)) : null
  const targetFigure = target
    ? target.weight == null
      ? `${target.reps} reps`
      : `${showKg(target.weight)} kg × ${target.reps}`
    : null
  // La serie de hoy que ya lo batió, si alguna. Ver `beatenAt`.
  const beatenIn = beatenAt(target, sets)
  // ¿Terminado? Hoy ya llevas tantas series como la última vez. Entonces lo
  // principal deja de ser registrar otra: la pantalla lo resume y el pie
  // empuja a lo siguiente. Otra serie sigue a un toque.
  const done = doneSummary(previous, sets)
  const best = done ? heaviestSet(sets) : null
  const lastFigure = sets.length
    ? sets[sets.length - 1].weight == null
      ? `${sets[sets.length - 1].reps} reps`
      : `${showKg(sets[sets.length - 1].weight)} kg × ${sets[sets.length - 1].reps}`
    : null
  // Cómo se llega al objetivo desde la última vez, dicho en la regla
  // (progression.js): una rep más, o más peso.
  const targetWhy = !target
    ? null
    : target.reason === 'rep'
      ? 'una rep más'
      : target.reason === 'top'
        ? `+${showKg(target.weight - lastTop.weight)} kg, vuelta a ${target.reps}`
        : `+${showKg(target.weight - lastTop.weight)} kg`

  // ── La siembra ───────────────────────────────────────────────────────────
  // Los mínimos toques: si haces lo previsto, registrar es un toque. Lo
  // previsto es repetir la última serie de hoy si ya hay alguna y, si no, el
  // objetivo. Las marcas llegan después de montar la tarjeta, así que esto se
  // vuelve a mirar cuando llegan — antes sólo miraba el primer render, y al
  // reabrir un entreno los campos salían vacíos. Lo que tecleaste no se pisa.
  const lastToday = sets[sets.length - 1]
  const seedSet = lastToday ?? (target ? { reps: target.reps, weight: target.weight } : null)
  const seedReps = seedSet?.reps ?? null
  const seedWeight = seedSet ? (seedSet.weight ?? null) : undefined
  useEffect(() => {
    if (touched.current || seedReps == null) return
    setReps(String(seedReps))
    setWeight(seedWeight == null ? '' : String(showKg(seedWeight)))
  }, [seedReps, seedWeight])

  const latestSet = sets[sets.length - 1]
  const latestIndex = sets.length - 1
  const shownRir =
    rirAnswer?.index === latestIndex ? rirAnswer.rir : rpeToRir(latestSet?.rpe)

  // Entrega la respuesta en cuanto hay con qué atarla a la serie. Una sola vez
  // por respuesta: `sent` evita reenviarla con cada render que traiga la fila.
  useEffect(() => {
    if (!rirAnswer || rirAnswer.sent) return
    const set = sets[rirAnswer.index]
    if (!set || (set.pending && !set.client_id)) return
    setRirAnswer({ ...rirAnswer, sent: true })
    onAnswerRir(set, rirToRpe(rirAnswer.rir))
  }, [rirAnswer, sets, onAnswerRir])
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
      {rest}
      {/* The standing note, read before the first rep — which is why it sits
          above the form rather than in it. It is the exercise's, not the
          session's, so it is here every time this card opens until you take it
          away. Nothing shows when there is none: an empty line under the name
          would be a field asking to be filled, and this one is worth nothing
          unless you actually had something to say. */}
      {note && <p className="exercise-note">{note}</p>}

      {/* La única puerta al editor del ejercicio, la misma que hay en Progreso:
          mismo texto, mismo trato y el mismo destino. Antes esto abría un
          pliegue aquí dentro que empujaba la página 257 px hacia abajo — el
          registro que estabas usando se iba de la pantalla para hacer sitio a un
          renombrado que haces dos veces al año. Ahora abre una hoja fija, y la
          columna de contenido no se mueve.

          Fuera de la cabecera, para que el objetivo del pliegue siga siendo de
          ancho completo (DESIGN.md), y arriba en vez de bajo el registro:
          enterrado bajo una lista de series que crece, era inalcanzable justo
          cuando lo querías. */}
      {onSwitchExercise && (
        <>
          <button
            type="button"
            className="unit-fix exercise-edit"
            // El `›` es un `::after`, y un pseudoelemento no se puede marcar
            // `aria-hidden`: sin esto el lector de pantalla dice "Editar
            // ejercicio, mayor que". La casa ya resuelve esto igual en la
            // navegación de periodo de Progreso — etiqueta explícita, y el
            // glifo se queda donde debe estar, en el dibujo.
            //
            // Lleva el nombre dentro por dos razones. Una pantalla de supersets
            // tiene varias tarjetas abiertas y "Editar ejercicio" repetido no
            // dice cuál. Y empieza por la etiqueta visible entera, que es lo que
            // exige el control por voz: quien dice "pulsa Editar ejercicio"
            // tiene que acertar, y una etiqueta que no contenga lo que se lee en
            // pantalla lo deja sin ese botón.
            aria-label={`Editar ejercicio ${name}`}
            aria-haspopup="dialog"
            aria-expanded={editorOpen}
            onClick={() => {
              // El segundo toque cierra. Antes no hacía nada: el botón seguía
              // ahí, enfocable y en `aria-expanded="true"`, y el pulgar que
              // volvía a él no conseguía plegar lo que el propio botón decía
              // tener desplegado. Un control que se anuncia abierto y se niega
              // a cerrarse es una mentira que se encuentra sola.
              if (editorOpen) {
                setEditorOpen(false)
                return
              }
              // Abrir resiembra los borradores desde el ejercicio. Ya no puede
              // salir otra cosa —no queda nada sin guardar cuando el editor se
              // cierra—, y por eso mismo se queda: es la comprobación de que lo
              // que ves al abrir es lo que hay guardado.
              // En Entreno la hoja es un buscador: se abre vacía y escribiendo.
              setNameDraft('')
              setEditorOpen(true)
            }}
          >
            Editar ejercicio
          </button>
          <ExerciseEditor
            name={name}
            open={editorOpen}
            onClose={() => setEditorOpen(false)}
            nameDraft={nameDraft}
            onNameDraftChange={setNameDraft}
            candidates={candidates}
            onPick={(target) => onSwitchExercise(name, target)}
            title={
              sets.length === 0
                ? 'Cambiar por…'
                : sets.length === 1
                  ? 'La serie de hoy es de…'
                  : `Las ${sets.length} series de hoy son de…`
            }
            // Quitarlo de *este* entreno, arriba junto al aspa. El borrado del
            // ejercicio entero, con todo su historial, vive en Progreso: es la
            // pantalla a la que vas a propósito (DESIGN.md), y aquí, a un
            // pulgar de las series, un toque de más costaba meses de registro.
            // Sin series de hoy no hay nada que perder: sale y ya está. Con
            // series, se dice cuántas antes.
            headAction={
              onRemoveFromWorkout && (
                <button
                  type="button"
                  className="editor-quit delete-exercise"
                  onClick={async () => {
                    setEditorOpen(false)
                    if (sets.length === 0) {
                      await onRemoveFromWorkout(name)
                      return
                    }
                    setConfirmRemove(true)
                  }}
                >
                  Quitar
                </button>
              )
            }
          />
          {confirmRemove && (
            <DeleteConfirm
              name={name}
              title={`Quitar ${name} de este entreno`}
              body={`${
                sets.length === 1
                  ? 'Se borra su serie de hoy.'
                  : `Se borran sus ${sets.length} series de hoy.`
              } El historial de otros días no se toca.`}
              confirm="Quitar"
              onCancel={() => setConfirmRemove(false)}
              onConfirm={async () => {
                setConfirmRemove(false)
                await onRemoveFromWorkout(name)
              }}
            />
          )}
        </>
      )}

      {/* The mark to beat, in the terms you'd think it in: what you last put on
          the bar, and how long ago. */}
      {/* ── Lo que esta marca todavía no puede pedir ────────────────────────
          `Última vez · 40 kg × 8` es el número al que apuntas, y con el cajón
          abierto queda tapado al **70,9 % en todo el barrido** y al 100 % al
          final de él, sin ninguna posición de scroll que lo enseñe. Y no es
          una queja de acabado: el formulario de registro sigue vivo con el
          editor delante —lo protege `data-editor-protect` a propósito—, así
          que se puede registrar una serie sin ver el número al que apunta.

          Marcarla `data-editor-protect` es lo primero que se prueba y no
          vale: mide 54 px justo debajo del hueco, así que el panel pasa a
          tener que caber entre el aire de arriba y su techo, y ahí entra en
          bucle con el rótulo `Editando · …` — la posición que tapa el nombre
          añade una fila, la fila de más no cabe, no caber suelta el tope, y
          soltar el tope destapa el nombre. React lo corta con «Maximum update
          depth exceeded» y la pantalla se queda en blanco, medido. La marca
          se queda sin proteger hasta que la colocación deje de depender de su
          propia altura. */}
      {done ? (
        // ── Terminado ────────────────────────────────────────────────────────
        // El resumen del ejercicio en vez de la serie que toca: si batiste el
        // objetivo, tu mejor serie de hoy y cuántas llevas contra la última
        // vez. «Otra serie» repite la última, en gris: lo principal es el pie.
        <>
          <div className={`target done-block${rest ? ' is-resting' : ''}`}>
            {beatenIn && (
              <div className="target-next is-beaten">{`✓ Objetivo batido en la S${beatenIn}`}</div>
            )}
            <div className="done-figure">
              {best.weight == null ? (
                <>
                  <span className="done-num">{best.reps}</span>
                  <span className="done-unit"> reps</span>
                </>
              ) : (
                <>
                  <span className="done-num">{showKg(best.weight)}</span>
                  <span className="done-unit">{` kg × ${best.reps}`}</span>
                </>
              )}
            </div>
            <div className="done-sub">{done}</div>
          </div>
          <button type="button" className="secondary btn-full otra-serie" onClick={handleRepeatLast}>
            {`Otra serie · ${lastFigure}`}
          </button>
        </>
      ) : (
        <>
        {lastTop ? (
          // ── La serie que toca ────────────────────────────────────────────────
          // Qué serie es y qué tiene que batir, junto a los controles a los que
          // se refiere. «Objetivo» a secas, solo en una esquina, no decía de
          // qué; aquí lo dice la serie que lo lleva y la marca de la que sale.
          // Sin cifra de tamaño Display: en esta pantalla la tiene el descanso.
          <div className="target serie-block" style={{ '--chip-fill': muscleFill(muscle) }}>
            <div className="serie-head">
              <span className="serie-n">{`${sets.length + 1}.ª serie`}</span>
              <span className="target-label">
                Última vez{lastWhen ? ` · ${lastWhen}` : ''}
                {': '}
                <span className="target-line">
                  {lastTop.weight == null ? (
                    <>
                      <span className="target-today">{lastTop.reps}</span>
                      <span className="target-unit"> reps · sin peso</span>
                    </>
                  ) : (
                    <>
                      <span className="target-today">{showKg(lastTop.weight)}</span>
                      <span className="target-unit"> kg × {lastTop.reps}</span>
                    </>
                  )}
                </span>
              </span>
            </div>
            {target && (
              <div className="serie-goal">
                <span className={`target-next${beatenIn ? ' is-beaten' : ''}`}>
                  {beatenIn
                    ? `✓ Batido en la S${beatenIn} · ${targetFigure}`
                    : `A batir · ${targetFigure}`}
                </span>
                {!beatenIn && targetWhy && <span className="target-why">{`· ${targetWhy}`}</span>}
              </div>
            )}
            {previous?.stale && (
              <div className="target-stale">Marcas guardadas · sin conexión</div>
            )}
          </div>
        ) : (
          <p className="previous muted">Sin marcas anteriores. Marca la referencia.</p>
        )}

        {/* El aparato de la serie, marcado como intocable para el editor. Es la
            regla de DESIGN.md hecha atributo: «cuando una acción rara y una
            acción por serie se pelean por el mismo sitio, gana la de la serie,
            siempre». Sin esto el panel se posaba encima —sin partir nada, así
            que ninguna regla saltaba— y dejaba los seis controles de peso y reps
            más `Registrar serie` y `Repetir serie` tapados e `inert` mientras
            cambiabas una etiqueta. */}
        {/* Fichas grandes de peso y reps; mientras descansas, el anillo es lo
            grande y las fichas se compactan. */}
        <form
          className={`log-form log-form-tiles${rest ? ' is-resting' : ''}`}
          data-editor-protect
          onSubmit={handleLogSet}
        >
          <div className="row">
            <div className="field stepper-field">
              <label htmlFor={`weight-${name}`}>Peso · kg</label>
              <div className="stepper">
                <button
                  type="button"
                  className="stepper-btn"
                  aria-label={`Restar kg`}
                  onClick={() => editWeight_(bump(weight, -WEIGHT_STEP, 0))}
                >
                  −
                </button>
                <input
                  id={`weight-${name}`}
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => editWeight_(e.target.value)}
                />
                <button
                  type="button"
                  className="stepper-btn stepper-plus"
                  aria-label={`Sumar kg`}
                  onClick={() => editWeight_(bump(weight, WEIGHT_STEP, 0))}
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
                  onClick={() => editReps_(bump(reps, -1, 1))}
                >
                  −
                </button>
                <input
                  id={`reps-${name}`}
                  inputMode="numeric"
                  value={reps}
                  onChange={(e) => editReps_(e.target.value)}
                />
                <button
                  type="button"
                  className="stepper-btn stepper-plus"
                  aria-label="Sumar rep"
                  onClick={() => editReps_(bump(reps, 1, 1))}
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
            <button type="submit" className="primary btn-full btn-log">
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
        </>
      )}

      {askRir && latestSet?.reps != null && (
        <div className="rir-ask" role="group" aria-label="¿Cuántas te quedaban?">
          <span className="rir-label">¿Cuántas te quedaban?</span>
          {[0, 1, 2, 3].map((rir) => (
            <button
              key={rir}
              type="button"
              className={`chip rir-chip${shownRir === rir ? ' is-active' : ''}`}
              aria-pressed={shownRir === rir}
              aria-label={String(rir)}
              onClick={() => {
                if (shownRir !== rir) setRirAnswer({ index: latestIndex, rir })
              }}
            >
              {rir === 3 ? '3+' : rir}
            </button>
          ))}
        </div>
      )}

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
        <ol className="sets set-log" data-editor-protect>
          {sets.map((set, index) => (
            <li key={set.id}>
              {editingId === set.id ? (
                /* The row opens in place. kg before reps, like the tiles above
                   and the «60 kg x 8» it stands for; − and + because a
                   correction is almost always one rep or one plate, and the
                   keyboard is still there for a big jump. The row itself shows
                   the value as it changes and is what closes — and saves — it. */
                <div className="set-edit">
                  <button
                    type="button"
                    className="set-row"
                    aria-expanded="true"
                    aria-label={`Cerrar serie ${index + 1}`}
                    onClick={() => closeEdit(set)}
                  >
                    <span className="set-ix" aria-hidden="true">
                      S{index + 1}
                    </span>
                    <span className="set-val">
                      {formatSet({
                        weight: editWeight.trim() === '' ? null : editWeight,
                        reps: editReps,
                      })}
                    </span>
                    <span className="set-edit-chev" aria-hidden="true">
                      ˄
                    </span>
                  </button>
                  <form
                    className="set-edit-steppers"
                    onSubmit={(e) => {
                      e.preventDefault()
                      closeEdit(set)
                    }}
                  >
                    <div className="stepper">
                      <button
                        type="button"
                        className="stepper-btn"
                        aria-label={`Restar kg a la serie ${index + 1}`}
                        onClick={() => setEditWeight(bump(editWeight, -WEIGHT_STEP, 0))}
                      >
                        −
                      </button>
                      <input
                        aria-label="Editar peso"
                        inputMode="decimal"
                        value={editWeight}
                        onChange={(e) => setEditWeight(e.target.value)}
                      />
                      <button
                        type="button"
                        className="stepper-btn stepper-plus"
                        aria-label={`Sumar kg a la serie ${index + 1}`}
                        onClick={() => setEditWeight(bump(editWeight, WEIGHT_STEP, 0))}
                      >
                        +
                      </button>
                    </div>
                    <div className="stepper">
                      <button
                        type="button"
                        className="stepper-btn"
                        aria-label={`Restar rep a la serie ${index + 1}`}
                        onClick={() => setEditReps(bump(editReps, -1, 1))}
                      >
                        −
                      </button>
                      <input
                        aria-label="Editar reps"
                        inputMode="numeric"
                        value={editReps}
                        onChange={(e) => setEditReps(e.target.value)}
                      />
                      <button
                        type="button"
                        className="stepper-btn stepper-plus"
                        aria-label={`Sumar rep a la serie ${index + 1}`}
                        onClick={() => setEditReps(bump(editReps, 1, 1))}
                      >
                        +
                      </button>
                    </div>
                    {noteOpen && (
                      <input
                        aria-label="Editar nota"
                        className="set-edit-note"
                        placeholder="nota"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                      />
                    )}
                  </form>
                  <div className="set-edit-actions">
                    {!noteOpen && (
                      <button
                        type="button"
                        className="set-edit-link"
                        onClick={() => setNoteOpen(true)}
                      >
                        + Nota
                      </button>
                    )}
                    {/* Borrar rides inside the editor: you are already looking
                        at the set you mean, and it saves the row a control. */}
                    <button
                      type="button"
                      className="set-edit-link set-delete"
                      onClick={() => handleDelete(set.id)}
                    >
                      Borrar serie
                    </button>
                  </div>
                </div>
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
  const [duration, setDuration] = useState('')
  const [distance, setDistance] = useState('')
  // La misma siembra que la fuerza: lo previsto es repetir la última de hoy
  // o, si no hay, la primera de la última vez. Lo que tocas no se pisa.
  const touched = useRef(false)
  const editDuration = (v) => {
    touched.current = true
    setDuration(v)
  }
  const editDistance = (v) => {
    touched.current = true
    setDistance(v)
  }
  const lastTime = previous?.found ? previous.sets?.[0] : null
  const seedSet = sets[sets.length - 1] ?? lastTime
  const seedSeconds = seedSet?.duration_seconds ?? null
  const seedDistance = seedSet?.distance ?? null
  useEffect(() => {
    if (touched.current || seedSeconds == null) return
    setDuration(formatDuration(seedSeconds))
    setDistance(seedDistance == null ? '' : String(seedDistance))
  }, [seedSeconds, seedDistance])
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
    // Duración y distancia se quedan: otra igual es otro toque. La nota sí se
    // vacía, es de esa serie.
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
      {lastTime ? (
        // La serie que toca, como en la fuerza. Sin «A batir»: en cardio no
        // hay una progresión que proponer, sólo la referencia.
        <div className="target serie-block">
          <div className="serie-head">
            <span className="serie-n">{`${sets.length + 1}.ª serie`}</span>
            <span className="target-label">
              Última vez{': '}
              {/* Sin el ritmo, que partía la línea en dos: ya va en cada fila. */}
              <span className="target-line">
                {formatDuration(lastTime.duration_seconds)}
                {lastTime.distance ? ` · ${lastTime.distance} km` : ''}
              </span>
            </span>
          </div>
        </div>
      ) : (
        <p className="previous muted">Sin marcas anteriores. Marca la referencia.</p>
      )}

      <form className="log-form log-form-tiles" onSubmit={handleLog}>
        <div className="row">
          <div className="field stepper-field">
            <label htmlFor={`dur-${name}`}>Duración</label>
            <div className="stepper">
              <button
                type="button"
                className="stepper-btn"
                aria-label="Restar minuto"
                onClick={() => editDuration(bumpDuration(duration, -60))}
              >
                −
              </button>
              <input
                id={`dur-${name}`}
                inputMode="numeric"
                placeholder="mm:ss"
                value={duration}
                onChange={(e) => editDuration(e.target.value)}
              />
              <button
                type="button"
                className="stepper-btn stepper-plus"
                aria-label="Sumar minuto"
                onClick={() => editDuration(bumpDuration(duration, 60))}
              >
                +
              </button>
            </div>
          </div>
          <div className="field stepper-field">
            <label htmlFor={`dist-${name}`}>Distancia · km</label>
            <div className="stepper">
              <button
                type="button"
                className="stepper-btn"
                aria-label="Restar km"
                onClick={() => editDistance(bump(distance, -KM_STEP, 0))}
              >
                −
              </button>
              <input
                id={`dist-${name}`}
                inputMode="decimal"
                placeholder="—"
                value={distance}
                onChange={(e) => editDistance(e.target.value)}
              />
              <button
                type="button"
                className="stepper-btn stepper-plus"
                aria-label="Sumar km"
                onClick={() => editDistance(bump(distance, KM_STEP, 0))}
              >
                +
              </button>
            </div>
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
        <button type="submit" className="primary btn-full btn-log">
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
// `pausedMs`: the rest was paused from the widget (APK only) with that much
// left. The clock stands still in --muted until `Reanudar`; the widget is the
// only place that pauses, so here it can only be resumed or skipped.
// El reloj de la cabecera: cada segundo mientras la sesión sigue abierta.
function Cronometro({ workout, fallback }) {
  const [now, setNow] = useState(() => Date.now())
  const live = liveElapsed(workout, now)
  useEffect(() => {
    if (!live) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [live === ''])
  return live ? (
    <span className="workout-date workout-clock" aria-label={`En curso, ${live}`}>
      {live}
    </span>
  ) : (
    <span className="workout-date">{fallback}</span>
  )
}

function RestBar({ endsAt, total, pausedMs = null, onSkip, onResume }) {
  const [now, setNow] = useState(() => Date.now())
  const paused = pausedMs != null

  useEffect(() => {
    if (paused) return undefined
    // Sub-second so the readout never visibly sticks on a number.
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [endsAt, paused])

  // Paused, rounded up like the widget's: 0.4 s left still reads 00:01.
  const remaining = paused ? Math.ceil(pausedMs / 1000) : Math.max(0, (endsAt - now) / 1000)
  const left = total > 0 ? Math.min(100, (remaining / total) * 100) : 0
  const label = paused ? 'En pausa' : 'Descanso'

  return (
    <div className="rest-bar" role="timer" aria-label={`${label} ${formatClock(remaining)}`}>
      <span className="rest-label">{label}</span>
      <span className={paused ? 'rest-num rest-num-paused' : 'rest-num'}>
        {formatClock(remaining)}
      </span>
      {paused && (
        <button type="button" className="secondary" onClick={onResume}>
          Reanudar
        </button>
      )}
      <button type="button" className="secondary" onClick={onSkip}>
        Saltar
      </button>
      <div className="rest-track" aria-hidden="true">
        <span style={{ width: `${left}%` }} />
      </div>
    </div>
  )
}

// ── El descanso en el centro ─────────────────────────────────────────────
// Mientras descansas no hay otra cosa que mirar, así que el reloj va dentro
// de la tarjeta en la que acabas de registrar, grande y bajo el nombre: un
// anillo que se vacía. Cuenta contra una hora de fin, igual que la barra, y
// ±15 s mueven esa hora — un toque por ajuste. En pausa (desde el widget del
// APK) sólo se puede reanudar o saltar, como en la barra.
const RING_R = 88
const RING_C = 2 * Math.PI * RING_R

function RestRing({ endsAt, total, pausedMs = null, onSkip, onResume, onAdjust }) {
  const [now, setNow] = useState(() => Date.now())
  const paused = pausedMs != null

  useEffect(() => {
    if (paused) return undefined
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [endsAt, paused])

  const remaining = paused ? Math.ceil(pausedMs / 1000) : Math.max(0, (endsAt - now) / 1000)
  const left = total > 0 ? Math.min(1, remaining / total) : 0
  const label = paused ? 'En pausa' : 'Descanso'

  return (
    <div className="rest-ring" role="timer" aria-label={`${label} ${formatClock(remaining)}`}>
      <div className="rest-ring-dial">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle className="rest-ring-track" cx="100" cy="100" r={RING_R} />
          <circle
            className="rest-ring-left"
            cx="100"
            cy="100"
            r={RING_R}
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - left)}
            transform="rotate(-90 100 100)"
          />
        </svg>
        <div className="rest-ring-face">
          <span className="rest-label">{label}</span>
          <span className={paused ? 'rest-num rest-num-paused' : 'rest-num'}>
            {formatClock(remaining)}
          </span>
          <span className="rest-total">{`de ${formatClock(total)}`}</span>
        </div>
      </div>
      <div className="rest-ring-actions">
        {paused ? (
          <button type="button" className="secondary" onClick={onResume}>
            Reanudar
          </button>
        ) : (
          <button
            type="button"
            className="secondary"
            aria-label="Quitar 15 segundos"
            onClick={() => onAdjust(-15)}
          >
            −15 s
          </button>
        )}
        <button type="button" className="secondary" onClick={onSkip}>
          Saltar
        </button>
        {!paused && (
          <button
            type="button"
            className="secondary"
            aria-label="Añadir 15 segundos"
            onClick={() => onAdjust(15)}
          >
            +15 s
          </button>
        )}
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

export default function Workout({
  workoutId,
  onExit,
  initialWorkout = null,
}) {
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
  // ── Un ejercicio a la vez ────────────────────────────────────────────────
  // El que ocupa la pantalla. Null hasta que eliges uno: entonces manda el
  // primero de la lista, que es el último trabajado o, en una sesión de
  // «Repetir» recién abierta, el primero de la plantilla. `previous` es aquel
  // del que vienes, para que volver (un superset) cueste un toque.
  const [activeName, setActiveName] = useState(null)
  // El buscador del pie, enfocado: es cuando enseña lo demás de hoy.
  const [searching, setSearching] = useState(false)
  const [known, setKnown] = useState([]) // known exercise names for autocomplete
  // Los mismos, enteros: el buscador del editor necesita el grupo para el punto
  // y el tipo para no ofrecer cardio a una tarjeta de fuerza.
  const [catalog, setCatalog] = useState([])
  const [muscleByName, setMuscleByName] = useState({}) // name -> muscle group
  const [noteByName, setNoteByName] = useState({}) // name -> standing note
  const [idByName, setIdByName] = useState({}) // name -> exercise id, for re-tagging
  // name -> sets logged against it in the whole log. This card can only see the
  // session it is standing in, and a re-tag moves all of them.
  // ── La identidad de una tarjeta no es su nombre ──────────────────────────
  // El nombre es un dato del ejercicio, no su identidad, y la lista de abajo lo
  // usaba de llave (`key={ex.name}`). Renombrar le cambiaba la llave a React,
  // que desmonta la tarjeta y monta otra en su sitio — y una tarjeta recién
  // montada siembra sus steppers desde `previous`, o sea desde la sesión
  // anterior. Medido: con `42,5 × 9` a medio escribir, corregir una errata en
  // el nombre los dejaba en `37,5 × 10`. Arreglar una letra te borraba la serie
  // que estabas contando, que es el peor cambio que puede hacer esta pantalla.
  //
  // El id del servidor sí es la identidad de verdad, pero **no sirve de llave**
  // aquí: llega en una petición aparte (`/exercises`), así que la llave saltaría
  // de `nombre` a `id` a media carga y produciría exactamente el desmontaje que
  // venimos a quitar, con la tarjeta ya en pantalla. Y un ejercicio en cola
  // desde una plantilla de «Repetir» puede no tener id todavía, ni tenerlo
  // nunca si nunca llegas a registrarle una serie.
  //
  // Así que la llave se acuña aquí la primera vez que se ve un nombre, y el
  // renombrado la mueve igual que mueve todos los demás mapas de esta pantalla
  // —que ya se movían—: la llave es una entrada más de la mudanza. Va en un
  // `ref` y no en estado porque no la lee nadie salvo React, y cambiarla no
  // tiene que repintar nada.
  const cardKeys = useRef({ next: 0, byName: new Map() })
  const keyFor = (name) => {
    const store = cardKeys.current
    if (!store.byName.has(name)) {
      store.next += 1
      store.byName.set(name, `card-${store.next}`)
    }
    return store.byName.get(name)
  }
  const moveCardKey = (from, to) => {
    const { byName } = cardKeys.current
    if (!byName.has(from) || from === to) return
    byName.set(to, byName.get(from))
    byName.delete(from)
  }
  // Muscle groups trained today or yesterday, most recent first — [] until the
  // answer lands, so nothing flashes on screen before it is known.
  const [recent, setRecent] = useState([])
  const recentLine = recentNote(recent)
  const [renaming, setRenaming] = useState(false)
  const [nameInput, setNameInput] = useState('')
  // Los nombres que ya usaste otros días, para ponerlo con un toque.
  const [pastNames, setPastNames] = useState([])
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
  const [restSeconds] = useState(getRestSeconds)
  const [restEndsAt, setRestEndsAt] = useState(getRestUntil)
  // Paused from the widget: what was left, in ms. Only the native control
  // brings it; `restEndsAt` is null meanwhile.
  const [restPausedMs, setRestPausedMs] = useState(null)
  // Lo que dura este descanso, que ±15 s cambian: es la vuelta entera del
  // anillo y el «de 01:30» bajo la cifra.
  const [restTotal, setRestTotal] = useState(restSeconds)
  // El último control publicado al nativo, para volver a publicarlo con otra
  // hora de fin cuando ajustas: la notificación cuenta con el mismo reloj.
  const lastControl = useRef(null)
  // The screen staying lit while you are at the rack. Chosen in Perfil with the
  // rest of what gets set once; read here.
  const [screenAwake] = useState(getScreenAwake)
  // Counter behind the local ids of sets the server hasn't acknowledged yet.
  // It starts again on every mount, and the queue does not: a set left unsent
  // from the last time the app was open is already `tmp-1`. So the id carries
  // the moment this screen mounted too — two sets sharing an id means sending
  // one drops both, and the second never reaches the server.
  const nextTmpId = useRef(0)
  const tmpPrefix = useRef(`tmp-${Date.now().toString(36)}`)
  // One drain at a time, or two triggers firing together send the same set twice.
  const flushing = useRef(false)
  // Lo mismo para las respuestas a «¿Cuántas te quedaban?», que se envían con
  // lo que la serie dice en ese momento: de ahí que haga falta el entreno al día
  // desde listeners que se registraron en el primer render.
  const answering = useRef(false)
  const workoutRef = useRef(workout)
  workoutRef.current = workout
  // The notification permission is asked for once per visit to Entreno; Android
  // itself stops asking after the second no.
  const askedNotifications = useRef(false)

  function endRest() {
    setRestUntil(null)
    setRestEndsAt(null)
    setRestPausedMs(null)
  }

  // Skipping is a decision, not the clock running out. In the APK the
  // notification drops its clock too: two clocks disagreeing is worse than none.
  function skipRest() {
    endRest()
    if (nativeSession()) session.skipRest().catch(() => {})
  }

  // The rest the notification or a widget started (docs/widgets-entreno.md,
  // fase 2): a +1 from the lock screen starts the bar here too, and a control
  // with no clock takes it away. Only for this workout.
  function followNativeRest(control) {
    if (!control || control.workoutId !== workoutId) return
    lastControl.current = control
    if (control.restSeconds > 0) setRestTotal(control.restSeconds)
    if (control.restPausedMs > 0) {
      // Paused from the widget. Nothing to resume from storage on a reload:
      // the native control says it again when Entreno opens.
      setRestUntil(null)
      setRestEndsAt(null)
      setRestPausedMs(control.restPausedMs)
    } else if (control.restEndsAt > Date.now()) {
      setRestUntil(control.restEndsAt)
      setRestEndsAt(control.restEndsAt)
      setRestPausedMs(null)
    } else if (!control.restEndsAt) {
      endRest()
    }
  }

  // `Reanudar`: what was left, from now. The widget and the notification count
  // again because the native side does the same sum.
  function resumeRest() {
    if (restPausedMs == null) return
    const until = Date.now() + restPausedMs
    setRestUntil(until)
    setRestEndsAt(until)
    setRestPausedMs(null)
    session.resumeRest().catch(() => {})
  }

  // The countdown on screen.
  function startRest() {
    if (restSeconds <= 0) return null
    const until = Date.now() + restSeconds * 1000
    setRestUntil(until)
    setRestEndsAt(until)
    setRestPausedMs(null)
    setRestTotal(restSeconds)
    return until
  }

  // ±15 s: mueve la hora de fin. Quitar más de lo que queda es saltarlo. En el
  // APK la notificación recibe la hora nueva: dos relojes que no coinciden es
  // peor que ninguno.
  function adjustRest(deltaSeconds) {
    if (restEndsAt == null) return
    const until = restEndsAt + deltaSeconds * 1000
    if (until <= Date.now()) {
      skipRest()
      return
    }
    setRestUntil(until)
    setRestEndsAt(until)
    setRestTotal((t) => Math.max(1, t + deltaSeconds))
    if (nativeSession() && lastControl.current) {
      lastControl.current = { ...lastControl.current, restEndsAt: until }
      session.publish(lastControl.current).catch(() => {})
    }
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
        // Gone, not unreachable: deleted from Días, from another device, or
        // opened from a widget that still thought it was live. The cache is for
        // no signal, never for contradicting the server — standing the copy up
        // here is what showed a workout that could no longer be deleted.
        if (err?.status === 404) {
          forgetWorkout(workoutId)
          onExit()
          return null
        }
        const cached = cachedWorkout(workoutId)
        if (cached) return cached
        throw err
      })
      .then(async (w) => {
        if (!w) return
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
        // Exercises added here and left before their first set go on top, as
        // they were when you added them: it's what you were about to do.
        const added = getAddedExercises(workoutId).filter((e) => !loggedNames.has(e.name))
        const addedNames = new Set(added.map((e) => e.name))
        const queued = (getRepeatTemplate(workoutId) ?? []).filter(
          (n) => !loggedNames.has(n) && !addedNames.has(n),
        )
        setExercises([
          ...added.map(({ name, kind }) => ({ name, kind: kind ?? 'strength' })),
          ...logged,
          ...queued.map((name) => ({ name, kind: 'strength' })),
        ])

        // Every card needs its marks, rebuilt ones included. Only the add path
        // used to fetch them, so reopening a workout lost the target on every
        // card and left the badge comparing each set against the session's own
        // running peak — flagging set 2 as a record for beating set 1. The
        // current workout is excluded server-side, or the answer is your own
        // sets from ten minutes ago.
        const names = [...added.map((e) => e.name), ...logged.map((e) => e.name), ...queued]
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
      // Only once the session on screen exists. Draining first would race the
      // load: a set sent from here would be wiped by a response that was
      // already in flight before it went out.
      .finally(() => flushQueue())
  }, [workoutId])

  // The two moments a phone in a basement gets its signal back: the browser
  // noticing the network, and you bringing the app forward. No polling timer —
  // a countdown that wakes the radio every few seconds is a battery cost paid
  // by every session to help the rare one.
  useEffect(() => {
    const drain = () => {
      flushQueue()
      flushAnswers()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') drain()
    }
    window.addEventListener('online', drain)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', drain)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutId])

  // En el APK la cola la envía el nativo, con la app abierta o cerrada
  // (docs/widgets-entreno.md, fase 1), y cuenta aquí lo que ha pasado. La copia
  // de la cola ya viene al día (offline.js), así que redibujar con `withQueued`
  // quita de «pendiente» lo que el servidor ya tiene. En la web esto no hace
  // nada: la página envía y se entera en `flushQueue`.
  useEffect(() => {
    if (!sendsNatively()) return undefined
    const refused = () => setError('El servidor rechazó una serie. Vuelve a registrarla.')
    // Lo que el servidor rechazó con la app cerrada, cuando no había a quién decírselo.
    checkInNativeQueue((control) => {
      // Opening Entreno on a rest paused from the widget (or started there
      // with the app shut): the bar says what the widget says. Only a clock
      // that exists — no control, or one without a rest, leaves the bar alone.
      if (control?.restPausedMs > 0 || control?.restEndsAt > Date.now()) followNativeRest(control)
    }).then((rejected) => {
      setWorkout(withQueued)
      if (rejected > 0) refused()
    })
    return onNativeSend(({ workout: answered, rejected, control, ended }) => {
      // Terminado fuera de aquí (el widget, dos horas sin series): el descanso
      // de la pantalla era el de ese control. Sólo con `ended`: un envío sin
      // control es una sesión que nunca lo tuvo (sólo cardio), y su reloj sigue.
      if (ended) endRest()
      else followNativeRest(control)
      // Sólo este entreno se redibuja con la respuesta; la cola puede llevar
      // series de una sesión de la que ya saliste.
      if (answered?.id === workoutId) {
        cacheWorkout(answered)
        setWorkout(withQueued(answered))
      } else {
        setWorkout(withQueued)
      }
      if (rejected > 0) refused()
      // El nativo acaba de hablar con el servidor: hay señal.
      flushAnswers()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutId])

  // Cada vez que el entreno en pantalla cambia, si queda alguna respuesta: al
  // cargarlo (las que quedaron de la última vez) y cuando una serie de la cola
  // vuelve del servidor con su id (las que se dieron antes de que llegara). Un
  // efecto y no quien cambia el entreno: `workoutRef` sólo lo ve tras el render.
  useEffect(() => {
    if (workout?.id === workoutId && answersFor(workoutId).length > 0) flushAnswers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout, workoutId])

  // The screen doesn't go dark between sets. Re-run on the preference, so
  // turning it off in the overflow lets go of the lock there and then.
  useEffect(() => {
    if (!screenAwake) return undefined
    return holdScreenAwake()
  }, [screenAwake])

  useEffect(() => {
    // Autocomplete is best-effort; a failure here shouldn't break logging.
    listExercises()
      .then((list) => {
        setKnown(list.map((e) => e.name))
        setCatalog(list)
        setMuscleByName(Object.fromEntries(list.map((e) => [e.name, e.muscle_group])))
        setNoteByName(Object.fromEntries(list.map((e) => [e.name, e.note ?? null])))
        setIdByName(Object.fromEntries(list.map((e) => [e.name, e.id])))
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
    // Uno de hoy que encaja gana a uno del catálogo: a mitad de sesión, lo que
    // buscas casi siempre es volver.
    await addExercise(knownExact ?? todayMatch?.name ?? matches[0] ?? exerciseInput)
  }

  // Poner un ejercicio en pantalla.
  function goTo(name) {
    // Ir al que ya está en pantalla no cambia de ejercicio, pero sí cierra la
    // búsqueda igual que cualquier otra llegada.
    if (name !== activeExercise?.name) setActiveName(name)
    setSearching(false)
    setExerciseInput('')
    // Fuera el teclado: lo que toca ahora es el ejercicio. Y así volver a tocar
    // el buscador vuelve a ser enfocarlo, que es lo que abre la lista de hoy.
    const field = document.getElementById('exercise')
    if (field && document.activeElement === field) field.blur()
  }

  async function addExercise(rawName) {
    const name = rawName.trim()
    if (!name) return
    // Uno que ya está en esta sesión no se añade otra vez: se va a él.
    const standingOne = exercises.find((e) => fold(e.name) === fold(name))
    if (standingOne) {
      goTo(standingOne.name)
      return
    }
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
    // Written down, or leaving the app before its first set loses the card.
    if (!setsFor(name).length) rememberAddedExercise(workoutId, { name, kind })
    setAdding(false)
    // Lo acabas de añadir: es lo que vas a hacer ahora.
    goTo(name)
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
    // With its offset, like the food log: the server reads the wall clock off
    // it to tell which meal comes after training (carbs follow training).
    const payload = { ...template, performed_at: foodMomentIso() }
    const tmpId = `${tmpPrefix.current}-${(nextTmpId.current += 1)}`
    enqueueSet({ tmpId, workoutId: workout.id, payload })
    setWorkout(withQueued)
    // Started on the tap, not on the round trip: resting is what you do *while*
    // the request is open, and offline there may not be a round trip for hours.
    const endsAt = startRest()
    if (fields.kind !== 'cardio') publishControl(name, fields, endsAt)
    await flushQueue()
  }

  // In the APK, what the notification in progress shows and repeats: the set
  // just logged, as a template (the stamped moment is not something to repeat),
  // and how many of this exercise so far. Cardio is left out: the interval you
  // just ran is not the one you are about to run. The notification permission
  // is asked for here, on the first set, where it is obviously for something.
  // Spec: docs/widgets-entreno.md, fase 2.
  function publishControl(name, fields, endsAt) {
    if (!nativeSession()) return
    const now = Date.now()
    lastControl.current = {
      workoutId: workout.id,
      exercise: name,
      group: muscleByName[name] ?? null,
      template: { exercise_name: name, reps: fields.reps, weight: fields.weight ?? null },
      // `workout` is this render's: the set just queued isn't in it yet.
      count: setsFor(name).length + 1,
      restSeconds,
      restEndsAt: endsAt ?? 0,
      lastSetAt: now,
    }
    session.publish(lastControl.current).catch(() => {})
    if (!askedNotifications.current) {
      askedNotifications.current = true
      session.ensureNotifications().catch(() => {})
    }
  }

  // Drain the outbox oldest-first. Nothing here throws at the card: a set that
  // couldn't be sent is not an error the lifter can act on, it is a set waiting
  // for signal, and the row already says so.
  async function flushQueue() {
    // En el APK envía el nativo; aquí sólo se le pide.
    if (sendsNatively()) {
      await flushNatively()
      return
    }
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

  function answerRirFor(set, rpe) {
    queueAnswer({
      workoutId: workout.id,
      ...(set.pending ? {} : { setId: set.id }),
      ...(set.client_id ? { clientId: set.client_id } : {}),
      rpe,
    })
    setWorkout(withQueued)
    flushAnswers()
  }

  // Como `flushQueue`, pero sin orden que guardar: cada respuesta corrige una
  // serie distinta. Se para en la primera que no sale por falta de señal —las
  // demás fallarían igual— y suelta, en voz alta, la que el servidor rechaza.
  async function flushAnswers() {
    if (answering.current) return
    answering.current = true
    try {
      for (const answer of answersFor(workoutId)) {
        const sets = workoutRef.current?.id === workoutId ? workoutRef.current.sets : null
        if (!sets) break
        const set = sets.find((s) => answerIsFor(answer, s))
        // Borrada desde que se contestó: ya no hay a quién ponérsela.
        if (!set) {
          dropAnswer(answer)
          continue
        }
        // Todavía en la cola: sale cuando el servidor la devuelva con su id.
        if (set.pending) continue
        try {
          await editSetFor(set, {
            reps: set.reps,
            weight: set.weight,
            rpe: answer.rpe,
            note: set.note ?? null,
          })
          dropAnswer(answer)
        } catch (err) {
          if (retryable(err)) break
          dropAnswer(answer)
          setError('El servidor rechazó cuántas te quedaban.')
        }
      }
    } finally {
      answering.current = false
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

  // ── Quitar un ejercicio de esta sesión ───────────────────────────────────
  // Sólo de esta: sus series de hoy y la tarjeta. El ejercicio, su historial,
  // su grupo y su nota se quedan, así que nada de lo que esta pantalla lleva
  // indexado por su nombre —id, grupo, cuenta— se toca. Borrar el ejercicio
  // entero es de Progreso.
  async function removeFromWorkoutFor(name) {
    const onServer = setsFor(name).filter((set) => !set.pending)
    const id = idByName[name] ?? onServer[0]?.exercise_id
    if (onServer.length > 0 && id != null) {
      setError('')
      try {
        await removeExerciseFromWorkout(workoutId, id)
      } catch {
        setError('No se pudo quitar el ejercicio del entreno.')
        return
      }
    }
    // Lo que quede en la bandeja de salida también: mandarlo después
    // devolvería al entreno las series que acabas de quitar.
    dropQueuedFor(name)
    forgetAddedExercise(workoutId, name)
    dropFromRepeatTemplate(workoutId, name)
    setExercises((list) => list.filter((e) => e.name !== name))
    setWorkout((w) =>
      w ? { ...w, sets: w.sets.filter((set) => set.exercise_name !== name) } : w,
    )
  }

  // ── Estas series eran de otro ejercicio ──────────────────────────────────
  // Apuntaste en el ejercicio equivocado. Renombrar no sirve —el nombre es de
  // toda su historia— y fusionar es irreversible y se lleva esa historia
  // entera. Esto mueve sólo las series de esta sesión: cada una se corrige con
  // el mismo `PATCH` que corrige sus reps, ahora con otro `exercise_name`, y el
  // ejercicio de antes se queda como estaba en todas las demás sesiones.
  //
  // Primero el servidor y después la pantalla: es un acto raro, y pintar una
  // mudanza que luego hay que deshacer serie a serie es peor que medio segundo
  // de espera. Lo que sigue en la bandeja de salida se muda por nombre.
  async function switchExerciseFor(from, to) {
    if (!to || from === to) return
    setError('')
    const moving = setsFor(from)
    let updated
    try {
      updated = await Promise.all(
        moving
          .filter((set) => !set.pending)
          .map((set) =>
            editSet(set.id, {
              exercise_name: to,
              reps: set.reps,
              weight: set.weight,
              rpe: set.rpe ?? null,
              note: set.note ?? null,
            }),
          ),
      )
    } catch {
      setError('No se pudo cambiar el ejercicio.')
      // Alguna pudo pasar y otra no: lo que hay lo dice el servidor.
      resyncWorkout().catch(() => {})
      return
    }
    const byId = new Map(updated.map((set) => [set.id, set]))
    renameQueued(from, to)
    const standing = exercises.some((e) => e.name === to)
    if (standing) {
      // Ya tenía tarjeta: las series se suman a ella y la de antes se va.
      forgetAddedExercise(workoutId, from)
      dropFromRepeatTemplate(workoutId, from)
      setExercises((list) => list.filter((e) => e.name !== from))
    } else {
      // La tarjeta se queda en su sitio con otro nombre —la misma llave, así
      // que no se desmonta— y pide las marcas del ejercicio que ahora es.
      renameAddedExercise(workoutId, from, to)
      moveCardKey(from, to)
      setToggled((map) => {
        if (!(from in map)) return map
        const { [from]: value, ...rest } = map
        return { ...rest, [to]: value }
      })
      setExercises((list) =>
        list.map((e) => (e.name === from ? { ...e, name: to, previous: undefined } : e)),
      )
      marksFor(to, workoutId).then((marks) => {
        const previous = marks ?? { found: false, sets: [] }
        setExercises((list) => list.map((e) => (e.name === to ? { ...e, previous } : e)))
      })
    }
    setWorkout((w) =>
      w
        ? {
            ...w,
            sets: w.sets.map((set) =>
              byId.get(set.id) ??
              (set.exercise_name === from ? { ...set, exercise_name: to } : set),
            ),
          }
        : w,
    )
    // Si era el de la pantalla, la pantalla se va con él: sin esto volvería al
    // primero de la lista, que puede ser otro.
    if (activeExercise?.name === from) setActiveName(to)
    focusEditorTrigger(to)
  }

  // ── Volver a preguntarle al servidor cómo está la sesión ─────────────────
  // Todo lo que esta pantalla sabe de un ejercicio lo lleva **por nombre**:
  // qué series son suyas, su id, su grupo, su nota y su cuenta. Cuando una
  // mudanza de series sale a medias —unas pasan y otras no— la pantalla no
  // sabe qué serie quedó dónde, así que no lo deduce: lo pregunta.
  //
  // Y se pregunta por las dos: `/workouts/{id}` devuelve las series con su
  // ejercicio, y `/exercises` los mapas por nombre.
  async function resyncWorkout() {
    const [w, list] = await Promise.all([
      getWorkout(workoutId).catch(() => null),
      listExercises().catch(() => null),
    ])
    if (list) {
      setKnown(list.map((e) => e.name))
      setCatalog(list)
      setMuscleByName(Object.fromEntries(list.map((e) => [e.name, e.muscle_group])))
      setNoteByName(Object.fromEntries(list.map((e) => [e.name, e.note ?? null])))
      setIdByName(Object.fromEntries(list.map((e) => [e.name, e.id])))
    }
    if (!w) return
    cacheWorkout(w)
    const full = withQueued(w)
    setWorkout(full)
    // Las tarjetas también las manda el servidor. Se conserva el orden que hay
    // en pantalla —las que ya estaban se quedan donde están— y se corrige lo
    // único que la aritmética local puede haber roto: una tarjeta repetida y
    // una tarjeta que falta. Lo que no tiene ninguna serie no lo conoce el
    // servidor (una plantilla repetida, un ejercicio recién añadido) y por eso
    // no se toca.
    const logged = exercisesFromWorkout(full)
    setExercises((list_) => {
      const seen = new Set()
      const kept = []
      for (const ex of list_) {
        if (seen.has(ex.name)) continue
        seen.add(ex.name)
        kept.push(ex)
      }
      const missing = logged.filter((ex) => !seen.has(ex.name))
      return missing.length === 0 ? kept : [...missing, ...kept]
    })
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
    // Como el resto de pistas: si falla, la hoja sale sin atajos y no se dice nada.
    Promise.resolve()
      .then(() => listDays())
      .then((days) => {
        if (!Array.isArray(days)) return
        const seen = new Set()
        for (const day of days)
          for (const w of day.workouts ?? []) if (w.name && w.id !== workout.id) seen.add(w.name)
        setPastNames([...seen].slice(0, 6))
      })
      .catch(() => {})
  }

  // Sin «Guardar»: cerrar la hoja —velo, Atrás, Intro o un atajo— guarda, y
  // cerrarla sin cambiar nada no manda nada. Vacío vuelve al automático.
  async function saveName(typed) {
    setRenaming(false)
    const next = typed.trim() || null
    if (next === (workout.name || null)) return
    try {
      const updated = await renameWorkout(workout.id, next)
      setWorkout((w) => ({ ...w, name: updated.name }))
    } catch {
      setError('No se pudo renombrar el entreno.')
    }
  }

  // Terminar no cierra nada en el servidor —una sesión es un día—: quita la
  // notificación en el APK, para el descanso y te devuelve a Días.
  function finishWorkout() {
    if (nativeSession()) session.end().catch(() => {})
    endRest()
    onExit()
  }

  async function handleDeleteWorkout() {
    setError('')
    try {
      await deleteWorkout(workout.id)
    } catch (err) {
      // Already gone is what deleting asked for, not a failure to report.
      if (err?.status !== 404) {
        setError('No se pudo borrar el entreno.')
        return
      }
    }
    forgetWorkout(workout.id)
    onExit()
  }

  const setsFor = (name) =>
    workout ? workout.sets.filter((s) => s.exercise_name === name) : []

  // El ejercicio en pantalla: el elegido si sigue en la sesión, y si no (aún no
  // elegiste, o lo quitaste) el primero de la lista.
  const activeExercise = exercises.find((e) => e.name === activeName) ?? exercises[0] ?? null
  // El atajo del pie. Siguiente: el primero sin series de hoy que viene
  // *después* de éste en la sesión, dando la vuelta — lo que queda de
  // «Repetir» o lo que añadiste y aún no empezaste. Después, y no el primero de
  // la lista: el que te saltaste no vuelve a ofrecerse como lo que toca; para
  // volver a él está la tira de arriba.
  const activeIndex = exercises.findIndex((e) => e.name === activeExercise?.name)
  const nextUp =
    exercises
      .map((_, i) => exercises[(activeIndex + 1 + i) % exercises.length])
      .find((e) => e.name !== activeExercise?.name && setsFor(e.name).length === 0)?.name ?? null
  // Terminado el de pantalla (tantas series como la última vez), el atajo del
  // pie pasa a ser lo principal: el siguiente si lo hay, y si no aquel del que
  // vienes. Ir a por él es el paso que toca, y cuesta un toque.
  const activeDone =
    activeExercise != null &&
    activeExercise.kind !== 'cardio' &&
    doneSummary(activeExercise.previous, setsFor(activeExercise.name)) != null
  // Y si ya no queda nada a medias, lo que toca es acabar: «Terminar entreno»
  // ocupa ese sitio. Hecho es llegar a las series de la última vez; lo que no
  // tiene última vez (cardio, o un ejercicio nuevo) con una serie ya lo está.
  const exDone = (ex) => {
    const sets = setsFor(ex.name)
    if (sets.length === 0) return false
    if (ex.kind === 'cardio' || !ex.previous?.found) return true
    return doneSummary(ex.previous, sets) != null
  }
  const canFinish = exercises.length > 0 && exercises.every(exDone)
  const leadShortcut = activeDone && !canFinish ? nextUp : null
  // Fase 3: terminado, lo que sueles hacer después, a un toque desde el pie.
  // Se pide al terminar y no antes: mientras queda serie, lo que toca es ella.
  // Lo que ya tiene series hoy no se ofrece otra vez, ni lo que ya ofrece el
  // atajo. Como el resto de pistas, si falla no se dice nada.
  const [usual, setUsual] = useState({ after: null, list: [] })
  const doneName = activeDone ? activeExercise.name : null
  useEffect(() => {
    if (doneName == null) return undefined
    let live = true
    Promise.resolve()
      .then(() => nextExercises(doneName, workoutId))
      .then((list) => {
        if (live && Array.isArray(list)) setUsual({ after: doneName, list })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [doneName, workoutId])
  const usualShown =
    doneName != null && usual.after === doneName
      ? usual.list.filter((e) => setsFor(e.name).length === 0 && e.name !== leadShortcut)
      : []

  // ¿Dónde va el reloj? En la tarjeta en pantalla, si es la de la última serie,
  // está abierta y es de fuerza. Si no —otro ejercicio, plegada, cardio, o un
  // descanso que vino del widget sin series aquí todavía—, en la barra de
  // arriba de siempre: el descanso no puede quedarse sin sitio.
  const resting = restEndsAt != null || restPausedMs != null
  const lastSet = workout?.sets?.length ? workout.sets[workout.sets.length - 1] : null
  const restOn = resting ? (lastControl.current?.exercise ?? lastSet?.exercise_name ?? null) : null
  const ringShown =
    restOn != null &&
    restOn === activeExercise?.name &&
    activeExercise.kind !== 'cardio' &&
    isOpen(restOn, 0)

  // How long this session took, from its own sets. Empty while it is still
  // running, so the header simply doesn't carry it yet.
  const took = sessionLength(workout)
  // Sin nombre puesto, el entreno se llama por sus músculos. Una serie recién
  // apuntada puede llegar sin grupo: lo pone el catálogo.
  const autoName = workout
    ? autoWorkoutName(
        workout.sets.map((st) =>
          st.muscle_group ? st : { ...st, muscle_group: muscleByName[st.exercise_name] },
        ),
      )
    : null

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
  // Escribir parte del nombre de uno de hoy y dar a Intro lleva a él: la tira
  // de arriba es el camino corto, pero quien teclea no tiene que añadirlo dos
  // veces.
  const todayMatch = typedName
    ? exercises.find((e) => e.name !== activeExercise?.name && fold(e.name).includes(fold(typedName)))
    : null
  // The way out of the substring trap: `Peso Muerto` is contained in `Peso
  // Muerto Rumano`, so the go key below would forever stand up the Rumano and
  // the lift you meant could never be created. Only offered when something did
  // match — with an empty list `Añadir ejercicio` already creates what you
  // typed, and a second control for that same job is one path too many.
  const canCreateTyped = isNewExercise && matches.length > 0

  // El esqueleto de la pantalla, con el mismo umbral que Días.
  const waiting = useWaitFlag(!workout && !error)

  if (!workout) {
    // The way out matters more now that the app can reopen straight into a
    // workout: if that one is gone, an alert with no button is a dead end.
    return error ? (
      <>
        <p role="alert" className="alert">
          {error}
        </p>
        <button type="button" className="secondary head-back" aria-label="Volver" onClick={onExit}>
          ‹ Volver
        </button>
      </>
    ) : waiting ? (
      // Dos tarjetas plegadas y la de añadir, que es la forma que va a tener
      // esto en cuanto conteste el servidor. `Cargando…` no reservaba ninguna
      // de las dos, así que la sesión entera saltaba al llegar.
      <WorkoutSkeleton onExit={onExit} />
    ) : null
  }

  return (
    // Columna que llena la pantalla: con poco contenido el pie baja igual hasta
    // el pulgar en vez de quedarse a media altura.
    <section className="workout-screen">
      {/* One toolbar, one row: back on the left, the workout (name + date) as the
          anchor, and the rare/destructive actions folded into an overflow on the
          right — instead of four buttons and a title staggered across the top. */}
      <div className="workout-head">
        <button type="button" className="secondary head-back" aria-label="Volver" onClick={onExit}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        {/* El título es la puerta del nombre: tocarlo abre la hoja. Sin
            nombre puesto, el entreno se llama por sus músculos y lo dice. */}
        <button
          type="button"
          className="workout-title"
          aria-label={`Cambiar nombre del entreno ${workout.name || autoName || 'Entreno'}`}
          onClick={startRename}
        >
          <span className="workout-name">
            <strong>{workout.name || autoName || 'Entreno'}</strong>
            {!workout.name && autoName && <span className="workout-auto">auto</span>}
          </span>
          {/* The length rides with the date, not on a line of its own: both
              answer "which session is this", and the header is already two
              rows tall. Empty string while the session is still running —
              see sessionLength. */}
          {/* En curso, el reloj de la sesión; cerrada, su fecha y lo que duró. */}
          <Cronometro workout={workout} fallback={`${formatDate(workout.date)}${took ? ` · ${took}` : ''}`} />
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
                  <button
                    type="button"
                    className="secondary set-action head-menu-item"
                    onClick={startRename}
                  >
                    Cambiar nombre
                  </button>
                  {/* Rest and the screen staying lit are chosen once, in
                      Perfil; this menu keeps only what acts on this session. */}
                  {/* Only in the APK, in the spot the lock-screen switch used to
                      have: takes the notification in progress away. The sets
                      stay — a session in Fitit is a day, and there is nothing
                      on the server to close. docs/widgets-entreno.md, fase 2. */}
                  {nativeSession() && (
                    <button
                      type="button"
                      className="secondary set-action head-menu-item"
                      onClick={() => {
                        closeMenu()
                        finishWorkout()
                      }}
                    >
                      Terminar entreno
                    </button>
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
      </div>

      {/* Un solo campo y sin «Guardar»: cerrar la hoja lo guarda (saveName). */}
      <Sheet open={renaming} title="Nombre del entreno" onClose={() => saveName(nameInput)}>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            saveName(nameInput)
          }}
        >
          <div className="field">
            <label htmlFor="workout-name-input">
              {autoName ? `Vacío = el automático («${autoName}»)` : 'Vacío = «Entreno»'}
            </label>
            <input
              id="workout-name-input"
              autoComplete="off"
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
            />
          </div>
        </form>
        {pastNames.length > 0 && (
          <div className="workout-name-chips" role="group" aria-label="Tus nombres de otros días">
            {pastNames.map((n) => (
              <Chip key={n} onClick={() => saveName(n)}>
                {n}
              </Chip>
            ))}
          </div>
        )}
      </Sheet>

      {/* ── La tira ─────────────────────────────────────────────────────────
          Todos los de hoy, en el orden de la sesión, cada uno a un toque: volver
          a uno para corregirlo, un superset, saltar al que toca. El de pantalla
          se marca en su sitio en vez de esconderse, para que la tira no baile.
          La cifra son sus series de hoy y, con última vez, de cuántas. Con un
          solo ejercicio no hay a dónde ir, y no se pinta. */}
      {exercises.length > 1 && (
        <nav className="workout-strip" aria-label="Ejercicios de hoy">
          {exercises.map((e) => {
            const done = setsFor(e.name).length
            const target =
              e.kind !== 'cardio' && e.previous?.found ? e.previous.sets.length : null
            const here = e.name === activeExercise?.name
            return (
              <button
                key={e.name}
                type="button"
                className="strip-chip"
                aria-current={here ? 'true' : undefined}
                onClick={() => goTo(e.name)}
              >
                <span
                  className="dot"
                  aria-hidden="true"
                  style={{ '--chip': muscleColor(muscleByName[e.name]) }}
                />
                <span className="strip-name">{e.name}</span>
                {/* «1/2» mientras falta; llegado a las de la última vez, «2 ✓»:
                    «3/2» se leía como un error y no lo es. */}
                <span className="strip-count">
                  {target && done < target ? `${done}/${target}` : target ? `${done} ✓` : done}
                </span>
              </button>
            )
          })}
        </nav>
      )}

      {resting && !ringShown && (
        <RestBar
          endsAt={restEndsAt}
          total={restTotal}
          pausedMs={restPausedMs}
          onSkip={skipRest}
          onResume={resumeRest}
        />
      )}

      {/* What is still recovering, above the form so it lands before you choose
          what to add. Muted and uncoloured on purpose: it informs, it does not
          rule — the same stance the in-progress week takes. Absent entirely
          when there is nothing to say, since most sessions have nothing. */}
      {recentLine && <p className="recent-note">{recentLine}</p>}


      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}

      {/* Sin nada todavía: el pie es el principio. */}
      {!activeExercise && <p className="hint workout-empty">Busca abajo tu primer ejercicio.</p>}

      {[activeExercise].filter(Boolean).map((ex) =>
        ex.kind === 'cardio' ? (
          <CardioCard
            key={keyFor(ex.name)}
            name={ex.name}
            previous={ex.previous}
            sets={setsFor(ex.name)}
            onLogSet={logSetFor}
            onDeleteSet={deleteSetFor}
            open={isOpen(ex.name, 0)}
            onToggle={() => toggleCard(ex.name, 0)}
          />
        ) : (
          <ExerciseCard
            key={keyFor(ex.name)}
            name={ex.name}
            muscle={muscleByName[ex.name] ?? null}
            note={noteByName[ex.name] ?? null}
            previous={ex.previous}
            sets={setsFor(ex.name)}
            onLogSet={logSetFor}
            onEditSet={editSetFor}
            onAnswerRir={answerRirFor}
            onDeleteSet={deleteSetFor}
            candidates={catalog.filter((e) => e.kind !== 'cardio' && e.name !== ex.name)}
            onSwitchExercise={switchExerciseFor}
            onRemoveFromWorkout={removeFromWorkoutFor}
            open={isOpen(ex.name, 0)}
            onToggle={() => toggleCard(ex.name, 0)}
            onOpen={() => openCard(ex.name)}
            rest={
              ringShown && ex.name === restOn ? (
                <RestRing
                  endsAt={restEndsAt}
                  total={restTotal}
                  pausedMs={restPausedMs}
                  onSkip={skipRest}
                  onResume={resumeRest}
                  onAdjust={adjustRest}
                />
              ) : null
            }
          />
        ),
      )}
      {/* ── El pie ─────────────────────────────────────────────────────────
          Todo lo que no es el ejercicio en pantalla se alcanza desde aquí,
          pegado al pulgar: volver al anterior (un superset, un toque), el
          siguiente de «Repetir» (un toque) y el buscador, que añade uno nuevo
          o lleva a uno de hoy. */}
      <div className="workout-dock">
        {usualShown.length > 0 && (
          <div
            className="dock-usual"
            role="group"
            aria-label={`Después de ${doneName} sueles hacer`}
          >
            <p className="dock-heading">{`Después de ${doneName.toLowerCase()} sueles hacer`}</p>
            <div className="dock-usual-row">
              {usualShown.map((e) => (
                <button
                  key={e.name}
                  type="button"
                  className="secondary dock-usual-btn"
                  onClick={() => addExercise(e.name)}
                >
                  {e.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {(nextUp || canFinish) && (
          <div className="dock-shortcuts">
            {nextUp && (
              <button
                type="button"
                className={`${leadShortcut === nextUp ? 'primary' : 'secondary'} dock-shortcut`}
                aria-label={`Siguiente: ${nextUp}`}
                onClick={() => goTo(nextUp)}
              >
                {nextUp}
                <span aria-hidden="true"> ›</span>
              </button>
            )}
            {canFinish && (
              <button type="button" className="primary dock-shortcut" onClick={finishWorkout}>
                Terminar entreno<span aria-hidden="true"> ✓</span>
              </button>
            )}
          </div>
        )}
      <form className="card card-compose" onSubmit={handleAddExercise}>
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
            {/* Last, because it is the rarer intent: you are usually looking for
                a lift you have. Hollow dot for the same reason cardio's is —
                nothing to colour by until the exercise exists. */}
            {canCreateTyped && (
              <li>
                <button
                  type="button"
                  className="set-row set-row-new"
                  onClick={() => addExercise(typedName)}
                >
                  <span className="dot dot-new" aria-hidden="true" />
                  Crear «{typedName}»
                </button>
              </li>
            )}
          </ul>
        )}
        <div className="field">
          <label htmlFor="exercise" className="dock-label">
            Ejercicio
          </label>
          <input
            id="exercise"
            value={exerciseInput}
            onChange={(e) => setExerciseInput(e.target.value)}
            onFocus={() => setSearching(true)}
            placeholder={exercises.length ? 'Otro ejercicio…' : 'Buscar o escribir…'}
            autoComplete="off"
          />
        </div>
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
        {/* Sólo con algo escrito: con el campo vacío no hay nada que añadir, e
            Intro ya lo hace sin tocarlo. */}
        {(typedName || adding) && (
          <button type="submit" className="primary btn-full" disabled={adding}>
            {adding ? 'Comprobando…' : 'Añadir ejercicio'}
          </button>
        )}
      </form>
      </div>
    </section>
  )
}
