import { useEffect, useState } from 'react'

import {
  getBestMarks,
  getExerciseHistory,
  listDays,
  listExercises,
  renameExercise,
  setExerciseMuscle,
} from './api.js'
import { downloadCsv } from './csv.js'
import { formatDate } from './format.js'
import Heatmap from './Heatmap.jsx'
import { MUSCLE_GROUPS, muscleColor } from './muscles.js'
import { getWeightUnit } from './prefs.js'
import { displayWeight } from './units.js'

// Nobody types "Máq." with the accent on a phone keyboard, and nobody
// capitalises a search. Fold both away before comparing.
const fold = (s) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

// Points arrive in kilos. The geometry is computed on them directly — scale is
// scale — and only the two printed figures are converted for the reader.
function Chart({ points, color, unit }) {
  const W = 320
  const H = 180
  const padL = 40
  const padR = 16
  const padT = 16
  const padB = 28
  const vals = points.map((p) => p.one_rm)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const n = points.length
  const x = (i) =>
    n === 1 ? padL + (W - padL - padR) / 2 : padL + (i * (W - padL - padR)) / (n - 1)
  const y = (v) => padT + (1 - (v - min) / span) * (H - padT - padB)
  const linePts = points.map((p, i) => `${x(i)},${y(p.one_rm)}`).join(' ')
  const prY = y(max)

  return (
    <>
      <p className="chart-caption">
        <strong>1RM estimado · {unit}</strong>
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Gráfica de progreso">
        {/* PR reference line stays amber — the record is effort, not a muscle. */}
        <line
          x1={padL}
          x2={W - padR}
          y1={prY}
          y2={prY}
          stroke="var(--pr)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <text x={W - padR} y={prY - 4} textAnchor="end" fontSize="10" fill="var(--pr)"
          fontFamily="var(--font-mono)">
          PR {displayWeight(max, unit)}
        </text>
        <text x={padL - 6} y={y(min)} textAnchor="end" dominantBaseline="middle" fontSize="9"
          fill="var(--muted)" fontFamily="var(--font-mono)">
          {displayWeight(min, unit)}
        </text>
        {/* The trend line carries the muscle's colour. */}
        <polyline fill="none" stroke={color} strokeWidth="2" points={linePts} />
        {points.map((p, i) => (
          <circle
            key={p.date}
            cx={x(i)}
            cy={y(p.one_rm)}
            r={p.one_rm === max ? 4 : 3}
            fill={p.one_rm === max ? 'var(--pr)' : color}
          />
        ))}
      </svg>
      <p className="chart-caption muted">
        {formatDate(points[0].date)} → {formatDate(points[n - 1].date)}
      </p>
    </>
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
  const [days, setDays] = useState([]) // the days feed, for the consistency heatmap
  const [freq, setFreq] = useState({})
  // Two jobs, two states. One `name` doing both meant the charted lift was
  // printed as the card title, as the field's value and as the active chip —
  // the same string three times, twice within a thumb's width.
  const [name, setName] = useState('') // the currently charted lift
  const [query, setQuery] = useState('') // what you are typing to find one
  const [muscle, setMuscle] = useState(null) // selected muscle filter
  const [points, setPoints] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [bests, setBests] = useState([]) // best set per exercise, strongest first
  const [editingName, setEditingName] = useState(false) // inline rename open?
  const [nameDraft, setNameDraft] = useState('')
  // Rename and re-tag are corrections, the same shape as the ones on an
  // exercise card: rare, and they were sitting inside the content.
  const [showFixes, setShowFixes] = useState(false)
  // Read once: the toggle lives in Entreno, so it can't change while Progreso
  // is on screen.
  const weightUnit = getWeightUnit()

  const muscleOf = (lift) =>
    exercises.find((e) => e.name === lift)?.muscle_group ?? null

  useEffect(() => {
    listExercises()
      .then((list) =>
        setExercises(
          list.map((e) => ({ id: e.id, name: e.name, muscle_group: e.muscle_group })),
        ),
      )
      .catch(() => {})
  }, [])

  useEffect(() => {
    getBestMarks()
      .then(setBests)
      .catch(() => {}) // the rest of Progreso still works without records
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
      setExercises((list) =>
        list.map((e) => (e.id === id ? { ...e, name: updated.name } : e)),
      )
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
      .then((days) => {
        setDays(days || [])
        const counts = frequencies(days || [])
        setFreq(counts)
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
        if (top) loadHistory(top[0])
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadHistory(query) {
    const q = query.trim()
    if (!q) return
    setName(q)
    // The box is for finding, not for holding what you found: the card title
    // and the active chip already say where you are.
    setQuery('')
    setMuscle(muscleOf(q))
    setEditingName(false)
    setError('')
    setLoading(true)
    try {
      setPoints(await getExerciseHistory(q))
    } catch {
      setError('No se pudo cargar el progreso.')
    } finally {
      setLoading(false)
    }
  }

  // Picking a known lift charts it immediately, the way the chips already did.
  // Making the text field alone demand a tap on a submit button was two paths
  // for one job, one of them with a confirmation step and one without.
  function handleNameInput(value) {
    setQuery(value)
    // An exact name still charts straight away, so autocomplete and paste work.
    const match = exercises.find((e) => fold(e.name) === fold(value))
    if (match) loadHistory(match.name)
  }

  const liftsForMuscle = (m) =>
    exercises
      .filter((e) => e.muscle_group === m)
      .map((e) => e.name)
      .sort((a, b) => (freq[b] || 0) - (freq[a] || 0))

  function selectMuscle(m) {
    setMuscle(m)
    const top = liftsForMuscle(m)[0]
    if (top) loadHistory(top)
  }

  // Only show chips for muscles you actually have exercises in, in canonical order.
  const musclesPresent = MUSCLE_GROUPS.filter((m) =>
    exercises.some((e) => e.muscle_group === m),
  )
  const chartColor = muscleColor(muscleOf(name))
  const current = exercises.find((e) => e.name === name)
  // What you typed, matched by substring. The native <datalist> this replaces
  // was a suggestion the browser showed when it felt like it, and never on a
  // phone — so "gemelo" found nothing and said nothing.
  const matches = query.trim()
    ? exercises.filter((e) => fold(e.name).includes(fold(query))).slice(0, 8)
    : []

  return (
    <section>
      {days.length > 0 && <Heatmap days={days} />}

      {points !== null && (
        <div className="card">
          {/* Name + group editing lives here regardless of whether there's a
              chart: you must be able to rename a cardio or brand-new lift too,
              not just one with 1RM history. Folded, because both are rare
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
          {points.length === 0 ? (
            /* Two different failures. A known lift with no 1RM curve is cardio;
               an unknown name is a typo, and telling someone "no data" for it
               blames the log for a name that was never in it. */
            <p className="hint">
              {current
                ? 'Aún no hay datos para graficar este ejercicio.'
                : `No hay ningún ejercicio con ese nombre.`}
            </p>
          ) : (
            <Chart points={points} color={chartColor} unit={weightUnit} />
          )}
        </div>
      )}

      {/* The picker sits directly under the chart it drives, not on top of it:
          three stacked selectors above the content meant scrolling the whole
          apparatus on a phone to reach the thing you opened Progreso for. */}
      <form className="card" onSubmit={(e) => {
        e.preventDefault()
        // The go key takes the first thing you found, or the raw text so a name
        // that matches nothing gets told so.
        loadHistory(matches[0]?.name ?? query)
      }}>
        {/* Muscles filter; the box finds. A row of exercise-name chips used to
            sit under this one, doing the third version of the same job: seven
            memorised groups can hide behind a swipe, but the names you are
            hunting for cannot, and wrapped they stood taller than the chart.
            Tapping a muscle charts its top lift, so nothing got slower. */}
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
                <button type="button" className="set-row" onClick={() => loadHistory(e.name)}>
                  <span className="dot" aria-hidden="true" style={{ '--chip': muscleColor(e.muscle_group) }} />
                  {e.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {loading && <p className="hint">Cargando…</p>}
      </form>

      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}

      {bests.length > 0 && (
        <div className="card">
          <h2>Mejores marcas</h2>
          {/* The row is the way in. This list was already on screen naming your
              lifts while the only route to a chart was a box that didn't
              search — tapping the thing you can see is the shorter path. */}
          <ul className="bests">
            {bests.map((mark) => (
              <li key={mark.exercise_id}>
                <button
                  type="button"
                  className="set-row best-row"
                  aria-label={`Ver progreso de ${mark.exercise_name}`}
                  onClick={() => loadHistory(mark.exercise_name)}
                >
                  <span
                    className="dot"
                    aria-hidden="true"
                    style={{ '--chip': muscleColor(mark.muscle_group) }}
                  />
                  <span className="name">{mark.exercise_name}</span>
                  <span className="val">
                    {displayWeight(mark.weight_kg, weightUnit)} {weightUnit} × {mark.reps}
                  </span>
                  {/* A record nothing has beaten yet gets a dash, not a fake +0. */}
                  <span className={`delta${mark.delta_one_rm ? '' : ' flat'}`}>
                    {mark.delta_one_rm
                      ? `+${displayWeight(mark.delta_one_rm, weightUnit)} ${weightUnit}`
                      : '—'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
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
