import { useEffect, useState } from 'react'

import { acceptTarget, answerReview, getReview, getTargetProfile } from './api.js'
import { conMiles } from './Objetivo.jsx'

const RESPUESTAS = [
  ['all', 'Sí, todo'],
  ['most', 'Casi todo'],
  ['none', 'No'],
]

/**
 * «¿Apuntaste todo lo que comiste?», el primer paso de planificar la semana que viene.
 *
 * El gasto medido sale de lo que comiste y de lo que pesaste: una semana con
 * días a medias lo da más bajo de lo real, y proponer comer menos por eso sería
 * castigarte por no haber apuntado. Así que se pregunta, y la respuesta decide
 * si esa semana cuenta (`none` no cuenta).
 *
 * Contestar **propone, no fija** (decisión 18): el objetivo sólo cambia con
 * «Aceptar», y entonces rige desde mañana (§31) — Comida avisa del cambio en su
 * línea del objetivo. Si GET /targets/review falla no se pinta nada: una
 * pregunta que no llega no puede bloquear el diario.
 *
 * Va con planificar y no con un día de la semana: el objetivo tiene que estar
 * decidido antes de generar la semana y comprar con ella, y el día de compra
 * cambia. El servidor dice `due` si hace una semana de la última respuesta.
 *
 * `onDone` avisa de que el paso ha acabado, por la vía que sea —contestada,
 * mantenida, aceptada, o porque no tocaba o no llegó— y el flujo sigue.
 */
export default function RevisionSemanal({ onAccepted, onDone = () => {} }) {
  // 'cargando' | 'oculta' | 'pregunta' | { propuesta, actual } | 'no'
  const [fase, setFase] = useState('cargando')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await getReview()
        if (!vivo) return
        setFase(r?.due ? 'pregunta' : 'oculta')
        if (!r?.due) onDone()
      } catch {
        if (!vivo) return
        setFase('oculta')
        onDone()
      }
    })()
    return () => {
      vivo = false
    }
    // Sólo al montar: `onDone` es del padre y cambia en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (fase === 'cargando' || fase === 'oculta') return null

  async function contestar(respuesta) {
    setBusy(true)
    setError(false)
    try {
      if (respuesta === 'none') {
        await answerReview('none')
        setFase('no')
        return
      }
      // El objetivo aceptado de ahora, para poder decir «de cuánto a cuánto».
      // Si no llega se cuenta como «sin objetivo»: sólo pierde el «→».
      const [propuesta, perfil] = await Promise.all([
        answerReview(respuesta),
        getTargetProfile().catch(() => null),
      ])
      setFase({ propuesta, actual: perfil?.objetivo_kcal ?? null })
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  async function aceptar(kcal) {
    setBusy(true)
    setError(false)
    try {
      await acceptTarget(kcal)
      setFase('oculta')
      await onAccepted()
      onDone()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  const cerrar = () => {
    setFase('oculta')
    onDone()
  }

  return (
    <section className="revision" aria-labelledby="revision-sello">
      <span id="revision-sello" className="revision-sello">
        REVISIÓN SEMANAL
      </span>

      {fase === 'pregunta' && (
        <>
          <p className="revision-pregunta">¿Apuntaste todo lo que comiste?</p>
          <div className="revision-acciones">
            {RESPUESTAS.map(([valor, label]) => (
              <button
                key={valor}
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => contestar(valor)}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {fase === 'no' && (
        <>
          <p className="revision-texto">
            Esta semana no la cuento: con días a medias tu gasto saldría más bajo de lo real.
          </p>
          <div className="revision-acciones">
            <button type="button" className="primary" onClick={cerrar}>
              Vale
            </button>
          </div>
        </>
      )}

      {typeof fase === 'object' && <Propuesta {...fase} busy={busy} onAceptar={aceptar} onCerrar={cerrar} />}

      {error && <p className="revision-error">No se ha podido guardar. Prueba otra vez.</p>}
    </section>
  )
}

// Lo que sale de contestar: el gasto, el cambio y la decisión.
function Propuesta({ propuesta, actual, busy, onAceptar, onCerrar }) {
  const kcal = propuesta?.kcal ?? null
  const gasto = propuesta?.expenditure
  const igual = kcal != null && actual != null && Math.round(actual) === Math.round(kcal)

  return (
    <>
      {/* Sin gasto no se inventa uno: la línea se omite. */}
      {gasto != null && (
        <p className="revision-texto">{`Gastaste unas ${conMiles(gasto)} kcal al día`}</p>
      )}
      {kcal != null && (
        <p className="revision-cambio">
          {igual
            ? `Tu objetivo sigue en ${conMiles(actual)} kcal.`
            : actual == null
              ? `${conMiles(kcal)} kcal`
              : `${conMiles(actual)} → ${conMiles(kcal)} kcal`}
        </p>
      )}
      <div className="revision-acciones">
        {kcal == null || igual ? (
          <button type="button" className="primary" onClick={onCerrar}>
            Vale
          </button>
        ) : (
          <>
            <button type="button" className="secondary" disabled={busy} onClick={onCerrar}>
              {actual == null ? 'Ahora no' : `Mantener ${conMiles(actual)}`}
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => onAceptar(kcal)}
            >
              {`Aceptar ${conMiles(kcal)}`}
            </button>
          </>
        )}
      </div>
    </>
  )
}
