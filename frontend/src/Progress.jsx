import { useEffect, useState } from 'react'

import { getExerciseHistory, listExercises } from './api.js'
import { formatDate } from './format.js'

function Chart({ points }) {
  const W = 320
  const H = 160
  const pad = 24
  const vals = points.map((p) => p.one_rm)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const n = points.length
  const x = (i) => (n === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1))
  const y = (v) => H - pad - ((v - min) / span) * (H - 2 * pad)
  const line = points.map((p, i) => `${x(i)},${y(p.one_rm)}`).join(' ')

  return (
    <>
      <p className="chart-caption">
        <strong>1RM estimado</strong> · máx {max}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Gráfica de progreso">
        <polyline fill="none" stroke="var(--accent)" strokeWidth="2" points={line} />
        {points.map((p, i) => (
          <circle key={p.date} cx={x(i)} cy={y(p.one_rm)} r="3" fill="var(--accent)" />
        ))}
      </svg>
      <p className="chart-caption muted">
        {formatDate(points[0].date)} → {formatDate(points[n - 1].date)}
      </p>
    </>
  )
}

export default function Progress() {
  const [known, setKnown] = useState([])
  const [name, setName] = useState('')
  const [points, setPoints] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listExercises()
      .then((list) => setKnown(list.map((e) => e.name)))
      .catch(() => {})
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    const query = name.trim()
    if (!query) return
    setError('')
    setLoading(true)
    try {
      setPoints(await getExerciseHistory(query))
    } catch {
      setError('No se pudo cargar el progreso.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <form className="card" onSubmit={handleSubmit}>
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
