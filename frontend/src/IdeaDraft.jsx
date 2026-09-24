import { useEffect, useRef, useState } from 'react'

import { createDish, ideaDraft, previewDish } from './api.js'
import { NewDish } from './Dish.jsx'
import { formatMacro } from './food.js'
import PonerEnPlan, { frasePuesto } from './PonerEnPlan.jsx'

// Lo que le dice la pantalla a quien está delante cuando la página no sirve.
// «Un resultado vacío tiene que nombrar el fallo correcto» (DESIGN.md): una
// receta que no publica sus ingredientes y una página que no contesta piden
// cosas distintas — la primera no se arregla reintentando.
export const AVISOS = {
  no_recipe_data: 'Esta receta no publica sus ingredientes. Añádelos a mano.',
  unreachable: 'No he podido abrir la receta. Añade los ingredientes a mano o inténtalo más tarde.',
}

const numero = (text) => Number(String(text ?? '').replace(',', '.'))
const valido = (text) => {
  const n = numero(text)
  return String(text ?? '').trim() !== '' && Number.isFinite(n) && n > 0
}
// Los gramos que manda el servidor, como texto de campo. `null` es «no se
// sabe» y se queda vacío (el campo pinta `—`), nunca «0».
const aCampo = (grams) => (grams == null ? '' : String(grams))

function lineaInicial(line) {
  return {
    text: line.text,
    status: line.status,
    candidates: line.candidates,
    food: line.food,
    grams: aCampo(line.grams),
    // Los gramos que tecleas tú no los pisa un cambio de raciones.
    edited: false,
  }
}

// Qué le falta al borrador para poder guardarse, en una frase. En el orden en
// que se resuelve de arriba abajo en la pantalla.
export function motivoBloqueo({ name, servings, lines }) {
  if (!name.trim()) return 'Ponle nombre al plato.'
  if (!valido(servings)) return 'Dime para cuántas raciones es.'
  if (lines.length === 0) return 'Un plato necesita al menos un ingrediente.'
  const falta = lines.find((l) => l.status === 'missing')
  if (falta) return `«${falta.text}» no está en tus alimentos: quítala para guardar.`
  const cual = lines.find((l) => !l.food)
  if (cual) return `Elige cuál es «${cual.text}».`
  const sinGramos = lines.find((l) => !valido(l.grams))
  if (sinGramos) return `Faltan los gramos de ${sinGramos.food.name}.`
  return null
}

const MACROS = [
  ['kcal', 'kcal'],
  ['protein', 'prot'],
  ['carbs', 'hc'],
  ['fat', 'grasa'],
]

