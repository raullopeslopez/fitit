import { useCallback, useEffect, useState } from 'react'

import { correctDish, listDishes } from './api.js'
import { formatMacro } from './food.js'
import { Sheet } from './ui'

const leerTusSitios = () => listDishes('', 'fuera')

// Con virgulilla: es una cifra de fuera, no una pesada. Sin cifra, `—`.
function kcal(sitio) {
  const valor = sitio.per_serving?.kcal
  return valor == null ? '— kcal' : `~${formatMacro(valor)} kcal`
}

/**
 * Perfil → Tus sitios (registro sin huecos, fase 3): donde comes fuera, cada
 * uno con su cifra, del último al que fuiste al primero.
 *
 * Un sitio es un plato tuyo `fuera`. Sus gramos los puso un modelo al estimar
 * la primera vez; corregirlos aquí los hace tuyos, y lo que apuntes desde él
 * deja de salir como estimado. Lo ya apuntado no cambia: el diario congela.
 */
export default function TusSitios({ onClose, leer = leerTusSitios, corregir = correctDish }) {
  const [sitios, setSitios] = useState(null)
  const [abierto, setAbierto] = useState(null)

  const cargar = useCallback(async () => {
    try {
      setSitios((await leer()) ?? [])
    } catch {
      setSitios([])
    }
  }, [leer])

  useEffect(() => {
    cargar()
  }, [cargar])

  return (
    <div className="food-screen" role="dialog" aria-modal="true" aria-label="Tus sitios">
      <header className="food-screen-head">
        <p className="food-screen-title">
          <span className="card-eyebrow">Comer fuera</span>
          <span className="food-screen-slot">Tus sitios</span>
        </p>
        <button type="button" className="link-btn" onClick={onClose}>
          Cerrar
        </button>
      </header>

      <div className="food-screen-body">
        {sitios && sitios.length === 0 && (
          <p className="hint">Todavía no tienes sitios. Se guardan al ponerle nombre a lo que comes fuera.</p>
        )}
        <ul className="platos-lista">
          {(sitios ?? []).map((s) => (
            <li key={s.id}>
              <button type="button" className="platos-fila" onClick={() => setAbierto(s)}>
                <span className="platos-fila-main">
                  <span className="platos-nombre">{s.name}</span>
                  {s.estimated && <span className="platos-comidas">estimado</span>}
                </span>
                <span className="platos-cifras">
                  <span className="platos-kcal">{kcal(s)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {abierto && (
        <HojaSitio
          sitio={abierto}
          corregir={corregir}
          onClose={() => setAbierto(null)}
          onSaved={async () => {
            setAbierto(null)
            await cargar()
          }}
        />
      )}
    </div>
  )
}

function gramosDe(texto) {
  const valor = Number(String(texto).replace(',', '.'))
  return texto !== '' && Number.isFinite(valor) && valor > 0 ? valor : null
}

function HojaSitio({ sitio, corregir, onClose, onSaved }) {
  const [nombre, setNombre] = useState(sitio.name)
  const [gramos, setGramos] = useState(() => sitio.ingredients.map((i) => String(i.grams)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const valores = gramos.map(gramosDe)
  const valido = nombre.trim() !== '' && valores.every((g) => g != null)

  async function guardar() {
    setBusy(true)
    setError(null)
    try {
      await corregir(sitio.id, {
        name: nombre.trim(),
        ingredients: sitio.ingredients.map((i, n) => ({ food_id: i.food_id, grams: valores[n] })),
      })
      await onSaved()
    } catch {
      setError('No se ha podido guardar.')
      setBusy(false)
    }
  }

  return (
    <Sheet open title={sitio.name} onClose={onClose}>
      <div className="field">
        <label htmlFor="sitio-nombre">Nombre</label>
        <input id="sitio-nombre" autoComplete="off" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      {sitio.estimated && (
        <p className="hint">
          Gramos estimados. Al guardar pasan a ser tuyos y lo próximo que apuntes aquí ya no sale como estimado.
        </p>
      )}
      <ul className="platos-ingredientes">
        {sitio.ingredients.map((i, n) => (
          <li key={i.id}>
            <span>{i.food_name}</span>
            <span className="sitio-gramos">
              <input
                aria-label={`Gramos de ${i.food_name}`}
                inputMode="decimal"
                autoComplete="off"
                value={gramos[n]}
                onChange={(e) => setGramos((todos) => todos.map((g, j) => (j === n ? e.target.value : g)))}
              />
              g
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="alert">{error}</p>}
      <button type="button" className="primary btn-full" disabled={busy || !valido} onClick={guardar}>
        Guardar
      </button>
    </Sheet>
  )
}
