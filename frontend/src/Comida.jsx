import { useCallback, useEffect, useRef, useState } from 'react'

import {
  correctFoodEntry,
  createFood,
  deleteFoodEntry,
  frequentFoods,
  getFoodDay,
  logFood,
  searchFoods,
} from './api.js'
import {
  MACROS,
  MEAL_SLOTS,
  foodDayIso,
  formatAmount,
  formatMacro,
  shiftDay,
  slotLabel,
  unknownNote,
} from './food.js'
import { formatDayShort } from './format.js'

// Los raíles del día: las cuatro comidas, siempre, con su subtotal y lo que
// lleven dentro. Una comida vacía **sí** se dibuja — es por donde se entra a
// registrar en ella, y un raíl que aparece y desaparece según lo que hayas
// comido mueve de sitio el control que ibas a pulsar.
//
// El montón sin asignar es la excepción: no tiene `+`, porque nadie quiere
// *decidir* no decidir, así que sólo se dibuja cuando ya hay algo en él.
//
// Los subtotales llegan del servidor (`by_slot`). Sumarlos aquí sería una
// segunda implementación de la regla de los nulos, y esa regla vive entera en
// `backend/app/nutrition.py`.
function rails(day) {
  const bySlot = day.by_slot?.length
    ? day.by_slot
    : [...MEAL_SLOTS.map((s) => ({ slot: s.key })), { slot: null }]
  return bySlot
    .map((group) => {
      const key = group.slot ?? null
      return {
        key,
        totals: group.totals ?? {},
        entries: day.entries.filter((e) => (e.meal_slot ?? null) === key),
      }
    })
    .filter((rail) => rail.key !== null || rail.entries.length > 0)
}

