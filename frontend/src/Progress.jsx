import { useEffect, useState } from 'react'

import { listDays, listExercises, renameExercise, setExerciseMuscle } from './api.js'
import { downloadCsv } from './csv.js'
import { formatMonth, formatRange } from './format.js'
import Heatmap from './Heatmap.jsx'
import { MUSCLE_GROUPS, muscleColor } from './muscles.js'
import { recordLadder, sessionsPerPeriod, setsPerMuscle } from './stats.js'
import { showKg } from './units.js'

// Nobody types "Máq." with the accent on a phone keyboard, and nobody
// capitalises a search. Fold both away before comparing.
const fold = (s) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// The climb of one lift: only the sessions where it actually went up. A step,
// not a slope — nothing here is interpolated, so every corner is a day you did
// it. The estimated-1RM curve this replaces drew a line through days you were
// only maintaining, which reads as progress that never happened.
function Ladder({ rungs, color }) {
  const W = 320
  const H = 130
  const padL = 10
  const padR = 14
  const padT = 16
  const padB = 26
  const weights = rungs.map((r) => r.weight)
  const min = Math.min(...weights)
  const max = Math.max(...weights)
  const span = max - min || 1
  const t = (iso) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).getTime()
  }
  const first = t(rungs[0].date)
  const timeSpan = t(rungs.at(-1).date) - first || 1
  const x = (rung) =>
    rungs.length === 1
      ? padL + (W - padL - padR) / 2
      : padL + ((t(rung.date) - first) / timeSpan) * (W - padL - padR)
  const y = (weight) => padT + (1 - (weight - min) / span) * (H - padT - padB)

  // Hold the old mark until the day the new one landed, then step up.
  const line = rungs
    .flatMap((rung, i) => (i === 0 ? [[padL, y(rung.weight)]] : [
      [x(rung), y(rungs[i - 1].weight)],
      [x(rung), y(rung.weight)],
    ]))
    .map(([px, py]) => `${px},${py}`)
    .join(' ')

  // A month tick only where the month changes, so the axis stays legible.
  const ticks = rungs.filter(
    (rung, i) => i === 0 || rung.date.slice(0, 7) !== rungs[i - 1].date.slice(0, 7),
  )

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Récords reales">
      <line
        x1="0"
        x2={W}
        y1={H - padB + 4}
        y2={H - padB + 4}
        stroke="var(--border)"
        strokeWidth="1"
      />
      {rungs.length > 1 && <polyline fill="none" stroke={color} strokeWidth="2" points={line} />}
      {rungs.map((rung, i) => {
        const isLast = i === rungs.length - 1
        // A label past the middle of the chart is hung to the left of its point,
        // or it runs off the edge — the last rung sits on the right border by
        // construction, so its label always would.
        const inwards = x(rung) > W * 0.55
        return (
          <g key={rung.date}>
            <circle cx={x(rung)} cy={y(rung.weight)} r="4" fill={isLast ? 'var(--pr)' : color} />
            <text
              x={inwards ? x(rung) - 8 : x(rung) + 6}
              y={y(rung.weight) - 6}
              textAnchor={inwards ? 'end' : 'start'}
              fontSize={isLast ? 11 : 10}
              fontWeight={isLast ? 600 : 400}
              fill={isLast ? 'var(--text)' : 'var(--muted)'}
              fontFamily="var(--font-mono)"
            >
              {showKg(rung.weight)} × {rung.reps}
            </text>
          </g>
        )
      })}
      {ticks.map((rung) => (
        <text
          key={`t${rung.date}`}
          x={x(rung)}
          y={H - 4}
          fontSize="9"
          fill="var(--muted)"
          fontFamily="var(--font-mono)"
        >
          {formatMonth(rung.date).slice(0, 3)}
        </text>
      ))}
    </svg>
  )
}

