import { useEffect, useState } from 'react'

import { getCaredDays } from './api.js'
import { foodDayIso, shiftDay } from './food.js'

/**
 * Los días cuidados: la cifra norte (épica de cuatro comidas, fase 7).
 *
 * Un día cuenta si dijiste lo que comiste o entrenaste (`GET /cared-days`). Se
 * cuenta sobre una ventana —las últimas 8 semanas— y por mes, **nunca en
 * racha**: un día malo no borra nada, que es lo que hace que se siga mirando.
 */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const VENTANA = 56
const N_MESES = 5

// El primer día del mes que cae `n` meses antes que el de `iso`.
function inicioDeMes(iso, n = 0) {
  const [y, m] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 - n, 1))
  return d.toISOString().slice(0, 10)
}

export function contarCuidados(dias, hoy) {
  const desde = shiftDay(hoy, -(VENTANA - 1))
  const ventana = dias.filter((d) => d >= desde && d <= hoy).length
  const meses = Array.from({ length: N_MESES }, (_, i) => {
    const mes = inicioDeMes(hoy, N_MESES - 1 - i).slice(0, 7)
    return { mes, dias: dias.filter((d) => d.startsWith(mes)).length }
  })
  return { ventana, meses }
}

export function DiasCuidados({ dias, hoy }) {
  if (!Array.isArray(dias)) return null
  const { ventana, meses } = contarCuidados(dias, hoy)
  const nombre = (mes) => MESES[Number(mes.slice(5)) - 1]
  return (
    <section className="card cuidados" data-seccion>
      <p className="card-eyebrow">Días cuidados</p>
      <p className="cuidados-cifra">
        <span className="cuidados-num">{`${ventana} de ${VENTANA}`}</span>
        <span className="cuidados-pie">días cuidados en 8 semanas</span>
      </p>
      <div
        className="cuidados-meses"
        role="img"
        aria-label={`Días cuidados por mes: ${meses.map((m) => `${nombre(m.mes)} ${m.dias}`).join(', ')}`}
      >
        {meses.map((m, i) => (
          <span key={m.mes} className={`cuidados-mes${i === meses.length - 1 ? ' is-este' : ''}`}>
            <span className="cuidados-mes-n" aria-hidden="true">{m.dias}</span>
            <span className="cuidados-barra" style={{ height: `${Math.round((m.dias / 31) * 48)}px` }} />
            <span className="cuidados-mes-l" aria-hidden="true">{nombre(m.mes)}</span>
          </span>
        ))}
      </div>
    </section>
  )
}

// La cifra norte en una línea, para la cabecera de Progreso: los días del mes en
// curso, la misma cuenta que la última barra de la tarjeta. Mientras no hay
// respuesta (o no llegó) no se sabe, y eso es una raya en la tinta de la cifra,
// nunca un 0; un mes que llegó vacío sí es 0.
export function CuidadosEsteMes({ dias, hoy }) {
  const n = Array.isArray(dias) ? contarCuidados(dias, hoy).meses.at(-1).dias : null
  return (
    <p className="cuidados-linea">
      <span className="cuidados-linea-num">{n ?? '—'}</span>{' '}
      <span className="cuidados-pie">{n === 1 ? 'día cuidado este mes' : 'días cuidados este mes'}</span>
    </p>
  )
}

// Los días cuidados de los cinco últimos meses enteros, hasta hoy: `null`
// mientras no hay respuesta. Un pedido sirve a la línea y a la tarjeta.
export function useDiasCuidados(leer = getCaredDays, hoy = foodDayIso()) {
  const [dias, setDias] = useState(null)
  useEffect(() => {
    let vivo = true
    Promise.resolve(leer(inicioDeMes(hoy, N_MESES - 1), hoy))
      .then((r) => vivo && setDias(Array.isArray(r?.days) ? r.days : null))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [leer, hoy])
  return dias
}
