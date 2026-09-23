import { useCallback, useEffect, useState } from 'react'

import { createRule, listRules, retireRule } from './api.js'

const FAMILIAS = [
  ['verdura', 'Verdura'],
  ['legumbre', 'Legumbre'],
  ['tuberculo', 'Tubérculo'],
  ['fruta', 'Fruta'],
  ['pescado', 'Pescado'],
  ['carne', 'Carne'],
  ['huevo', 'Huevo'],
  ['lacteo', 'Lácteo'],
  ['cereal', 'Cereal'],
  ['frutos_secos', 'Frutos secos'],
]

const MACROS = [
  ['protein', 'Proteína'],
  ['carbs', 'Hidratos'],
  ['fat', 'Grasa'],
  ['fiber', 'Fibra'],
]

const SLOTS = [
  ['desayuno', 'el desayuno'],
  ['comida', 'la comida'],
  ['snack', 'el snack'],
  ['cena', 'la cena'],
]

const METODOS = [
  ['air_fryer', 'Air fryer'],
  ['plancha', 'Plancha'],
  ['sarten', 'Sartén'],
  ['horno', 'Horno'],
]

const etiqueta = (pares, valor) => pares.find(([v]) => v === valor)?.[1] ?? valor
const num = (n) => String(n).replace('.', ',')

/**
 * Una regla, dicha en palabras.
 *
 * Se lee, no se configura: una lista de `macro_per_kg · min 1.5 · max 2` es la
 * regla en el idioma de la base de datos, no en el de quien come.
 */
export function frase(regla) {
  const p = regla.params ?? {}
  let texto
  switch (regla.type) {
    case 'macro_per_kg':
      texto = `${etiqueta(MACROS, p.macro)} entre ${num(p.min)} y ${num(p.max)} g por kilo`
      break
    case 'macro_share':
      texto = `${etiqueta(MACROS, p.macro)} entre el ${num(p.min_pct)} % y el ${num(p.max_pct)} % de las kcal`
      break
    case 'group_presence':
      texto = `${etiqueta(FAMILIAS, p.familia)} en ${etiqueta(SLOTS, regla.slot)}`
      break
    case 'group_frequency':
      texto = `${etiqueta(FAMILIAS, p.familia)} al menos ${p.min} veces por semana`
      break
    case 'cap':
      texto = `${etiqueta(SLOTS, regla.slot)} no pasa del ${num(p.max_pct)} % del día`
      break
    case 'method_preference':
      texto = `${etiqueta(METODOS, p.method)} al menos ${p.min} veces por semana`
      break
    default:
      texto = regla.type
  }
  const cuando =
    regla.day_condition === 'training'
      ? ', los días que entreno'
      : regla.day_condition === 'rest'
        ? ', los días de descanso'
        : ''
  return texto.charAt(0).toUpperCase() + texto.slice(1) + cuando
}

// El catálogo, dicho como se elige. Cada receta sabe qué ámbito tiene y qué
// preguntar — es el mismo catálogo cerrado del backend, visto desde el otro
// lado: si un tipo no está aquí, no hay forma de crearlo.
const RECETAS = {
  macro_per_kg: { label: 'Un macro por kilo de peso', scope: 'day', pide: ['macro', 'banda'] },
  macro_share: { label: 'Un macro como % de las kcal', scope: 'day', pide: ['macro', 'banda_pct'] },
  group_presence: { label: 'Un grupo en una comida', scope: 'slot', pide: ['familia', 'slot'] },
  group_frequency: { label: 'Un grupo N veces por semana', scope: 'week', pide: ['familia', 'min'] },
  cap: { label: 'Una comida con tope', scope: 'slot', pide: ['slot', 'max_pct'] },
  method_preference: { label: 'Un modo de cocinar N veces', scope: 'week', pide: ['metodo', 'min'] },
}

