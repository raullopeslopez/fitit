import { useEffect, useState } from 'react'

import { getExerciseHistory, listDays, listExercises, setExerciseMuscle } from './api.js'
import { formatDate } from './format.js'
import { MUSCLE_GROUPS, muscleColor } from './muscles.js'

function Chart({ points, color }) {
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
        <strong>1RM estimado</strong>
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
          PR {max}
        </text>
        <text x={padL - 6} y={y(min)} textAnchor="end" dominantBaseline="middle" fontSize="9"
          fill="var(--muted)" fontFamily="var(--font-mono)">
          {min}
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
  const [freq, setFreq] = useState({})
  const [name, setName] = useState('') // search box + the currently charted lift
  const [muscle, setMuscle] = useState(null) // selected muscle filter
  const [points, setPoints] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
    setMuscle(muscleOf(q))
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
  const topLifts = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([n]) => n)
  const shownLifts = muscle ? liftsForMuscle(muscle) : topLifts
  const chartColor = muscleColor(muscleOf(name))
  const current = exercises.find((e) => e.name === name)

  return (
    <section>
      <form className="card" onSubmit={(e) => {
        e.preventDefault()
        loadHistory(name)
      }}>
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
            list="progress-options"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="p. ej. Press banca"
          />
          <datalist id="progress-options">
            {exercises.map((e) => (
              <option key={e.name} value={e.name} />
            ))}
          </datalist>
        </div>
        {shownLifts.length > 0 && (
          <div className="lift-chips">
            {shownLifts.map((lift) => (
              <button
                key={lift}
                type="button"
                className={`chip${name === lift ? ' is-active' : ''}`}
                style={{ '--chip': muscleColor(muscleOf(lift)) }}
                onClick={() => loadHistory(lift)}
              >
                <span className="dot" aria-hidden="true" />
                {lift}
              </button>
            ))}
          </div>
        )}
        <button type="submit" className="btn-full" disabled={loading}>
          {loading ? 'Cargando…' : 'Ver progreso'}
        </button>
      </form>

      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}

      {points !== null &&
        (points.length === 0 ? (
          <p className="hint">Aún no hay datos para este ejercicio.</p>
        ) : (
          <div className="card">
            {current && (
              <div className="muscle-edit">
                <span className="dot" aria-hidden="true" style={{ '--chip': chartColor }} />
                <span className="muscle-edit-name">{current.name}</span>
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
            )}
            <Chart points={points} color={chartColor} />
          </div>
        ))}
    </section>
  )
}
