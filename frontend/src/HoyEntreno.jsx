import { useEffect, useState } from 'react'

import { listDays } from './api.js'
import { muscleFill } from './muscles.js'
import { setsPerMuscle } from './stats.js'
import { bandState } from './volume.js'

// Los tres músculos más lejos de su mínimo semanal (MEV), con las series que
// les faltan. Juzgados con la misma llamada que las filas de Progreso, así que
// lo que dice Hoy y lo que dice Progreso no pueden contradecirse.
export function owedThisWeek(days, max = 3) {
  const summary = setsPerMuscle(days, { period: 'week', index: 0 })
  return summary.rows
    .map((row) => ({ group: row.group, ...bandState(row.group, row.sets, row.indirect) }))
    .filter((row) => row.state === 'bajo')
    .sort((a, b) => b.gap - a.gap)
    .slice(0, max)
    .map((row) => ({ group: row.group, gap: row.gap }))
}

const conComa = (n) => String(n).replace('.', ',')

// La banda de entreno de Hoy (Marcador): qué le falta a la semana y el botón
// que te mete en el entreno de hoy — empezado o continuado — en un toque.
export default function HoyEntreno({ onTrain }) {
  const [owed, setOwed] = useState(null)

  useEffect(() => {
    let vivo = true
    listDays()
      .then((days) => vivo && setOwed(owedThisWeek(days ?? [])))
      .catch(() => vivo && setOwed([]))
    return () => {
      vivo = false
    }
  }, [])

  return (
    <section className="hoy-entreno" aria-label="Entreno">
      {owed !== null && (
        <>
          <p className="hoy-entreno-sello">
            {owed.length > 0 ? 'Esta semana te falta' : 'Esta semana, todo en zona'}
          </p>
          {owed.length > 0 && (
            <ul className="hoy-entreno-musculos">
              {owed.map((m) => (
                <li key={m.group} style={{ '--chip-fill': muscleFill(m.group) }}>
                  <span className="hoy-entreno-punto" aria-hidden="true" />
                  {m.group} <span className="hoy-entreno-falta">−{conComa(m.gap)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <button type="button" className="hoy-entreno-cta" onClick={onTrain}>
        Entrenar
        <span className="hoy-entreno-flecha" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </button>
    </section>
  )
}
