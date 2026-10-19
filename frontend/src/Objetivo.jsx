import { useState } from 'react'

import { acceptTarget, saveTargetProfile } from './api.js'
import { formatMacro } from './food.js'
import { formatDayMonth } from './format.js'
import { formatSteps } from './steps.js'
import { Chip, Sheet } from './ui'

const OBJETIVOS = [
  ['cut', 'Bajar'],
  ['maintain', 'Mantener'],
  ['gain', 'Ganar'],
]

// Un número con el punto de miles que se escribe aquí. `toLocaleString('es-ES')`
// no sirve: en español no agrupa los de cuatro cifras («2569»), y 2.569 kcal es
// como se lee y como se teclea.
export function conMiles(n) {
  // La convención de la app es la de `formatMacro` (RAE, es-ES): cuatro cifras
  // sin separador —«2230 kcal»— y a partir de cinco con punto —«10.000»—. Aquí
  // se ponía punto siempre, y en Comida la línea del objetivo decía «2.230»
  // encima de una fila Energía que decía «2230».
  return formatMacro(n == null ? null : Math.round(n))
}

// «0,5»: aquí se escribe con coma, y la API habla en punto.
const conComa = (n) => String(n).replace('.', ',')

// Vacío o ilegible es `null`, nunca cero: sin dato no es dato.
function numero(raw) {
  const value = Number(String(raw ?? '').replace(',', '.'))
  return String(raw ?? '').trim() === '' || !Number.isFinite(value) ? null : value
}

// De dónde salió la cifra, dicho con la palabra que le corresponde.
//
// Una estimación y una medición no se pintan igual: presentar la primera con la
// tinta de la segunda es la clase de mentira tranquila que esta app evita en
// todo lo demás. `measured` dice además sobre cuántos días descansa, y la
// fórmula con qué actividad contó cuando hubo pasos en vez de adivinarla.
export function procedencia(propuesta) {
  if (!propuesta) return null
  const { source } = propuesta
  if (source === 'measured') return `Medido con tus datos · ${propuesta.days ?? 0} días`
  if (source === 'formula' && propuesta.steps_per_day != null) {
    const entreno = propuesta.training_kcal_per_day
    return (
      `Estimado con tus ${formatSteps(propuesta.steps_per_day)} al día` +
      (entreno ? ` y ${entreno} kcal de entreno` : '')
    )
  }
  if (source === 'formula') return 'Estimado con una fórmula'
  return null
}

// El ritmo, como se dice: «Bajar · 0,5 kg/sem». Sin objetivo es una raya, no «—
// kg/sem»; y «Mantener» no lleva ritmo, que no tiene sentido.
export function ritmo(perfil) {
  const goal = perfil?.goal
  const nombre = OBJETIVOS.find(([value]) => value === goal)?.[1]
  if (!nombre) return null
  if (goal === 'maintain' || !perfil.goal_rate) return nombre
  return `${nombre} · ${conComa(perfil.goal_rate)} kg/sem`
}

// La cuenta de la hoja, en filas: lo que gastas, lo que el ritmo suma o resta y
// lo que toca comer. El ritmo se **resta del servidor** (`kcal − expenditure`)
// y no se vuelve a derivar aquí de 7.700 kcal/kg: si el servidor cambia la
// constante, o el suelo recorta la cifra, la pantalla sigue diciendo lo que de
// verdad se ha restado. Sin gasto no hay cuenta (`null` no es `0`).
export function cuenta(perfil, propuesta) {
  const gasto = propuesta?.expenditure
  const kcal = propuesta?.kcal
  if (gasto == null || kcal == null) return null
  const filas = [
    [propuesta.source === 'measured' ? 'Gasto medido' : 'Gasto estimado', conMiles(gasto)],
  ]
  const delta = Math.round(kcal - gasto)
  const nombre = { cut: 'Bajar', gain: 'Ganar' }[perfil?.goal]
  if (delta !== 0 && nombre && perfil.goal_rate) {
    // U+2212, no un guion: es una resta y el guion se lee como un rango.
    filas.push([
      `${nombre} ${conComa(perfil.goal_rate)} kg/semana`,
      `${delta < 0 ? '\u2212' : '+'} ${conMiles(Math.abs(delta))}`,
    ])
  }
  filas.push(['Comer al día', conMiles(kcal), true])
  return filas
}

// «≈ 7 semanas más · hacia el 20 nov». Cuenta hasta la fecha que dio el
// servidor (`eta`), construida por partes: `new Date('2026-11-20')` es UTC y
// en un huso al oeste caería en el día anterior.
export function faltan(plan) {
  if (!plan || plan.reached || !plan.eta) return null
  const [y, m, d] = plan.eta.split('-').map(Number)
  const meta = new Date(y, m - 1, d)
  const hoy = new Date()
  // Días enteros por UTC: restar fechas locales cruza el cambio de hora y
  // regala una hora que ceil convierte en una semana de más.
  const dias = (Date.UTC(y, m - 1, d) - Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) / 86400000
  const semanas = Math.max(1, Math.ceil(dias / 7))
  return `≈ ${semanas} ${semanas === 1 ? 'semana' : 'semanas'} más · hacia el ${formatDayMonth(meta)}`
}