// Sets per muscle over a week or a month, with the arrows to walk back through
// them. The question is "am I training what I think I'm training", so the bar
// compares groups and the delta is the only thing wearing a colour.
function PeriodSummary({ days }) {
  const [period, setPeriod] = useState('month')
  const [index, setIndex] = useState(0)
  const periods = sessionsPerPeriod(days, period)
  const at = Math.min(index, periods.length - 1)
  const current = periods[at]
  const previous = periods[at + 1]
  const summary = setsPerMuscle(days, { period, index: at })
  const byMonth = period === 'month'
  const widest = Math.max(...summary.rows.map((r) => r.sets), 1)

  function switchTo(mode) {
    setPeriod(mode)
    // A period index means nothing across modes: week 3 is not month 3.
    setIndex(0)
  }

  const title = byMonth
    ? capitalize(formatMonth(current.start))
    : at === 0
      ? 'Esta semana'
      : formatRange(current.start, current.end)

  const subtitle = byMonth
    ? `${plural(current.sessions, 'entreno', 'entrenos')} · ${current.perWeek}/semana`
    : `${plural(current.sessions, 'entreno', 'entrenos')} · ${plural(summary.sets, 'serie', 'series')}`

  const footer = byMonth
    ? [previous && `vs. ${formatMonth(previous.start)}`, 'media de series por semana']
        .filter(Boolean)
        .join(' · ')
    : [
        formatRange(current.start, current.end),
        at === 0 && 'en curso',
        previous && 'vs. semana anterior',
      ]
        .filter(Boolean)
        .join(' · ')

  return (
    <div className="card">
      <div className="sum-head">
        <div className="sum-nav">
          <button
            type="button"
            className="secondary set-action sum-arrow"
            aria-label="Periodo anterior"
            disabled={at + 1 >= periods.length}
            onClick={() => setIndex(at + 1)}
          >
            ‹
          </button>
          <h2>{title}</h2>
          <button
            type="button"
            className="secondary set-action sum-arrow"
            aria-label="Periodo siguiente"
            disabled={at === 0}
            onClick={() => setIndex(at - 1)}
          >
            ›
          </button>
        </div>
        <div className="sum-seg">
          {[
            ['week', 'Semana'],
            ['month', 'Mes'],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`chip${period === mode ? ' is-active' : ''}`}
              aria-pressed={period === mode}
              onClick={() => switchTo(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="hint sum-sub">{subtitle}</p>

      {summary.rows.length === 0 ? (
        <p className="hint">Nada registrado en este periodo.</p>
      ) : (
        <div className="sum-rows">
          {summary.rows.map((row) => (
            <div className="sum-row" key={row.group}>
              <span className="sum-name">{row.group}</span>
              <span className="sum-bar">
                <span
                  className="sum-fill"
                  style={{
                    width: `${Math.round((row.sets / widest) * 100)}%`,
                    '--chip': muscleColor(row.group),
                  }}
                />
              </span>
              {/* No "series" in month mode: the footer already says these are
                  weekly averages of sets, and spelling it out per row wrapped
                  the column onto two lines. */}
              <span className="sum-val">
                {byMonth ? `${row.perWeek}/sem` : plural(row.sets, 'serie', 'series')}
              </span>
              {/* Only when there is something to compare with. Against an empty
                  period every delta is just the row's own value again. A group
                  that held steady gets "=", not a fake +0. */}
              {previous && (
                <span
                  className={`sum-delta${row.delta === 0 ? ' flat' : row.delta < 0 ? ' down' : ''}`}
                >
                  {row.delta === 0
                    ? '='
                    : row.delta > 0
                      ? `+${row.delta}`
                      : `−${Math.abs(row.delta)}`}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="hint sum-foot">{footer}</p>
    </div>
  )
}

// Sets logged per exercise, from the days feed — used to pick sensible defaults
// and order chips by how much you actually train each lift.
function frequencies(days) {
  const counts = {}
  for (const day of days) {
    for (const workout of day.workouts) {
      for (const set of workout.sets) {
        counts[set.exercise_name] = (counts[set.exercise_name] || 0) + 1
      }
    }
  }
  return counts
}

export default function Progress() {
  const [exercises, setExercises] = useState([]) // [{ name, muscle_group }]
  const [days, setDays] = useState([]) // the whole log; everything here is derived from it
  const [freq, setFreq] = useState({})
  // Two jobs, two states. One `name` doing both meant the charted lift was
  // printed as the card title, as the field's value and as the active chip —
  // the same string three times, twice within a thumb's width.
  const [name, setName] = useState('') // the currently charted lift
  const [query, setQuery] = useState('') // what you are typing to find one
  const [muscle, setMuscle] = useState(null) // selected muscle filter
  const [error, setError] = useState('')
  const [editingName, setEditingName] = useState(false) // inline rename open?
  const [nameDraft, setNameDraft] = useState('')
  // Rename and re-tag are corrections, the same shape as the ones on an
  // exercise card: rare, and they were sitting inside the content.
  const [showFixes, setShowFixes] = useState(false)

  const muscleOf = (lift) => exercises.find((e) => e.name === lift)?.muscle_group ?? null

  useEffect(() => {
    listExercises()
      .then((list) =>
        setExercises(list.map((e) => ({ id: e.id, name: e.name, muscle_group: e.muscle_group }))),
      )
      .catch(() => {})
  }, [])

  // Rename in place. The row keeps its id, so past sets, history and records all
  // follow; we update locally and re-point `name` at the renamed lift so the chart
  // and chips stay on it. A blank or unchanged name just closes the editor.
  async function renameCurrent(id, draft) {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === name) {
      setEditingName(false)
      return
    }
    try {
      const updated = await renameExercise(id, trimmed)
      setExercises((list) => list.map((e) => (e.id === id ? { ...e, name: updated.name } : e)))
      setName(updated.name)
      setEditingName(false)
    } catch {
      setError('No se pudo cambiar el nombre. ¿Ya existe otro con ese nombre?')
    }
  }

  // Fix a mis-guessed group; the classifier is only a default. Updates locally so
  // the chips regroup and the chart recolours immediately.
  async function changeMuscle(id, group) {
    try {
      const updated = await setExerciseMuscle(id, group || null)
      setExercises((list) =>
        list.map((e) => (e.id === id ? { ...e, muscle_group: updated.muscle_group } : e)),
      )
      setMuscle(updated.muscle_group)
    } catch {
      setError('No se pudo cambiar el grupo.')
    }
  }

  useEffect(() => {
    // Open on your most-trained lift, and select its muscle.
    listDays()
      .then((loaded) => {
        setDays(loaded || [])
        const counts = frequencies(loaded || [])
        setFreq(counts)
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
        if (top) selectLift(top[0])
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Charting is now a local act: the ladder comes out of the log we already
  // hold, so picking a lift costs nothing and can't fail.
  function selectLift(lift) {
    const trimmed = lift.trim()
    if (!trimmed) return
    setName(trimmed)
    // The box is for finding, not for holding what you found: the card title
    // and the active chip already say where you are.
    setQuery('')
    setMuscle(muscleOf(trimmed))
    setEditingName(false)
    setError('')
  }

  // Picking a known lift charts it immediately, the way the chips already did.
  // Making the text field alone demand a tap on a submit button was two paths
  // for one job, one of them with a confirmation step and one without.
  function handleNameInput(value) {
    setQuery(value)
    // An exact name still charts straight away, so autocomplete and paste work.
    const match = exercises.find((e) => fold(e.name) === fold(value))
    if (match) selectLift(match.name)
  }

  const liftsForMuscle = (m) =>
    exercises
      .filter((e) => e.muscle_group === m)
      .map((e) => e.name)
      .sort((a, b) => (freq[b] || 0) - (freq[a] || 0))

  function selectMuscle(m) {
    setMuscle(m)
    const top = liftsForMuscle(m)[0]
    if (top) selectLift(top)
  }

  // Only show chips for muscles you actually have exercises in, in canonical order.
  const musclesPresent = MUSCLE_GROUPS.filter((m) => exercises.some((e) => e.muscle_group === m))
  const chartColor = muscleColor(muscleOf(name))
  const current = exercises.find((e) => e.name === name)
  const rungs = name ? recordLadder(days, name) : []
  const gain = rungs.length > 1 ? rungs.at(-1).weight - rungs[0].weight : 0
  // What you typed, matched by substring. The native <datalist> this replaces
  // was a suggestion the browser showed when it felt like it, and never on a
  // phone — so "gemelo" found nothing and said nothing.
  const matches = query.trim()
    ? exercises.filter((e) => fold(e.name).includes(fold(query))).slice(0, 8)
    : []

  return (
    <section>
      {days.length > 0 && <Heatmap days={days} />}

      {/* Not gated on exercises having loaded: the search box below is typeable
          the instant the screen mounts, so it must be on screen the instant the
          screen mounts. Gating the whole card on `exercises.length` held the
          box hostage to a request that hadn't resolved yet. */}
      <div className="card">
        <h2>Evolución</h2>
        {/* The chips drive this card's chart, so they live in it. Down in the
            search card you had to scroll past the chart to change what it was
            about. Seven memorised groups can hide behind a swipe; the names
            you are hunting for cannot, which is why the box stays below. */}
        {musclesPresent.length > 0 && (
          <div className="muscle-chips">
            {musclesPresent.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip muscle-chip${muscle === m ? ' is-active' : ''}`}
                style={{ '--chip': muscleColor(m) }}
                aria-pressed={muscle === m}
                onClick={() => (muscle === m ? setMuscle(null) : selectMuscle(m))}
              >
                <span className="dot" aria-hidden="true" />
                {m}
              </button>
            ))}
          </div>
        )}
        {/* Name + group editing lives here regardless of whether there's a
            chart: you must be able to rename a cardio or brand-new lift too,
            not just one with records. Folded, because both are rare
            corrections and this card is content. */}
        {current && (
          <>
            {/* The name titles the card — a chart of nothing named is a chart
                you have to go looking for the subject of — and tapping it is
                how you rename it. */}
            {editingName ? (
              <form
                className="exercise-rename chart-title"
                onSubmit={(e) => {
                  e.preventDefault()
                  renameCurrent(current.id, nameDraft)
                }}
              >
                <input
                  aria-label="Nombre del ejercicio"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={120}
                  autoFocus
                />
                <button type="submit" className="secondary set-action">
                  Guardar nombre
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="chart-title"
                aria-label={`Renombrar ${current.name}`}
                onClick={() => {
                  setNameDraft(current.name)
                  setEditingName(true)
                }}
              >
                <span className="dot" aria-hidden="true" style={{ '--chip': chartColor }} />
                <h2>{current.name}</h2>
              </button>
            )}
          </>
        )}
        {rungs.length === 0 ? (
          /* Three different silences. Nothing picked yet; a known lift with no
             records (cardio, or one you have only ever done at the same
             weight); and an unknown name — telling someone "no data" for that
             one blames the log for a name that was never in it. */
          <p className="hint">
            {name === ''
              ? 'Elige un músculo o busca un ejercicio.'
              : current
                ? 'Aún no hay datos para graficar este ejercicio.'
                : 'No hay ningún ejercicio con ese nombre.'}
          </p>
        ) : (
          <>
            <Ladder rungs={rungs} color={chartColor} />
            <p className="chart-caption muted">
              {name} · solo récords reales
              {gain > 0 && (
                <>
                  {' · '}
                  <span className="mono" style={{ color: 'var(--pr)' }}>
                    +{showKg(gain)} kg
                  </span>{' '}
                  desde {formatMonth(rungs[0].date)}
                </>
              )}
            </p>
          </>
        )}
        {/* The box finds what the chips can't reach: everything that isn't
            the most-trained lift of its group. One card, one job — a lift
            picked here or from the chips ends up on the same chart, so
            picking it shouldn't mean leaving the card that draws it. */}
        <form
          className="exercise-search"
          onSubmit={(e) => {
            e.preventDefault()
            // The go key takes the first thing you found, or the raw text so
            // a name that matches nothing gets told so.
            selectLift(matches[0]?.name ?? query)
          }}
        >
          <div className="field">
            <label htmlFor="progress-exercise">Ejercicio</label>
            <input
              id="progress-exercise"
              value={query}
              onChange={(e) => handleNameInput(e.target.value)}
              placeholder="Buscar…"
            />
          </div>
          {matches.length > 0 && (
            <ul className="search-results">
              {matches.map((e) => (
                <li key={e.id}>
                  <button type="button" className="set-row" onClick={() => selectLift(e.name)}>
                    <span
                      className="dot"
                      aria-hidden="true"
                      style={{ '--chip': muscleColor(e.muscle_group) }}
                    />
                    {e.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
        {/* At the foot of the card, per DESIGN.md — between the title and the
            chart it read as a second heading on the thing you came to look
            at. Renaming and re-tagging are corrections, not content. */}
        {current && (
          <>
            <button
              type="button"
              className="unit-fix fixes-toggle"
              aria-expanded={showFixes}
              onClick={() => setShowFixes((v) => !v)}
            >
              Corregir
            </button>
            {showFixes && (
              <div className="card-fixes">
                <div className="muscle-edit">
                  <label htmlFor="muscle-select" className="muscle-edit-label">
                    Grupo
                  </label>
                  <select
                    id="muscle-select"
                    value={current.muscle_group ?? ''}
                    onChange={(e) => changeMuscle(current.id, e.target.value)}
                  >
                    <option value="">Sin grupo</option>
                    {MUSCLE_GROUPS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {days.length > 0 && <PeriodSummary days={days} />}

      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}

      {/* Exporting belongs with the numbers it exports, and it is the rarest
          thing on this screen — so it sits at the bottom of it. */}
      {days.length > 0 && (
        <div className="export-row">
          <button type="button" className="secondary" onClick={() => downloadCsv(days)}>
            Exportar CSV
          </button>
        </div>
      )}
    </section>
  )
}
