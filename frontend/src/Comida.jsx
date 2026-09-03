import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import {
  correctFoodEntry,
  createFood,
  deleteFoodEntry,
  frequentFoods,
  getFoodDay,
  logFood,
  searchFoods,
  setTargets,
} from './api.js'
import {
  MACROS,
  MEAL_SLOTS,
  foodDayIso,
  formatAmount,
  formatMacro,
  inferMealSlot,
  proteinProgress,
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

// Una entrada está completa cuando ninguno de sus nutrientes es `null`. Sirve
// para el filtro que abre el chip de «sin fibra»: no hay una bandera para
// esto en el servidor porque no hace falta una — se lee directamente de la
// entrada, igual que la pantalla ya lee `entry.fiber` para imprimirlo.
const NUTRIENT_KEYS = ['kcal', ...MACROS.map((m) => m.key)]
const isIncomplete = (entry) => NUTRIENT_KEYS.some((key) => entry[key] == null)

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
  // El filtro que abre el chip de nutrientes desconocidos: sólo las entradas
  // a las que les falta algo, para poder corregirlas sin buscarlas a ojo.
  const [onlyIncomplete, setOnlyIncomplete] = useState(false)
  // El objetivo diario, en su propio cajón — no es del día, es del perfil.
  const [targetOpen, setTargetOpen] = useState(false)
  const [targetKcal, setTargetKcal] = useState('')
  const [targetProtein, setTargetProtein] = useState('')
  const [savingTarget, setSavingTarget] = useState(false)
  // La última entrada borrada, con un «Deshacer» que vive donde estaba —no
  // un aviso flotante que se va antes de que te des cuenta de lo que hiciste.
  const [deleted, setDeleted] = useState(null)
  const [undoing, setUndoing] = useState(false)

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

  // Cambiar de día deja atrás cualquier borrado a medio deshacer: el «Deshacer»
  // vive en el raíl en el que se hizo, y ese raíl ya no está en pantalla.
  useEffect(() => {
    setDeleted(null)
  }, [dayIso])

  // Hoy es el último día al que se puede llegar: no se registra por adelantado.
  const isToday = dayIso === foodDayIso()
  const totals = day?.totals ?? {}
  const note = unknownNote(day?.unknown)
  const hasTarget = day?.target_kcal != null
  const editingEntry = editing != null ? (day?.entries.find((e) => e.id === editing) ?? null) : null

  async function afterWrite() {
    setAdding(null)
    setEditing(null)
    setDeleted(null)
    // Las dos cosas que acaban de cambiar: el día y el recuento del que sale el
    // repertorio. Registrar dos veces lo mismo lo sube en la rejilla.
    await Promise.all([load(dayIso), loadSiempre()])
  }

  function closeSheet() {
    setAdding(null)
    setEditing(null)
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

  // Borrar ya no vive en el formulario: se desliza la fila, y lo que queda es
  // un «Deshacer» donde estaba la entrada, no un aviso que caduca solo.
  async function handleDeleteEntry(entry) {
    try {
      await deleteFoodEntry(entry.id)
    } catch {
      setError('No se ha podido borrar la entrada.')
      return
    }
    setDeleted(entry)
    await Promise.all([load(dayIso), loadSiempre()])
  }

  // Deshacer es volver a registrar lo mismo, con la hora original — no una
  // papelera: `log_entries` congela, así que no hay nada que «recuperar», sólo
  // algo que volver a escribir igual que se escribió la primera vez.
  async function handleUndo() {
    if (!deleted) return
    setUndoing(true)
    try {
      await logFood({
        foodId: deleted.food_id,
        grams: deleted.grams,
        mealSlot: deleted.meal_slot,
        loggedAt: deleted.logged_at,
      })
      await afterWrite()
    } catch {
      setError('No se ha podido deshacer el borrado.')
    } finally {
      setUndoing(false)
    }
  }

  function openTarget() {
    setTargetKcal(day?.target_kcal != null ? String(day.target_kcal) : '')
    setTargetProtein(day?.target_protein != null ? String(day.target_protein) : '')
    setTargetOpen(true)
  }

  async function saveTarget(event) {
    event.preventDefault()
    const parse = (raw) => (raw.trim() === '' ? null : Number(raw.replace(',', '.')))
    setSavingTarget(true)
    try {
      await setTargets({ kcal: parse(targetKcal), protein: parse(targetProtein) })
      setTargetOpen(false)
      await load(dayIso)
    } finally {
      setSavingTarget(false)
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

      {/* El objetivo es del perfil, no del día: se fija una vez y se corrige
          rara vez, así que vive en un cajón callado como el de las preferencias
          de Entreno (DESIGN.md: «sticky preferences count as rare actions»),
          no en un control permanente sobre las cifras que sí cambian a diario. */}
      <div className="food-target">
        <button
          type="button"
          className="food-target-toggle"
          aria-expanded={targetOpen}
          onClick={() => (targetOpen ? setTargetOpen(false) : openTarget())}
        >
          <span>Objetivo diario</span>
          <span className="food-target-summary">
            {hasTarget ? `${formatMacro(day.target_kcal)} kcal` : 'Sin fijar'}
          </span>
        </button>
        {targetOpen && (
          <form className="food-target-panel" onSubmit={saveTarget}>
            <div className="field">
              <label htmlFor="target-kcal">Kcal al día</label>
              <input
                id="target-kcal"
                inputMode="decimal"
                placeholder="p. ej. 2800"
                value={targetKcal}
                onChange={(e) => setTargetKcal(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="target-protein">Proteína al día (g)</label>
              <input
                id="target-protein"
                inputMode="decimal"
                placeholder="p. ej. 160"
                value={targetProtein}
                onChange={(e) => setTargetProtein(e.target.value)}
              />
            </div>
            <div className="food-editor-actions">
              <button type="submit" className="primary" disabled={savingTarget}>
                Guardar
              </button>
              <button
                type="button"
                className="link-btn"
                onClick={() => setTargetOpen(false)}
                disabled={savingTarget}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>

      {error && <p className="alert">{error}</p>}

      {/* Con objetivo fijado, la cifra grande deja de ser lo comido y pasa a
          ser lo que queda (`objetivo − comido`, calculado en el servidor,
          igual que los subtotales): es la pregunta que se hace a las 20:00.
          Lo comido sigue ahí, pequeño y a la derecha. */}
      {day && hasTarget && (
        <div className="food-hero" data-testid="food-macros">
          <div className="food-hero-top">
            <span className="food-hero-remaining">{formatMacro(day.remaining_kcal)}</span>
            <span className="food-hero-remaining-unit">kcal por comer</span>
            <span className="food-hero-total">
              {formatMacro(totals.kcal)} / {formatMacro(day.target_kcal)}
            </span>
          </div>
          <div className="food-hero-protein">
            <span className="food-hero-protein-label">Proteína</span>
            <span className="food-hero-protein-value">{formatMacro(totals.protein)}</span>
            {day.target_protein != null && (
              <span className="food-hero-protein-target">/ {formatMacro(day.target_protein)} g</span>
            )}
          </div>
          {day.target_protein != null && (
            <div className="food-hero-bar">
              <div style={{ width: `${proteinProgress(totals.protein, day.target_protein) ?? 0}%` }} />
            </div>
          )}
          <div className="food-hero-macros">
            {MACROS.filter((macro) => macro.key !== 'protein').map((macro) => (
              <span className="food-hero-macro" key={macro.key}>
                <span className="food-strip-short">{macro.short}</span>{' '}
                <span className="food-strip-value">
                  {formatMacro(totals[macro.key], { decimals: macro.decimals })}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sin objetivo, la tira de siempre: el total del día y sus cuatro
          macros, sin nada que restar todavía. */}
      {day && !hasTarget && (
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
          contrario de lo que dice. Así que se explica en voz alta — y ahora se
          toca: filtra el día a esas entradas, que es lo único que se puede
          corregir. */}
      {note && (
        <button
          type="button"
          className={`chip food-unknown-chip${onlyIncomplete ? ' is-active' : ''}`}
          aria-pressed={onlyIncomplete}
          onClick={() => setOnlyIncomplete((v) => !v)}
        >
          {note}
        </button>
      )}

      {/* Lo de siempre, delante de los raíles: es el camino de un toque, y
          vivía debajo de los cuatro raíles — con un día medio registrado había
          que desplazar para llegar a él. */}
      {showSiempre && (
        <section className="food-group food-siempre">
          <div className="food-siempre-head">
            <h3 className="food-group-title">Lo de siempre</h3>
            {/* El hueco al que iría cada toque ya lo dice cada azulejo — lee
                `item.meal_slot`, la comida en la que sueles registrar ese
                alimento, más fiable que una única hora para todo el repertorio.
                Esto es sólo el contexto: qué hora es ahora mismo. */}
            <span className="food-siempre-slot">→ {slotLabel(inferMealSlot())} ahora</span>
          </div>
          <div className="food-siempre-strip">
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

      {day &&
        rails(day).map((rail) => {
          const visible = onlyIncomplete ? rail.entries.filter(isIncomplete) : rail.entries
          const undoHere = deleted && (deleted.meal_slot ?? null) === rail.key
          return (
            <section className="food-rail" key={rail.key ?? 'sin-asignar'}>
              <h3 className="food-rail-head">
                <span className="food-rail-name">{slotLabel(rail.key)}</span>
                {/* Un raíl vacío es una línea: sin «Nada aún» y sin subtotal en
                    cero, porque la cabecera con su `+` ya dice que está vacío. */}
                {rail.entries.length > 0 && (
                  <span className="food-rail-kcal">{formatMacro(rail.totals.kcal)} kcal</span>
                )}
                {/* Entrar por el raíl es lo que jubila el desplegable «Comida»:
                    la respuesta la da el sitio por el que has pulsado. Baja a
                    control secundario —color, no tamaño: DESIGN.md fija 44px
                    como suelo para todo lo que se toca, y éste se toca cuatro
                    veces al día— porque «Añadir alimento» abajo es ahora el
                    destino principal. */}
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
              {visible.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  onEdit={() => setEditing(entry.id)}
                  onDelete={handleDeleteEntry}
                />
              ))}
              {undoHere && (
                <p className="retag-undo">
                  <span>{deleted.food_name} borrada.</span>
                  <button
                    type="button"
                    className="retag-undo-action"
                    aria-label={`Deshacer el borrado de ${deleted.food_name}`}
                    onClick={handleUndo}
                    disabled={undoing}
                  >
                    Deshacer
                  </button>
                </p>
              )}
            </section>
          )
        })}

      {/* Un solo destino para «añadir», al alcance del pulgar — el mismo sitio
          en el que Días fija su CTA (DESIGN.md: la acción principal va abajo,
          nunca arriba). El buscador y la cantidad se abren en una hoja que
          llega sobre el teclado en vez de empujar la lista. */}
      <div className="food-cta">
        <button
          type="button"
          className="primary btn-full"
          onClick={() => setAdding({ slot: inferMealSlot() })}
        >
          Añadir alimento
        </button>
      </div>

      {(adding || editingEntry) && (
        <div className="sheet-scrim" onClick={closeSheet}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={adding ? 'Añadir alimento' : 'Editar entrada'}
            onClick={(e) => e.stopPropagation()}
          >
            {adding && <AddFood slot={adding.slot} onDone={afterWrite} onCancel={closeSheet} />}
            {!adding && editingEntry && (
              <EntryEditor entry={editingEntry} onDone={afterWrite} onCancel={closeSheet} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Cuánto se puede arrastrar una fila hacia la izquierda para revelar «Borrar»,
// y a partir de dónde soltar la deja abierta en vez de volver a cerrarla.
const SWIPE_OPEN = -76
const SWIPE_ARM = -34

// La fila de una entrada. Deslizarla revela «Borrar» detrás; tocarla —sin
// arrastre— la abre para editar. Un segundo toque con la fila abierta la
// vuelve a cerrar, en vez de abrir el editor por sorpresa.
function EntryRow({ entry, onEdit, onDelete }) {
  const dragXRef = useRef(0)
  const startX = useRef(0)
  const originX = useRef(0)
  const dragging = useRef(false)
  const moved = useRef(false)
  const [, forceRender] = useReducer((n) => n + 1, 0)

  function setDrag(x) {
    dragXRef.current = x
    forceRender()
  }

  function onPointerDown(e) {
    dragging.current = true
    moved.current = false
    startX.current = e.clientX
    originX.current = dragXRef.current
  }

  function onPointerMove(e) {
    if (!dragging.current) return
    const delta = e.clientX - startX.current
    if (Math.abs(delta) > 4) moved.current = true
    setDrag(Math.max(SWIPE_OPEN, Math.min(0, originX.current + delta)))
  }

  function endDrag() {
    if (!dragging.current) return
    dragging.current = false
    setDrag(dragXRef.current <= SWIPE_ARM ? SWIPE_OPEN : 0)
  }

  function onRowClick() {
    if (moved.current) return
    if (dragXRef.current !== 0) {
      setDrag(0)
      return
    }
    onEdit()
  }

  const dragX = dragXRef.current
  const open = dragX !== 0

  return (
    <div className="food-entry-swipe">
      <div className="food-entry-swipe-actions">
        <button
          type="button"
          className="food-entry-delete"
          aria-label={`Borrar ${entry.food_name}`}
          aria-hidden={!open}
          tabIndex={open ? 0 : -1}
          onClick={() => {
            setDrag(0)
            onDelete(entry)
          }}
        >
          Borrar
        </button>
      </div>
      <button
        type="button"
        className="link-row food-entry"
        style={{ transform: `translateX(${dragX}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={onRowClick}
      >
        <span className="food-entry-name">{entry.food_name}</span>
        <span className="food-entry-amount">{formatAmount(entry.grams)}</span>
        <span className="food-entry-kcal">{formatMacro(entry.kcal)} kcal</span>
      </button>
    </div>
  )
}

// Repesar lo ya registrado. Los gramos son lo único editable aquí: los
// nutrientes se reescalan en el servidor desde lo que se congeló, y no hay
// ninguna pantalla desde la que se puedan escribir a mano. Borrar ya no vive
// aquí — se desliza la fila que abrió este editor.
function EntryEditor({ entry, onDone, onCancel }) {
  const [grams, setGrams] = useState(String(entry.grams))
  const [busy, setBusy] = useState(false)

  async function save(event) {
    event.preventDefault()
    const value = Number(grams.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) return
    setBusy(true)
    await correctFoodEntry(entry.id, { grams: value })
    await onDone()
  }

  return (
    <form className="card card-compose food-editor" onSubmit={save}>
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
  const field = useRef(null)

  // El cursor entra en la búsqueda al abrir: es lo siguiente que ibas a hacer
  // de todas formas. Ya no hace falta `scrollIntoView` — la hoja llega siempre
  // entera a la pantalla, sea cual sea el raíl que la abrió.
  useEffect(() => {
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
    <div className="card card-compose food-search">
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