/**
 * De qué quieres que le pase a tu cuerpo y a cuántas kcal tocan: la hoja «Tu
 * objetivo» de Perfil.
 *
 * La app **propone** y tú aceptas (decisión 18). Un número que cambia sin
 * avisar no se obedece, se desconfía — así que mirar la propuesta no fija
 * nada, y aceptar es un acto aparte. «Guardar» fija sólo el objetivo y el
 * ritmo, vuelve a preguntar y deja la hoja abierta, para que se vea qué cifra
 * sale con lo nuevo antes de decidir si se acepta.
 *
 * Se monta al abrirse, así que su borrador siempre arranca del perfil de ahora.
 */
export default function ObjetivoSheet({ perfil, propuesta, onClose, onSaved, onAccepted }) {
  const [goal, setGoal] = useState(perfil?.goal ?? null)
  const [rate, setRate] = useState(perfil?.goal_rate == null ? '' : conComa(perfil.goal_rate))
  const [meta, setMeta] = useState(
    perfil?.goal_weight_kg == null ? '' : conComa(perfil.goal_weight_kg),
  )
  const [busy, setBusy] = useState(false)

  const kcal = propuesta?.kcal ?? null
  const fuente = procedencia(propuesta)
  const filas = cuenta(perfil, propuesta)
  const plan = propuesta?.plan ?? null

  async function guardar() {
    setBusy(true)
    try {
      await saveTargetProfile({
        goal,
        // Mantener no tiene ritmo: se guarda 0 y no un resto de cuando bajabas.
        goal_rate: goal === 'maintain' ? 0 : numero(rate),
        // Vacío es sin peso meta (`null`), nunca cero.
        goal_weight_kg: numero(meta),
      })
      await onSaved()
    } finally {
      setBusy(false)
    }
  }

  async function aceptar() {
    setBusy(true)
    try {
      // Aceptar fija las kcal y sus gramos a la vez: los macros no se deciden
      // aparte, y Comida compara con lo que se acepte aquí.
      await acceptTarget(kcal)
      await onAccepted()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open title="Tu objetivo" onClose={onClose}>
      <p className="objetivo-sello">Te propongo</p>
      <p className="perfil-figure">
        <span className="perfil-kcal">{conMiles(kcal)}</span>
        {kcal != null && <span className="perfil-unit">kcal</span>}
      </p>
      {fuente && <span className="perfil-fuente">{fuente}</span>}

      {/* La cuenta: de dónde sale la cifra de arriba. Llegar a la meta se dice
          antes que las filas, porque cambia lo que significan: ya no se resta. */}
      {plan?.reached && (
        <p className="perfil-aviso">Has llegado a tu peso meta: te propongo mantener.</p>
      )}
      {filas && <p className="objetivo-sello">La cuenta</p>}
      {filas && (
        <ul className="objetivo-cuenta" aria-label="La cuenta">
          {filas.map(([label, cifra, fuerte]) => (
            <li key={label} className={fuerte ? 'is-total' : undefined}>
              <span>{label}</span>
              <span className="objetivo-cuenta-cifra">{cifra}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Cómo se reparten esas kcal. Se ve antes de aceptar porque aceptar fija
          las dos cosas: las kcal y estos gramos. */}
      {kcal != null && propuesta?.protein != null && (
        <p className="perfil-macros">
          {`Proteína ${propuesta.protein} g · Hidratos ${propuesta.carbs} g · Grasa ${propuesta.fat} g`}
        </p>
      )}

      {/* Un resultado vacío nombra el fallo correcto: qué falta, por su nombre,
          en vez de una cifra inventada con una media. */}
      {kcal == null && propuesta?.missing?.length > 0 && (
        <p className="perfil-aviso">Para calcularlo me falta: {propuesta.missing.join(', ')}.</p>
      )}

      {/* Recortar en silencio sería devolver otra cosa de la que pediste. */}
      {propuesta?.floored && (
        <p className="perfil-aviso">Con ese ritmo saldría menos, pero no baja de 1.200 kcal.</p>
      )}

      <p className="perfil-campo-label" id="objetivo-quiero">
        Quiero
      </p>
      <div className="perfil-chips" role="group" aria-labelledby="objetivo-quiero">
        {OBJETIVOS.map(([value, label]) => (
          <Chip key={value} selected={goal === value} onClick={() => setGoal(value)}>
            {label}
          </Chip>
        ))}
      </div>

      {goal !== 'maintain' && (
        <div className="field">
          <label htmlFor="goal_rate">kg por semana</label>
          <input
            id="goal_rate"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="0,5"
          />
        </div>
      )}

      {/* El peso al que quieres llegar. Siempre visible, también con Mantener:
          es un dato tuyo, no del ritmo, y quitarlo del formulario lo borraría. */}
      <div className="field">
        <label htmlFor="goal_weight">Peso meta</label>
        <input
          id="goal_weight"
          inputMode="decimal"
          value={meta}
          onChange={(e) => setMeta(e.target.value)}
          placeholder="97,5"
        />
      </div>
      {faltan(plan) && <p className="perfil-aviso">{faltan(plan)}</p>}

      <div className="perfil-acciones">
        <button type="button" className="secondary" disabled={busy} onClick={guardar}>
          Guardar
        </button>
        {/* Dice qué fija: la cifra, no un «Aceptar» a secas. */}
        <button type="button" className="primary" disabled={busy || kcal == null} onClick={aceptar}>
          {kcal == null ? 'Aceptar' : `Aceptar ${conMiles(kcal)} kcal`}
        </button>
      </div>
    </Sheet>
  )
}
