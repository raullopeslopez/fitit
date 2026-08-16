import { useEffect, useMemo, useState } from 'react'

import Wordmark from './Wordmark.jsx'
import {
  cardsForBoot,
  ESCAPE_AFTER_MS,
  progressPct,
  ROTATE_MS,
} from './coldstart.js'
import { muscleColor } from './muscles.js'
import { getRestSeconds } from './prefs.js'

// Fine enough for a 4px bar to move without a repaint per frame.
const TICK_MS = 250

export default function ColdStart({ phase, attempt, onRetry, onLocal }) {
  const [elapsed, setElapsed] = useState(0)

  // A retry starts the wait over: the bar goes back to the left and the cards
  // start again from the session, not halfway through the volume.
  useEffect(() => {
    setElapsed(0)
    if (phase !== 'waiting') return undefined
    const id = setInterval(() => setElapsed((ms) => ms + TICK_MS), TICK_MS)
    return () => clearInterval(id)
  }, [phase, attempt])

  const cards = useMemo(() => cardsForBoot({ restSeconds: getRestSeconds() }), [attempt])

  if (phase === 'failed') {
    return (
      <div className="container cold">
        <header className="cold-brand">
          <Wordmark />
        </header>
        <h2 className="cold-fail-title">No hemos podido cargar tu sesión</h2>
        {/* Not `.alert`: red is the app's destructive colour, and a sentence
            whose whole job is to calm you down should not be painted in it. */}
        <p className="cold-note" role="alert">
          Tu historial y tus marcas están intactos: nada de lo que has registrado se pierde.
        </p>
        <div className="cold-actions">
          <button type="button" className="btn-full" onClick={onRetry}>
            Volver a intentarlo
          </button>
          <button type="button" className="secondary btn-full" onClick={onLocal}>
            Empezar a registrar ya
          </button>
        </div>
        <p className="hint">
          No pierdas el entreno por esto: apunta las series en el móvil y se suben solas cuando
          vuelva la conexión.
        </p>
      </div>
    )
  }

  const card = cards[Math.floor(elapsed / ROTATE_MS) % cards.length]
  const width = `${progressPct(elapsed).toFixed(1)}%`

  return (
    <div className="container cold">
      <header className="cold-brand">
        <Wordmark />
      </header>

      {/* aria-busy, not a live region: the cards turn every 4.5 s and a screen
          reader that announced each one would talk over the user for a minute. */}
      <section className="card cold-card" aria-busy="true">
        <span className="cold-kicker">{card.kicker}</span>

        {/* Keyed on the card so React remounts it and the entry animation runs
            again — the fade is what makes a turn read as a turn. */}
        <div className="cold-slide" key={card.id}>
          <h2 className="cold-title">
            {card.muscle ? (
              <span
                className="dot cold-dot"
                style={{ '--chip': muscleColor(card.muscle) }}
                aria-hidden="true"
              />
            ) : null}
            {card.title}
          </h2>
          <p className="cold-text">{card.body}</p>
        </div>

        {card.stat ? (
          <p className={`cold-stat tone-${card.tone}`}>
            <span className="cold-stat-value">{card.stat}</span>
            <span className="cold-stat-label">{card.statLabel}</span>
          </p>
        ) : (
          <p className="cold-stat" />
        )}

        <div className="cold-bar" aria-hidden="true">
          <div className="cold-bar-fill" style={{ width }} />
          <div className="cold-bar-sweep" />
        </div>
      </section>

      <div className="cold-dots" aria-hidden="true">
        {cards.map((c) => (
          <span key={c.id} className={`cold-tick${c.id === card.id ? ' is-on' : ''}`} />
        ))}
      </div>

      {elapsed >= ESCAPE_AFTER_MS ? (
        <div className="cold-escape">
          <p className="hint">Aún preparando tu sesión. Puedes empezar sin esperar.</p>
          <button type="button" className="secondary btn-full" onClick={onLocal}>
            Empezar a registrar ya
          </button>
        </div>
      ) : null}
    </div>
  )
}
