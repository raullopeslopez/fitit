import { useEffect, useState } from 'react'

import { getTargetProfile } from './api.js'
import { isoWeekStart } from './format.js'
import { MUSCLE_GROUPS, muscleFill } from './muscles.js'
import { stepsByDate } from './steps.js'

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function sumarDias(isoDia, n) {
  const [y, m, d] = isoDia.split('-').map(Number)
  return iso(new Date(y, m - 1, d + n))
}

const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

// Las series directas de cada músculo en las últimas ocho semanas (lunes a
// domingo), la más antigua primero. La media es de las ocho; «↓» si la
// segunda mitad cae por debajo de tres cuartos de la primera.
export function ochoSemanas(days, hoy = iso(new Date())) {
  const lunes = isoWeekStart(hoy)
  const semanas = Array.from({ length: 8 }, (_, i) => sumarDias(lunes, -7 * (7 - i)))
  const fin = sumarDias(semanas[7], 6)
  const filas = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, Array(8).fill(0)]))
  for (const day of days ?? []) {
    if (day.date < semanas[0] || day.date > fin) continue
    const i = semanas.findLastIndex((s) => day.date >= s)
    for (const w of day.workouts ?? []) {
      for (const set of w.sets ?? []) {
        if (filas[set.muscle_group]) filas[set.muscle_group][i] += 1
      }
    }
  }
  return MUSCLE_GROUPS.map((group) => {
    const w = filas[group]
    const total = w.reduce((a, b) => a + b, 0)
    const antes = w.slice(0, 4).reduce((a, b) => a + b, 0)
    const despues = w.slice(4).reduce((a, b) => a + b, 0)
    return { group, semanas: w, media: Math.round(total / 8), baja: antes > 0 && despues < antes * 0.75 }
  })
}

// Progreso → Músculos (Marcador): una fila por músculo, ocho celdas graduadas
// —las mismas de Semana e Historial— y su media semanal a la derecha.
export function MusculosOchoSemanas({ days }) {
  const filas = ochoSemanas(days)
  const max = Math.max(1, ...filas.flatMap((f) => f.semanas))
  return (
    <section className="ocho" aria-label="Series por semana, ocho semanas" data-seccion>
      <div className="ocho-head">
        <span />
        <span>8 semanas, la última a la derecha</span>
        <span>series/sem</span>
      </div>
      {filas.map((f) => (
        <div className="ocho-fila" key={f.group}>
          <span className="ocho-nombre">{f.group}</span>
          <span className="ocho-celdas" aria-hidden="true">
            {f.semanas.map((v, i) => (
              <span
                key={i}
                className="ocho-celda"
                style={
                  v
                    ? {
                        background: `color-mix(in srgb, ${muscleFill(f.group)} ${Math.round(20 + (v / max) * 80)}%, var(--surface-raised))`,
                      }
                    : undefined
                }
              />
            ))}
          </span>
          <span className="ocho-media">
            {f.media}
            {f.baja && (
              <span className="ocho-baja" aria-label="bajando">
                {' ↓'}
              </span>
            )}
          </span>
        </div>
      ))}
    </section>
  )
}

// Progreso → Cuerpo: los pasos de los últimos siete días, en barras, contra tu
// meta; la barra que la cumple, en verde.
export function PasosSieteDias({ hoy = iso(new Date()) }) {
  const [pasos, setPasos] = useState(null)
  const [meta, setMeta] = useState(null)
  useEffect(() => {
    let vivo = true
    Promise.resolve()
      .then(() => stepsByDate(sumarDias(hoy, -6), hoy))
      .then((p) => vivo && setPasos(p ?? {}))
      .catch(() => vivo && setPasos(null))
    Promise.resolve()
      .then(() => getTargetProfile())
      .then((p) => vivo && setMeta(p?.steps_goal ?? null))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [hoy])
  if (!pasos || Object.keys(pasos).length === 0) return null
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(hoy, i - 6))
  const valores = dias.map((d) => pasos[d] ?? 0)
  const media = Math.round(valores.reduce((a, b) => a + b, 0) / 7)
  const tope = Math.max(meta ?? 0, ...valores, 1)
  return (
    <section className="pasos7" aria-label="Pasos de los últimos siete días" data-seccion>
      <div className="pasos7-head">
        <span className="pasos7-sello">Pasos · 7 días</span>
        <span className="pasos7-media">
          media {miles(media)}
          {meta ? ` / ${miles(meta)}` : ''}
        </span>
      </div>
      <div className="pasos7-barras" aria-hidden="true">
        {valores.map((v, i) => (
          <span
            key={dias[i]}
            className={`pasos7-barra${meta && v >= meta ? ' is-meta' : ''}`}
            style={{ height: `${Math.max(2, Math.round((v / tope) * 48))}px` }}
          />
        ))}
      </div>
    </section>
  )
}
