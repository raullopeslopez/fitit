import { useCallback, useEffect, useState } from 'react'

import { logBodyWeight, weightTrend } from './api.js'
import { saveWeightToHealth } from './platform/health.js'
import { formatDayShort } from './format.js'

// La fecha civil de hoy. **No** `foodDayIso()`: el corte de las 04:00 es del
// diario de comida, donde una cena de la 01:00 es de ayer. Una pesada no tiene
// hora útil, así que pesarte de madrugada cuenta para el día en que estás.
export function hoyIso(now = new Date()) {
  const mes = String(now.getMonth() + 1).padStart(2, '0')
  const dia = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${mes}-${dia}`
}

const conComa = (n) => String(n).replace('.', ',')

// Aquí se escribe con coma y la API habla en punto. Devuelve `null` para todo
// lo que no sea un número: un peso inventado de un texto a medio teclear es
// peor que uno no registrado.
export function aNumero(texto) {
  const limpio = String(texto ?? '').trim().replace(',', '.')
  return /^\d+(\.\d+)?$/.test(limpio) ? Number(limpio) : null
}

export default function Weight({ today = new Date(), onSaved }) {
  const [trend, setTrend] = useState(null)
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const refrescar = useCallback(async () => {
    try {
      setTrend(await weightTrend())
    } catch {
      // Una tendencia que no se pudo pedir no es una tendencia vacía. Se queda
      // como estaba y la tarjeta sigue aceptando pesadas.
    }
  }, [])

  useEffect(() => {
    refrescar()
  }, [refrescar])

  async function guardar(event) {
    event.preventDefault()
    const kg = aNumero(texto)
    if (kg === null) {
      setError('Escribe el peso, por ejemplo 78,4.')
      return
    }
    setError(null)
    setGuardando(true)
    try {
      await logBodyWeight({ measured_on: hoyIso(today), kg })
      // En el APK, también a Health Connect, para las demás apps. Sin esperar:
      // lo que cuenta es que ya está en Fitit.
      saveWeightToHealth(kg)
      setTexto('')
      await refrescar()
      // Lo que depende de tu peso (la propuesta de Objetivo) se entera aquí.
      onSaved?.()
    } catch {
      setError('No se ha podido guardar. Inténtalo otra vez.')
    } finally {
      setGuardando(false)
    }
  }

  const kg = trend?.kg
  const pesadas = trend?.weigh_ins ?? 0

  return (
    <div className="card weight-card">
      <h2>Peso</h2>

      {/* La cifra es la tendencia, nunca la última pesada: el peso oscila más
          de un kilo por agua, y pintar la última cifra invita a leer como un
          cambio lo que es una cena. El guion va con la misma tinta que un
          número — desconocido es un dato, no una ausencia decorativa. */}
      <p className="weight-figure">
        <span className="weight-kg">{kg == null ? '—' : conComa(kg)}</span>
        {kg != null && <span className="weight-unit">kg</span>}
      </p>

      {kg != null ? (
        <p className="weight-stamp">
          {`TENDENCIA · ${pesadas} PESADAS · ${formatDayShort(trend.up_to, today)}`}
        </p>
      ) : (
        <p className="weight-empty">
          {pesadas === 0
            ? 'Todavía no te has pesado.'
            : 'Una pesada no es una tendencia. Pésate otro día y aparece.'}
        </p>
      )}

      <form className="weight-form" onSubmit={guardar}>
        <label className="weight-label" htmlFor="weight-kg">
          Peso
        </label>
        <div className="weight-row">
          <input
            id="weight-kg"
            className="weight-input"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="78,4"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <button className="primary weight-save" type="submit" disabled={guardando}>
            Guardar
          </button>
        </div>
        {error && (
          <p role="status" className="weight-error">
            {error}
          </p>
        )}
      </form>
    </div>
  )
}
