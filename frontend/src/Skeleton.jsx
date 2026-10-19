import { useEffect, useRef, useState } from 'react'


/* Lo que Fitit enseña mientras el dato no ha llegado.
 *
 * Antes era la palabra `Cargando…`, que dice que la app está viva y nada más:
 * no reserva la altura de lo que viene, no dice qué pantalla es, y en Progreso
 * ni siquiera existía —la tarjeta simplemente no estaba hasta que el log
 * contestaba, así que la pantalla entraba en blanco y saltaba entera.
 *
 * El esqueleto dibuja el armazón, no el contenido: lo que la app sabe sin
 * preguntarle a nadie —la regla de la semana, las columnas de Progreso, la
 * franja del carril, la vuelta a Días— se pinta de verdad, y el bloque gris se
 * queda sólo para lo que trae el servidor. Cada bloque mide lo que va a medir
 * el dato, para que al llegar la respuesta no salte nada bajo el pulgar.
 */

// Por debajo de esto no aparece: un bloque gris que parpadea 80ms se lee como
// un fallo de pintado, no como una espera. Y una vez dibujado se queda su
// mínimo, porque cambiarlo por el contenido 30ms después es el mismo parpadeo
// visto desde el otro lado.
export const SHOW_AFTER_MS = 250
export const MIN_ON_MS = 400

export function useWaitFlag(pending, { delay = SHOW_AFTER_MS, min = MIN_ON_MS } = {}) {
  const [show, setShow] = useState(false)
  const shownAt = useRef(0)

  useEffect(() => {
    if (pending) {
      if (show) return undefined
      const id = setTimeout(() => {
        shownAt.current = Date.now()
        setShow(true)
      }, delay)
      return () => clearTimeout(id)
    }
    if (!show) return undefined
    const left = min - (Date.now() - shownAt.current)
    if (left <= 0) {
      setShow(false)
      return undefined
    }
    const id = setTimeout(() => setShow(false), left)
    return () => clearTimeout(id)
  }, [pending, show, delay, min])

  return show
}

// La pieza. `w`/`h` en px porque son medidas de lo que sustituyen —la altura de
// una línea real, el ancho de una cifra de dos dígitos—, no pasos de una escala.
function Bar({ w, h, strong = false, style }) {
  return (
    <span className={`sk${strong ? ' sk-hi' : ''}`} style={{ width: w, height: h, ...style }} />
  )
}

const Dot = ({ size }) => <Bar w={size} h={size} style={{ borderRadius: '50%' }} />

// Tres días, siempre tres, traiga lo que traiga la respuesta: un esqueleto de
// nueve filas que colapsa a tres promete un log que no existe. Los anchos de
// los nombres varían porque los nombres varían; la cuenta de filas, no.
const DAY_NAMES = [132, 106, 148]

export function DaysSkeleton() {
  return (
    <div className="week">
      {/* La semana en la que estás la sabe el móvil sin preguntar a nadie, así
          que no es un bloque: es la misma regla que va a quedarse ahí. El total
          sí depende del log. */}
      <div className="week-head">
        <span className="week-label">ESTA SEMANA</span>
        <span className="week-totals">
          <Bar w={104} h={11} />
        </span>
      </div>
      {DAY_NAMES.map((w, i) => (
        <div className="day-slot" key={i}>
          <div className="day-block">
            <h2 className="day-date">
              <Bar w={46} h={13} />
              <Bar w={26} h={11} style={{ marginTop: 5 }} />
            </h2>
            <ul className="sets day-sessions">
              <li className="day-session-row">
                <span className="day-session">
                  <span className="day-session-main">
                    <span className="day-session-top">
                      <Bar w={w} h={13} />
                    </span>
                    <span className="day-session-bottom">
                      <span className="day-cells">
                        <Bar w={107} h={8} style={{ borderRadius: 2 }} />
                      </span>
                      <Bar w={42} h={14} strong />
                    </span>
                  </span>
                </span>
                <span className="day-repeat day-repeat-empty" aria-hidden="true" />
              </li>
            </ul>
          </div>
        </div>
      ))}
    </div>
  )
}

