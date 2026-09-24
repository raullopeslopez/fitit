import { useEffect, useRef, useState } from 'react'

import { dishIdeas } from './api.js'
import { motivo } from './Dish.jsx'
import { formatDayMonth } from './format.js'
import { IdeaDraft } from './IdeaDraft.jsx'
import PonerEnPlan from './PonerEnPlan.jsx'

// «Acelga, cruda» -> «acelga». Los nombres de CIQUAL llevan el estado detrás de
// la primera coma, y «Ideas con acelga, cruda» suena a ficha, no a pregunta.
export function shortFoodName(name) {
  return (name ?? '').split(',')[0].trim().toLowerCase()
}

// De dónde sale la receta, sin el `www.`: es lo que se reconoce de un vistazo.
function domain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// La línea de debajo del botón. Dice qué ha pasado con lo último que se pidió,
// y cuando no ha pasado nada, qué hay y cómo conseguir más.
function statusLine(result, pidioMas) {
  if (!result) return null
  if (result.refusal) return motivo(result.refusal, result.quota_scope)
  const total = result.ideas.length
  if (pidioMas) {
    const nuevas = result.new_count
      ? `${plural(result.new_count, 'idea nueva', 'ideas nuevas')}`
      : 'Ninguna idea nueva'
    return `${nuevas} · ${plural(total, 'guardada', 'guardadas')}`
  }
  if (!total) return 'No ha salido ninguna receta. «Otras ideas» vuelve a buscar.'
  return `Guardadas el ${formatDayMonth(result.stored_at)} · «Otras ideas» busca más`
}

// La fila sigue siendo el enlace a la receta, tal como se aprobó. Convertirla
// en plato va al lado, en su propia columna: un botón dentro de un enlace no es
// HTML válido y el toque no sabría cuál de los dos es. Callado —muted, sin
// relleno—: es una vez por receta, no lo que se viene a hacer aquí.
//
// Ya guardada, la misma columna dice «✓ Guardado» y es la puerta de «Ponerlo en
// el plan» con **tu** plato: igual de callada, porque sigue sin ser lo que se
// viene a hacer a esta pantalla.
function ToDish({ idea, onDraft, onPlan }) {
  if (idea.dish_id != null) {
    // Sin `dish_name` (un servidor anterior) el mejor nombre es el de la idea.
    const dish = { id: idea.dish_id, name: idea.dish_name ?? idea.name }
    return (
      <button
        type="button"
        className="idea-to-dish idea-saved"
        aria-label={`Ponerlo en el plan: ${dish.name}`}
        onClick={() => onPlan(dish)}
      >
        <span className="idea-saved-tick" aria-hidden="true">
          ✓
        </span>
        Guardado
      </button>
    )
  }
  return (
    <button
      type="button"
      className="idea-to-dish"
      aria-label={`Convertir en plato: ${idea.name}`}
      onClick={() => onDraft(idea)}
    >
      <span aria-hidden="true">+</span>
      Plato
    </button>
  )
}

function IdeaRow({ idea, marcar, onDraft, onPlan }) {
  return (
    <li className="idea-item">
      <a className="idea" href={idea.url} target="_blank" rel="noopener noreferrer">
        <span className="idea-main">
          <span className="idea-name">
            {idea.name}
            {marcar && idea.new && <span className="idea-new">Nueva</span>}
          </span>
          <span className="idea-source">{domain(idea.url)} ↗</span>
        </span>
        <span className="idea-spec">
          {/* Sin minutos no hay cifra: una receta que no lo dice no tarda cero. */}
          {idea.minutes != null && (
            <span className="idea-min">
              {idea.minutes}
              <small>MIN</small>
            </span>
          )}
          {idea.method && <span className="idea-method">{idea.method}</span>}
        </span>
      </a>
      {onDraft && <ToDish idea={idea} onDraft={onDraft} onPlan={onPlan} />}
    </li>
  )
}

function SkeletonRow() {
  return (
    <li aria-hidden="true">
      <div className="idea idea-skeleton">
        <span className="idea-main">
          <span className="ideas-bone" style={{ width: '70%' }} />
          <span className="ideas-bone ideas-bone-thin" style={{ width: '40%' }} />
        </span>
      </div>
    </li>
  )
}

/**
 * Ideas con un alimento: recetas de la web, con enlace a la original.
 *
 * Las ideas son para mirar, no para guardar: ninguna se convierte en plato por
 * estar aquí. Lo que se guarda es la búsqueda, contra el alimento, así que
 * abrir esto otra vez es instantáneo y no gasta nada. Sólo «Otras ideas» vuelve
 * a buscar, y lo que encuentra se pone arriba, marcado.
 */
