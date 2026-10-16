import { useState } from 'react'

import { Chip } from './ui'
import { amountWithMeasure } from './food.js'

const NOMBRE = { desayuno: 'Desayuno', comida: 'Comida', cena: 'Cena', snack: 'Snack' }
const ORDEN = ['desayuno', 'comida', 'cena', 'snack']
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

// Lo decidido sobre cada plato: si se descarta, y por cada línea qué alimento y
// cuántos gramos. Arranca con lo que propuso el servidor: lo elegido, elegido;
// lo dudoso y lo que falta, sin alimento; y los gramos, los que dio la línea
// (`null` en «2 huevos»: tiene cantidad y no peso, y NULL no es 0).
export function estadoInicial(lectura) {
  return (lectura?.dishes ?? []).map((plato) => ({
    descartado: false,
    lineas: (plato.lines ?? []).map((l) => ({ alimento: l.food?.id ?? null, gramos: l.grams ?? null })),
  }))
}

function lineasUtiles(estado) {
  return estado.lineas.filter((l) => l.alimento != null && l.gramos != null && l.gramos > 0)
}

// Un plato tuyo siempre se puede poner en la pauta; uno nuevo, sólo con algún
// ingrediente que tenga alimento y gramos — `DishIn` no admite un plato vacío.
function guardable(plato, estado) {
  return plato.status === 'existing' || lineasUtiles(estado).length > 0
}

/**
 * El cuerpo de `POST /plans/import/save` con lo decidido.
 *
 * Los platos que no entran —descartados, o nuevos sin nada que guardar— se
 * caen, y las casillas que los nombraban también: esa comida la elegirá el
 * generador. Las que quedan se renumeran contra la lista que sí se manda.
 */
export function aGuardar(lectura, estados, weekStart) {
  const indices = new Map()
  const dishes = []
  lectura.dishes.forEach((plato, i) => {
    const estado = estados[i]
    if (estado.descartado || !guardable(plato, estado)) return
    indices.set(i, dishes.length)
    dishes.push(
      plato.status === 'existing'
        ? { name: plato.name, slots: plato.slots, dish_id: plato.dish_id }
        : {
            name: plato.name,
            slots: plato.slots,
            ingredients: lineasUtiles(estado).map((l) => ({ food_id: l.alimento, grams: l.gramos })),
          },
    )
  })
  const week = lectura.week
    .filter((c) => indices.has(c.dish))
    .map((c) => ({ day: c.day, slot: c.slot, dish: indices.get(c.dish) }))
  return { week_start: weekStart, dishes, week }
}

function resumen(platos) {
  const nuevos = platos.filter((p) => p.status === 'new').length
  const tuyos = platos.length - nuevos
  return [
    platos.length === 1 ? '1 plato' : `${platos.length} platos`,
    nuevos === 1 ? '1 nuevo' : `${nuevos} nuevos`,
    tuyos === 1 ? '1 ya lo tienes' : `${tuyos} ya los tienes`,
  ].join(' · ')
}

export function Linea({ linea, estado, onCambio }) {
  const candidatos = linea.candidates ?? []
  const elegido = linea.food ?? candidatos.find((c) => c.id === estado.alimento) ?? null

  if (linea.status === 'missing') {
    return <li className="importar-linea is-falta">{`Falta: ${linea.text}. No se guarda.`}</li>
  }

  return (
    <li className="importar-linea">
      {linea.status === 'ambiguous' && (
        <>
          <span className="importar-pregunta">{`¿Cuál? ${linea.text}`}</span>
          <span className="importar-candidatos">
            {candidatos.map((c) => (
              <Chip
                key={c.id}
                selected={estado.alimento === c.id}
                onClick={() => onCambio({ ...estado, alimento: c.id })}
              >
                {c.name}
              </Chip>
            ))}
          </span>
        </>
      )}
      {linea.status === 'chosen' && elegido && (
        <span className="importar-alimento">
          {elegido.name}
          {linea.grams != null && <span className="importar-g">{amountWithMeasure(linea.grams)}</span>}
        </span>
      )}
      {linea.grams == null && estado.alimento != null && (
        <span className="importar-sin-gramos">
          <label className="importar-gramos">
            <input
              type="number"
              inputMode="decimal"
              min="1"
              aria-label={`Gramos de ${linea.text}`}
              value={estado.gramos ?? ''}
              onChange={(e) => {
                const valor = parseFloat(e.target.value.replace(',', '.'))
                onCambio({ ...estado, gramos: Number.isFinite(valor) && valor > 0 ? valor : null })
              }}
            />
            <span>g</span>
          </label>
          {estado.gramos == null && (
            <span className="hint">Sin gramos: si no los escribes, no se guarda.</span>
          )}
        </span>
      )}
    </li>
  )
}

