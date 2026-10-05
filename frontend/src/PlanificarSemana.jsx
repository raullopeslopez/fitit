import { useEffect, useState } from 'react'

import { generatePlan, getTargetProfile } from './api.js'
import { formatDayMonth } from './format.js'
import { conMiles } from './Objetivo.jsx'
import { Semana, motivo } from './Plan.jsx'
import RevisionSemanal from './RevisionSemanal.jsx'

/**
 * Planificar la semana que viene: revisar, y con el objetivo ya decidido,
 * generar.
 *
 * Son un solo momento a propósito. Compras una vez a la semana con la lista del
 * plan, pero no siempre el mismo día; si la revisión fuera un domingo fijo, un
 * jueves de compra planificaría con el objetivo viejo y el domingo cambiaría los
 * números con la compra ya hecha. Así que la revisión va primero —se salta sola
 * si no toca— y la semana se genera con lo que salga de ella.
 */
export default function PlanificarSemana({ weekStart, plan, onClose, onChanged, generar = generatePlan }) {
  // 'revision' | 'semana'
  const [paso, setPaso] = useState('revision')
  const [objetivo, setObjetivo] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // El objetivo con el que se va a planificar, leído **después** de la revisión:
  // si en ella aceptaste otro, es ése.
  useEffect(() => {
    if (paso !== 'semana') return
    let vivo = true
    getTargetProfile()
      .then((perfil) => vivo && setObjetivo(perfil?.objetivo_kcal ?? null))
      .catch(() => vivo && setObjetivo(undefined))
    return () => {
      vivo = false
    }
  }, [paso])

  if (paso === 'semana' && plan) {
    return (
      <Semana
        plan={plan}
        weekStart={weekStart}
        onClose={onClose}
        onChanged={onChanged}
        antetitulo="La semana que viene"
        titulo={`Semana del ${semanaDel(weekStart)}`}
      />
    )
  }

  async function generarSemana() {
    setBusy(true)
    setError(null)
    try {
      await generar(weekStart, null)
      await onChanged()
    } catch (err) {
      setError(motivo(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="food-screen" role="dialog" aria-modal="true" aria-label="Planificar la semana que viene">
      <header className="food-screen-head">
        <p className="food-screen-title">
          <span className="card-eyebrow">La semana que viene</span>
          <span className="food-screen-slot">{`Semana del ${semanaDel(weekStart)}`}</span>
        </p>
        <button type="button" className="link-btn" onClick={onClose}>
          Cerrar
        </button>
      </header>

      <div className="food-screen-body">
        {paso === 'revision' && <RevisionSemanal onAccepted={onChanged} onDone={() => setPaso('semana')} />}

        {paso === 'semana' && (
          <section className="card plan-card">
            <p className="card-eyebrow">Tu plan</p>
            {/* Sin perfil que leer no se dice nada: una línea que no llega no
                es «no tienes objetivo». */}
            {objetivo !== undefined && (
              <p className="hint">
                {objetivo != null
                  ? `Se planifica con tu objetivo de ${conMiles(objetivo)} kcal al día.`
                  : 'Todavía no tienes objetivo de kcal: la semana no se ajustará a ninguno.'}
              </p>
            )}
            {error && <p className="alert">{error}</p>}
            <button type="button" className="primary" disabled={busy} onClick={generarSemana}>
              Generar la semana
            </button>
          </section>
        )}
      </div>
    </div>
  )
}

// "2026-10-12" → "12 oct", por sus partes: `new Date(iso)` es medianoche UTC y
// al oeste de Greenwich sería el día anterior.
function semanaDel(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return formatDayMonth(new Date(y, m - 1, d))
}
