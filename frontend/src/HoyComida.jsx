import { useState } from 'react'

import { PlanEnComida } from './Plan.jsx'
import { foodDayIso, formatAmount, planEntryAmountGrams, shiftDay, slotLabel } from './food.js'

// Comida simple, fase 1 (lienzo «Comida simple», fila Premium). Hoy tiene un
// protagonista —la comida que toca— y el resto del día en calma; lo que antes
// eran anillos, tira y franja de la semana se queda en siete puntos y una
// cifra.

const DIAS_LARGOS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const DIAS_CORTOS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
export const HUECOS_HOY = ['desayuno', 'comida', 'snack', 'cena']

function diaSemana(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

// Los últimos siete días acabando hoy: la ventana de los días cuidados, que es
// móvil a propósito (nunca una racha que se rompe el lunes).
export function ultimosSiete(hoy = foodDayIso()) {
  return Array.from({ length: 7 }, (_, i) => shiftDay(hoy, i - 6))
}

/**
 * Los siete puntos: un día cuidado es un punto lleno; hoy, un aro hasta que se
 * cierra. Cada punto es también el camino a ese día — sustituye a la franja de
 * la semana, que ocupaba una fila entera para lo mismo.
 */
export function PuntosCuidados({ hoy, dayIso, cuidados = [], onPick }) {
  const dias = ultimosSiete(hoy)
  const cuenta = dias.filter((iso) => cuidados.includes(iso)).length
  return (
    <div className="hoy-puntos">
      <nav className="hoy-puntos-fila" aria-label="Elegir día">
        {dias.map((iso) => (
          <button
            key={iso}
            type="button"
            className={`hoy-punto${cuidados.includes(iso) ? ' is-cuidado' : ''}${iso === hoy ? ' is-hoy' : ''}`}
            aria-label={`${DIAS_LARGOS[diaSemana(iso)]} ${Number(iso.slice(8))}`}
            aria-description={cuidados.includes(iso) ? 'Día cuidado' : undefined}
            aria-pressed={iso === dayIso}
            onClick={() => onPick(iso)}
          >
            <span className="hoy-punto-dot" aria-hidden="true" />
            <span className="hoy-punto-letra" aria-hidden="true">
              {DIAS_CORTOS[diaSemana(iso)]}
            </span>
          </button>
        ))}
      </nav>
      <p className="hoy-puntos-cuenta">
        <span className="hoy-puntos-cifra">{cuenta}</span> de 7 días cuidados
      </p>
    </div>
  )
}

// Una comida del plan está dicha cuando tiene estado, o cuando ya hay algo
// apuntado en ella (apuntar otra cosa la marca cambiada en el servidor).
export function dicha(entrada, rail) {
  return entrada.status != null || (rail?.entries.length ?? 0) > 0
}

/**
 * Lo que toca ahora: la primera comida del plan sin decir, en grande. Dos
 * respuestas a la vista —«Comido» y «Otra cosa»—; las demás (me lo salté, no
 * sé, de la olla, fuera) siguen dentro de su fila, donde estaban.
 */
export function Ahora({ entrada, hechas, platos, onChanged, onComido, onOtraCosa }) {
  const [abierta, setAbierta] = useState(false)
  const gramos = planEntryAmountGrams(entrada)
  return (
    <section className="hoy-ahora" aria-label="Lo que toca ahora">
      <div className="hoy-ahora-top">
        <span className="hoy-ahora-sello">Ahora · {slotLabel(entrada.slot)}</span>
        <span className="hoy-ahora-barras" aria-hidden="true">
          {HUECOS_HOY.map((slot) => (
            <span key={slot} className={`hoy-ahora-barra${hechas.includes(slot) ? ' is-hecha' : ''}`} />
          ))}
        </span>
      </div>
      <h2 className="hoy-ahora-plato">{entrada.dish_name}</h2>
      <div className="hoy-ahora-meta">
        {gramos != null && <span className="hoy-ahora-gramos">{formatAmount(gramos)}</span>}
        {entrada.carbs_shift > 0 && <span className="hoy-ahora-hidrato">+ hidrato · has entrenado</span>}
      </div>
      {/* Abierta (olla o sitio), las respuestas van debajo: dos «Confirmar»
          seguidos serían el mismo botón dos veces. */}
      {!abierta && (
      <div className="hoy-ahora-acciones">
        <PlanEnComida
          compacto
          className="hoy-ahora-comido"
          entrada={entrada}
          platos={platos}
          onChanged={onChanged}
          onComido={onComido}
          onAbrir={() => setAbierta(true)}
        />
        <button type="button" className="hoy-ahora-otra" onClick={onOtraCosa}>
          Otra cosa
        </button>
      </div>
      )}
      {/* La olla o el sitio piden elegir antes de apuntar: se abre aquí mismo. */}
      {abierta && (
        <PlanEnComida entrada={entrada} platos={platos} onChanged={onChanged} onComido={onComido} />
      )}
    </section>
  )
}

// El cierre del día: las cuatro comidas dichas. Lo que cuenta es cuántos de
// los últimos siete, no una racha.
export function DiaCerrado({ cuenta, manana = null }) {
  return (
    <section className="hoy-cerrado" aria-label="Día cerrado">
      <span className="hoy-cerrado-sello">4 de 4 · día cerrado</span>
      <h2 className="hoy-cerrado-titulo">Día cuidado</h2>
      <p className="hoy-cerrado-linea">
        <span className="hoy-cerrado-cifra">{cuenta}</span> de los últimos 7.
        {manana && <> Mañana empiezas con {manana}.</>}
      </p>
    </section>
  )
}

// Sin plan esta semana: se dice una vez, arriba, con el camino para hacerlo.
export function SinPlan({ onPlan }) {
  return (
    <div className="hoy-sinplan">
      <span className="hoy-sinplan-texto">
        <span className="hoy-sinplan-titulo">Esta semana no hay plan</span>
      </span>
      {onPlan && (
        <button type="button" className="hoy-sinplan-ir" onClick={onPlan}>
          Hacer el plan ›
        </button>
      )}
    </div>
  )
}