function Plato({ plato, estado, onCambio }) {
  const vacio = plato.status === 'new' && (plato.lines ?? []).length === 0
  return (
    <article
      className={`card importar-plato${estado.descartado ? ' is-descartado' : ''}`}
      aria-label={plato.name}
    >
      <header className="importar-plato-head">
        <span className="importar-plato-nombre">{plato.name}</span>
        <span className="importar-estado">{plato.status === 'existing' ? 'Ya lo tienes' : 'Nuevo'}</span>
      </header>
      {plato.slots?.length > 0 && (
        <span className="card-eyebrow">{plato.slots.map((s) => NOMBRE[s] ?? s).join(' · ')}</span>
      )}
      {vacio && <p className="hint">Sin ingredientes: no se puede guardar.</p>}
      {plato.status === 'new' && !vacio && (
        <ul className="importar-lineas">
          {plato.lines.map((linea, i) => (
            <Linea
              key={i}
              linea={linea}
              estado={estado.lineas[i]}
              onCambio={(nueva) =>
                onCambio({ ...estado, lineas: estado.lineas.map((l, j) => (j === i ? nueva : l)) })
              }
            />
          ))}
        </ul>
      )}
      {!vacio && (
        <button
          type="button"
          className="link-btn importar-descartar"
          onClick={() => onCambio({ ...estado, descartado: !estado.descartado })}
        >
          {estado.descartado ? 'Recuperar' : 'Descartar'}
        </button>
      )}
    </article>
  )
}

function Semana({ lectura, estados }) {
  const dias = DIAS.map((nombre, d) => ({
    nombre,
    celdas: lectura.week
      .filter((c) => c.day === d)
      .sort((a, b) => ORDEN.indexOf(a.slot) - ORDEN.indexOf(b.slot)),
  })).filter((d) => d.celdas.length > 0)
  if (dias.length === 0) return null
  return (
    <section className="card importar-semana" aria-label="La semana">
      <span className="card-eyebrow">La semana</span>
      {dias.map((dia) => (
        <div key={dia.nombre} className="importar-dia">
          <p className="importar-dia-nombre">{dia.nombre}</p>
          <ul className="importar-celdas">
            {dia.celdas.map((c) => {
              const plato = lectura.dishes[c.dish]
              const entra = !estados[c.dish].descartado && guardable(plato, estados[c.dish])
              return (
                <li key={c.slot} className={entra ? '' : 'is-app'}>
                  {`${NOMBRE[c.slot] ?? c.slot} · ${entra ? plato.name : 'lo elige la app'}`}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}

/**
 * Lo que se leyó de un PDF de plan, para revisarlo antes de guardar nada.
 *
 * Las cifras las ha interpretado un modelo, y por la regla de CLAUDE.md esta
 * pantalla es obligatoria: nada entra en tu repertorio ni en la pauta hasta que
 * pulsas «Guardar». Cerrarla deja todo como estaba.
 */
export default function ImportarPlan({
  lectura,
  weekStart,
  guardar,
  onGuardado,
  onClose,
  titulo = 'Subir plan',
}) {
  const [estados, setEstados] = useState(() => estadoInicial(lectura))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const platos = lectura?.dishes ?? []
  const cuerpo = aGuardar(lectura, estados, weekStart)

  async function onGuardar() {
    setBusy(true)
    setError(null)
    try {
      await guardar(cuerpo)
      await onGuardado(cuerpo)
    } catch (err) {
      const porque = typeof err?.detail === 'string' ? err.detail : null
      setError(porque ? `No se ha podido guardar: ${porque}.` : 'No se ha podido guardar.')
      setBusy(false)
    }
  }

  return (
    <div className="food-screen" role="dialog" aria-modal="true" aria-label="Platos identificados">
      <header className="food-screen-head">
        <p className="food-screen-title">
          <span className="card-eyebrow">{titulo}</span>
          <span className="food-screen-slot">Platos identificados</span>
        </p>
        <button type="button" className="link-btn" onClick={onClose}>
          Cerrar
        </button>
      </header>

      <div className="food-screen-body importar">
        {platos.length === 0 ? (
          <p className="hint">No se ha encontrado ningún plato en el PDF.</p>
        ) : (
          <>
            <p className="importar-resumen">{resumen(platos)}</p>
            {platos.map((plato, i) => (
              <Plato
                key={i}
                plato={plato}
                estado={estados[i]}
                onCambio={(nuevo) => setEstados((todos) => todos.map((e, j) => (j === i ? nuevo : e)))}
              />
            ))}
            <Semana lectura={lectura} estados={estados} />
          </>
        )}
        {error && <p className="alert">{error}</p>}
        <button
          type="button"
          className="primary importar-guardar"
          disabled={busy || cuerpo.dishes.length === 0}
          onClick={onGuardar}
        >
          Guardar
        </button>
      </div>
    </div>
  )
}
