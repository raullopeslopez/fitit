import { useEffect, useState } from 'react'

import { listDays } from './api.js'
import { MUSCLE_GROUPS, muscleFill } from './muscles.js'
import { storage } from './platform/storage.js'
import { setsPerMuscle } from './stats.js'
import { bandState } from './volume.js'

// Los tres músculos más lejos de su mínimo semanal (MEV), con las series que
// les faltan. Juzgados con la misma llamada que las filas de Progreso, así que
// lo que dice Hoy y lo que dice Progreso no pueden contradecirse.
export function owedThisWeek(days, max = 3) {
  return todosLosQueFaltan(days)
    .slice(0, max)
    .map((row) => ({ group: row.group, gap: row.gap }))
}

function todosLosQueFaltan(days) {
  const summary = setsPerMuscle(days, { period: 'week', index: 0 })
  return summary.rows
    .map((row) => ({ group: row.group, ...bandState(row.group, row.sets, row.indirect) }))
    .filter((row) => row.state === 'bajo')
    .sort((a, b) => b.gap - a.gap)
}

// Lo que la franja enseñó la última vez, para ver al volver qué músculo ha
// dejado de faltar (lienzo «Movimiento → un músculo deja de faltar»). Vive en
// el módulo: dura lo que dura la app abierta, que es lo que dura el gesto de
// ir a entrenar y volver a Hoy.
let ultimaVez = null

// La franja de ahora y, en su sitio de antes, los que han dejado de faltar
// esta semana —no los que sólo han bajado del podio porque otro subió—, que
// salen con «✓» y se van solos.
export function conLosCumplidos(antes, ahora, todos) {
  if (!antes) return ahora
  const faltan = new Set(todos.map((r) => r.group))
  const filas = [...ahora]
  antes.forEach((m, i) => {
    if (!faltan.has(m.group) && !filas.some((f) => f.group === m.group)) {
      filas.splice(Math.min(i, filas.length), 0, { group: m.group, gap: 0, cumplido: true })
    }
  })
  return filas
}

const lunes = () => {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toDateString()
}

const conComa = (n) => String(n).replace('.', ',')

// La banda de entreno de Hoy (Marcador): qué le falta a la semana y el botón
// que te mete en el entreno de hoy — empezado o continuado — en un toque.
export default function HoyEntreno({ onTrain }) {
  const [owed, setOwed] = useState(null)

  useEffect(() => {
    let vivo = true
    let pausa
    // Sin backend que conteste (o sin `listDays` en un doble de prueba), la
    // banda se queda sin músculos, no tumba la pantalla.
    Promise.resolve()
      .then(() => listDays())
      .then((days) => {
        if (!vivo) return
        const ahora = owedThisWeek(days ?? [])
        const semana = lunes()
        const antes = ultimaVez?.semana === semana ? ultimaVez.owed : null
        ultimaVez = { semana, owed: ahora }
        const filas = conLosCumplidos(antes, ahora, todosLosQueFaltan(days ?? []))
        setOwed(filas)
        // El «✓» empuja (240 ms) y, medio segundo después, la píldora se va.
        if (filas.some((m) => m.cumplido)) pausa = setTimeout(() => vivo && setOwed(ahora), 960)
      })
      .catch(() => vivo && setOwed([]))
    return () => {
      vivo = false
      clearTimeout(pausa)
    }
  }, [])

  return (
    <section className="hoy-entreno" aria-label="Entreno" data-seccion>
      {owed !== null && (
        <>
          <p className="hoy-entreno-sello">
            {owed.length > 0 ? 'Esta semana te falta' : 'Esta semana, todo en zona'}
          </p>
          {owed.length > 0 && (
            <ul className="hoy-entreno-musculos">
              {owed.map((m) => (
                <li
                  key={m.group}
                  className={m.cumplido ? 'is-cumplido' : undefined}
                  style={{ '--chip-fill': muscleFill(m.group) }}
                >
                  <span className="hoy-entreno-punto" aria-hidden="true" />
                  {m.group}{' '}
                  <span className="hoy-entreno-falta">{m.cumplido ? '✓' : `−${conComa(m.gap)}`}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <button type="button" className="hoy-entreno-cta" onClick={onTrain}>
        Entrenar
        <span className="hoy-entreno-flecha" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </button>
    </section>
  )
}

// Semana → «Entreno · series que faltan»: los diez músculos, cada uno con lo
// que le falta a su mínimo semanal (o ✓), y la celda más llena cuanto más
// cerca. El mismo dibujo que Historial y Progreso.
export function weekCells(days) {
  const summary = setsPerMuscle(days, { period: 'week', index: 0 })
  const byGroup = Object.fromEntries(summary.rows.map((r) => [r.group, r]))
  return MUSCLE_GROUPS.map((group) => {
    const row = byGroup[group]
    const { direct, band } = bandState(group, row?.sets ?? 0, row?.indirect ?? 0)
    const goal = band?.mev ?? 0
    const left = Math.max(0, Math.ceil(goal - direct))
    const pct = goal > 0 ? Math.max(12, Math.round(Math.min(1, direct / goal) * 100)) : 100
    return { group, left, pct }
  })
}

// Las celdas se llenan una vez al día, la primera vez que abres Semana; al
// volver ya están llenas y no se mueven (lienzo «Movimiento»).
const LLENADO = 'fitit_semana_llenada'
function primeraVezHoy() {
  const hoy = new Date().toDateString()
  try {
    if (storage.getItem(LLENADO) === hoy) return false
    storage.setItem(LLENADO, hoy)
  } catch {
    return false
  }
  return true
}

export function SemanaEntreno() {
  const [cells, setCells] = useState(null)
  const [llenando] = useState(primeraVezHoy)

  useEffect(() => {
    let vivo = true
    // Sin backend que conteste (o sin `listDays` en un doble de prueba), la
    // banda se queda sin músculos, no tumba la pantalla.
    Promise.resolve()
      .then(() => listDays())
      .then((days) => vivo && setCells(weekCells(days ?? [])))
      .catch(() => vivo && setCells(null))
    return () => {
      vivo = false
    }
  }, [])

  if (!cells) return null
  return (
    <section className="semana-bloque" aria-label="Entreno" data-seccion>
      <div className="semana-bloque-head">
        <h2>Entreno</h2>
        <span>series que faltan</span>
      </div>
      <ul className={`semana-musculos${llenando ? ' is-llenando' : ''}`}>
        {cells.map((c, i) => (
          <li key={c.group}>
            <span
              className={`semana-celda${c.pct >= 55 ? ' is-llena' : ''}`}
              style={{ '--chip-fill': muscleFill(c.group), '--pct': `${c.pct}%`, '--i': i }}
              aria-label={c.left > 0 ? `${c.group}: faltan ${c.left}` : `${c.group}: hecho`}
            >
              {c.left > 0 ? `−${c.left}` : '✓'}
            </span>
            <span className="semana-musculo">{c.group}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
