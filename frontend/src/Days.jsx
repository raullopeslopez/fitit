import { useEffect, useRef, useState } from 'react'

import { createWorkout, deleteDay, getFoodDay, listDays } from './api.js'
import { buildBootSummary } from './coldstart.js'
import { autoWorkoutName, buildHistory, CARDIO, muscleCounts } from './daysHistory.js'
import { formatDayStamp, isoWeekStart, sessionLength, sessionMinutes } from './format.js'
import { MUSCLE_GROUPS, muscleColor, UNGROUPED } from './muscles.js'
import { cacheBootSummary, forgetWorkout } from './offline.js'
import { setRepeatTemplate } from './prefs.js'
import { DaysSkeleton, useWaitFlag } from './Skeleton.jsx'
import { STEPS_SYNCED, formatSteps, stepsByDate } from './steps.js'
import { publishLastWorkout } from './widgetSummary.js'
import { foodDayIso } from './food.js'

// El día de entreno corta a las 04:00 locales, el mismo que el de comida: una
// sesión a la 01:30 es la del día que llevas despierto. Antes salía en UTC, y
// entre las 00:00 y las 02:00 en Madrid «Empezar entreno» no encontraba la
// sesión de hoy y fechaba la nueva en ayer.
const conPunto = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

function todayISO() {
  return foodDayIso()
}

// How long a press has to last to mean "act on this day" rather than "open it".
// Long enough that a tap can't overshoot into it, short enough to be found by
// somebody who suspects it's there.
const LONG_PRESS_MS = 550

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

// Each week's rule names it and totals it: "how much have I done this week" was
// answerable only by counting rows.
function weekTotals(week) {
  if (week.days.length === 0) return ''
  return `${plural(week.days.length, 'DÍA', 'DÍAS')} · ${plural(week.sets, 'SERIE', 'SERIES')}`
}

// The muscle's colour at a strength that says how much of it there was: the
// biggest group in full, the smallest still clearly lit, none an empty outline.
function cellFill(group, sets, max) {
  return `color-mix(in srgb, ${muscleColor(group)} ${Math.round(35 + (65 * sets) / max)}%, var(--surface))`
}

// A folded month's line: sessions spelled out, series as the list's unit.
function monthTotals(item) {
  return `${plural(item.sessions, 'entreno', 'entrenos')} · ${item.sets} ser`
}

const ABBR = (group) => group.slice(0, 3).toUpperCase()

