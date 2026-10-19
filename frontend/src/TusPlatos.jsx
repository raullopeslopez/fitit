import { useCallback, useEffect, useState } from 'react'

import { correctDish, listDishes, weighBatch } from './api.js'
import { amountWithMeasure, foodDayIso, formatMacro } from './food.js'
import { NewDish, ProposeDishes } from './Dish.jsx'
import { Chip, Sheet } from './ui'

// Los cuatro huecos en el orden del día, con su nombre. El mismo orden que el
// backend (`MealSlot`) y que `Plan.jsx`.
const COMIDAS = [
  ['desayuno', 'Desayuno'],
  ['comida', 'Comida'],
  ['cena', 'Cena'],
  ['snack', 'Snack'],
]
const NOMBRE = Object.fromEntries(COMIDAS)

/**
 * Tus platos: lo que el plan baraja, a la vista y corregible.
 *
 * Hasta aquí los platos no tenían casa —un chip en la hoja de añadir, un botón
 * debajo, ninguna lista—, y el plan podía poner una pizza de desayuno sin que
 * hubiera dónde decirle que no. Cuelga de «Planificar la semana que viene»
 * porque es ahí donde importa qué platos hay: justo antes de generar.
 *
 * Un plato sin comidas (`slots` a null) **no es uno que no va en ninguna**: el
 * planificador lo lee como «vale para cualquiera». Por eso se enseña así y va
 * primero: es lo que hay que arreglar.
 */