export default function Comida() {
  // El día que se está mirando. Arranca en el día alimentario en curso, que a
  // las 02:00 sigue siendo el de ayer — misma regla que el servidor usa para
  // fechar lo que escribes.
  const [dayIso, setDayIso] = useState(() => foodDayIso())
  const [day, setDay] = useState(null)
  // `null` = cerrado. Si no, `{ slot }`: la comida por cuyo `+` has entrado.
  const [adding, setAdding] = useState(null)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState(null)
  // Lo de siempre: lo que más repites, a un toque. No depende del día que se
  // esté mirando, así que se lee aparte y no se vuelve a pedir al pasar de día.
  const [siempre, setSiempre] = useState([])
  const [quick, setQuick] = useState(null)

  const load = useCallback(async (iso) => {
    try {
      setDay(await getFoodDay(iso))
      setError(null)
    } catch {
      setError('No se ha podido cargar el día.')
    }
  }, [])

  // Un repertorio que no llega no es un error de la pantalla: la lista del día
  // y el buscador siguen sirviendo. Se queda vacío y la sección no se dibuja.
  const loadSiempre = useCallback(async () => {
    try {
      // `?? []` y no a pelo: una respuesta vacía no puede dejar la pantalla
      // sin lista del día por un `.length` sobre `undefined`.
      setSiempre((await frequentFoods()) ?? [])
    } catch {
      setSiempre([])
    }
  }, [])

  useEffect(() => {
    load(dayIso)
  }, [dayIso, load])

  useEffect(() => {
    loadSiempre()
  }, [loadSiempre])

  // Hoy es el último día al que se puede llegar: no se registra por adelantado.
  const isToday = dayIso === foodDayIso()
  const totals = day?.totals ?? {}
  const note = unknownNote(day?.unknown)

  async function afterWrite() {
    setAdding(null)
    setEditing(null)
    // Las dos cosas que acaban de cambiar: el día y el recuento del que sale el
    // repertorio. Registrar dos veces lo mismo lo sube en la rejilla.
    await Promise.all([load(dayIso), loadSiempre()])
  }

  // Un toque sobre lo de siempre: la cantidad y la comida que ya usas, sin
  // buscador y sin formulario. `logFood` fecha con el reloj del móvil, así que
  // esto sólo se ofrece en el día en curso — ver la condición de la sección.
  async function quickLog(item) {
    setQuick(item.food_id)
    try {
      await logFood({ foodId: item.food_id, grams: item.grams, mealSlot: item.meal_slot })
      await afterWrite()
    } finally {
      setQuick(null)
    }
  }

  // Sólo en hoy. En un día pasado el toque escribiría en el día en curso —
  // `logged_at` es el reloj del móvil— y la entrada aparecería en una pantalla
  // que no estás mirando, sin error por ninguna parte.
  const showSiempre = isToday && siempre.length > 0

  return (
    <div className="comida">
      <div className="food-daynav">
        <button
          type="button"
          className="link-btn food-daystep"
          aria-label="Día anterior"
          onClick={() => setDayIso(shiftDay(dayIso, -1))}
        >
          ‹
        </button>
        {/* La fecha en su propio `span` y no suelta en el `h2`: el sello de
            «Hoy» va al lado, y con los dos como texto plano del mismo elemento
            no hay forma de leer la fecha sola —ni desde una prueba ni desde un
            lector de pantalla—. */}
        <h2 className="food-daystamp">
          <span className="food-daystamp-date">{formatDayShort(dayIso)}</span>
          {/* Que estés en hoy se deducía de que la flecha derecha estaba
              apagada, que es pedirle al ojo que compare dos controles para
              contestar a la pregunta más simple de la pantalla. */}
          {isToday && <span className="food-today">Hoy</span>}
        </h2>
        <button
          type="button"
          className="link-btn food-daystep"
          aria-label="Día siguiente"
          disabled={isToday}
          onClick={() => setDayIso(shiftDay(dayIso, 1))}
        >
          ›
        </button>
      </div>

      {error && <p className="alert">{error}</p>}

      {/* El total del día, en una tira y no en una tarjeta. Con cuatro raíles
          debajo, la tarjeta hero de 143 px empujaba «lo de siempre» y el último
          raíl fuera de la pantalla: la cifra sigue siendo lo más grande que hay
          aquí, pero ya no necesita una superficie para decirlo. */}
      {day && (
        <div className="food-strip" data-testid="food-macros">
          <span className="food-strip-kcal">{formatMacro(totals.kcal)}</span>
          <span className="food-strip-unit">kcal</span>
          <span className="food-strip-macros">
            {MACROS.map((macro) => (
              <span className="food-strip-macro" key={macro.key}>
                <span className="food-strip-short">{macro.short}</span>{' '}
                <span className="food-strip-value">
                  {formatMacro(totals[macro.key], { decimals: macro.decimals })}
                </span>
              </span>
            ))}
          </span>
        </div>
      )}
      {/* Una raya en un total se lee como "no comí nada de eso", que es lo
          contrario de lo que dice. Así que se explica en voz alta. */}
      {note && <p className="hint food-unknown">{note}</p>}

      {day &&
        rails(day).map((rail) => (
          <section className="food-rail" key={rail.key ?? 'sin-asignar'}>
            <h3 className="food-rail-head">
              <span className="food-rail-name">{slotLabel(rail.key)}</span>
              <span className="food-rail-kcal">{formatMacro(rail.totals.kcal)} kcal</span>
              {/* Entrar por el raíl es lo que jubila el desplegable «Comida»:
                  la respuesta la da el sitio por el que has pulsado. */}
              {rail.key !== null && (
                <button
                  type="button"
                  className="food-rail-add"
                  aria-label={`Añadir a ${slotLabel(rail.key).toLowerCase()}`}
                  onClick={() => setAdding({ slot: rail.key })}
                >
                  +
                </button>
              )}
            </h3>
            {rail.entries.length === 0 && !(adding?.slot === rail.key) && (
              <p className="hint food-rail-empty">Nada aún</p>
            )}
            {rail.entries.map((entry) =>
              editing === entry.id ? (
                <EntryEditor
                  key={entry.id}
                  entry={entry}
                  onDone={afterWrite}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <button
                  type="button"
                  className="link-row food-entry"
                  key={entry.id}
                  onClick={() => setEditing(entry.id)}
                >
                  <span className="food-entry-name">{entry.food_name}</span>
                  <span className="food-entry-amount">{formatAmount(entry.grams)}</span>
                  <span className="food-entry-kcal">{formatMacro(entry.kcal)} kcal</span>
                </button>
              ),
            )}
            {adding?.slot === rail.key && (
              <AddFood slot={rail.key} onDone={afterWrite} onCancel={() => setAdding(null)} />
            )}
          </section>
        ))}

      {showSiempre && (
        <section className="food-group food-siempre">
          <h3 className="food-group-title">Lo de siempre</h3>
          <div className="food-siempre-grid">
            {siempre.map((item) => (
              <button
                type="button"
                className="food-repeat"
                key={item.food_id}
                disabled={quick !== null}
                onClick={() => quickLog(item)}
              >
                <span className="food-repeat-name">{item.name}</span>
                <span className="food-repeat-meta">
                  {formatAmount(item.grams)} · {formatMacro(item.kcal)} kcal
                </span>
              </button>
            ))}
          </div>
          <p className="hint food-siempre-hint">Un toque lo registra con la cantidad de siempre.</p>
        </section>
      )}


    </div>
  )
}