// What a day's tick is painted with: its main muscle's colour, cardio striped,
// untagged muted, a day off empty.
function tickStyle(part) {
  if (!part || part === CARDIO) return undefined
  return { background: part === UNGROUPED ? 'var(--muted)' : muscleColor(part) }
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

export default function Days({ onOpenWorkout, startOnArrival = false, onStarted = () => {} }) {
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
  // Pasos por fecha, de Health Connect (steps.js). Un día que no está no tiene
  // dato y se dibuja sin cifra.
  const [steps, setSteps] = useState({})
  // The folded rows opened in place: `w:` weeks, `m:` months, `y:` years.
  const [expanded, setExpanded] = useState(() => new Set())
  const toggle = (key) =>
    setExpanded((open) => {
      const next = new Set(open)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

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
        // Y el widget de Android sin entreno: «Último: hace 2 días · Pierna».
        publishLastWorkout(loaded)
      })
      .catch(() => setError('No se pudieron cargar tus días.'))
  }, [])

  // Los pasos de los días que hay en la lista: desde el más antiguo (hasta 400
  // días atrás, lo que deja pedir el servidor) hasta el más reciente. Se vuelven
  // a pedir cuando el teléfono acaba de subir pasos nuevos.
  useEffect(() => {
    if (!days || days.length === 0) return undefined
    const dates = days.map((day) => day.date).sort()
    const to = dates[dates.length - 1]
    const [y, m, d] = to.split('-').map(Number)
    const limit = new Date(y, m - 1, d - 399)
    const limitIso = `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, '0')}-${String(
      limit.getDate(),
    ).padStart(2, '0')}`
    const from = dates[0] > limitIso ? dates[0] : limitIso
    let live = true
    const load = () =>
      stepsByDate(from, to)
        .then((loaded) => live && setSteps(loaded))
        .catch(() => {})
    load()
    window.addEventListener(STEPS_SYNCED, load)
    return () => {
      live = false
      window.removeEventListener(STEPS_SYNCED, load)
    }
  }, [days])

  // Las kcal de cada día entrenado de esta semana (Marcador: «ESTA SEMANA ·
  // kcal»). No hay petición por rango: como mucho siete días, en paralelo, y
  // uno que no contesta se queda sin cifra en vez de tumbar la lista.
  const [kcal, setKcal] = useState({})
  useEffect(() => {
    if (!days || days.length === 0) return undefined
    const semana = isoWeekStart(todayISO())
    const fechas = [...new Set(days.map((d) => d.date).filter((d) => d >= semana))]
    let vivo = true
    Promise.all(
      fechas.map((f) =>
        Promise.resolve()
          .then(() => getFoodDay(f))
          .then((dia) => [f, dia?.totals?.kcal ?? null])
          .catch(() => [f, undefined]),
      ),
    ).then((pares) => vivo && setKcal(Object.fromEntries(pares.filter(([, k]) => k !== undefined))))
    return () => {
      vivo = false
    }
  }, [days])

  useEffect(() => () => clearTimeout(pressTimer.current), [])

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
      onOpenWorkout(workout.id, workout)
    } catch {
      setError('No se pudo empezar el entreno.')
    } finally {
      setCreating(false)
    }
  }

  // «Empezar entreno» desde el widget del APK: lo mismo que el botón de aquí
  // arriba, en cuanto se sabe si hoy ya hay entreno. Una sola vez por orden.
  useEffect(() => {
    if (!startOnArrival || days === null) return
    onStarted()
    if (todaySession) onOpenWorkout(todaySession.id, todaySession)
    else startToday()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startOnArrival, days])

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
    } catch (err) {
      // Already gone is what deleting asked for, not a failure to report.
      if (err?.status !== 404) {
        setError('No se pudo borrar ese día.')
        return
      }
    }
    // Its workouts went with it: nothing the phone kept of them is owed to
    // anyone, and in the APK the widget may still be pointing at one.
    const gone = days.find((d) => d.id === id)
    gone?.workouts.forEach((w) => forgetWorkout(w.id))
    setDays((list) => list.filter((d) => d.id !== id))
  }

  // No session name on the button. The row already says which session is open —
  // that is what `EN CURSO` is for — and carrying it here meant a label that had
  // to ellipsise the moment a session was called something descriptive.
  // El esqueleto de la lista, con su umbral: por debajo de un cuarto de
  // segundo no se dibuja nada, porque un bloque gris que parpadea se lee como
  // un fallo de pintado y no como una espera.
  const waiting = useWaitFlag(days === null)


  const currentWeek = isoWeekStart(todayISO())
  // The week you are in always has a rule, whether or not anything is written
  // under it: a Monday with nothing logged is the one morning the question
  // "what should today be" is live. Everything older than last week folds —
  // `daysHistory.js` says how far.
  const history = days ? buildHistory(days, todayISO()) : null

  function renderSession(day, w, isPast) {
    // The one state the list could not express: a session still running. It
    // takes the slot the duration would have, and they are mutually exclusive
    // by construction — an open session has no length to report yet.
    const live = day.date === todayISO() && !sessionLength(w)
    const took = sessionMinutes(w)
    const counts = muscleCounts(w.sets)
    const max = Math.max(1, ...Object.values(counts))
    const named = MUSCLE_GROUPS.filter((g) => counts[g]).sort((a, b) => counts[b] - counts[a])
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
              <span className="day-session-name">{w.name || autoWorkoutName(w.sets) || 'Entreno'}</span>
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
                {/* Ten fixed cells, one per muscle and always in the same
                    place, lit by how many series it took. «Pecho +2» named the
                    biggest group and hid the rest behind a count nobody could
                    read; here the position is the name, taught once by the
                    week's panel, and a column of rows reads as a pattern. */}
                <span
                  className="day-cells"
                  role="img"
                  aria-label={
                    named.length
                      ? named.map((g) => `${g} ${counts[g]}`).join(', ')
                      : 'Sin grupo muscular'
                  }
                >
                  {MUSCLE_GROUPS.map((g) => (
                    <span
                      key={g}
                      className={`day-cell${counts[g] ? '' : ' is-empty'}`}
                      data-group={g}
                      data-sets={counts[g] || 0}
                      style={counts[g] ? { background: cellFill(g, counts[g], max) } : undefined}
                    />
                  ))}
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
            aria-label={`Repetir ${w.name || autoWorkoutName(w.sets) || 'Entreno'}`}
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

  // The days of a week, as the list has always drawn them: date in the gutter,
  // sessions hanging off it. Rest markers only inside the week you are still
  // filling — a week that is over has gaps you can't act on, and the folded
  // rows already draw its seven days.
  function renderDays(week, withRest) {
    return week.days.map((day, i) => {
              const previous = week.days[i - 1]
              const rest =
                withRest && previous ? restBetween(previous.date, day.date) : null
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
                    {(steps[day.date] != null || day.date in kcal) && (
                      <p className="day-steps">
                        {[
                          steps[day.date] != null && formatSteps(steps[day.date]),
                          // `null` no es 0: sin kcal medidas, la raya.
                          day.date in kcal && `${kcal[day.date] == null ? '—' : conPunto(kcal[day.date])} kcal`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
              )
    })
  }

  // A finished week, per muscle: the ten cells with their names and series.
  function renderWeekMuscles(week) {
    if (week.sets === 0 || Object.keys(week.muscles).length === 0) return null
    const max = Math.max(...Object.values(week.muscles))
    return (
      <div className="week-muscles">
        {MUSCLE_GROUPS.map((g) => {
          const n = week.muscles[g] || 0
          return (
            <span className="wm" key={g}>
              <span className="wm-name">{ABBR(g)}</span>
              <span
                className={`wm-cell${n ? '' : ' is-empty'}`}
                style={n ? { background: cellFill(g, n, max) } : undefined}
              />
              <span className="wm-count">{n || ''}</span>
            </span>
          )
        })}
      </div>
    )
  }

  // An older week, folded to one row: its dates, a tick per day from Monday to
  // Sunday painted with that day's main muscle, its series. Tapping it opens the
  // week in place. A week with nothing in it says so and opens nothing.
  function renderWeekRow(week) {
    if (week.sessions === 0) {
      return (
        <div className="hist-week is-empty" key={week.key}>
          <span className="hist-range">{week.range}</span>
          <span className="hist-none">Sin entrenos</span>
        </div>
      )
    }
    const open = expanded.has(`w:${week.key}`)
    return (
      <div className={`hist-week-wrap${open ? ' is-open' : ''}`} key={week.key}>
        <button
          type="button"
          className="hist-week"
          aria-expanded={open}
          onClick={() => toggle(`w:${week.key}`)}
        >
          <span className="hist-range">{week.range}</span>
          <span className="hist-ticks" aria-hidden="true">
            {week.ticks.map((part, i) => (
              <span
                key={i}
                className={`hist-tick${part === CARDIO ? ' is-cardio' : ''}${part ? '' : ' is-off'}`}
                data-group={part ?? undefined}
                style={tickStyle(part)}
              />
            ))}
          </span>
          <span className="hist-sets">{week.sets}</span>
          <span className="hist-chevron" aria-hidden="true">›</span>
        </button>
        {open && (
          <div className="week hist-open">
            {renderWeekMuscles(week)}
            {renderDays(week, false)}
          </div>
        )}
      </div>
    )
  }

  // A month (or a year) further back, folded to one row: how many sessions and
  // series. A month opens into its weeks, a year into its months.
  function renderFoldRow(item, kind) {
    const open = expanded.has(`${kind}:${item.key}`)
    return (
      <div className={`hist-fold-wrap${open ? ' is-open' : ''}`} key={`${kind}:${item.key}`}>
        <button
          type="button"
          className="hist-fold"
          aria-expanded={open}
          onClick={() => toggle(`${kind}:${item.key}`)}
        >
          <span className="hist-fold-name">{item.label}</span>
          <span className="hist-totals">{monthTotals(item)}</span>
          <span className="hist-chevron" aria-hidden="true">›</span>
        </button>
        {open && (
          <div className="hist-fold-body">
            {kind === 'y'
              ? item.months.map((m) => renderFoldRow(m, 'm'))
              : item.weeks.map(renderWeekRow)}
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="days">
      {/* Entrenar se empieza desde Hoy; aquí sólo queda anotar un día pasado,
          con el «+» junto al titular. */}
      <header className="days-head">
        <h1 className="days-title">Historial</h1>
        <button
          type="button"
          className="days-add"
          aria-label="Anotar otra fecha"
          aria-expanded={backfill}
          onClick={() => setBackfill(true)}
        >
          +
        </button>
      </header>
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
              «Entrenar», en Hoy, abre la primera sesión. Al cerrarla, aparece aquí con su fecha,
              sus músculos y sus series.
            </p>
          </div>
        </div>
      ) : (
        <>
          {history.detailed.map((week) => (
            <div className="week" key={week.key}>
              {/* One rule per week, the one you are in included, naming it and
                  totalling it. A finished week also gets its muscles once,
                  under the rule — the panel that teaches what each cell in the
                  rows below stands for. The week in progress doesn't: it is
                  still filling, and mid-session it is not a reading you use. */}
              <div className="week-head">
                <span className="week-label">{week.label}</span>
                <span className="week-totals">{weekTotals(week)}</span>
              </div>
              {week.key !== currentWeek && renderWeekMuscles(week)}
              {renderDays(week, week.key === currentWeek)}
            </div>
          ))}
          {history.months.filter((m) => m.open).map((month) => (
            <section className="hist-month" key={month.key}>
              {/* The month's name rides the top of the screen while its weeks
                  scroll under it: deep in the list, "where am I" is a month. */}
              <div className="hist-month-head">
                <h2 className="hist-month-name">{month.label}</h2>
                <span className="hist-totals">{monthTotals(month)}</span>
              </div>
              {month.weeks.map(renderWeekRow)}
            </section>
          ))}
          {(history.months.some((m) => !m.open) || history.years.length > 0) && (
            <section className="hist-month">
              <div className="hist-month-head">
                <h2 className="week-label hist-before">ANTES</h2>
              </div>
              {history.months.filter((m) => !m.open).map((m) => renderFoldRow(m, 'm'))}
              {history.years.map((y) => renderFoldRow(y, 'y'))}
            </section>
          )}
        </>
      )}

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
