import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { getFoodDay } from './api.js'
import { autoWorkoutName, muscleCounts } from './daysHistory.js'
import { formatMacro, MEAL_SLOTS } from './food.js'
import { sessionMinutes } from './format.js'
import { MUSCLE_GROUPS, muscleFill } from './muscles.js'
import { showKg } from './units.js'

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const CORTOS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']

function fecha(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const titulo = (iso) => `${DIAS[fecha(iso).getDay()]} ${fecha(iso).getDate()}`
const corto = (iso) => `${CORTOS[fecha(iso).getDay()]} ${fecha(iso).getDate()}`

// Lienzo «Movimiento → abrir un día»: el título de la fila sube y crece hasta
// ser el titular (320 ms, frena), el fondo tapa las demás filas y el detalle
// entra debajo. Volver lo devuelve a su fila (200 ms, acelera).
const FRENA = 'cubic-bezier(0, 0, 0, 1)'
const ACELERA = 'cubic-bezier(0.3, 0, 1, 1)'
const quieto = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function desdeLaFila(titulo, desde) {
  const a = titulo.getBoundingClientRect()
  return `translate(${desde.left - a.left}px, ${desde.top - a.top}px) scale(${desde.height / a.height})`
}

const miles = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

// Las series de un ejercicio en una línea: «100 × 8 · 100 × 8 · 105 × 6».
function lineaSeries(sets) {
  return sets.map((s) => (s.weight == null ? `${s.reps} reps` : `${showKg(s.weight)} × ${s.reps}`)).join(' · ')
}

// Los ejercicios de una sesión, en el orden en que se hicieron.
function ejercicios(w) {
  const orden = []
  const por = {}
  for (const s of w.sets ?? []) {
    if (!por[s.exercise_name]) {
      por[s.exercise_name] = []
      orden.push(s.exercise_name)
    }
    por[s.exercise_name].push(s)
  }
  return orden.map((name) => ({ name, sets: por[name] }))
}

/**
 * Historial → un día (Marcador): su entreno, banda del color de su músculo
 * principal y debajo cada ejercicio con sus series; su comida, con el total y
 * una fila por comida. Se abre tocando la fecha de un día en Historial; tocar
 * la sesión sigue abriendo el entreno directamente.
 */
export default function DiaDetalle({ day, desde = null, prev, next, onPick, onClose, onOpenWorkout, onDelete }) {
  const [comida, setComida] = useState(undefined)
  const [borrando, setBorrando] = useState(false)
  const tituloRef = useRef(null)
  const inicial = useRef(day.date)
  const [crece] = useState(() => !!desde && !quieto())
  const [vuelve, setVuelve] = useState(false)

  useLayoutEffect(() => {
    const titulo = tituloRef.current
    if (!crece || typeof titulo?.animate !== 'function') return
    titulo.animate([{ transform: desdeLaFila(titulo, desde) }, { transform: 'none' }], { duration: 320, easing: FRENA })
    // Sólo al abrir: saltar de día con ‹ › no vuelve a crecer nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Volver: si sigue siendo el día que se abrió desde su fila, el título vuelve
  // a ella antes de cerrar; si no (otro día, o sin animaciones), cierra ya.
  function volver() {
    const titulo = tituloRef.current
    if (!crece || vuelve || day.date !== inicial.current || typeof titulo?.animate !== 'function') return onClose()
    setVuelve(true)
    const ida = titulo.animate([{ transform: 'none' }, { transform: desdeLaFila(titulo, desde) }], {
      duration: 200,
      easing: ACELERA,
      fill: 'forwards',
    })
    // Cierra al acabar, o a los 260 ms si la animación no avanza (una pestaña
    // que no pinta no la termina nunca): volver no puede depender de ella.
    let hecho = false
    const cerrar = () => {
      if (hecho) return
      hecho = true
      onClose()
    }
    ida.finished.then(cerrar, cerrar)
    setTimeout(cerrar, 260)
  }

  useEffect(() => {
    let vivo = true
    setComida(undefined)
    setBorrando(false)
    Promise.resolve()
      .then(() => getFoodDay(day.date))
      .then((d) => vivo && setComida(d ?? null))
      .catch(() => vivo && setComida(null))
    return () => {
      vivo = false
    }
  }, [day.date])

  const comidas = comida
    ? [...MEAL_SLOTS, { key: null, label: 'Sin asignar' }]
        .map((s) => {
          const suyas = (comida.entries ?? []).filter((e) => (e.meal_slot ?? null) === s.key)
          if (suyas.length === 0) return null
          const kcal = suyas.some((e) => e.kcal == null) ? null : suyas.reduce((t, e) => t + e.kcal, 0)
          return { key: s.key ?? 'sin', name: s.label, items: suyas.map((e) => e.food_name).join(' · '), kcal }
        })
        .filter(Boolean)
    : []

  return (
    <div
      className={`food-screen dia${crece ? ' is-crece' : ''}${vuelve ? ' is-vuelve' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={titulo(day.date)}
    >
      <header className="dia-head">
        <button type="button" className="dia-volver" aria-label="Volver a Historial" onClick={volver}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <span className="dia-nav">
          {prev && (
            <button type="button" className="dia-salto" onClick={() => onPick(prev)}>
              ‹ {corto(prev.date)}
            </button>
          )}
          {prev && next && <span aria-hidden="true"> · </span>}
          {next && (
            <button type="button" className="dia-salto" onClick={() => onPick(next)}>
              {corto(next.date)} ›
            </button>
          )}
        </span>
        <span className="dia-hueco" />
      </header>
      <h1 className="dia-titulo" ref={tituloRef}>{titulo(day.date)}</h1>

      {day.workouts.map((w) => {
        const counts = muscleCounts(w.sets ?? [])
        const principal = MUSCLE_GROUPS.filter((g) => counts[g]).sort((a, b) => counts[b] - counts[a])[0]
        const minutos = sessionMinutes(w)
        return (
          <section key={w.id} aria-label="Entreno">
            <button
              type="button"
              className="dia-entreno"
              style={{ '--chip-fill': principal ? muscleFill(principal) : 'var(--mf-core)' }}
              onClick={() => onOpenWorkout(w.id, { ...w, date: day.date })}
            >
              <span className="dia-entreno-nombre">{w.name || autoWorkoutName(w.sets) || 'Entreno'}</span>
              <span className="dia-entreno-meta">
                {`${(w.sets ?? []).length} ser`}
                {minutos && ` · ${minutos.replace('′', ' min')}`}
              </span>
            </button>
            {ejercicios(w).map((e) => (
              <button
                key={e.name}
                type="button"
                className="dia-ejercicio"
                onClick={() => onOpenWorkout(w.id, { ...w, date: day.date })}
              >
                <span className="dia-ejercicio-nombre">{e.name}</span>
                <span className="dia-ejercicio-series">{lineaSeries(e.sets)}</span>
              </button>
            ))}
          </section>
        )
      })}

      <section className="dia-comida" aria-label="Comida">
        <div className="dia-comida-head">
          <span className="dia-sello">Comida</span>
          {comida && (
            <span className="dia-comida-total">
              {comida.totals?.kcal == null ? '—' : miles(comida.totals.kcal)}{' '}
              <span className="dia-comida-unidad">
                kcal · prot. {formatMacro(comida.totals?.protein)} g
              </span>
            </span>
          )}
        </div>
        {comida && comidas.length === 0 && <p className="dia-vacio">Nada apuntado este día.</p>}
        {comidas.map((m) => (
          <div key={m.key} className="dia-fila">
            <span className="dia-fila-main">
              <span className="dia-fila-nombre">{m.name}</span>
              <span className="dia-fila-items">{m.items}</span>
            </span>
            <span className="dia-fila-kcal">{m.kcal == null ? '—' : miles(m.kcal)}</span>
          </div>
        ))}
      </section>

      <footer className="dia-pie">
        <span className="dia-pista">Toca un ejercicio para corregirlo</span>
        {/* Dos toques: el primero sólo arma el borrado. */}
        <button
          type="button"
          className="dia-borrar"
          onClick={() => (borrando ? onDelete(day.id) : setBorrando(true))}
        >
          {borrando ? 'Sí, borrar día' : 'Borrar día'}
        </button>
      </footer>
    </div>
  )
}
