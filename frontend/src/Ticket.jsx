import { useState } from 'react'

import { savePantry } from './api.js'
import { aGuardar } from './Fuera.jsx'
import { Linea } from './ImportarPlan.jsx'

function guardados(n) {
  return n === 1 ? '1 alimento guardado en casa.' : `${n} alimentos guardados en casa.`
}

/**
 * El ticket de la compra (registro sin huecos, fase 6.1): lo leído, para
 * revisar, y después cómo fue la compra contra la lista de la semana.
 *
 * Las cantidades y los alimentos los ha interpretado un modelo leyendo un
 * ticket sin códigos y con los nombres cortados, así que esta pantalla es
 * obligatoria (CLAUDE.md). Lo dudoso se elige igual que en «Subir plan».
 */
export default function Ticket({ lineas, weekStart, guardar = savePantry, onClose }) {
  const [estados, setEstados] = useState(() =>
    lineas.map((l) => ({ alimento: l.food?.id ?? null, gramos: l.grams ?? null })),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [compra, setCompra] = useState(null)
  const items = aGuardar(estados)

  async function onGuardar() {
    setBusy(true)
    setError(null)
    try {
      setCompra(await guardar(items, weekStart))
    } catch {
      setError('No se ha podido guardar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="food-screen" role="dialog" aria-modal="true" aria-label="Ticket de la compra">
      <header className="food-screen-head">
        <p className="food-screen-title">
          <span className="card-eyebrow">Ticket de la compra</span>
          <span className="food-screen-slot">{compra ? 'En casa' : 'Revisa la compra'}</span>
        </p>
        <button type="button" className="link-btn" onClick={onClose}>
          Cerrar
        </button>
      </header>

      <div className="food-screen-body fuera">
        {compra ? (
          <>
            <p className="ticket-guardado">{guardados(compra.saved)}</p>
            {compra.in_list == null ? (
              <p className="hint">Esta semana no tiene lista con la que compararlo.</p>
            ) : (
              <>
                <p className="ticket-cuenta">{`${compra.in_list} en tu lista · ${compra.off_list} fuera de lista`}</p>
                <p className="ticket-falta">
                  {compra.missing.length ? `Falta: ${compra.missing.join(', ')}` : 'No falta nada de la lista.'}
                </p>
              </>
            )}
            <button type="button" className="primary fuera-accion" onClick={onClose}>
              Hecho
            </button>
          </>
        ) : (
          <>
            <p className="hint">Cantidades leídas del ticket: revisa lo dudoso antes de guardar.</p>
            <ul className="importar-lineas">
              {lineas.map((linea, i) => (
                <Linea
                  key={i}
                  linea={linea}
                  estado={estados[i]}
                  onCambio={(nuevo) => setEstados((todos) => todos.map((e, j) => (j === i ? nuevo : e)))}
                />
              ))}
            </ul>
            {error && <p className="alert">{error}</p>}
            <button
              type="button"
              className="primary fuera-accion"
              disabled={busy || items.length === 0}
              onClick={onGuardar}
            >
              Guardar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