// El texto del botón depende del dato: `Empezar entreno` y `Continuar entreno`
// no son la misma frase, y acertar cuatro de cada cinco veces es abrir la
// quinta sesión partida en dos —justo lo que el botón existe para evitar—. Así
// que conserva su ámbar, su altura y su sitio, y no contesta al dedo.
export function CtaLabelSkeleton() {
  return (
    <span
      className="sk"
      style={{
        width: 118,
        height: 14,
        background: 'color-mix(in srgb, var(--on-accent) 30%, transparent)',
      }}
    />
  )
}

function ComposeFrame() {
  return (
    <div className="card card-compose">
      <div className="field">
        <label htmlFor="exercise-waiting">Ejercicio</label>
        <input id="exercise-waiting" placeholder="Buscar o escribir…" disabled readOnly />
      </div>
      <button type="button" className="btn-full" disabled>
        Añadir ejercicio
      </button>
    </div>
  )
}

export function WorkoutSkeleton({ onExit }) {
  return (
    <section>
      <div className="workout-head">
        {/* Lo único que sigue funcionando mientras se espera, así que es real. */}
        <button type="button" className="secondary head-back" aria-label="Volver" onClick={onExit}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        {/* El nombre sobre la fecha, centrados entre los dos botones: la misma
            caja que va a ocupar el título, para que al llegar no se mueva. */}
        <span className="workout-title" style={{ gap: 6 }}>
          <Bar w={96} h={16} />
          <Bar w={132} h={11} />
        </span>
        <div className="head-menu">
          {/* Un `button`, no un `span`: el marco de este control lo pinta
              `button.secondary`, y sin el elemento el glifo se queda desnudo. */}
          <button type="button" className="secondary set-action head-menu-btn" disabled>
            ⋯
          </button>
        </div>
      </div>

      {[158, 126].map((w, i) => (
        <div className="card card-quiet is-folded" key={i}>
          <div className="card-toggle" style={{ alignItems: 'center' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Bar w={i === 0 ? 74 : 62} h={11} />
              <Bar w={w} h={17} />
            </span>
            <span className="card-chevron" aria-hidden="true" />
          </div>
          <p className="hint card-digest">
            <Bar w={i === 0 ? 146 : 128} h={13} strong />
          </p>
        </div>
      ))}

      <ComposeFrame />
    </section>
  )
}

// La forma de la tarjeta: la cifra con su medidor de diez celdas y tres
// filas de la lista de debajo. Los números no se inventan; sólo se reserva
// su sitio.
const SUM_NAMES = [52, 64, 46]

export function SummarySkeleton() {
  return (
    <div className="card sum-card">
      <h2 className="sum-title visually-hidden">Series por músculo</h2>
      <p className="sum-sub">
        <Bar w={132} h={11} />
      </p>
      <div className="sum-tally">
        <p className="sum-tally-line">
          <Bar w={64} h={36} strong />
        </p>
        <div className="sum-meter" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className="sum-cell" />
          ))}
        </div>
      </div>
      <ul className="sum-items">
        {SUM_NAMES.map((w, i) => (
          <li className="sum-item" key={i}>
            <span className="sum-label">
              <Dot size={7} />
              <Bar w={w} h={12} />
            </span>
            <Bar w={22} h={18} strong />
          </li>
        ))}
      </ul>
    </div>
  )
}

// La forma de la lista de Ritmo: nombre y frecuencia a la izquierda, cuánto
// hace a la derecha. Sin cifras inventadas.
export function RhythmSkeleton() {
  return (
    <div className="card card-raised rhythm-card">
      <h2 className="visually-hidden">Ritmo por músculo</h2>
      <ul className="rhythm-list">
        {SUM_NAMES.map((w, i) => (
          <li className="rhythm-item" key={i}>
            <span className="rhythm-row">
              <span className="rhythm-id">
                <span className="rhythm-name">
                  <Dot size={8} />
                  <Bar w={w} h={12} />
                </span>
                <Bar w={120} h={11} />
              </span>
              <span className="rhythm-since">
                <Bar w={64} h={12} strong />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
