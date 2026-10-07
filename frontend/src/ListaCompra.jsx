import { useEffect, useState } from 'react'

import { getShoppingList } from './api.js'
import { formatIsoDayMonth } from './format.js'
import { storage } from './platform/storage.js'

// Lo que se recuerda en este móvil. Comodidades, no datos: si se pierden, la
// lista vuelve a salir entera, que es lo seguro.
//  - Lo que ya va en el carro, por semana: es de esa compra y de ninguna otra.
//  - Lo que siempre tienes en casa, por alimento y para todas las semanas: el
//    aceite no se compra cada lunes.
const claveCarro = (semana) => `fitit_compra_${semana}`
const CLAVE_LO_TENGO = 'fitit_ya_lo_tengo'

function leerIds(clave) {
  try {
    const ids = JSON.parse(storage.getItem(clave) ?? '[]')
    return new Set(Array.isArray(ids) ? ids : [])
  } catch {
    return new Set()
  }
}

function guardarIds(clave, ids) {
  try {
    storage.setItem(clave, JSON.stringify([...ids]))
  } catch {
    // Sin almacenamiento la lista funciona igual; sólo no se acuerda.
  }
}

const conComa = (n) => String(n).replace('.', ',')

function peso(gramos) {
  if (gramos >= 1000) return `${conComa(Math.round(gramos / 100) / 10)} kg`
  return `${gramos} g`
}

/** Cuánto coger: en envases si se sabe el envase, al peso si no. */
export function cantidad(item) {
  if (item.packs && item.package_grams) return `${item.packs} × ${peso(item.package_grams)}`
  return `~${peso(Math.round(item.grams / 10) * 10)}`
}

/**
 * La lista de la compra de una semana planificada (diseño A, design-shotgun 6
 * oct): contador de lo que va en el carro, pasillos con su cuenta, una casilla
 * por artículo, y «Lo tengo» para apartar lo que siempre hay en casa.
 *
 * Lo marcado baja al final de su pasillo: lo que queda por coger es lo que se
 * busca con la vista, y tiene que estar arriba.
 */
export default function ListaCompra({ weekStart, onClose, leer = getShoppingList }) {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState(false)
  const [carro, setCarro] = useState(() => leerIds(claveCarro(weekStart)))
  const [loTengo, setLoTengo] = useState(() => leerIds(CLAVE_LO_TENGO))
  const [verTengo, setVerTengo] = useState(false)

  useEffect(() => {
    let vivo = true
    leer(weekStart)
      .then((datos) => vivo && setLista(datos))
      .catch(() => vivo && setError(true))
    return () => {
      vivo = false
    }
  }, [weekStart, leer])

  function alternarCarro(id) {
    const nuevo = new Set(carro)
    if (nuevo.has(id)) nuevo.delete(id)
    else nuevo.add(id)
    setCarro(nuevo)
    guardarIds(claveCarro(weekStart), nuevo)
  }

  function alternarTengo(id) {
    const nuevo = new Set(loTengo)
    if (nuevo.has(id)) nuevo.delete(id)
    else nuevo.add(id)
    setLoTengo(nuevo)
    guardarIds(CLAVE_LO_TENGO, nuevo)
  }

  const pasillos = (lista?.aisles ?? [])
    .map((a) => ({ ...a, items: a.items.filter((i) => !loTengo.has(i.food_id)) }))
    .filter((a) => a.items.length > 0)
  const apartados = (lista?.aisles ?? []).flatMap((a) => a.items.filter((i) => loTengo.has(i.food_id)))
  const total = pasillos.reduce((n, a) => n + a.items.length, 0)
  const enCarro = pasillos.reduce((n, a) => n + a.items.filter((i) => carro.has(i.food_id)).length, 0)

  return (
    <div className="food-screen" role="dialog" aria-modal="true" aria-label="Lista de la compra">
      <header className="food-screen-head">
        <p className="food-screen-title">
          <span className="card-eyebrow">{`Semana del ${formatIsoDayMonth(weekStart)}`}</span>
          <span className="food-screen-slot">Lista de la compra</span>
        </p>
        <button type="button" className="link-btn" onClick={onClose}>
          Cerrar
        </button>
      </header>

      <div className="food-screen-body">
        {error && <p className="alert">No se ha podido cargar la lista.</p>}

        {lista && total + apartados.length === 0 && (
          <p className="hint">Esta semana no tiene nada que comprar.</p>
        )}

        {total > 0 && (
          <div className="lista-contador">
            <p className="lista-cifra">
              <span className="lista-grande">{enCarro}</span>
              <span className="lista-de">{`/ ${total} en el carro`}</span>
            </p>
            <div className="lista-barra" aria-hidden="true">
              <i style={{ width: `${(enCarro * 100) / total}%` }} />
            </div>
          </div>
        )}

        {pasillos.map((pasillo) => {
          const hechos = pasillo.items.filter((i) => carro.has(i.food_id)).length
          // Lo que queda por coger arriba; lo del carro, abajo y en su orden.
          const orden = [
            ...pasillo.items.filter((i) => !carro.has(i.food_id)),
            ...pasillo.items.filter((i) => carro.has(i.food_id)),
          ]
          return (
            <section key={pasillo.name} className="lista-pasillo">
              <h3 className="lista-pasillo-nombre">
                <span>{pasillo.name}</span>
                <span className="lista-pasillo-cuenta">{`${hechos}/${pasillo.items.length}`}</span>
              </h3>
              <ul className="lista-items">
                {orden.map((item) => {
                  const hecho = carro.has(item.food_id)
                  return (
                    <li key={item.food_id} className={`lista-fila${hecho ? ' is-done' : ''}`}>
                      <button
                        type="button"
                        className="lista-casilla"
                        aria-label="En el carro"
                        aria-pressed={hecho}
                        onClick={() => alternarCarro(item.food_id)}
                      >
                        <span aria-hidden="true">{hecho ? '✓' : ''}</span>
                      </button>
                      <span className="lista-nombre">{item.name}</span>
                      <span className="lista-cantidad">{cantidad(item)}</span>
                      <button type="button" className="link-btn lista-tengo" onClick={() => alternarTengo(item.food_id)}>
                        Lo tengo
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}

        {apartados.length > 0 && (
          <section className="lista-apartados">
            <button
              type="button"
              className="lista-apartados-cabecera"
              aria-expanded={verTengo}
              onClick={() => setVerTengo((v) => !v)}
            >
              {`Ya lo tengo · ${apartados.length}`}
            </button>
            {verTengo && (
              <ul className="lista-items">
                {apartados.map((item) => (
                  <li key={item.food_id} className="lista-fila is-tengo">
                    <span className="lista-nombre">{item.name}</span>
                    <span className="lista-cantidad">{cantidad(item)}</span>
                    <button type="button" className="link-btn lista-tengo" onClick={() => alternarTengo(item.food_id)}>
                      Lo necesito
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
