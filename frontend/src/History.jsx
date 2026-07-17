import { useEffect, useState } from 'react'

import { listWorkouts } from './api.js'
import { formatSet } from './format.js'

export default function History() {
  const [workouts, setWorkouts] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    listWorkouts()
      .then(setWorkouts)
      .catch(() => setError('Could not load your history.'))
  }, [])

  if (error) {
    return (
      <p role="alert" className="alert">
        {error}
      </p>
    )
  }
  if (workouts === null) {
    return <p className="hint">Loading…</p>
  }
  if (workouts.length === 0) {
    return <p className="hint">No workouts yet. Log one to see it here.</p>
  }

  return (
    <section>
      {workouts.map((w) => (
        <div className="card" key={w.id}>
          <h2>{w.name || w.date}</h2>
          <p className="set-index">
            {w.date} · {w.sets.length} set{w.sets.length === 1 ? '' : 's'}
          </p>
          {w.sets.length > 0 ? (
            <ol className="sets">
              {w.sets.map((s) => (
                <li key={s.id}>
                  <span>{s.exercise_name}</span>
                  <span>{formatSet(s)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="hint">No sets.</p>
          )}
        </div>
      ))}
    </section>
  )
}
