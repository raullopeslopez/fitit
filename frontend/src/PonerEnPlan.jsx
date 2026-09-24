import { useEffect, useState } from 'react'

import { getPlanAhead, replanEntry } from './api.js'
import { foodDayIso } from './food.js'

// «Ponerlo en el plan»: elegir en qué hueco de esta semana va un plato.
//
// Sólo se ofrece lo que **no ha pasado y no tiene respuesta**: el servidor ya
// filtra (`GET /plans/entries/ahead`), así que la hoja no decide nada, enseña.
// Tocar una fila es la confirmación — la hoja entera es la pregunta «¿dónde?»,
// y una segunda pregunta «¿seguro?» encima no añadiría información: lo que se
// pierde (el plato que había) está escrito en la propia fila.
//
// No escribe el diario. Cambia lo que el plan dice que vas a comer; el día que
// toque, la fila se confirma o se salta como cualquier otra.

const SLOT = {
  desayuno: 'Desayuno',
  comida: 'Comida',
  cena: 'Cena',
  snack: 'Snack',
}
const EN_EL = {
  desayuno: 'en el desayuno',
  comida: 'en la comida',
  cena: 'en la cena',
  snack: 'en el snack',
}
const DIA_CORTO = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
const DIA_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

// Día de la semana de un `YYYY-MM-DD`, en UTC para que ningún huso lo mueva.
function diaSemana(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function Asa() {
  return <span className="sheet-grip" aria-hidden="true" />
}

export default function PonerEnPlan({
  dish,
  onClose,
  onPuesto = null,
  dayIso = foodDayIso(),
  // Inyectables para que los tests no tengan que interceptar el módulo de red.
  cargar = getPlanAhead,
  poner = replanEntry,
}) {
  const [huecos, setHuecos] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [puesto, setPuesto] = useState(null)

  useEffect(() => {
    let vivo = true
    cargar(dayIso)
      .then((r) => vivo && setHuecos(r))
      .catch(() => vivo && setError('No se ha podido leer el plan.'))
    return () => {
      vivo = false
    }
  }, [cargar, dayIso])

  async function elegir(fila) {
    setBusy(true)
    setError(null)
    try {
      await poner(fila.id, dish.id, dayIso)
      setPuesto(fila)
      onPuesto?.(fila)
    } catch {
      setError('No se ha podido poner en el plan.')
    } finally {
      setBusy(false)
    }
  }

  const filas = Array.isArray(huecos?.entries) ? huecos.entries : []

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={dish.name}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-body poner-plan">
          <Asa />
          <header className="food-detail-head">
            <h2 className="food-detail-name">{dish.name}</h2>
            <button type="button" className="link-btn" onClick={onClose}>
              Cerrar
            </button>
          </header>

          {puesto ? (
            <p className="poner-hecho" role="status">
              Puesto{' '}
              {puesto.log_date === dayIso ? 'hoy' : `el ${DIA_LARGO[diaSemana(puesto.log_date)]}`},{' '}
              {EN_EL[puesto.slot] ?? puesto.slot}.
            </p>
          ) : huecos === null ? (
            !error && <p className="hint">Cargando el plan…</p>
          ) : !huecos.has_plan ? (
            <p className="poner-vacio">
              Esta semana no tiene plan. El plato queda guardado y el generador lo tendrá en cuenta.
            </p>
          ) : filas.length === 0 ? (
            <p className="poner-vacio">No quedan comidas por delante en el plan de esta semana.</p>
          ) : (
            <ul className="poner-lista">
              {filas.map((fila) => (
                <li key={fila.id}>
                  <button
                    type="button"
                    className="poner-fila"
                    disabled={busy}
                    aria-label={`${DIA_CORTO[diaSemana(fila.log_date)]} · ${SLOT[fila.slot] ?? fila.slot} — ${fila.dish_name}`}
                    onClick={() => elegir(fila)}
                  >
                    <span className="poner-dia">{DIA_CORTO[diaSemana(fila.log_date)]}</span>
                    <span className="poner-slot">{SLOT[fila.slot] ?? fila.slot}</span>
                    <span className="poner-sep" aria-hidden="true">
                      —
                    </span>
                    <span className="poner-actual">{fila.dish_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p className="poner-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
