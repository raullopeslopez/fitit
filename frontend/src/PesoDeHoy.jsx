import { useEffect, useState } from 'react'

import { listBodyWeights, logBodyWeight } from './api.js'
import { saveWeightToHealth } from './platform/health.js'
import { storage } from './platform/storage.js'
import { aNumero, hoyIso } from './Weight.jsx'

// «Ahora no» calla la pregunta hasta mañana. Es una comodidad de este móvil, no
// un dato: si se pierde, la pregunta vuelve, que es lo seguro.
export const CLAVE_AHORA_NO = 'fitit_peso_ahora_no'

const conComa = (n) => String(n).replace('.', ',')

function calladoHoy(hoy) {
  try {
    return storage.getItem(CLAVE_AHORA_NO) === hoy
  } catch {
    return false
  }
}

/**
 * «¿Te has pesado hoy?», justo después de confirmar una comida del plan.
 *
 * Sin pesadas el objetivo no se ajusta solo —el gasto medido necesita dos por
 * mitad de ventana— y la báscula es lo primero que se olvida. Confirmar una
 * comida es el momento en que ya tienes el móvil en la mano, así que se pregunta
 * ahí, dentro de la tarjeta del plan, y no en una notificación aparte.
 *
 * No pregunta si hoy ya hay pesada, si dijiste «Ahora no» hoy, o si no se
 * pudo leer: una pregunta que no llega no bloquea el plan. `onDone` avisa de que
 * ha acabado, por la vía que sea.
 */
export default function PesoDeHoy({
  today = new Date(),
  onDone = () => {},
  leer = listBodyWeights,
  guardar = logBodyWeight,
}) {
  const hoy = hoyIso(today)
  // 'cargando' | 'pregunta' | { kg } | 'nada'
  const [fase, setFase] = useState('cargando')
  const [texto, setTexto] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (calladoHoy(hoy)) {
        setFase('nada')
        onDone()
        return
      }
      try {
        const pesadas = (await leer()) ?? []
        if (!vivo) return
        if (pesadas.some((p) => p.measured_on === hoy)) {
          setFase('nada')
          onDone()
        } else {
          setFase('pregunta')
        }
      } catch {
        if (!vivo) return
        setFase('nada')
        onDone()
      }
    })()
    return () => {
      vivo = false
    }
    // Sólo al montar: `onDone` es del padre y cambia en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function enviar(event) {
    event.preventDefault()
    const kg = aNumero(texto)
    if (kg === null) {
      setError('Escribe el peso, por ejemplo 78,4.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await guardar({ measured_on: hoy, kg })
      // En el APK, también a Health Connect, como desde Perfil. Sin esperar.
      saveWeightToHealth(kg)
      setFase({ kg })
      onDone()
    } catch {
      setError('No se ha podido guardar. Inténtalo otra vez.')
    } finally {
      setBusy(false)
    }
  }

  function ahoraNo() {
    try {
      storage.setItem(CLAVE_AHORA_NO, hoy)
    } catch {
      // Sin almacenamiento, mañana —o al volver a abrir— se pregunta otra vez.
    }
    setFase('nada')
    onDone()
  }

  if (fase === 'cargando' || fase === 'nada') return null

  if (typeof fase === 'object') {
    return <p className="peso-hoy-hecho">{`Guardado: ${conComa(fase.kg)} kg`}</p>
  }

  return (
    <form className="peso-hoy" onSubmit={enviar}>
      <p className="peso-hoy-pregunta">¿Te has pesado hoy?</p>
      <div className="peso-hoy-fila">
        <input
          className="peso-hoy-input"
          inputMode="decimal"
          aria-label="Peso de hoy (kg)"
          placeholder="kg"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <button type="submit" className="primary" disabled={busy}>
          Guardar
        </button>
        <button type="button" className="link-btn" onClick={ahoraNo}>
          Ahora no
        </button>
      </div>
      {error && <p className="alert">{error}</p>}
    </form>
  )
}