function Linea({ line, onPick, onGrams, onDrop }) {
  const sinAlimento = !line.food
  return (
    <li className="draft-line">
      <div className="draft-line-main">
        <p className="draft-line-food">
          {line.status === 'missing' ? (
            <span className="draft-line-missing">Falta: {line.text}</span>
          ) : sinAlimento ? (
            <span className="draft-line-ask">¿Cuál?</span>
          ) : (
            line.food.name
          )}
        </p>
        {/* Lo que dice la receta, siempre: es contra lo que se comprueba. */}
        {line.status !== 'missing' && <p className="draft-line-text">{line.text}</p>}
      </div>
      {line.status !== 'missing' && (
        <label className="draft-line-grams">
          <input
            inputMode="decimal"
            aria-label={`Gramos por ración de ${line.food?.name ?? line.text}`}
            value={line.grams}
            placeholder="—"
            onChange={(e) => onGrams(e.target.value)}
          />
          <span aria-hidden="true">g</span>
        </label>
      )}
      <button
        type="button"
        className="dish-ingredient-drop"
        aria-label={`Quitar ${line.text}`}
        onClick={onDrop}
      >
        ✕
      </button>
      {line.status === 'ambiguous' && (
        <div className="draft-line-choices" role="group" aria-label={`¿Cuál es ${line.text}?`}>
          {line.candidates.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chip draft-choice${line.food?.id === c.id ? ' is-active' : ''}`}
              aria-pressed={line.food?.id === c.id}
              onClick={() => onPick(c)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </li>
  )
}

/**
 * Una idea abierta como plato: lo que publica su página, sin guardar.
 *
 * Nada se decide por la persona. Una línea con un alimento claro llega
 * elegida; con varios, pregunta «¿Cuál?»; sin ninguno dice «Falta» y no deja
 * guardar hasta que se quite — una web no da de alta alimentos. Los gramos que
 * la receta no da («2 huevos») se quedan en `—` hasta que alguien los escriba:
 * NULL no es 0. Y si la página no dice para cuántos es, se pregunta en vez de
 * dividir entre uno.
 *
 * La pantalla no hace cuentas: los gramos por ración los reparte el servidor
 * (`gramos_por_racion`) y las macros también (`POST /dishes/preview`).
 * Guardar va por `POST /dishes`, la puerta de siempre, con la idea anotada.
 */
export function IdeaDraft({ idea, onSaved, onCancel, onPuesto = null }) {
  const [draft, setDraft] = useState(null)
  const [name, setName] = useState(idea.name)
  const [servings, setServings] = useState('')
  const [lines, setLines] = useState([])
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  // El plato ya guardado. A partir de aquí la pantalla deja de ser un borrador.
  const [guardado, setGuardado] = useState(null)
  const vivo = useRef(true)

  // Guardar no cierra: quien llamó se entera (la fila pasa a «Guardado») y la
  // pantalla se queda para ofrecer lo siguiente, que es ponerlo en el plan.
  const alGuardar = (dish) => {
    setGuardado(dish)
    onSaved(dish)
  }

  useEffect(() => {
    vivo.current = true
    ideaDraft(idea.id)
      .then((d) => {
        if (!vivo.current) return
        setDraft(d)
        setServings(d.servings == null ? '' : String(d.servings))
        setLines(d.lines.map(lineaInicial))
      })
      .catch(() => vivo.current && setDraft({ refusal: 'unreachable', lines: [] }))
    return () => {
      vivo.current = false
    }
  }, [idea.id])

  // Otras raciones: el servidor vuelve a repartir los gramos de la receta. Lo
  // que tecleaste tú se queda como está.
  useEffect(() => {
    if (!draft || draft.refusal || !valido(servings)) return undefined
    const n = numero(servings)
    if (n === draft.servings) return undefined
    const t = setTimeout(async () => {
      try {
        const d = await ideaDraft(idea.id, { servings: n })
        if (!vivo.current) return
        setDraft(d)
        setLines((prev) =>
          prev.map((l, i) => {
            const nueva = d.lines.find((x) => x.text === l.text) ?? d.lines[i]
            return l.edited || !nueva ? l : { ...l, grams: aCampo(nueva.grams) }
          }),
        )
      } catch {
        // Sin red se queda lo que había; guardar tampoco podrá, y lo dirá.
      }
    }, 250)
    return () => clearTimeout(t)
  }, [servings, draft, idea.id])

  const bloqueo = draft && !draft.refusal ? motivoBloqueo({ name, servings, lines }) : null
  const completo = draft && !draft.refusal && lines.length > 0 && lines.every((l) => l.food && valido(l.grams))

  // Las macros por ración, cuando cada línea tiene alimento y gramos. Antes no
  // hay cifra que enseñar: una suma a la que le falta un ingrediente no es
  // «casi» la del plato, es otra.
  const clave = completo ? JSON.stringify(lines.map((l) => [l.food.id, numero(l.grams)])) : null
  useEffect(() => {
    if (!clave) {
      setPreview(null)
      return undefined
    }
    const t = setTimeout(async () => {
      try {
        const p = await previewDish({
          servings: 1,
          ingredients: JSON.parse(clave).map(([food_id, grams]) => ({ food_id, grams })),
        })
        if (vivo.current) setPreview(p)
      } catch {
        if (vivo.current) setPreview(null)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [clave])

  if (guardado) {
    return <Guardado dish={guardado} onDone={onCancel} onPuesto={onPuesto} />
  }

  if (draft?.refusal) {
    return (
      <NewDish
        initialName={idea.name}
        recipeUrl={idea.url}
        ideaId={idea.id}
        notice={AVISOS[draft.refusal] ?? AVISOS.unreachable}
        onCreated={alGuardar}
        onCancel={onCancel}
      />
    )
  }

  const cambiar = (i, patch) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const quitar = (i) => setLines((prev) => prev.filter((_, j) => j !== i))

  async function guardar() {
    if (bloqueo || saving) return
    setSaving(true)
    setError(null)
    try {
      const dish = await createDish({
        name: name.trim(),
        // Los gramos del borrador ya son de una ración: el plato se guarda así.
        servings: 1,
        basis: 'raw',
        method: draft.method ?? null,
        idea_id: idea.id,
        ingredients: lines.map((l) => ({ food_id: l.food.id, grams: numero(l.grams) })),
      })
      alGuardar(dish)
    } catch (err) {
      setError(
        err?.status === 409 && typeof err.detail === 'string'
          ? `No se ha guardado: ${err.detail}.`
          : 'No se ha podido guardar el plato. Inténtalo otra vez.',
      )
    } finally {
      if (vivo.current) setSaving(false)
    }
  }

  return (
    <div className="food-screen" role="dialog" aria-modal="true" aria-label="Convertir en plato">
      <header className="food-screen-head">
        <p className="food-screen-title">
          <span className="card-eyebrow">Alta de plato</span>
          <span className="food-screen-slot">De una receta</span>
        </p>
        <button type="button" className="link-btn" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      </header>

      <div className="food-screen-body draft-body">
        {!draft ? (
          <p className="ideas-lead">Leyendo la receta…</p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="draft-name">Nombre</label>
              <input
                id="draft-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="field draft-servings">
              <label htmlFor="draft-servings">¿Para cuántas raciones es?</label>
              <input
                id="draft-servings"
                inputMode="decimal"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
              />
              <p className="draft-hint">
                {draft.servings_published
                  ? 'Lo dice la receta. Los gramos de abajo son de una ración.'
                  : 'La receta no lo dice. Los gramos de abajo son de una ración.'}
              </p>
            </div>

            <p className="card-eyebrow draft-eyebrow">Ingredientes · por ración</p>
            <ul className="draft-lines">
              {lines.map((line, i) => (
                <Linea
                  key={line.text + i}
                  line={line}
                  onPick={(food) => cambiar(i, { food })}
                  onGrams={(grams) => cambiar(i, { grams, edited: true })}
                  onDrop={() => quitar(i)}
                />
              ))}
            </ul>

            <div className="draft-macros" aria-label="Por ración">
              <p className="card-eyebrow">Por ración</p>
              <dl className="draft-macro-row">
                {MACROS.map(([key, label]) => (
                  <div key={key} className="draft-macro">
                    <dt>{label}</dt>
                    <dd>{formatMacro(preview?.per_serving?.[key])}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <p className="draft-source">
              <a href={idea.url} target="_blank" rel="noopener noreferrer">
                Ver receta original ↗
              </a>
            </p>
          </>
        )}
      </div>

      {/* Fijo abajo, como la barra de Ideas, con su fundido. Aquí sí es ámbar:
          guardar es lo que se viene a hacer a esta pantalla. */}
      <div className="ideas-bar">
        <div className="ideas-bar-inner">
          <button
            type="button"
            className="primary btn-full draft-save"
            onClick={guardar}
            disabled={!draft || Boolean(bloqueo) || saving}
          >
            {saving ? 'Guardando…' : 'Guardar en mis platos'}
          </button>
          <p className={`ideas-status${error ? ' draft-error' : ''}`} role="status">
            {error ?? bloqueo ?? ''}
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * El plato recién guardado. Terminar es «Hecho», donde estaba «Cancelar»; lo
 * que se ofrece es ponerlo ya en un hueco de esta semana, en gris y no en ámbar:
 * el plato está guardado y el trabajo de esta pantalla, hecho — el plan es un
 * paso de más que no todos los platos necesitan hoy.
 */
function Guardado({ dish, onDone, onPuesto }) {
  const [hoja, setHoja] = useState(false)
  const [puesto, setPuesto] = useState(null)

  return (
    <div className="food-screen" role="dialog" aria-modal="true" aria-label="Plato guardado">
      <header className="food-screen-head">
        <p className="food-screen-title">
          <span className="card-eyebrow">Alta de plato</span>
          <span className="food-screen-slot">De una receta</span>
        </p>
        <button type="button" className="link-btn" onClick={onDone}>
          Hecho
        </button>
      </header>

      <div className="food-screen-body draft-body">
        <p className="draft-saved">
          <span className="draft-saved-tick" aria-hidden="true">
            ✓
          </span>
          Guardado en tus platos.
        </p>
        <h2 className="draft-saved-name">{dish.name}</h2>
      </div>

      <div className="ideas-bar">
        <div className="ideas-bar-inner">
          <button type="button" className="secondary btn-full ideas-more" onClick={() => setHoja(true)}>
            Ponerlo en el plan
          </button>
          <p className="ideas-status" role="status">
            {puesto ? frasePuesto(puesto) : ''}
          </p>
        </div>
      </div>

      {hoja && (
        <PonerEnPlan
          dish={dish}
          onClose={() => setHoja(false)}
          onPuesto={(fila) => {
            setPuesto(fila)
            onPuesto?.(fila)
          }}
        />
      )}
    </div>
  )
}
