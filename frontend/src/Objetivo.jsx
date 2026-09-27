import { useCallback, useEffect, useState } from 'react'

import { acceptTarget, getTargetProfile, getTargetProposal, saveTargetProfile } from './api.js'
import { formatMacro } from './food.js'
import { publishStepsGoal } from './widgetSummary.js'

const OBJETIVOS = [
  ['cut', 'Bajar'],
  ['maintain', 'Mantener'],
  ['gain', 'Ganar'],
]

// De dónde salió la cifra, dicho con la palabra que le corresponde.
//
// Una estimación y una medición no se pintan igual: presentar la primera con la
// tinta de la segunda es la clase de mentira tranquila que esta app evita en
// todo lo demás. `measured` dice además sobre cuántos días descansa.
function Procedencia({ source, days }) {
  if (source === 'measured') {
    return (
      <span className="objetivo-fuente">
        Medido con tus datos · {days} días
      </span>
    )
  }
  if (source === 'formula') {
    return <span className="objetivo-fuente">Estimado con una fórmula</span>
  }
  return null
}

/**
 * De qué quieres que le pase a tu cuerpo a cuántas kcal tocan.
 *
 * La app **propone** y tú aceptas (decisión 18). Un número que cambia sin
 * avisar no se obedece, se desconfía — así que mirar la propuesta no fija
 * nada, y aceptar es un acto aparte.
 */
export default function Objetivo({ onAccepted }) {
  const [perfil, setPerfil] = useState(null)
  const [propuesta, setPropuesta] = useState(null)
  const [busy, setBusy] = useState(false)
  const [pasosMal, setPasosMal] = useState(false)

  const preguntar = useCallback(async () => {
    try {
      setPropuesta((await getTargetProposal()) ?? null)
    } catch {
      setPropuesta(null)
    }
  }, [])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const p = await getTargetProfile()
        // `?? {}` y no a pelo: un perfil que no llega deja la pantalla
        // utilizable —los campos vacíos y la propuesta diciendo qué falta—
        // en vez de caerse sobre `undefined`.
        if (vivo) setPerfil(p ?? {})
      } catch {
        if (vivo) setPerfil({})
      }
      if (vivo) await preguntar()
    })()
    return () => {
      vivo = false
    }
  }, [preguntar])

  const set = (key) => (e) => setPerfil({ ...perfil, [key]: e.target.value })

  const numero = (raw) => {
    const value = Number(String(raw ?? '').replace(',', '.'))
    return String(raw ?? '').trim() === '' || !Number.isFinite(value) ? null : value
  }

  // Pasos: un entero, con o sin punto de miles («10.000» son diez mil, no diez).
  // Vacío es sin objetivo (null), nunca cero.
  const pasos = (raw) => {
    const text = String(raw ?? '').replace(/[.\s]/g, '')
    if (text === '') return null
    return /^\d+$/.test(text) ? Number(text) : NaN
  }

  async function guardarPerfil() {
    const stepsGoal = pasos(perfil.steps_goal)
    // El servidor sólo acepta 1.000–100.000; mandarle otra cosa sería un error
    // callado en vez de una frase.
    if (stepsGoal !== null && !(stepsGoal >= 1000 && stepsGoal <= 100000)) {
      setPasosMal(true)
      return
    }
    setPasosMal(false)
    setBusy(true)
    try {
      await saveTargetProfile({
        goal: perfil.goal || null,
        goal_rate: numero(perfil.goal_rate),
        height_cm: numero(perfil.height_cm),
        birth_year: numero(perfil.birth_year),
        sex: perfil.sex || null,
        steps_goal: stepsGoal,
      })
      // El widget de Android dibuja la barra contra este número.
      publishStepsGoal(stepsGoal)
      // Y se vuelve a preguntar: la cifra depende de lo que se acaba de guardar.
      await preguntar()
    } finally {
      setBusy(false)
    }
  }

  async function aceptar() {
    setBusy(true)
    try {
      await acceptTarget(propuesta.kcal)
      await onAccepted()
    } finally {
      setBusy(false)
    }
  }

  if (perfil === null) return null
  const kcal = propuesta?.kcal ?? null

  return (
    <section className="objetivo">
      <p className="card-eyebrow">De dónde salen tus calorías</p>

      <p className="objetivo-figure">
        <span className="objetivo-kcal">{formatMacro(kcal)}</span>
        {kcal != null && <span className="objetivo-unit">kcal</span>}
      </p>
      <Procedencia source={propuesta?.source} days={propuesta?.days ?? 0} />
      {/* Cómo se reparten esas kcal. Se ve antes de aceptar porque aceptar fija
          las dos cosas: las kcal y estos gramos. */}
      {kcal != null && propuesta?.protein != null && (
        <p className="objetivo-macros">
          {`Proteína ${propuesta.protein} g · Hidratos ${propuesta.carbs} g · Grasa ${propuesta.fat} g`}
        </p>
      )}

      {/* Un resultado vacío nombra el fallo correcto: qué falta, por su nombre,
          en vez de una cifra inventada con una media. */}
      {kcal == null && propuesta?.missing?.length > 0 && (
        <p className="objetivo-falta">
          Para calcularlo me falta: {propuesta.missing.join(', ')}.
        </p>
      )}

      {/* Recortar en silencio sería devolver otra cosa de la que pediste. */}
      {propuesta?.floored && (
        <p className="objetivo-falta">
          Con ese ritmo saldría menos, pero no baja de 1.200 kcal.
        </p>
      )}

      <div className="objetivo-row">
        <div className="field">
          <label htmlFor="goal">Quiero</label>
          <select id="goal" value={perfil.goal ?? ''} onChange={set('goal')}>
            <option value="">Sin decidir</option>
            {OBJETIVOS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="goal_rate">kg por semana</label>
          <input
            id="goal_rate"
            inputMode="decimal"
            value={perfil.goal_rate ?? ''}
            onChange={set('goal_rate')}
            placeholder="0,5"
          />
        </div>
      </div>

      <div className="objetivo-row">
        <div className="field">
          <label htmlFor="height_cm">Altura (cm)</label>
          <input
            id="height_cm"
            inputMode="decimal"
            value={perfil.height_cm ?? ''}
            onChange={set('height_cm')}
          />
        </div>
        <div className="field">
          <label htmlFor="birth_year">Año de nacimiento</label>
          <input
            id="birth_year"
            inputMode="numeric"
            value={perfil.birth_year ?? ''}
            onChange={set('birth_year')}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="sex">Sexo</label>
        <select id="sex" value={perfil.sex ?? ''} onChange={set('sex')}>
          <option value="">Sin decir</option>
          <option value="male">Hombre</option>
          <option value="female">Mujer</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="steps_goal">Pasos al día</label>
        <input
          id="steps_goal"
          inputMode="numeric"
          value={perfil.steps_goal ?? ''}
          onChange={set('steps_goal')}
          placeholder="10.000"
          aria-describedby={pasosMal ? 'steps_goal_error' : undefined}
        />
        {pasosMal && (
          <p id="steps_goal_error" className="objetivo-falta">
            Entre 1.000 y 100.000 pasos.
          </p>
        )}
      </div>

      <div className="objetivo-actions">
        <button type="button" className="secondary" disabled={busy} onClick={guardarPerfil}>
          Guardar mis datos
        </button>
        <button type="button" className="primary" disabled={busy || kcal == null} onClick={aceptar}>
          Aceptar
        </button>
      </div>
    </section>
  )
}
