import { useCallback, useEffect, useState } from 'react'

import { listBodyWeights, logBodyWeight, weightTrend } from './api.js'
import { saveWeightToHealth } from './platform/health.js'
import { formatDayShort } from './format.js'
import { Fab, Sheet } from './ui'

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

// Las últimas pesadas que caben en la curva: más no se distinguen en 120 px y
// una curva de dos años no dice cómo vas, dice cómo ibas.
const PUNTOS = 30
const ANCHO = 120
const ALTO = 36
const MARGEN = 4

// La curva, sin ejes ni cifras: sólo la forma del último mes. De la más
// antigua a la más reciente, con la última como punto — es la que manda. El
// trazo y el punto toman su color de la hoja (`.weight-spark-*`), no de aquí.
// Con menos de dos pesadas no hay curva que dibujar.
function Curva({ pesadas }) {
  const serie = [...pesadas]
    .sort((a, b) => (a.measured_on < b.measured_on ? -1 : a.measured_on > b.measured_on ? 1 : 0))
    .slice(-PUNTOS)
  if (serie.length < 2) return null

  const kgs = serie.map((p) => p.kg)
  const min = Math.min(...kgs)
  const max = Math.max(...kgs)
  // Todas iguales: una raya en medio, no una división por cero.
  const rango = max - min || 1
  const x = (i) => MARGEN + (i * (ANCHO - 2 * MARGEN)) / (serie.length - 1)
  const y = (kg) =>
    max === min ? ALTO / 2 : ALTO - MARGEN - ((kg - min) * (ALTO - 2 * MARGEN)) / rango
  const puntos = serie.map((p, i) => `${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`)
  const ultimo = serie.length - 1

  return (
    <svg
      className="weight-spark"
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      role="img"
      aria-label="Tus últimas pesadas"
    >
      <polyline className="weight-spark-line" points={puntos.join(' ')} />
      <circle className="weight-spark-dot" cx={x(ultimo)} cy={y(serie[ultimo].kg)} r="3" />
    </svg>
  )
}

// `fila`: la fila «Peso» del final de Hoy (Marcador). La cifra a la derecha, y
// tocarla abre la misma hoja de apuntar pesada; sin curva ni botón flotante.
export default function Weight({ today = new Date(), onSaved, fila = false }) {
  const [trend, setTrend] = useState(null)
  const [pesadas, setPesadas] = useState([])
  const [abierta, setAbierta] = useState(false)
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
    try {
      // `?? []`: sin lista no hay curva, y la cabecera se sostiene igual.
      setPesadas((await listBodyWeights()) ?? [])
    } catch {
      // Lo mismo: la curva es un adorno de la cifra, no la cifra.
    }
  }, [])

  useEffect(() => {
    refrescar()
  }, [refrescar])

  function cerrar() {
    setAbierta(false)
    setTexto('')
    setError(null)
  }

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
      cerrar()
      await refrescar()
      // Lo que depende de tu peso (la propuesta de Objetivo) se entera aquí.
      onSaved?.()
    } catch {
      setError('No se ha podido guardar. Inténtalo otra vez.')
    } finally {
      setGuardando(false)
    }
  }

  const ultima = trend?.last_kg
  const media = trend?.kg
  const cuantas = trend?.weigh_ins ?? 0

  const hoja = (
    <Sheet open={abierta} title="Apuntar pesada" onClose={cerrar}>
      <form className="weight-form" onSubmit={guardar}>
        <label className="weight-label" htmlFor="weight-kg">
          Peso (kg)
        </label>
        <input
          id="weight-kg"
          className="weight-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          placeholder="78,4"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        {error && (
          <p role="status" className="weight-error">
            {error}
          </p>
        )}
        <div className="perfil-acciones">
          <button type="button" className="secondary" onClick={cerrar}>
            Cancelar
          </button>
          <button className="primary" type="submit" disabled={guardando}>
            Guardar
          </button>
        </div>
      </form>
    </Sheet>
  )

  if (fila) {
    return (
      <>
        <button type="button" className="hoy-peso" onClick={() => setAbierta(true)}>
          <span className="hoy-peso-label">Peso</span>
          <span className="hoy-peso-cifra">
            {ultima == null ? '—' : conComa(ultima)}
            {ultima != null && <span className="hoy-peso-unidad"> kg</span>}
          </span>
        </button>
        {hoja}
      </>
    )
  }

  return (
    <>
      <div className="weight-card">
        {/* La cifra es lo que marcó la báscula: tras pesarte, un «—» se leía como
            que no se había guardado. La tendencia —de la que sale Objetivo— va
            debajo, porque el peso oscila más de un kilo por agua y la última
            cifra sola invita a leer como un cambio lo que es una cena. El guion
            va con la misma tinta que un número: desconocido es un dato, no una
            ausencia decorativa. */}
        <p className="weight-stamp">Peso</p>
        <div className="weight-head">
          <p className="weight-figure">
            <span className="weight-kg">{ultima == null ? '—' : conComa(ultima)}</span>
            {ultima != null && <span className="weight-unit">kg</span>}
          </p>
          <Curva pesadas={pesadas} />
        </div>

        {ultima != null ? (
          <div className="weight-facts">
            {media != null && (
              <p className="weight-trend">
                Tendencia <span className="weight-fact">{conComa(media)} kg</span>
                <span className="weight-n">{` · ${cuantas} ${cuantas === 1 ? 'pesada' : 'pesadas'}`}</span>
              </p>
            )}
            <p className="weight-last">
              Última · <span className="weight-fact">{formatDayShort(trend.up_to, today).toLowerCase()}</span>
            </p>
          </div>
        ) : (
          <p className="weight-empty">Todavía no te has pesado.</p>
        )}
      </div>

      <Fab icon="+" label="Pesarme" onClick={() => setAbierta(true)} />

      {hoja}
    </>
  )
}
