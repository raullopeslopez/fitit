import { useCallback, useEffect, useState } from 'react'

import { generatePlan, getPlan, listDishes } from './api.js'
import { foodDayIso } from './food.js'
import { Semana, lunesDe, lunesSiguiente, motivo } from './Plan.jsx'
import PlanificarSemana from './PlanificarSemana.jsx'
import TusPlatos from './TusPlatos.jsx'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// «5 – 11 oct», o «28 sep – 4 oct» cuando la semana cruza de mes. En UTC, por
// lo mismo que `lunesDe`: un `Date` local de un `YYYY-MM-DD` cae el día antes.
export function rangoSemana(weekStart) {
  const [y, m, d] = weekStart.split('-').map(Number)
  const inicio = new Date(Date.UTC(y, m - 1, d))
  const fin = new Date(Date.UTC(y, m - 1, d + 6))
  const mesFin = MESES[fin.getUTCMonth()]
  if (inicio.getUTCMonth() === fin.getUTCMonth()) {
    return `${inicio.getUTCDate()} – ${fin.getUTCDate()} ${mesFin}`
  }
  return `${inicio.getUTCDate()} ${MESES[inicio.getUTCMonth()]} – ${fin.getUTCDate()} ${mesFin}`
}

/**
 * La pestaña Plan: lo que vas a comer, separado de lo que has comido.
 *
 * Hasta aquí el plan vivía dentro de Comida —una tarjeta entre los macros y el
 * diario, y la semana, la lista y tus platos colgando de dos enlaces dentro de
 * ella—. Son dos trabajos distintos: registrar es varias veces al día con el
 * móvil en una mano; planificar es una vez a la semana, el día que compras.
 * Comida se queda con el registro y con confirmar lo planificado de hoy, que es
 * donde se toca el plan con la comida delante.
 *
 * Dos semanas y no un calendario: la que estás viviendo (qué toca, cómo va) y la
 * que viene (revisar el objetivo, generar, comprar). No hay una tercera que
 * tenga sentido mirar desde aquí.
 */
export default function PlanPantalla({ hoy = foodDayIso(), inicial = 'esta' }) {
  const [segmento, setSegmento] = useState(inicial)
  const esta = lunesDe(hoy)
  const viene = lunesSiguiente(hoy)
  // `undefined` = cargando; `null` = esa semana no se ha generado.
  const [planes, setPlanes] = useState({ [esta]: undefined, [viene]: undefined })
  const [platos, setPlatos] = useState([])
  const [error, setError] = useState(null)
  const [platosOpen, setPlatosOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([getPlan(esta), getPlan(viene)])
      setPlanes({ [esta]: a, [viene]: b })
      setError(null)
    } catch {
      setError('No se ha podido cargar el plan.')
    }
  }, [esta, viene])

  // Aparte del plan: unos platos que no llegan dejan la semana a la vista, sólo
  // sin aviso ni con qué cambiar un plato.
  const cargarPlatos = useCallback(async () => {
    try {
      setPlatos((await listDishes()) ?? [])
    } catch {
      setPlatos([])
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    cargarPlatos()
  }, [cargarPlatos])

  async function generarEsta() {
    setBusy(true)
    setError(null)
    try {
      await generatePlan(esta, null)
      await cargar()
    } catch (err) {
      setError(motivo(err))
    } finally {
      setBusy(false)
    }
  }

  if (platosOpen) {
    return (
      <TusPlatos
        onClose={() => setPlatosOpen(false)}
        onChanged={async () => {
          await cargarPlatos()
        }}
      />
    )
  }

  const week = segmento === 'esta' ? esta : viene
  const plan = planes[week]

  return (
    <div className="plan-pantalla">
      <header className="plan-head">
        <span className="card-eyebrow">{rangoSemana(week)}</span>
        <h1 className="plan-title">Plan</h1>
      </header>

      <div className="seg" role="group" aria-label="Semana">
        <button
          type="button"
          className={`seg-btn${segmento === 'esta' ? ' is-on' : ''}`}
          aria-pressed={segmento === 'esta'}
          onClick={() => setSegmento('esta')}
        >
          Esta semana
        </button>
        <button
          type="button"
          className={`seg-btn${segmento === 'viene' ? ' is-on' : ''}`}
          aria-pressed={segmento === 'viene'}
          onClick={() => setSegmento('viene')}
        >
          La que viene
        </button>
      </div>

      {error && <p className="alert">{error}</p>}

      {segmento === 'esta' &&
        plan !== undefined &&
        (plan ? (
          <Semana
            embebida
            plan={plan}
            weekStart={esta}
            hoy={hoy}
            onChanged={cargar}
            platos={platos}
            onPlatos={() => setPlatosOpen(true)}
            onPlatosChanged={cargarPlatos}
          />
        ) : (
          <section className="card plan-card">
            <p className="hint">Todavía no hay plan para esta semana.</p>
            <button type="button" className="primary" disabled={busy} onClick={generarEsta}>
              Generar la semana
            </button>
          </section>
        ))}

      {/* La que viene es la pantalla de planificar de siempre, sin su cabecera:
          revisar el objetivo primero —se salta sola si no toca— y con él ya
          decidido, generar. `key` por semana: si el día cambia con la pantalla
          abierta, la revisión vuelve a empezar para la semana nueva. */}
      {segmento === 'viene' && plan !== undefined && (
        <PlanificarSemana
          key={viene}
          embebida
          weekStart={viene}
          plan={plan}
          onChanged={cargar}
          platos={platos}
          onPlatosChanged={cargarPlatos}
        />
      )}
    </div>
  )
}
