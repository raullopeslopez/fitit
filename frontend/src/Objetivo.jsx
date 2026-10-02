import { useState } from 'react'

import { acceptTarget, saveTargetProfile } from './api.js'
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
  if (n == null) return '—'
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
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
  const [busy, setBusy] = useState(false)

  const kcal = propuesta?.kcal ?? null
  const fuente = procedencia(propuesta)

  async function guardar() {
    setBusy(true)
    try {
      await saveTargetProfile({
        goal,
        // Mantener no tiene ritmo: se guarda 0 y no un resto de cuando bajabas.
        goal_rate: goal === 'maintain' ? 0 : numero(rate),
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
      <p className="perfil-figure">
        <span className="perfil-kcal">{conMiles(kcal)}</span>
        {kcal != null && <span className="perfil-unit">kcal</span>}
      </p>
      {fuente && <span className="perfil-fuente">{fuente}</span>}

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

      <div className="perfil-acciones">
        <button type="button" className="secondary" disabled={busy} onClick={guardar}>
          Guardar
        </button>
        <button type="button" className="primary" disabled={busy || kcal == null} onClick={aceptar}>
          Aceptar
        </button>
      </div>
    </Sheet>
  )
}
