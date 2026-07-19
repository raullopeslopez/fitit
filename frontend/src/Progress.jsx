import { useEffect, useState } from 'react'

import { getExerciseHistory, listDays, listExercises } from './api.js'
import { formatDate } from './format.js'

function Chart({ points }) {
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
  const line = points.map((p, i) => `${x(i)},${y(p.one_rm)}`).join(' ')
  const prY = y(max)

  return (
    <>
      <p className="chart-caption">
        <strong>1RM estimado</strong>
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Gráfica de progreso">
        {/* PR reference line — the record is the scale the rest reads against. */}
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
        {/* y-axis floor so the numbers have a scale, not just a shape. */}
        <text x={padL - 6} y={y(min)} textAnchor="end" dominantBaseline="middle" fontSize="9"
          fill="var(--muted)" fontFamily="var(--font-mono)">
          {min}
        </text>
        <polyline fill="none" stroke="var(--accent)" strokeWidth="2" points={line} />
        {points.map((p, i) => (
          <circle
            key={p.date}
            cx={x(i)}
            cy={y(p.one_rm)}
            r={p.one_rm === max ? 4 : 3}
            fill={p.one_rm === max ? 'var(--pr)' : 'var(--accent)'}
          />
        ))}
      </svg>
      <p className="chart-caption muted">
        {formatDate(points[0].date)} → {formatDate(points[n - 1].date)}
      </p>
    </>
  )
}

// Most-logged lifts first, so Progreso opens with something charted instead of
// a blank field. Derived client-side from the days feed — no extra endpoint.
function topLifts(days, limit = 3) {
  const counts = {}
  for (const day of days) {
    for (const workout of day.workouts) {
      for (const set of workout.sets) {
        counts[set.exercise_name] = (counts[set.exercise_name] || 0) + 1
      }
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name)
}

export default function Progress() {
  const [known, setKnown] = useState([])
  const [lifts, setLifts] = useState([])
  const [name, setName] = useState('')
  const [selected, setSelected] = useState(null)
  const [points, setPoints] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listExercises()
      .then((list) => setKnown(list.map((e) => e.name)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    // Open on the user's most-trained lift already charted.
    listDays()
      .then((days) => {
        const top = topLifts(days || [])
        setLifts(top)
        if (top.length) loadHistory(top[0])
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadHistory(query) {
    const q = query.trim()
    if (!q) return
    setSelected(q)
    setName(q)
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

  return (
    <section>
      <form className="card" onSubmit={(e) => {
        e.preventDefault()
        loadHistory(name)
      }}>
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
            {known.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        {lifts.length > 0 && (
          <div className="lift-chips">
            {lifts.map((n) => (
              <button
                key={n}
                type="button"
                className={`chip${selected === n ? ' is-active' : ''}`}
                onClick={() => loadHistory(n)}
              >
                {n}
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
            <Chart points={points} />
          </div>
        ))}
    </section>
  )
}