// Repesar o borrar lo ya registrado. Los gramos son lo único editable aquí: los
// nutrientes se reescalan en el servidor desde lo que se congeló, y no hay
// ninguna pantalla desde la que se puedan escribir a mano.
function EntryEditor({ entry, onDone, onCancel }) {
  const [grams, setGrams] = useState(String(entry.grams))
  const [busy, setBusy] = useState(false)
  const box = useRef(null)

  // La fila que tocas puede ser la última de la lista, y el editor es más alto
  // que ella: sin esto, abrir la última entrada la empuja fuera de la pantalla.
  useEffect(() => {
    // Ver la nota de `AddFood`: en jsdom este método no existe.
    box.current?.scrollIntoView?.({ block: 'center' })
  }, [])

  async function save(event) {
    event.preventDefault()
    const value = Number(grams.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) return
    setBusy(true)
    await correctFoodEntry(entry.id, { grams: value })
    await onDone()
  }

  async function remove() {
    setBusy(true)
    await deleteFoodEntry(entry.id)
    await onDone()
  }

  return (
    <form className="card card-compose food-editor" onSubmit={save} ref={box}>
      <p className="food-editor-name">{entry.food_name}</p>
      <div className="field">
        <label htmlFor={`grams-${entry.id}`}>Gramos</label>
        <input
          id={`grams-${entry.id}`}
          inputMode="decimal"
          value={grams}
          onChange={(e) => setGrams(e.target.value)}
        />
      </div>
      <div className="food-editor-actions">
        <button type="submit" className="primary" disabled={busy}>
          Guardar
        </button>
        <button type="button" className="link-btn" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button type="button" className="link-btn food-danger" onClick={remove} disabled={busy}>
          Borrar
        </button>
      </div>
    </form>
  )
}