export default function TusPlatos({
  onClose,
  onChanged = () => {},
  leer = listDishes,
  corregir = correctDish,
  pesar = weighBatch,
}) {
  const [platos, setPlatos] = useState(null)
  const [abierto, setAbierto] = useState(null)
  const [nuevo, setNuevo] = useState(false)
  // Qué comida se mira (Marcador): `null` es todas. Un plato sin comidas va
  // en cualquiera, así que sale en todas.
  const [filtro, setFiltro] = useState(null)

  const cargar = useCallback(async () => {
    try {
      setPlatos((await leer()) ?? [])
    } catch {
      setPlatos([])
    }
  }, [leer])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function cambiado() {
    await cargar()
    await onChanged()
  }

  if (nuevo) {
    return (
      <NewDish
        onCreated={async () => {
          setNuevo(false)
          await cambiado()
        }}
        onCancel={() => setNuevo(false)}
      />
    )
  }

  const todos = ordenados(platos ?? [])
  const lista = filtro ? todos.filter((p) => !p.slots?.length || p.slots.includes(filtro)) : todos
  const sinAsignar = todos.filter((p) => !p.slots?.length).length

  return (
    <div className="food-screen" role="dialog" aria-modal="true" aria-label="Tus platos">
      <header className="food-screen-head">
        <p className="food-screen-title">
          <span className="card-eyebrow">Planificar</span>
          <span className="food-screen-slot">Tus platos</span>
        </p>
        <span className="platos-head-acciones">
          {/* Dar de alta, en la cabecera: el «+» de la pantalla. */}
          <button type="button" className="platos-nuevo" aria-label="Nuevo plato" onClick={() => setNuevo(true)}>
            +
          </button>
          <button type="button" className="link-btn" onClick={onClose}>
            Cerrar
          </button>
        </span>
      </header>

      <div className="food-screen-body">
        <div className="platos-filtro" role="group" aria-label="Qué comida">
          {[[null, 'Todos'], ...COMIDAS].map(([key, label]) => (
            <button
              key={label}
              type="button"
              className="platos-filtro-chip"
              aria-pressed={filtro === key}
              onClick={() => setFiltro(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <ProposeDishes onCreated={cambiado} />

        {sinAsignar > 0 && (
          <p className="platos-aviso">
            {sinAsignar === 1
              ? '1 plato sin comida asignada: el plan puede ponerlo en cualquiera.'
              : `${sinAsignar} platos sin comida asignada: el plan puede ponerlos en cualquiera.`}
          </p>
        )}

        {platos && lista.length === 0 && (
          <p className="hint">Todavía no tienes platos. Crea uno o pide que te los propongan.</p>
        )}

        <ul className="platos-lista">
          {lista.map((p) => (
            <li key={p.id}>
              <button type="button" className="platos-fila" onClick={() => setAbierto(p)}>
                <span className="platos-fila-main">
                  <span className="platos-nombre">{p.name}</span>
                  <span className="platos-comidas">{comidas(p)}</span>
                </span>
                <span className="platos-cifras">
                  {/* «42 P», como el botón de añadir: «42 g» a secas no dice de qué. */}
                  <span>{`${cifra(p.per_serving?.protein)} P`}</span>
                  <span className="platos-kcal">{`${cifra(p.per_serving?.kcal)} kcal`}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {abierto && (
        <HojaPlato
          plato={abierto}
          corregir={corregir}
          pesar={pesar}
          onClose={() => setAbierto(null)}
          onSaved={async () => {
            setAbierto(null)
            await cambiado()
          }}
        />
      )}
    </div>
  )
}

function HojaPlato({ plato, corregir, pesar, onClose, onSaved }) {
  const [elegidas, setElegidas] = useState(() => new Set(plato.slots ?? []))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  function alternar(slot) {
    setElegidas((antes) => {
      const despues = new Set(antes)
      if (despues.has(slot)) despues.delete(slot)
      else despues.add(slot)
      return despues
    })
  }

  async function guardar() {
    setBusy(true)
    setError(false)
    try {
      // En el orden del día, no en el de los toques: es lo que el plan lee.
      await corregir(plato.id, { slots: COMIDAS.map(([s]) => s).filter((s) => elegidas.has(s)) })
      await onSaved()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open title={plato.name} onClose={onClose}>
      <ul className="platos-ingredientes">
        {plato.ingredients.map((i) => (
          <li key={i.id}>
            <span>{i.food_name}</span>
            <span className="platos-gramos">{amountWithMeasure(i.grams, `${cifra(i.grams)} g`)}</span>
          </li>
        ))}
      </ul>

      <Olla plato={plato} pesar={pesar} onSaved={onSaved} />

      <p className="card-eyebrow">Sirve para</p>
      <div className="perfil-chips" role="group" aria-label="Sirve para">
        {COMIDAS.map(([slot, nombre]) => (
          <Chip key={slot} selected={elegidas.has(slot)} onClick={() => alternar(slot)}>
            {nombre}
          </Chip>
        ))}
      </div>
      {elegidas.size === 0 && (
        <p className="hint">Sin ninguna elegida, el plan puede ponerlo en cualquier comida.</p>
      )}

      {error && <p className="alert">No se ha podido guardar.</p>}
      <button type="button" className="primary btn-full" disabled={busy} onClick={guardar}>
        Guardar
      </button>
    </Sheet>
  )
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

function cuando(iso) {
  if (iso === foodDayIso()) return 'Pesada hoy'
  const [y, m, d] = iso.split('-').map(Number)
  return `Pesada el ${DIAS[new Date(y, m - 1, d).getDay()]}`
}

/**
 * La olla del plato (registro sin huecos, fase 5): se pesa una vez, al
 * sacarla del fuego, y cada comida de esa semana es una parte de ella. Pesar
 * otra sustituye a la anterior.
 */
function Olla({ plato, pesar, onSaved }) {
  const [pesando, setPesando] = useState(false)
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const gramos = Number(texto.replace(',', '.'))
  const olla = plato.batch

  async function guardar() {
    setBusy(true)
    setError(false)
    try {
      await pesar(plato.id, gramos)
      await onSaved()
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  return (
    <>
      <p className="card-eyebrow">La olla</p>
      {pesando ? (
        <div className="platos-olla-pesar">
          <input
            aria-label="Peso de la olla cocinada"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            placeholder="2400"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <span>g</span>
          <button type="button" className="secondary" disabled={busy || !(gramos > 0)} onClick={guardar}>
            Guardar peso
          </button>
        </div>
      ) : olla ? (
        <p className="platos-olla">
          <span>{`${cuando(olla.cooked_on)} · ${formatMacro(Math.round(olla.cooked_grams))} g`}</span>
          <button type="button" className="link-btn" onClick={() => setPesando(true)}>
            Pesar otra
          </button>
        </p>
      ) : (
        <>
          <p className="hint">Pésala al sacarla del fuego y cada comida será una parte de ella.</p>
          <button type="button" className="secondary" onClick={() => setPesando(true)}>
            Pesar la olla
          </button>
        </>
      )}
      {error && <p className="alert">No se ha podido guardar.</p>}
    </>
  )
}

function ordenados(platos) {
  return [...platos].sort((a, b) => {
    const sinA = a.slots?.length ? 1 : 0
    const sinB = b.slots?.length ? 1 : 0
    return sinA - sinB || a.name.localeCompare(b.name, 'es')
  })
}

function comidas(plato) {
  if (!plato.slots?.length) return 'Cualquier comida'
  return plato.slots.map((s) => NOMBRE[s] ?? s).join(' · ')
}

// `NULL` no es `0`: un macro sin medir se pinta como raya.
function cifra(valor) {
  return valor == null ? '—' : String(Math.round(valor))
}
