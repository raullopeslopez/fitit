import { useEffect, useRef, useState } from 'react'

import { createWorkout, deleteDay, listDays } from './api.js'
import { buildBootSummary } from './coldstart.js'
import {
  formatDayStamp,
  formatWeekLabel,
  isoWeekStart,
  sessionLength,
  sessionMinutes,
} from './format.js'
import { MUSCLE_GROUPS, muscleColor, UNGROUPED } from './muscles.js'
import { cacheBootSummary } from './offline.js'
import { setRepeatTemplate } from './prefs.js'
import { CtaLabelSkeleton, DaysSkeleton, useWaitFlag } from './Skeleton.jsx'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// Cardio has no muscle group by design, so it gets its own bucket in the day
// breakdown rather than falling in with the lifts nobody has tagged yet.
const CARDIO = 'Cardio'

// How long a press has to last to mean "act on this day" rather than "open it".
// Long enough that a tap can't overshoot into it, short enough to be found by
// somebody who suspects it's there.
const LONG_PRESS_MS = 550

// The canonical display order, used to break ties in the seam so two groups on
// the same count don't swap places between renders.
const PART_ORDER = [...MUSCLE_GROUPS, CARDIO, UNGROUPED]

const ONE_DAY_MS = 86400000

// The exercises a session worked, each once, in the order they were worked.
// That order is the plan: repeat the session and you start where you started.
function exerciseNames(workout) {
  return [...new Set(workout.sets.map((s) => s.exercise_name))]
}