// Buscar → elegir cantidad → registrar. Y, cuando el catálogo no tiene lo que
// comiste, darlo de alta sin salir del flujo.
//
// El alta manual es la ÚNICA puerta por la que se escribe en `foods`: nada en
// este proyecto crea un alimento sin que alguien lo confirme en un formulario.
function AddFood({ slot = null, onDone, onCancel }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [chosen, setChosen] = useState(null)
  const [creating, setCreating] = useState(false)
  const latest = useRef(0)
  const box = useRef(null)
  const field = useRef(null)

  // El panel se abre al pie de la lista del día, que con un día registrado ya
  // queda por debajo de la línea de flotación: pulsabas «Añadir alimento» y la
  // pantalla no se movía, que es indistinguible de un botón roto. Así que el
  // panel se trae a la vista y el cursor entra en la búsqueda — que es lo
  // siguiente que ibas a hacer de todas formas.
  //
  // `start` y no `center`: el panel crece con los resultados y pasa de media
  // pantalla, así que centrarlo deja su pie —«Crear …» y «Cancelar»— contra la
  // barra de pestañas. Alineado arriba, la lista de resultados cae hacia el
  // hueco que queda debajo, que es la dirección en la que crece.
  useEffect(() => {
    // `?.` sobre el método, no sólo sobre la referencia: jsdom no implementa
    // `scrollIntoView` —no tiene motor de maquetación, así que no hay a dónde
    // desplazarse— y llamarlo a pelo revienta la suite de siempre. Lo que esto
    // hace de verdad se mide en `comida.browser-test.jsx`, en Chromium.
    box.current?.scrollIntoView?.({ block: 'start' })
    field.current?.focus()
  }, [])

  useEffect(() => {
    if (chosen || creating) return
    const term = query.trim()
    const ticket = ++latest.current
    const timer = setTimeout(async () => {
      const found = await searchFoods(term)
      // Una respuesta lenta de una búsqueda anterior no puede pisar la actual.
      if (ticket === latest.current) setResults(found)
    }, 180)
    return () => clearTimeout(timer)
  }, [query, chosen, creating])

  if (creating) {
    return (
      <NewFood
        name={query.trim()}
        onCreated={(food) => {
          setCreating(false)
          setChosen(food)
        }}
        onCancel={() => setCreating(false)}
      />
    )
  }

  if (chosen) {
    return (
      <Amount
        food={chosen}
        initialSlot={slot}
        onDone={onDone}
        onCancel={() => setChosen(null)}
      />
    )
  }

  return (
    <div className="card card-compose food-search" ref={box}>
      <div className="field">
        <label htmlFor="food-q">Buscar alimento</label>
        <input
          id="food-q"
          ref={field}
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <ul className="food-results">
        {results.map((food) => (
          <li key={food.id}>
            <button type="button" className="link-row food-result" onClick={() => setChosen(food)}>
              <span className="food-result-name">
                {food.name}
                {food.brand && <span className="food-result-brand"> · {food.brand}</span>}
              </span>
              <span className="food-result-kcal">
                {formatMacro(food.kcal_100g)} kcal/100 g
              </span>
            </button>
          </li>
        ))}
      </ul>
      {query.trim() && (
        <button type="button" className="link-btn" onClick={() => setCreating(true)}>
          Crear «{query.trim()}»
        </button>
      )}
      <button type="button" className="link-btn food-cancel" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  )
}