export function IdeasScreen({ food, onClose, onPlanChanged = null }) {
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(true)
  const [pidioMas, setPidioMas] = useState(false)
  // La idea abierta como plato, o `null`.
  const [borrador, setBorrador] = useState(null)
  // Tu plato de una idea ya guardada, camino del plan, o `null`.
  const [alPlan, setAlPlan] = useState(null)
  const vivo = useRef(true)

  // Guardada: su fila pasa a decir «Guardado» sin volver a pedir la lista. El
  // borrador no se cierra aquí: se queda ofreciendo ponerlo en el plan.
  const guardada = (idea, dish) => {
    setResult((prev) =>
      prev
        ? {
            ...prev,
            ideas: prev.ideas.map((i) =>
              i.id === idea.id ? { ...i, dish_id: dish.id, dish_name: dish.name ?? null } : i,
            ),
          }
        : prev,
    )
  }
  const corto = shortFoodName(food.name)

  const pedir = async (more) => {
    setBusy(true)
    let res
    try {
      res = await dishIdeas(food.id, { more })
    } catch {
      // Sin red el servidor no contesta ni con un `refusal`. Lo guardado que
      // ya se veía se queda; sólo cambia lo que se dice debajo.
      res = { ...(result ?? { ideas: [], new_count: 0, stored_at: null }), refusal: 'unavailable' }
    }
    if (!vivo.current) return
    setResult(res)
    setPidioMas(more)
    setBusy(false)
  }

  useEffect(() => {
    vivo.current = true
    pedir(false)
    return () => {
      vivo.current = false
    }
    // Sólo al abrir: volver a pedir es cosa de «Otras ideas».
  }, [food.id])

  const ideas = result?.ideas ?? []
  const primeraVez = busy && !result
  // La cuota del día no se pasa pulsando: el botón se apaga hasta mañana. La
  // del minuto sí, y por eso ese caso lo deja encendido.
  const agotado =
    result?.refusal === 'off' || (result?.refusal === 'quota' && result?.quota_scope === 'day')

  return (
    <div className="food-screen" role="dialog" aria-modal="true" aria-label={`Ideas con ${corto}`}>
      <header className="food-screen-head">
        <p className="food-screen-title">
          <span className="card-eyebrow">Ideas con</span>
          <span className="food-screen-slot">{food.name}</span>
        </p>
        <button type="button" className="link-btn" onClick={onClose}>
          Cerrar
        </button>
      </header>

      <div className="food-screen-body ideas-body">
        {primeraVez && (
          <p className="ideas-lead">Buscando recetas con {corto} en la web. Tarda unos segundos.</p>
        )}
        {(primeraVez || ideas.length > 0) && (
          <div className="card ideas-card">
            <ul className="ideas-list">
              {primeraVez
                ? [0, 1, 2].map((n) => <SkeletonRow key={n} />)
                : ideas.map((idea) => (
                    <IdeaRow
                      key={idea.id}
                      idea={idea}
                      marcar={pidioMas}
                      onDraft={setBorrador}
                      onPlan={setAlPlan}
                    />
                  ))}
            </ul>
          </div>
        )}
      </div>

      {/* Fijo abajo, con el fundido de la barra de Días. `secondary` y no el
          ámbar: buscar más no es lo que se viene a hacer aquí — lo que se
          viene a hacer es abrir una receta. */}
      <div className="ideas-bar">
        <div className="ideas-bar-inner">
          <button
            type="button"
            className="secondary btn-full ideas-more"
            onClick={() => pedir(true)}
            disabled={busy || agotado}
          >
            {busy ? 'Buscando…' : 'Otras ideas'}
          </button>
          <p className="ideas-status" role="status">
            {statusLine(result, pidioMas)}
          </p>
        </div>
      </div>

      {/* Encima de las ideas, a pantalla completa como el alta de plato. Al
          cerrar se vuelve a la lista tal como estaba. */}
      {borrador && (
        <IdeaDraft
          idea={borrador}
          onSaved={(dish) => guardada(borrador, dish)}
          onCancel={() => setBorrador(null)}
          onPuesto={() => onPlanChanged?.()}
        />
      )}
      {alPlan && (
        <PonerEnPlan dish={alPlan} onClose={() => setAlPlan(null)} onPuesto={() => onPlanChanged?.()} />
      )}
    </div>
  )
}
