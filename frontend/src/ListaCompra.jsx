import { useEffect, useState } from 'react'

import { getShoppingList, sendShoppingToTaski } from './api.js'
import { formatIsoDayMonth } from './format.js'
import { storage } from './platform/storage.js'

// Lo que se recuerda en este móvil. Una comodidad, no un dato: si se pierde,
// la lista vuelve a salir entera, que es lo seguro. Lo que tienes en casa va
// por alimento y para todas las semanas: el aceite no se compra cada lunes.
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

/** Lo que ha pasado al enviar, en una línea. */
export function resumenEnvio({ added, already }) {
  if (added === 0) return 'Taski ya lo tenía todo'
  const anadidos = `${added} ${added === 1 ? 'añadido' : 'añadidos'} a Taski`
  if (already === 0) return anadidos
  return `${anadidos} · ${already} ${already === 1 ? 'ya estaba' : 'ya estaban'}`
}

/**
 * La lista de la compra de una semana (comida simple, fase 6; lienzo fila
 * Premium · Compra). Taski es donde se compra, así que aquí sólo se decide una
 * cosa: qué tienes ya en casa. Lo demás se manda.
 *
 * - La cifra grande es lo que queda por comprar.
 * - Cada artículo lleva un círculo: tocarlo es «ya lo tengo»; se apaga en su
 *   sitio (no se va a otra sección) y deja de contar. Se recuerda para las
 *   semanas siguientes: el aceite no se compra cada lunes.
 * - «Enviar a Taski» manda lo que queda; enviada, una banda lo dice.
 *
 * El «en el carro» de antes sale: tachar en el súper es de Taski.
 */
export default function ListaCompra({ weekStart, onClose, leer = getShoppingList, enviar = sendShoppingToTaski }) {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState(false)
  const [loTengo, setLoTengo] = useState(() => leerIds(CLAVE_LO_TENGO))
  // null · 'enviando' · { ok: texto } · { error: texto }
  const [envio, setEnvio] = useState(null)

  useEffect(() => {
    let vivo = true
    leer(weekStart)
      .then((datos) => vivo && setLista(datos))
      .catch(() => vivo && setError(true))
    return () => {
      vivo = false
    }
  }, [weekStart, leer])

  // Desde el estado de antes y no desde el del último pintado: dos toques
  // seguidos (un pasillo repasado deprisa) no pueden pisarse.
  function alternarTengo(id) {
    setLoTengo((antes) => {
      const nuevo = new Set(antes)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      guardarIds(CLAVE_LO_TENGO, nuevo)
      return nuevo
    })
  }

  const todos = (lista?.aisles ?? []).flatMap((a) => a.items)
  const apartados = todos.filter((i) => loTengo.has(i.food_id))
  const quedan = todos.length - apartados.length

  async function enviarATaski() {
    setEnvio('enviando')
    try {
      setEnvio({ ok: resumenEnvio(await enviar(weekStart, apartados.map((i) => i.food_id))) })
    } catch {
      setEnvio({ error: 'Taski no ha contestado. Prueba otra vez en un rato.' })
    }
  }

  return (
    <div className="food-screen lista-compra" role="dialog" aria-modal="true" aria-label="Lista de la compra">
      <header className="food-screen-head">
        <p className="food-screen-title">
          <span className="card-eyebrow">{`Semana del ${formatIsoDayMonth(weekStart)}`}</span>
          <span className="food-screen-slot">Compra</span>
        </p>
        <button type="button" className="link-btn" onClick={onClose}>
          Cerrar
        </button>
      </header>

      <div className="food-screen-body">
        {error && <p className="alert">No se ha podido cargar la lista.</p>}

        {lista && todos.length === 0 && <p className="hint">Esta semana no tiene nada que comprar.</p>}

        {todos.length > 0 && (
          <div className="lista-cifra-bloque">
            <p className="lista-cifra">
              <span className="lista-cifra-n">{quedan}</span>
              <span className="lista-cifra-de">cosas que comprar</span>
            </p>
            <p className="lista-cifra-pista">
              Marca lo que ya tienes en casa.
              {apartados.length > 0 && (
                <>
                  {' '}
                  <span className="lista-cifra-fuera">{apartados.length}</span> fuera.
                </>
              )}
            </p>
          </div>
        )}

        {(lista?.aisles ?? [])
          .filter((p) => p.items.length > 0)
          .map((pasillo) => (
            <section key={pasillo.name} className="lista-pasillo">
              <h3 className="lista-pasillo-nombre">{pasillo.name}</h3>
              <ul className="lista-items">
                {pasillo.items.map((item) => {
                  const tengo = loTengo.has(item.food_id)
                  return (
                    <li key={item.food_id} className={`lista-fila${tengo ? ' is-tengo' : ''}`}>
                      <button
                        type="button"
                        className="lista-circulo"
                        aria-label={`Ya lo tengo: ${item.name}`}
                        aria-pressed={tengo}
                        onClick={() => alternarTengo(item.food_id)}
                      >
                        <span aria-hidden="true">{tengo ? '✓' : ''}</span>
                      </button>
                      <span className="lista-nombre">{item.name}</span>
                      <span className="lista-cantidad">{cantidad(item)}</span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}

        {quedan > 0 && (
          <div className="lista-taski">
            {envio?.ok ? (
              <div className="lista-enviada" role="status" aria-label="En Taski">
                <span className="lista-enviada-titulo">
                  <span aria-hidden="true">✓</span> En Taski
                </span>
                <span className="lista-enviada-texto">{envio.ok}</span>
              </div>
            ) : (
              <>
                <button type="button" className="lista-enviar" disabled={envio === 'enviando'} onClick={enviarATaski}>
                  {envio === 'enviando' ? 'Enviando a Taski…' : 'Enviar a Taski'}
                </button>
                {/* Taski duerme en Render y el servidor lo espera hasta que
                    arranca: sin esto, un minuto con el botón gris parece colgado. */}
                {envio === 'enviando' && <p className="hint">Si Taski estaba dormido, tarda hasta un minuto.</p>}
                {envio?.error && <p className="alert">{envio.error}</p>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