function setsIn(day) {
  return day.workouts.reduce((n, w) => n + w.sets.length, 0)
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// The list, cut into weeks. The one question a lifter asks this screen is "how
// much have I done this week", and it could only be answered by counting rows —
// so each run of days gets a mono rule naming its week and totalling it. No new
// surface, one line of type, and the ruled entries get the section rhythm they
// lacked. Runs, not a map: `days` arrives newest-first and stays that way, so
// consecutive days in the same week are already adjacent.
function weeksOf(days) {
  const weeks = []
  for (const day of days) {
    const key = isoWeekStart(day.date)
    const open = weeks[weeks.length - 1]
    if (open && open.key === key) open.days.push(day)
    else weeks.push({ key, days: [day] })
  }
  return weeks.map((week) => {
    const sets = week.days.reduce((n, day) => n + setsIn(day), 0)
    return {
      ...week,
      label: formatWeekLabel(week.key),
      totals: `${plural(week.days.length, 'DÍA', 'DÍAS')} · ${plural(sets, 'SERIE', 'SERIES')}`,
    }
  })
}

// The days between two trained ones, said out loud. Only trained days exist in
// the list, so a four-day gap and a single rest day drew the same thing — two
// adjacent rules — and the cadence of a week, which is the whole point of
// grouping it by week, could not be read at all.
//
// One day off is named (`VIE · DESCANSO`) because naming it is what makes it a
// rest rather than an absence; a run of them is counted, because listing four
// weekdays would cost more room than the week itself.
function restBetween(newerIso, olderIso) {
  const newer = Date.parse(`${newerIso}T00:00:00`)
  const older = Date.parse(`${olderIso}T00:00:00`)
  const missed = Math.round((newer - older) / ONE_DAY_MS) - 1
  if (missed < 1) return null
  if (missed > 1) return `${missed} DÍAS SIN ENTRENAR`
  // Built from local parts, never through `toISOString()`: east of Greenwich
  // local midnight is the previous day in UTC, so round-tripping the date to
  // name the day off named the day before it.
  const [y, m, d] = newerIso.split('-').map(Number)
  const off = new Date(y, m - 1, d - 1)
  const iso = `${off.getFullYear()}-${String(off.getMonth() + 1).padStart(2, '0')}-${String(
    off.getDate(),
  ).padStart(2, '0')}`
  const [stamp] = formatDayStamp(iso)
  return `${stamp.split(' ')[0]} · DESCANSO`
}

export default function Days({ onOpenWorkout }) {
  const [days, setDays] = useState(null)
  const [date, setDate] = useState(todayISO())
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [backfill, setBackfill] = useState(false)
  // Which day has its sheet open, and whether its delete is armed. Deleting a
  // day is irreversible and rare, so it lives behind a press and hold rather
  // than paying 44px on every row for a control nobody touches in a month.
  const [menuFor, setMenuFor] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState('')

  // A press that became a hold must not also land as a tap on the row it was
  // held over: the sheet would open behind the session it just opened.
  const pressTimer = useRef(null)
  const heldRef = useRef(false)

  useEffect(() => {
    listDays()
      .then((loaded) => {
        setDays(loaded)
        // What the launch screen will have to show next time the backend is
        // asleep. Written here because this is the one place the whole log
        // passes through, and read on a launch where nothing has arrived yet.
        cacheBootSummary(buildBootSummary(loaded))
      })
      .catch(() => setError('No se pudieron cargar tus días.'))
  }, [])

  useEffect(() => () => clearTimeout(pressTimer.current), [])

  // What a session cost, per muscle, biggest first. Every set carries its own
  // group, so this needs nothing the list didn't already fetch — it used to
  // cross-reference /exercises by name, a second request and a map that went
  // stale the moment you re-tagged a lift.
  //
  // Cardio and untagged sets keep their own entries rather than being dropped:
  // the seam draws a proportion, and a proportion of some of the sets is a
  // proportion of nothing. Ordered by size so the segment the label names is
  // the one the eye lands on first, with the canonical order breaking ties.
  function breakdownOf(workout) {
    const counts = {}
    for (const set of workout.sets) {
      const key = set.kind === 'cardio' ? CARDIO : (set.muscle_group ?? UNGROUPED)
      counts[key] = (counts[key] || 0) + 1
    }
    return PART_ORDER.filter((key) => counts[key])
      .map((key) => ({ key, sets: counts[key] }))
      .sort((a, b) => b.sets - a.sets || PART_ORDER.indexOf(a.key) - PART_ORDER.indexOf(b.key))
  }

  function startPress(dayId) {
    heldRef.current = false
    clearTimeout(pressTimer.current)
    pressTimer.current = setTimeout(() => {
      heldRef.current = true
      setConfirmingDelete(false)
      setMenuFor(dayId)
    }, LONG_PRESS_MS)
  }

  function endPress() {
    clearTimeout(pressTimer.current)
  }

  function closeSheets() {
    setMenuFor(null)
    setConfirmingDelete(false)
    setBackfill(false)
  }

  // Today's session, if there is one. Its existence is what the primary button
  // reads: a second workout on a day you already trained is how a session ends
  // up split across two entries.
  const todayDay = days?.find((d) => d.date === todayISO())
  const todaySession = todayDay?.workouts?.[0]
    ? { ...todayDay.workouts[0], date: todayDay.date }
    : null

  // Starting today's session is one intent: one button, no form.
  async function startToday() {
    setError('')
    setCreating(true)
    try {
      const workout = await createWorkout({ date: todayISO(), name: null })
      onOpenWorkout(workout.id, workout, true)
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
      setBackfill(false)
      onOpenWorkout(workout.id, workout)
    } catch {
      setError('No se pudo empezar el entreno.')
    } finally {
      setCreating(false)
    }
  }

  // The quickest session to log is one already written down: same name, same
  // exercises, standing and waiting in Entreno with their previous marks.
  async function handleRepeat(day) {
    const source = day.workouts[0]
    if (!source) return
    setError('')
    closeSheets()
    setCreating(true)
    try {
      const workout = await createWorkout({ date: todayISO(), name: source.name ?? null })
      setRepeatTemplate(workout.id, exerciseNames(source))
      onOpenWorkout(workout.id, workout)
    } catch {
      setError('No se pudo repetir ese entreno.')
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteDay(id) {
    setError('')
    closeSheets()
    try {
      await deleteDay(id)
      setDays((list) => list.filter((d) => d.id !== id))
    } catch {
      setError('No se pudo borrar ese día.')
    }
  }

  // No session name on the button. The row already says which session is open —
  // that is what `EN CURSO` is for — and carrying it here meant a label that had
  // to ellipsise the moment a session was called something descriptive.
  // El esqueleto de la lista, con su umbral: por debajo de un cuarto de
  // segundo no se dibuja nada, porque un bloque gris que parpadea se lee como
  // un fallo de pintado y no como una espera.
  const waiting = useWaitFlag(days === null)

  const ctaLabel = creating ? 'Empezando…' : todaySession ? 'Continuar entreno' : 'Empezar entreno'

  const currentWeek = isoWeekStart(todayISO())
  // The week you are in always has a rule, whether or not anything is written
  // under it. `weeksOf` builds its runs out of the days that exist, so a week
  // with nothing logged produced no rule at all and the screen opened on
  // `SEMANA ANTERIOR` — the state this account is in every Monday morning, and
  // the one morning the question "what should today be" is live. A week is a
  // calendar week; the log fills it in, it does not define it.
  const logged = days ? weeksOf(days) : []
  const weeks =
    days && logged[0]?.key !== currentWeek
      ? [{ key: currentWeek, days: [], label: 'ESTA SEMANA', totals: '' }, ...logged]
      : logged

  function renderSession(day, w, isPast) {
    // The one state the list could not express: a session still running. It
    // takes the slot the duration would have, and they are mutually exclusive
    // by construction — an open session has no length to report yet.
    const live = day.date === todayISO() && !sessionLength(w)
    const took = sessionMinutes(w)
    const parts = breakdownOf(w)
    return (
      <li className="day-session-row" key={w.id}>
        {/* Hand the workout over, not just its id: this list already holds
            every set, so Entreno can draw before it fetches. The date comes
            from the day rather than the workout, so the seed is renderable
            without depending on the nested workout carrying a field it
            doesn't need here. */}
        <button
          type="button"
          className="link-row day-session"
          onClick={() => {
            if (heldRef.current) {
              heldRef.current = false
              return
            }
            onOpenWorkout(w.id, { ...w, date: day.date })
          }}
        >
          <span className="day-session-main">
            <span className="day-session-top">
              <span className="day-session-name">{w.name || 'Entreno'}</span>
              {live ? (
                <span className="day-live">
                  <span className="day-live-dot" aria-hidden="true" />
                  EN CURSO
                </span>
              ) : (
                took && <span className="day-session-len">{took}</span>
              )}
            </span>
            {w.sets.length > 0 && (
              <span className="day-session-bottom">
                {/* One fixed line whatever the session was. Naming every group
                    wrapped to two or three lines, so a full-body day stood
                    twice as tall as a push day and the list lost the rhythm
                    you scan it by — and with four similar counts, marking the
                    biggest in ink stopped saying anything at all. The seam
                    carries the proportion on a mark, which is the only thing
                    the muscle palette is ever allowed to do. */}
                <span className="day-seam" aria-hidden="true">
                  {parts.map((part) => (
                    <span
                      key={part.key}
                      className={part.key === CARDIO ? 'seam-cardio' : undefined}
                      style={{
                        flexGrow: part.sets,
                        ...(part.key === CARDIO ? {} : { background: muscleColor(part.key) }),
                      }}
                    />
                  ))}
                </span>
                <span className="day-parts">
                  <span className="day-part-top">{parts[0].key}</span>
                  {parts.length > 1 && (
                    <span className="day-part-rest"> +{parts.length - 1}</span>
                  )}
                </span>
                <span className="day-session-count">
                  {w.sets.length}
                  <span className="day-count-unit"> SER</span>
                </span>
              </span>
            )}
          </span>
        </button>
        {/* Repeating a session is the fastest way to log one, and it was hidden
            behind a menu that every day paid 44px for. It gets those 44px
            instead — but never on the session already running, where repeating
            today into today is the split-session the CTA exists to prevent.

            It has the right edge to itself. A chevron sat here first, flush
            against it: a `<span>` outside this button, so the one glyph on the
            row that said "go in here" was also the only part of the row that
            did nothing when tapped — and missing it by a few pixels repeated a
            workout. Every row in this list opens; the cue was redundant the
            moment it had to share the corner with a real control. */}
        {isPast ? (
          <button
            type="button"
            className="day-repeat"
            aria-label={`Repetir ${w.name || 'Entreno'}`}
            disabled={creating}
            onClick={() => handleRepeat(day)}
          >
            ⟳
          </button>
        ) : (
          // The column is reserved even where there is no button to put in it.
          // Dropping it let the running session's row run 48px further right
          // than every other, and the set counts are a right-aligned column of
          // tabular figures — one of them stepping out is the whole point of
          // setting them in mono.
          <span className="day-repeat day-repeat-empty" aria-hidden="true" />
        )}
      </li>
    )
  }

  return (
    <section className="days">
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}

      {days === null ? (
        // `Cargando…` decía que la app seguía viva y nada más: ni reservaba la
        // altura de la lista que venía ni decía en qué pantalla estabas, así
        // que la lista entera aparecía de golpe encima de una frase.
        waiting ? (
          <DaysSkeleton />
        ) : null
      ) : days.length === 0 ? (
        // Una cuenta nueva ve esta pantalla antes que ninguna otra, y la regla
        // de la semana es verdad tanto si hay algo debajo como si no: sin ella
        // la primera pantalla es una frase suelta sobre un fondo vacío. La
        // frase, en el mismo par que usa Progreso —qué pasa, en tinta, y en qué
        // se convierte esto, debajo y en muted— en lugar de una sola línea que
        // decía "abajo" sin decir para qué.
        <div className="week">
          <div className="week-head">
            <span className="week-label">ESTA SEMANA</span>
            <span className="week-totals"></span>
          </div>
          <div className="days-first">
            <p className="sum-empty">Aún no hay días registrados.</p>
            <p className="hint sum-handover">
              El botón de abajo abre la primera sesión. Al cerrarla, aparece aquí con su fecha,
              sus músculos y sus series.
            </p>
          </div>
        </div>
      ) : (
        weeks.map((week) => (
          <div className="week" key={week.key}>
            {/* One rule per week, the one you are in included. It carried the
                whole volume block for a while — nine rows of sets per muscle,
                above the log — and that pushed the day list, which is what this
                tab is, below the fold to make room for a reading you cannot act
                on mid-session. The block lives on Progreso, where the arrows and
                the month and the deload switch already were; here the rule goes
                back to naming a week and totalling it. */}
            <div className="week-head">
              <span className="week-label">{week.label}</span>
              <span className="week-totals">{week.totals}</span>
            </div>
            {week.days.map((day, i) => {
              // Rest markers only inside the week you are still filling.
              // History doesn't need them: a week that is over is a week whose
              // gaps you can't act on, and drawing them would make the older
              // list mostly hairline.
              const previous = week.days[i - 1]
              const rest =
                week.key === currentWeek && previous ? restBetween(previous.date, day.date) : null
              return (
                <div className="day-slot" key={day.id}>
                  {rest && (
                    <div className="day-rest">
                      <span className="day-rest-label">{rest}</span>
                      <span className="day-rest-line" aria-hidden="true" />
                    </div>
                  )}
                  {/* A margin note, not a card: the date sets in a left gutter
                      and the sessions hang off it, with the hairline over the
                      whole block — date included, which is the only place it
                      says "new day" rather than "new section". */}
                  <div
                    className={`day-block${day.date === todayISO() ? ' is-today' : ''}`}
                    onPointerDown={() => startPress(day.id)}
                    onPointerUp={endPress}
                    onPointerLeave={endPress}
                    onPointerCancel={endPress}
                  >
                    <h2 className="day-date">
                      {formatDayStamp(day.date).map((line, n) => (
                        <span className={n === 0 ? 'day-date-day' : 'day-date-rest'} key={line}>
                          {line}
                        </span>
                      ))}
                    </h2>
                    <ul className="sets day-sessions">
                      {day.workouts.map((w) =>
                        renderSession(day, w, day.date !== todayISO() || !!sessionLength(w)),
                      )}
                    </ul>
                  </div>
                </div>
              )
            })}
          </div>
        ))
      )}

      {/* The list scrolls; the way into a session doesn't. Pinned above the tab
          bar because that's where a thumb already is, one-handed, mid-gym. */}
      <div className="days-cta">
        <button
          type="button"
          className="primary btn-full btn-log"
          onClick={todaySession ? () => onOpenWorkout(todaySession.id, todaySession) : startToday}
          disabled={creating || days === null}
        >
          {/* El texto depende del log: `Empezar` y `Continuar` no son la misma
              frase, y adivinar mal abre una segunda sesión en un día que ya
              tenía una — justo lo que este botón existe para evitar. Conserva
              su ámbar, su altura y su sitio, y no contesta al dedo hasta que
              sepa cuál de las dos cosas es. */}
          {days === null ? waiting && <CtaLabelSkeleton /> : ctaLabel}
        </button>
        {/* A framed button beside the primary action read as half as important
            as starting a session, for something done once a month. Quiet link,
            same treatment Salir already earned. */}
        <button
          type="button"
          className="days-backfill"
          aria-expanded={backfill}
          onClick={() => setBackfill(true)}
        >
          Anotar otra fecha
        </button>
      </div>

      {backfill && (
        <div className="sheet-scrim" onClick={closeSheets}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Anotar otra fecha"
            onClick={(e) => e.stopPropagation()}
          >
            <form className="backfill" onSubmit={handleCreate}>
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
              <button type="submit" className="primary btn-full" disabled={creating}>
                {creating ? 'Empezando…' : 'Crear entreno'}
              </button>
            </form>
          </div>
        </div>
      )}

      {menuFor != null && (
        <div className="sheet-scrim" onClick={closeSheets}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Acciones del día"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Two taps to delete: the first only arms it. */}
            {confirmingDelete ? (
              <button
                type="button"
                className="sheet-item sheet-danger"
                onClick={() => handleDeleteDay(menuFor)}
              >
                Sí, borrar día
              </button>
            ) : (
              <button
                type="button"
                className="sheet-item sheet-danger"
                onClick={() => setConfirmingDelete(true)}
              >
                Borrar día
              </button>
            )}
            <button type="button" className="sheet-item" onClick={closeSheets}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