/** Las reglas que sigues: leerlas, añadir y retirar. */
export default function Reglas({ onChanged, onClose }) {
  const [reglas, setReglas] = useState([])
  const [tipo, setTipo] = useState('macro_per_kg')
  const [campos, setCampos] = useState({ macro: 'protein', familia: 'verdura', slot: 'comida', metodo: 'air_fryer' })
  const [dureza, setDureza] = useState('soft')
  const [condicion, setCondicion] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setReglas((await listRules()) ?? [])
    } catch {
      setReglas([])
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const receta = RECETAS[tipo]
  const set = (key) => (e) => setCampos({ ...campos, [key]: e.target.value })
  const numero = (raw) => {
    const v = Number(String(raw ?? '').replace(',', '.'))
    return Number.isFinite(v) ? v : null
  }

  function params() {
    const p = {}
    if (receta.pide.includes('macro')) p.macro = campos.macro
    if (receta.pide.includes('familia')) p.familia = campos.familia
    if (receta.pide.includes('metodo')) p.method = campos.metodo
    if (receta.pide.includes('banda')) {
      p.min = numero(campos.min ?? 1.5)
      p.max = numero(campos.max ?? 2)
    }
    if (receta.pide.includes('banda_pct')) {
      p.min_pct = numero(campos.min_pct ?? 25)
      p.max_pct = numero(campos.max_pct ?? 35)
    }
    if (receta.pide.includes('min')) p.min = numero(campos.min ?? 3)
    if (receta.pide.includes('max_pct')) p.max_pct = numero(campos.max_pct ?? 25)
    return p
  }

  async function anadir() {
    setBusy(true)
    setError(null)
    try {
      await createRule({
        type: tipo,
        scope: receta.scope,
        slot: receta.scope === 'slot' ? campos.slot : null,
        day_condition: condicion || null,
        hardness: dureza,
        params: params(),
      })
      await cargar()
      await onChanged()
    } catch (err) {
      setError(err?.message ?? 'No se ha podido guardar la regla.')
    } finally {
      setBusy(false)
    }
  }

  async function retirar(regla) {
    const hoy = new Date()
    const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
    await retireRule(regla.id, iso)
    await cargar()
    await onChanged()
  }

  return (
    <div className="food-screen" role="dialog" aria-modal="true" aria-label="Tus reglas">
      <header className="food-screen-head">
        <p className="food-screen-title">
          <span className="card-eyebrow">Cómo como</span>
          <span className="food-screen-slot">Tus reglas</span>
        </p>
        <button type="button" className="link-btn" onClick={onClose}>
          Cerrar
        </button>
      </header>

      <div className="food-screen-body">
        <ul className="reglas-lista">
          {reglas.map((regla) => (
            <li key={regla.id} className="regla">
              <span className="regla-frase">{frase(regla)}</span>
              <span className="regla-dureza">
                {regla.hardness === 'hard' ? 'Obligatoria' : 'Deseable'}
              </span>
              {/* Retirar, no borrar: cambiar de opinión en octubre no puede
                  reescribir cómo se juzgó septiembre. */}
              <button
                type="button"
                className="regla-retirar"
                aria-label={`Retirar: ${frase(regla)}`}
                onClick={() => retirar(regla)}
              >
                Retirar
              </button>
            </li>
          ))}
          {reglas.length === 0 && (
            <li className="regla-vacio">Todavía no sigues ninguna regla.</li>
          )}
        </ul>

        <p className="card-eyebrow reglas-nueva">Añadir una</p>

        <div className="field">
          <label htmlFor="rule-type">Qué regla</label>
          <select id="rule-type" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {Object.entries(RECETAS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {receta.pide.includes('macro') && (
          <div className="field">
            <label htmlFor="rule-macro">Qué macro</label>
            <select id="rule-macro" value={campos.macro} onChange={set('macro')}>
              {MACROS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        )}

        {receta.pide.includes('familia') && (
          <div className="field">
            <label htmlFor="rule-familia">Qué grupo</label>
            <select id="rule-familia" value={campos.familia} onChange={set('familia')}>
              {FAMILIAS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        )}

        {receta.pide.includes('metodo') && (
          <div className="field">
            <label htmlFor="rule-metodo">Cómo cocinado</label>
            <select id="rule-metodo" value={campos.metodo} onChange={set('metodo')}>
              {METODOS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        )}

        {receta.scope === 'slot' && (
          <div className="field">
            <label htmlFor="rule-slot">En qué comida</label>
            <select id="rule-slot" value={campos.slot} onChange={set('slot')}>
              {SLOTS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        )}

        {receta.pide.includes('banda') && (
          <div className="objetivo-row">
            <div className="field">
              <label htmlFor="rule-min">Desde (g/kg)</label>
              <input id="rule-min" inputMode="decimal" value={campos.min ?? '1,5'} onChange={set('min')} />
            </div>
            <div className="field">
              <label htmlFor="rule-max">Hasta (g/kg)</label>
              <input id="rule-max" inputMode="decimal" value={campos.max ?? '2'} onChange={set('max')} />
            </div>
          </div>
        )}

        {receta.pide.includes('banda_pct') && (
          <div className="objetivo-row">
            <div className="field">
              <label htmlFor="rule-minpct">Desde (%)</label>
              <input id="rule-minpct" inputMode="decimal" value={campos.min_pct ?? '25'} onChange={set('min_pct')} />
            </div>
            <div className="field">
              <label htmlFor="rule-maxpct">Hasta (%)</label>
              <input id="rule-maxpct" inputMode="decimal" value={campos.max_pct ?? '35'} onChange={set('max_pct')} />
            </div>
          </div>
        )}

        {receta.pide.includes('min') && (
          <div className="field">
            <label htmlFor="rule-veces">Veces por semana</label>
            <input id="rule-veces" inputMode="numeric" value={campos.min ?? '3'} onChange={set('min')} />
          </div>
        )}

        {receta.pide.includes('max_pct') && (
          <div className="field">
            <label htmlFor="rule-tope">Tope (% del día)</label>
            <input id="rule-tope" inputMode="decimal" value={campos.max_pct ?? '25'} onChange={set('max_pct')} />
          </div>
        )}

        <div className="objetivo-row">
          <div className="field">
            <label htmlFor="rule-hardness">Cuánto importa</label>
            <select id="rule-hardness" value={dureza} onChange={(e) => setDureza(e.target.value)}>
              <option value="soft">Deseable</option>
              <option value="hard">Obligatoria</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="rule-condicion">Qué días</label>
            <select id="rule-condicion" value={condicion} onChange={(e) => setCondicion(e.target.value)}>
              <option value="">Todos</option>
              <option value="training">Los que entreno</option>
              <option value="rest">Los de descanso</option>
            </select>
          </div>
        </div>

        {error && (
          <p role="status" className="dish-error">
            {error}
          </p>
        )}

        <div className="dish-actions">
          <button type="button" className="primary" disabled={busy} onClick={anadir}>
            Añadir regla
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Lo que tus reglas dicen de hoy.
 *
 * Sólo se pinta lo que pide algo. Una regla cumplida no necesita decirse, y una
 * que hoy no aplica menos todavía: «un control que es inerte diecinueve veces
 * de veinte no se enseña esas diecinueve» (DESIGN.md).
 *
 * Y `no puedo saberlo` **no es** `incumples`. Pintarlos igual sería inventarse
 * un juicio sobre un dato que falta.
 */
export function Veredictos({ verdicts, rules }) {
  const porId = Object.fromEntries((rules ?? []).map((r) => [r.id, r]))
  const dicen = (verdicts ?? []).filter((v) => v.state === 'broken' || v.state === 'unknown')
  if (dicen.length === 0) return null

  return (
    <ul className="veredictos">
      {dicen.map((v) => {
        const regla = porId[v.rule_id]
        return (
          <li key={v.rule_id} className={`veredicto is-${v.state}`}>
            <span className="veredicto-regla">{regla ? frase(regla) : v.type}</span>
            <span className="veredicto-estado">
              {v.state === 'broken'
                ? v.short_by != null
                  ? `Te faltan ${num(Math.abs(v.short_by))}`
                  : 'Sin cumplir'
                : v.unclassified
                  ? `No puedo saberlo: ${v.unclassified} sin clasificar`
                  : 'No puedo saberlo todavía'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