// Cuánto, y a qué comida. La porción por defecto llega ya elegida cuando el
// alimento tiene una: registrar "una rebanada" no puede obligarte a pensar en
// gramos.
function Amount({ food, initialSlot = null, onDone, onCancel }) {
  const preset = food.portions?.find((p) => p.is_default) ?? null
  const [portionId, setPortionId] = useState(preset?.id ?? null)
  const [quantity, setQuantity] = useState('1')
  const [grams, setGrams] = useState(preset ? '' : '100')
  // Ya contestado por el raíl del que vienes. Sigue siendo cambiable: la
  // pregunta desaparece, la libertad no.
  const [slot, setSlot] = useState(initialSlot ?? '')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    const amount = Number(String(grams).replace(',', '.'))
    if (!portionId && (!Number.isFinite(amount) || amount <= 0)) return
    setBusy(true)
    await logFood({
      foodId: food.id,
      // Gramos o porción, nunca las dos: son dos cantidades distintas y
      // adivinar cuál se quiso decir es como un diario se estropea en silencio.
      grams: portionId ? null : amount,
      portionId,
      quantity: portionId ? Number(String(quantity).replace(',', '.')) || 1 : 1,
      mealSlot: slot || null,
    })
    await onDone()
  }

  return (
    <form className="card card-compose food-amount" onSubmit={submit}>
      <p className="food-amount-name">{food.name}</p>
      {food.portions?.length > 0 && (
        <div className="food-portions">
          {food.portions.map((portion) => (
            <button
              type="button"
              key={portion.id}
              className={`chip${portionId === portion.id ? ' is-active' : ''}`}
              aria-pressed={portionId === portion.id}
              onClick={() => setPortionId(portionId === portion.id ? null : portion.id)}
            >
              {portion.label} · {formatAmount(portion.grams)}
            </button>
          ))}
        </div>
      )}
      {portionId ? (
        <div className="field">
          <label htmlFor="food-qty">Cuántas</label>
          <input
            id="food-qty"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
      ) : (
        <div className="field">
          <label htmlFor="food-grams">Gramos</label>
          <input
            id="food-grams"
            inputMode="decimal"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
          />
        </div>
      )}
      {/* Chips y no un desplegable: la respuesta ya viene puesta desde el raíl,
          así que esto dejó de ser una pregunta y pasó a ser una corrección — y
          una corrección de un toque no se merece dos (abrir y elegir). */}
      <div className="field">
        <span className="food-slot-label">Comida</span>
        <div className="food-slots">
          {MEAL_SLOTS.map((s) => (
            <button
              type="button"
              key={s.key}
              className={`chip${slot === s.key ? ' is-active' : ''}`}
              aria-pressed={slot === s.key}
              onClick={() => setSlot(slot === s.key ? '' : s.key)}
            >
              {s.label}
            </button>
          ))}
          <button
            type="button"
            className={`chip${slot === '' ? ' is-active' : ''}`}
            aria-pressed={slot === ''}
            onClick={() => setSlot('')}
          >
            Sin asignar
          </button>
        </div>
      </div>
      <div className="food-editor-actions">
        <button type="submit" className="primary" disabled={busy}>
          Añadir
        </button>
        <button type="button" className="link-btn" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

// El alta manual: el pan de la panadería, los piquillos de tu madre.
//
// Sólo el nombre es obligatorio. Un macro que no escribes se manda como `null`,
// nunca como 0 — nadie lo ha medido, y un cero afirmaría que sí y que no hay.
function NewFood({ name: initialName, onCreated, onCancel }) {
  const [name, setName] = useState(initialName)
  // La marca va aparte del nombre porque es un dato distinto: se pinta aparte
  // en los resultados y se busca por su cuenta. De un producto envasado te
  // acuerdas por el súper —«el de Hacendado»— antes que por su nombre
  // comercial, así que escribirla aquí es lo que lo hace encontrable luego.
  const [brand, setBrand] = useState('')
  const [values, setValues] = useState({ kcal: '', protein: '', fat: '', carbs: '', fiber: '' })
  const [busy, setBusy] = useState(false)

  const number = (raw) => {
    const value = Number(String(raw).replace(',', '.'))
    return raw.trim() === '' || !Number.isFinite(value) ? null : value
  }

  async function submit(event) {
    event.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const food = await createFood({
      name: name.trim(),
      // En blanco es `null`, no cadena vacía: no tiene marca, que es distinto
      // de tener una marca que se llama «».
      brand: brand.trim() || null,
      kcal_100g: number(values.kcal),
      protein_100g: number(values.protein),
      fat_100g: number(values.fat),
      carbs_100g: number(values.carbs),
      fiber_100g: number(values.fiber),
    })
    onCreated(food)
  }

  const FIELDS = [
    { key: 'kcal', label: 'Kcal por 100 g' },
    { key: 'protein', label: 'Proteína por 100 g' },
    { key: 'fat', label: 'Grasa por 100 g' },
    { key: 'carbs', label: 'Hidratos por 100 g' },
    { key: 'fiber', label: 'Fibra por 100 g' },
  ]

  return (
    <form className="card card-compose food-new" onSubmit={submit}>
      <div className="field">
        <label htmlFor="food-name">Nombre</label>
        <input id="food-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="food-brand">Marca</label>
        <input
          id="food-brand"
          autoComplete="off"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
        />
      </div>
      {FIELDS.map((field) => (
        <div className="field" key={field.key}>
          <label htmlFor={`food-${field.key}`}>{field.label}</label>
          <input
            id={`food-${field.key}`}
            inputMode="decimal"
            value={values[field.key]}
            onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
          />
        </div>
      ))}
      <p className="hint">Lo que dejes en blanco queda como desconocido, no como cero.</p>
      <div className="food-editor-actions">
        <button type="submit" className="primary" disabled={busy}>
          Guardar alimento
        </button>
        <button type="button" className="link-btn" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
