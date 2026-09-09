import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import {
  correctFood,
  correctFoodEntry,
  createFood,
  deleteFoodEntry,
  frequentFoods,
  getFoodDay,
  logFood,
  readLabel,
  recomputeFoodDay,
  scanBarcode,
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
  macroBar,
  shiftDay,
  slotLabel,
  droppedNote,
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

// Las comidas que ya tienen algo dentro, en el orden en que se comen. Cada una
// se dibuja como una tarjeta con su subtotal, sus filas y su propio
// «+ Añadir a …»: entrar por el slot es lo que deja el destino ya resuelto,
// así que la pantalla de Añadir no tiene que preguntarlo.
function filled(day) {
  return rails(day).filter((rail) => rail.entries.length > 0)
}

// Las que están vacías. Van juntas al final y en `dashed`, no intercaladas: un
// hueco no compite por la atención con una comida registrada, y agrupándolos
// caben dos por fila en vez de ocupar cuatro tarjetas de alto.
//
// El montón sin asignar no aparece aquí — no tiene `+`, porque nadie quiere
// *decidir* no decidir, así que sólo existe cuando ya hay algo en él.
function empty(day) {
  return rails(day).filter((rail) => rail.key !== null && rail.entries.length === 0)
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

      {day && <MacroCard day={day} />}

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

      {day && (
        <>
          {filled(day).map((rail) => (
            <SlotCard
              key={rail.key ?? 'sin-asignar'}
              rail={rail}
              entries={onlyIncomplete ? rail.entries.filter(isIncomplete) : rail.entries}
              deleted={deleted && (deleted.meal_slot ?? null) === rail.key ? deleted : null}
              undoing={undoing}
              onUndo={handleUndo}
              onAdd={() => setAdding({ slot: rail.key })}
              onEdit={setEditing}
              onDelete={handleDeleteEntry}
            />
          ))}
          {/* Los vacíos, en fila de dos y en `dashed`: una tarjeta que todavía
              no contiene nada no puede pesar lo mismo que una que sí. Siguen
              siendo objetivo de un toque —es por donde se entra a registrar en
              esa comida— y por eso son `button` y no `div` con un enlace
              dentro: el área que se toca es la tarjeta entera. */}
          {empty(day).length > 0 && (
            <div className="food-blanks">
              {empty(day).map((rail) => (
                <button
                  type="button"
                  key={rail.key}
                  className="card food-blank"
                  /* El nombre calculado de la tarjeta sería «Desayuno + añadir»,
                     que describe lo que se ve y no lo que hace. Explícito, y el
                     mismo que lleva el pie de una comida con contenido: es el
                     mismo control, cambia sólo qué tarjeta lo aloja. */
                  aria-label={`Añadir a ${slotLabel(rail.key).toLowerCase()}`}
                  onClick={() => setAdding({ slot: rail.key })}
                >
                  <span className="food-slot-name">{slotLabel(rail.key)}</span>
                  <span className="food-blank-add">+ añadir</span>
                </button>
              ))}
            </div>
          )}
          <ClosingLine day={day} />
        </>
      )}

      {(adding || editingEntry) && (
        <div className="sheet-scrim" onClick={closeSheet}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={adding ? 'Añadir alimento' : 'Editar entrada'}
            onClick={(e) => e.stopPropagation()}
          >
            {adding && (
              <AddFood
                slot={adding.slot}
                dayIso={dayIso}
                entries={day?.entries ?? []}
                onDone={afterWrite}
                // Rehacer el día desde la corrección reescribe entradas que ya
                // están pintadas, y no cierra la hoja: estabas registrando algo
                // cuando te diste cuenta de la errata, y sigues estándolo.
                onDayChanged={() => load(dayIso)}
                onCancel={closeSheet}
              />
            )}
            {!adding && editingEntry && (
              <EntryEditor entry={editingEntry} onDone={afterWrite} onCancel={closeSheet} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// La cabecera del día, y la pieza donde vive el contrato de color.
//
// **El color codifica progreso, no categoría.** No hay un tono por macro: los
// macros ya se distinguen por posición y por número, y pintarlos sería
// redundante. Lo que el color dice es en qué punto del día estás:
//
// 1. Lo cumplido se desatura — el tramo consumido va en una mezcla de acento
//    con gris: presente, pero apagado. Ya no hay nada que hacer con él.
// 2. El cromo se reserva a lo que falta, y el número grande es **lo que falta**,
//    no lo que llevas. Es la pregunta que se hace a las 20:00, y contestarla con
//    lo comido obliga a restar de cabeza delante de la nevera.
// 3. `--pr` es el momento ganado: no aparece hasta que el objetivo se cierra, y
//    entonces ocupa la barra entera. Igual que un récord en Entreno.
//
// Jerarquía por intensidad y no por tono: la proteína manda (10px, cromo lleno)
// y los otros dos acompañan (6px, cromo al 60%). Un solo color en toda la app.
function MacroCard({ day }) {
  const totals = day.totals ?? {}
  const target = day.target_protein
  const bar = macroBar(totals.protein, target)
  const closed = bar?.closed ?? false

  // Sin objetivo de proteína no hay nada que restar, y una cifra grande de «te
  // falta» sin meta no significa nada. La tarjeta cae a enseñar lo comido.
  if (target == null) {
    return (
      <div className="card food-macros" data-testid="food-macros">
        <div className="food-macros-top">
          <p className="food-macros-hero">
            <span className="card-eyebrow">Llevas</span>
            <span className="food-macros-figure">
              <span className="food-macros-number">{formatMacro(totals.kcal)}</span>
              <span className="food-macros-unit">kcal</span>
            </span>
          </p>
        </div>
        <div className="food-macros-rows">
          {MACROS.map((macro) => (
            <MacroRow
              key={macro.key}
              label={macro.label}
              eaten={totals[macro.key]}
              decimals={macro.decimals}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="card food-macros" data-testid="food-macros">
      <div className="food-macros-top">
        <p className="food-macros-hero">
          <span className={`card-eyebrow${closed ? ' is-closed' : ''}`}>
            {closed ? 'Cerrado' : 'Te falta'}
          </span>
          <span className="food-macros-figure">
            {/* Cerrado, el número deja de ser una resta y pasa a ser el marcador:
                «160 / 160». Un «te falta 0» sería la misma cifra diciendo lo
                contrario de lo que ha pasado. */}
            <span className={`food-macros-number${closed ? ' is-closed' : ''}`}>
              {closed
                ? `${formatMacro(totals.protein)} / ${formatMacro(target)}`
                : formatMacro(day.remaining_protein)}
            </span>
            <span className="food-macros-unit">g de proteína</span>
          </span>
        </p>
        {/* Lo comido no desaparece: baja a la derecha, pequeño y en `--muted`.
            Se sigue pudiendo consultar, pero ya no es lo que se lee primero. */}
        {!closed && (
          <p className="food-macros-eaten">
            <span className="card-eyebrow">Llevas</span>
            <span className="food-macros-eaten-value">
              {formatMacro(totals.protein)} / {formatMacro(target)}
            </span>
          </p>
        )}
      </div>

      <div className="food-macros-rows">
        <MacroRow
          label="Proteína"
          eaten={totals.protein}
          target={target}
          lead
        />
        <MacroRow label="Hidratos" eaten={totals.carbs} target={day.target_carbs} />
        <MacroRow label="Grasa" eaten={totals.fat} target={day.target_fat} />
      </div>

      {day.target_kcal != null && (
        <p className="food-macros-kcal">
          <span>Cumplido</span>
          <span className="food-macros-kcal-value">
            kcal {formatMacro(totals.kcal)} / {formatMacro(day.target_kcal)}
          </span>
        </p>
      )}
    </div>
  )
}

// Un macro: su nombre, su cifra y su barra.
//
// La barra sólo se dibuja si hay objetivo — es lo que la hace medir algo. Sin él
// queda la línea de texto, que es toda la información que existe.
//
// `lead` es la proteína: misma estructura, el doble de alto y el cromo entero.
// La diferencia entre mandar y acompañar se dice con intensidad, no con un tono
// distinto.
function MacroRow({ label, eaten, target = null, decimals = 0, lead = false }) {
  const bar = macroBar(eaten, target)
  return (
    <div className={`food-macro${lead ? ' is-lead' : ''}`}>
      <p className="food-macro-line">
        <span className="food-macro-label">{label}</span>
        {/* Con objetivo, «118 / 160 g». Sin objetivo, sólo lo comido. Y si no
            se sabe, la raya sola: «— g» pega una unidad a un valor que no
            existe, y una raya no se mide en gramos. */}
        <span className="food-macro-value">
          {target != null
            ? `${formatMacro(eaten, { decimals })} / ${formatMacro(target, { decimals })} g`
            : eaten == null
              ? '—'
              : `${formatMacro(eaten, { decimals })} g`}
        </span>
      </p>
      {bar && (
        <span className={`food-macro-bar${bar.closed ? ' is-closed' : ''}`} aria-hidden="true">
          {/* Cerrado no lleva segmentos: la barra entera pasa a `--pr`. Partirla
              en «cumplido» y «pendiente» cuando no queda pendiente dibujaría una
              costura donde ya no hay dos cosas. */}
          {!bar.closed && (
            <>
              <span className="food-macro-done" style={{ width: `${bar.done}%` }} />
              <span className="food-macro-left" />
            </>
          )}
        </span>
      )}
    </div>
  )
}

// Una comida con algo dentro: subtotal, filas, y su propia puerta de entrada.
function SlotCard({ rail, entries, deleted, undoing, onUndo, onAdd, onEdit, onDelete }) {
  const label = slotLabel(rail.key)
  return (
    <section className="card food-slot">
      <h3 className="food-slot-head">
        <span className="food-slot-name">{label}</span>
        <span className="food-slot-meta">
          {formatMacro(rail.totals.protein)} P · {formatMacro(rail.totals.kcal)} kcal
        </span>
      </h3>
      {entries.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          onEdit={() => onEdit(entry.id)}
          onDelete={onDelete}
        />
      ))}
      {deleted && (
        <p className="retag-undo">
          <span>{deleted.food_name} borrada.</span>
          <button
            type="button"
            className="retag-undo-action"
            aria-label={`Deshacer el borrado de ${deleted.food_name}`}
            onClick={onUndo}
            disabled={undoing}
          >
            Deshacer
          </button>
        </p>
      )}
      {/* El montón sin asignar no tiene puerta: no se registra «en sin asignar»,
          se acaba ahí por no haber dicho nada. */}
      {rail.key !== null && (
        <p className="food-slot-foot">
          <button
            type="button"
            className="link-btn food-slot-add"
            aria-label={`Añadir a ${label.toLowerCase()}`}
            onClick={onAdd}
          >
            + Añadir a {label.toLowerCase()}
          </button>
        </p>
      )}
    </section>
  )
}

// La línea de cierre del día. Dice lo que queda para cerrar la proteína, que es
// el mismo número del héroe dicho en una frase — arriba contesta «cuánto», aquí
// contesta «y entonces qué me falta para terminar».
//
// Sin juicio: informa. Ni felicita al cerrar ni riñe por no haber llegado.
function ClosingLine({ day }) {
  if (day.target_protein == null) return null
  const bar = macroBar(day.totals?.protein, day.target_protein)
  return (
    <p className="hint food-close">
      <span>
        {bar?.closed ? (
          <>
            Proteína cerrada: <strong>{formatMacro(day.target_protein)} g</strong>.
          </>
        ) : (
          <>
            Te faltan <strong>{formatMacro(day.remaining_protein)} g</strong> de proteína para
            cerrar el día.
          </>
        )}
      </span>
    </p>
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
      {/* «Borrar» sólo existe mientras la fila está abierta o en movimiento.
          No es una decisión de accesibilidad —lo era: vivía siempre con
          `aria-hidden` y `tabIndex={-1}`— sino de pintado. La fila lleva un
          `transform` en línea para seguir al dedo, y eso la sube a su propia
          capa de composición: con alturas fraccionarias (60,95 px) el canto de
          esa capa deja pasar una costura de sub-píxel, y por debajo de cada
          fila asomaba una raya de `--danger` de 76 px. Con la fila dentro de una
          tarjeta se ve; suelta sobre el fondo también estaba, y no se veía.

          El botón nace en el primer `pointermove`, que es cuando `dragX` deja
          de ser 0 — antes de que haya nada revelado que pulsar. */}
      {open && (
        <div className="food-entry-swipe-actions">
          <button
            type="button"
            className="food-entry-delete"
            aria-label={`Borrar ${entry.food_name}`}
            onClick={() => {
              setDrag(0)
              onDelete(entry)
            }}
          >
            Borrar
          </button>
        </div>
      )}
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
        {/* El nombre y la cantidad apilados, y la proteína a la derecha: es el
            macro que la pantalla persigue, así que es el que se lee de un
            barrido vertical por el borde. Las kcal siguen estando, sumadas en la
            cabecera del slot — en cada fila eran una cuarta cifra que nadie
            compara una con otra. */}
        <span className="food-entry-main">
          <span className="food-entry-name">{entry.food_name}</span>
          <span className="food-entry-amount">{formatAmount(entry.grams)}</span>
        </span>
        <span className="food-entry-protein">{formatMacro(entry.protein)} P</span>
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
function AddFood({ slot = null, dayIso, entries = [], onDone, onDayChanged, onCancel }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  // Si la búsqueda que corresponde a lo que hay escrito ya ha contestado. Sin
  // esto, los ~180 ms de rebote más lo que tarde la red se pintan iguales que
  // «no hay nada»: lista vacía y una oferta de crear el alimento debajo, que
  // es una respuesta —la equivocada— a una pregunta que aún no se ha hecho.
  const [searching, setSearching] = useState(false)
  const [chosen, setChosen] = useState(null)
  const [creating, setCreating] = useState(false)
  // Lo que devolvió la foto. Es una **propuesta** para el formulario, no un
  // alimento: sigue haciendo falta que alguien mire lo que hay escrito y le dé
  // a guardar, igual que si lo hubiera tecleado entero.
  const [label, setLabel] = useState(null)
  // Lo que devolvió el escáner: o el alimento que ya tenías, o una propuesta de
  // Open Food Facts, o el motivo por el que no hay ninguna de las dos.
  const [scan, setScan] = useState(null)
  // Cuál de las dos cámaras está leyendo: 'label', 'scan' o ninguna. Un solo
  // booleano ponía «Leyendo…» en los dos disparadores a la vez, así que la hoja
  // decía «Leyendo… Leyendo…» — dos veces, una al lado de la otra, y ninguna te
  // decía cuál era la tuya.
  const [reading, setReading] = useState(null)
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
    setSearching(true)
    const timer = setTimeout(async () => {
      const found = await searchFoods(term)
      // Una respuesta lenta de una búsqueda anterior no puede pisar la actual.
      if (ticket !== latest.current) return
      setResults(found)
      setSearching(false)
    }, 180)
    return () => clearTimeout(timer)
  }, [query, chosen, creating])

  // La foto va al servidor y vuelve como propuesta. Un fallo de red no puede
  // dejarte mirando un botón que no hace nada: se abre el formulario igual, en
  // blanco, que es donde estabas antes de que existiera la cámara.
  async function photograph(event) {
    const file = event.target.files?.[0]
    // El input se limpia siempre: sin esto, elegir la misma foto dos veces
    // seguidas no dispara `change` y el botón parece roto la segunda vez.
    event.target.value = ''
    if (!file) return
    setReading('label')
    // Una lectura nueva manda sobre lo que dijera el escáner: `scan` se mira
    // antes que `creating` al pintar, así que dejarlo puesto haría que el
    // resultado de esta foto —ya pagada— no llegase a la pantalla.
    setScan(null)
    try {
      setLabel(await readLabel(file))
    } catch (error) {
      // Un 503 es «el servidor no tiene esto configurado», que no es lo mismo
      // que «no he podido leer la etiqueta»: contarlo como lo segundo te deja
      // repitiendo la foto contra algo que no puede funcionar. Pasó de verdad,
      // el 2026-09-04, y costó una sesión de depuración.
      setLabel({ refusal: error?.status === 503 ? 'off' : 'unreadable' })
    } finally {
      setReading(null)
      setCreating(true)
    }
  }

  // Un código de barras, decodificado **en el móvil** y resuelto contra Open
  // Food Facts. La foto no sale de aquí: `BarcodeDetector` es nativo, así que
  // decodificar no cuesta red, ni clave, ni cuota, ni un byte de librería. Al
  // servidor sólo viaja el número.
  //
  // Misma interacción que «Leer etiqueta» —una foto— en vez de un vídeo en
  // directo: es un gesto que ya conoces, no pide permiso de cámara continuo, y
  // para un código impreso en un envase quieto una foto sobra.
  async function photographBarcode(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setReading('scan')
    setLabel(null)
    setCreating(false)
    try {
      const codes = await detectBarcodes(file)
      if (codes.length === 0) {
        // Sin código no se pregunta a nadie: no hay nada por lo que preguntar,
        // y decirlo es más útil que un «no encontrado» que suena a que el
        // producto no existe.
        setScan({ refusal: 'nocode' })
        return
      }
      setScan(await scanBarcode(codes[0]))
    } catch {
      setScan({ refusal: 'offline' })
    } finally {
      setReading(null)
    }
  }

  // Un alimento que ya era tuyo no pasa por el alta: se va derecho a «cuánto»,
  // que es lo único que faltaba por decidir.
  if (scan?.food) {
    return (
      <Amount
        food={scan.food}
        initialSlot={slot}
        dayIso={dayIso}
        entries={entries}
        onDone={onDone}
        onDayChanged={onDayChanged}
        onCancel={() => setScan(null)}
      />
    )
  }

  if (scan) {
    return (
      <NewFood
        name={scan.name || query.trim()}
        scan={scan}
        onCreated={(food) => {
          setScan(null)
          setChosen(food)
        }}
        onCancel={() => setScan(null)}
      />
    )
  }

  if (creating) {
    return (
      <NewFood
        name={label?.name || query.trim()}
        label={label}
        onCreated={(food) => {
          setCreating(false)
          setLabel(null)
          setChosen(food)
        }}
        onCancel={() => {
          setCreating(false)
          setLabel(null)
        }}
      />
    )
  }

  if (chosen) {
    return (
      <Amount
        food={chosen}
        initialSlot={slot}
        dayIso={dayIso}
        entries={entries}
        onDone={onDone}
        onDayChanged={onDayChanged}
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
      {/* Los tres estados de una búsqueda son tres frases distintas, y sólo dos
          de ellas ofrecen crear el alimento. «Todavía no lo sé» no ofrece nada:
          el catálogo trae 3.185 alimentos y proponer dar de alta uno antes de
          haberlo mirado es la forma más rápida de duplicarlo. */}
      {query.trim() && searching && <p className="food-search-note">Buscando…</p>}
      {query.trim() && !searching && results.length === 0 && (
        <p className="food-search-note">Ningún alimento se llama «{query.trim()}».</p>
      )}
      {query.trim() && !searching && (
        <button type="button" className="link-btn food-create" onClick={() => setCreating(true)}>
          Crear «{query.trim()}»
        </button>
      )}
      {/* Las dos cámaras, juntas y bajo un rótulo.
          Sueltas eran dos `link-btn` más, indistinguibles de «Crear …» y de
          «Cancelar»: cuatro textos en negrita del mismo tamaño y la misma
          tinta que además fluían en línea y rompían por donde cupieran —
          medido a 430 px, «Crear «pollo»» y «Leer etiqueta» compartían
          renglón y «Cancelar» caía debajo y sangrado. Agruparlas dice de
          golpe las dos cosas que faltaban: que estas dos son hermanas entre
          sí, y que no son hermanas de las otras.

          Y el rótulo pone el verbo una vez, así que cada botón puede nombrar
          sólo **a qué le apuntas**. «Escanear código» y «Leer etiqueta» eran
          verbo + nombre, de la misma longitud —128 y 129 px— y de la misma
          forma: dos etiquetas que se leen como una. */}
      <div className="food-cameras">
        <p className="food-cameras-head">Rellenar con la cámara</p>
        <div className="food-cameras-row">
          {/* Un `label` y no un botón porque lo que abre la cámara es el
              `input`: envolverlo es la única forma de que el disparador tenga
              el aspecto de un control y siga siendo el control real. `capture`
              pide la trasera del móvil; en un ordenador el navegador lo ignora
              y ofrece un fichero, que para probar va igual de bien.

              `aria-disabled` y no sólo el `disabled` del `input`: el atributo
              vive en algo invisible, así que sin esto la cámara que no puede
              usarse se pinta idéntica a la que sí. */}
          {/* Primero el escáner, y no la etiqueta, porque es el que no cuesta
              nada: sin clave, sin cuota y sin modelo. El orden en que se
              ofrecen dos puertas es lo que decide por cuál se entra.

              Sólo donde el navegador sabe decodificar. En un Chrome de Android
              está; en un Safari, no — y un botón que no puede funcionar es peor
              que uno que no está, porque no hay forma de saber por qué falla. */}
          {canScan() && (
            <label
              className={`food-camera food-photo${reading === 'scan' ? ' is-busy' : ''}`}
              htmlFor="food-scan"
              aria-disabled={reading === 'label' || undefined}
              aria-busy={reading === 'scan' || undefined}
            >
              <Disparador leyendo={reading === 'scan'}>Código de barras</Disparador>
              {/* `aria-label` fijo: el texto visible pasa a «Leyendo…» mientras
                  lee, y sin esto el nombre del control se iba con él — quien
                  navega a ciegas se quedaba con dos disparadores llamados
                  «Leyendo…» y ninguno con nombre. */}
              <input
                id="food-scan"
                type="file"
                accept="image/*"
                capture="environment"
                aria-label="Código de barras"
                disabled={reading}
                onChange={photographBarcode}
              />
            </label>
          )}
          <label
            className={`food-camera food-photo${reading === 'label' ? ' is-busy' : ''}`}
            htmlFor="food-photo"
            aria-disabled={reading === 'scan' || undefined}
            aria-busy={reading === 'label' || undefined}
          >
            <Disparador leyendo={reading === 'label'}>Etiqueta</Disparador>
            <input
              id="food-photo"
              type="file"
              accept="image/*"
              capture="environment"
              aria-label="Etiqueta"
              disabled={reading}
              onChange={photograph}
            />
          </label>
        </div>
      </div>

      <button type="button" className="link-btn food-cancel" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  )
}

// Cuánto, y a qué comida. La porción por defecto llega ya elegida cuando el
// alimento tiene una: registrar "una rebanada" no puede obligarte a pensar en
// gramos.
function Amount({
  food: initialFood,
  initialSlot = null,
  dayIso,
  entries = [],
  onDone,
  onDayChanged,
  onCancel,
}) {
  // El alimento que se está registrando, que la corrección puede reescribir sin
  // salir de aquí: corriges las kcal y sigues con «cuánto», que es lo que
  // estabas haciendo cuando te diste cuenta de que estaban mal.
  const [food, setFood] = useState(initialFood)
  const [correcting, setCorrecting] = useState(false)
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

  if (correcting) {
    return (
      <FoodEditor
        food={food}
        dayIso={dayIso}
        // Cuántas entradas de este alimento hay en el día que se está mirando.
        // Se cuenta aquí y no se pregunta al servidor: la pantalla ya tiene el
        // día cargado, y es exactamente el mismo conjunto que rehará
        // `recompute`.
        affected={entries.filter((e) => e.food_id === food.id).length}
        onSaved={async (saved, { recomputed = false } = {}) => {
          setFood(saved)
          setCorrecting(false)
          // Rehacer el día reescribe entradas que la pantalla ya tiene pintadas,
          // así que hay que volver a pedirlo o se queda enseñando lo viejo.
          if (recomputed) await onDayChanged?.()
        }}
        onCancel={() => setCorrecting(false)}
      />
    )
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
        {/* Corregir es un acto raro y registrar es el de cada comida, así que
            no compite con «Añadir»: enlace, al final de la fila, y sólo donde
            funcionaría — el catálogo compartido no es tuyo para corregirlo. */}
        {food.is_mine && (
          <button
            type="button"
            className="link-btn food-correct"
            onClick={() => setCorrecting(true)}
            disabled={busy}
          >
            Corregir
          </button>
        )}
      </div>
    </form>
  )
}

// Lo que pone dentro de una cámara: su nombre, o que está leyendo.
//
// El punto es el mismo `.pending-dot` que ya lleva una serie encolada, y por la
// misma razón: una lectura puede tardar hasta veintiséis segundos —dos intentos
// de doce, más la espera de en medio (`backend/app/gemini.py`)—, y un texto
// quieto durante veintiséis segundos no se distingue de una pantalla colgada.
function Disparador({ leyendo, children }) {
  if (!leyendo) return children
  return (
    <>
      Leyendo…
      <span className="pending-dot" />
    </>
  )
}

// ¿Sabe este navegador leer un código de barras?
//
// `BarcodeDetector` es nativo en Chrome y en Android, y no existe en Safari ni
// en Firefox. Traer una librería para cubrirlos serían cientos de kilobytes en
// el bundle de una app que se usa en un móvil Android — y el resto de la
// pantalla sigue funcionando sin esto: se teclea, o se lee la etiqueta.
export function canScan() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

// Los códigos que haya en la foto, decodificados aquí mismo. Devuelve una lista
// vacía si no ve ninguno, que no es un error: es una foto sin código.
async function detectBarcodes(file) {
  const detector = new window.BarcodeDetector({
    formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'],
  })
  const bitmap = await createImageBitmap(file)
  const found = await detector.detect(bitmap)
  return found.map((code) => code.rawValue).filter(Boolean)
}

// Qué contar del escaneo, encima del formulario.
//
// Sin esta línea, un formulario en blanco después de escanear no se distingue
// de uno abierto a mano, y te quedas sin saber si el código se leyó, si nadie
// lo conoce o si no había red — tres cosas que piden respuestas distintas.
function ScanNote({ scan }) {
  const message = {
    nocode: 'No he visto ningún código en la foto.',
    unknown: 'Ese código no está en Open Food Facts. Tecléalo.',
    offline: 'No he podido preguntar por ese código. Tecléalo.',
    unusable: {
      'por ración': 'Los datos de ese código vienen por ración. No me sirven: tecléalo.',
      'por 100 ml': 'Los datos de ese código vienen por 100 ml, no por 100 g. Tecléalo.',
      'sin kcal': 'La ficha de ese código no trae kcal. Tecléalo.',
    }[scan.refused_reason],
  }[scan.refusal]

  if (!message) {
    return (
      <>
        {scan.per === '100ml' && (
          <p className="food-label-warn">
            Estas cifras son por 100 ml, no por 100 g. Compruébalo antes de guardar.
          </p>
        )}
        <MismatchNote mismatch={scan.mismatch} />
      </>
    )
  }
  return <p className="food-label-warn">{message}</p>
}

// Cuando las kcal y los macros de la misma etiqueta no dan lo mismo.
//
// Es la única defensa contra un dígito mal leído. Una cifra sin fila que la
// respalde se cae, una columna equivocada se rechaza y un macro absurdo se
// tira — pero `Proteínas 3,8 g` leído como `8,8` tiene su fila, es plausible y
// viene de la columna correcta: pasa todo. Lo delata que las cifras de una
// etiqueta no son independientes.
//
// Avisa y no rechaza: el producto puede llevar polioles, o la etiqueta
// redondear raro. Lo que hace falta no es impedir el guardado, es que mirar el
// bote deje de ser opcional — y para eso hay que decir **qué** no cuadra, no
// que algo no cuadra.
function MismatchNote({ mismatch }) {
  if (!mismatch) return null
  return (
    <p className="food-label-warn">
      Las cifras no cuadran: pone {formatMacro(mismatch.declared)} kcal, pero los macros suman{' '}
      {formatMacro(mismatch.computed)}. Comprueba la etiqueta.
    </p>
  )
}

// Qué contar de la lectura, encima del formulario.
//
// Las tres salidas de la cámara acaban en este mismo formulario y sólo cambian
// en cuánto viene puesto, así que lo único que las distingue es esta línea. Sin
// ella, «lo he leído todo» y «no he leído nada» se ven igual: campos con texto o
// campos sin él, que es exactamente lo que ves cuando tecleas.
// Lo que el modelo dice haber transcrito, a un toque.
//
// Existe porque un veredicto no contesta a «¿qué ha leído?». Con las filas
// delante se ve de un vistazo si leyó bien y el backend descartó las cifras, o
// si leyó mal desde el principio — y son dos problemas distintos, con dos
// arreglos distintos, que sin esto se ven exactamente igual.
//
// Plegado, porque cuando la lectura sale bien es ruido: la información que
// hace falta ya está en los siete campos.
function ReadRows({ rows }) {
  const [open, setOpen] = useState(false)
  if (!rows || rows.length === 0) return null
  return (
    <div className="food-label-rows">
      <button type="button" className="link-btn" onClick={() => setOpen(!open)}>
        {open ? 'Ocultar lo leído' : 'Ver lo que he leído'}
      </button>
      {open && (
        <ul>
          {rows.map((row, index) => (
            <li key={index}>{row}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function LabelNote({ label }) {
  if (label.refusal === 'column') {
    // Sin cabecera no es que la columna fuera mala: es que no se leyó, y
    // decirlo con unas comillas vacías —«Esa columna es «», no por 100 g»— no
    // significa nada. Son dos fallos distintos y piden dos frases distintas.
    return (
      <p className="food-label-warn">
        {label.refused_column
          ? `Esa columna es «${label.refused_column}», no por 100 g. No me sirve: tecléalo.`
          : 'No he encontrado la cabecera de la tabla. Tecléalo.'}
      </p>
    )
  }
  if (label.refusal === 'unreadable') {
    return <p className="food-label-warn">No he podido leer la etiqueta. Tecléala.</p>
  }
  // Ni la foto ni la red: falta la clave en el servidor. Se dice así porque el
  // que puede arreglarlo es quien lee esto.
  if (label.refusal === 'off') {
    return (
      <p className="food-label-warn">La lectura de etiquetas no está configurada en el servidor.</p>
    )
  }
  // Sin cuota no es lo mismo que ilegible: repetir la foto no lo arregla. Y la
  // del minuto no es la del día — a una se le espera y a la otra no —, así que
  // decir «espera un minuto» a quien tiene que volver mañana es mandarlo a
  // mirar el móvil para nada.
  if (label.refusal === 'quota') {
    return (
      <p className="food-label-warn">
        {label.quota_scope === 'day'
          ? 'Se han acabado las fotos de hoy. Tecléalo.'
          : 'Demasiadas fotos seguidas. Espera un minuto, o tecléalo.'}
      </p>
    )
  }
  // Una lectura de la que no sale ninguna cifra no es una lectura buena, por
  // mucho que la llamada haya ido bien. Visto en producción el 2026-09-04: el
  // servidor devolvió 200, la pantalla abrió siete campos vacíos y lo único
  // escrito era un «Leído de …» en gris. Ni datos ni explicación — que es peor
  // que un error, porque un error al menos se entiende.
  const anyRead = Object.values(label.nutrients ?? {}).some((value) => value != null)
  if (!anyRead) {
    return (
      <>
        <p className="food-label-warn">No he sacado ninguna cifra de la foto. Tecléalas.</p>
        <ReadRows rows={label.rows} />
      </>
    )
  }

  const dropped = droppedNote(label.dropped)
  return (
    <>
      {label.column_header && (
        <p className="hint food-label-read">Leído de «{label.column_header}».</p>
      )}
      {/* En tinta, y encima de los campos que describe: los números están en
          casillas que dicen «por 100 g» y no son gramos. No se convierte nada
          —eso exigiría una densidad que la etiqueta no trae—, se dice lo que
          son y decides tú. En un líquido acuoso la diferencia es del 3%. */}
      {label.per === '100ml' && (
        <p className="food-label-warn">
          Estas cifras son por 100 ml, no por 100 g. Compruébalo antes de guardar.
        </p>
      )}
      {/* En tinta y no en `--muted`: explica por qué un campo está vacío, y un
          hueco sin explicar se lee como «la etiqueta no lo declara», que aquí es
          justo lo contrario de lo que ha pasado. */}
      {dropped && <p className="food-label-warn">{dropped}</p>}
      <MismatchNote mismatch={label.mismatch} />
      <ReadRows rows={label.rows} />
    </>
  )
}

// Lo leído de la foto, en las cadenas que el formulario sabe pintar.
//
// `null` se convierte en cadena vacía y no en '0' — es la misma distinción de
// siempre, aquí en su forma más peligrosa: un 0 puesto por la cámara en un
// campo que nadie va a repasar es un dato inventado que ya nadie desmiente.
// Coma decimal porque es la que vas a leer en la etiqueta y la que espera
// `number()` al guardar.
function fromNutrients(read) {
  const empty = { kcal: '', protein: '', fat: '', carbs: '', fiber: '' }
  if (!read) return empty
  return Object.fromEntries(
    Object.keys(empty).map((key) => [
      key,
      read[key] == null ? '' : String(read[key]).replace('.', ','),
    ]),
  )
}

// Corregir un alimento tuyo: las cifras, el código y las raciones.
//
// La otra cara de `NewFood`, y se parece a ella a propósito — mismos campos, en
// el mismo orden, con los mismos rótulos. Es el mismo objeto: que el alta y la
// corrección se lean distinto es cómo se acaba dudando de si son la misma cosa.
//
// Sólo lo tuyo. Una fila del catálogo compartido es una medición de todos, el
// servidor la rechaza con un 403, y `is_mine` es lo que deja no ofrecer siquiera
// la puerta: un control que no puede funcionar es peor que uno que no está.
//
// Nada de lo aquí escrito toca el diario. Las entradas congelaron sus números
// al escribirse, que es exactamente para lo que los congelaron: una etiqueta
// que leíste mal en marzo no puede reescribir lo que sumaba febrero.
function FoodEditor({ food, dayIso, affected = 0, onSaved, onCancel }) {
  const [name, setName] = useState(food.name)
  const [brand, setBrand] = useState(food.brand ?? '')
  const [barcode, setBarcode] = useState(food.barcode ?? '')
  const [values, setValues] = useState(() => ({
    kcal: food.kcal_100g ?? '',
    protein: food.protein_100g ?? '',
    fat: food.fat_100g ?? '',
    carbs: food.carbs_100g ?? '',
    fiber: food.fiber_100g ?? '',
  }))
  const [portions, setPortions] = useState(() =>
    (food.portions ?? []).map((p) => ({
      label: p.label,
      grams: String(p.grams),
      is_default: p.is_default,
    })),
  )
  const [busy, setBusy] = useState(false)
  // Lo guardado, esperando a que se decida qué hacer con lo que ya hay escrito
  // en el diario de este día. `null` mientras no haya nada que decidir.
  const [pending, setPending] = useState(null)
  // Si el intento de rehacer el día no llegó. El alimento ya está corregido —
  // eso no se deshace—, y lo que queda es volver a intentarlo o dejarlo.
  const [failed, setFailed] = useState(false)

  const number = (raw) => {
    const value = Number(String(raw).replace(',', '.'))
    return String(raw).trim() === '' || !Number.isFinite(value) ? null : value
  }

  const setPortion = (index, patch) =>
    setPortions(portions.map((p, i) => (i === index ? { ...p, ...patch } : p)))

  // Una sola por defecto: marcar otra desmarca la anterior, aquí y no en el
  // servidor, para que la pantalla no enseñe dos mientras decide.
  const makeDefault = (index) =>
    setPortions(portions.map((p, i) => ({ ...p, is_default: i === index })))

  async function submit(event) {
    event.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const saved = await correctFood(food.id, {
      name: name.trim(),
      brand: brand.trim() || null,
      barcode: barcode.trim() || null,
      kcal_100g: number(values.kcal),
      protein_100g: number(values.protein),
      fat_100g: number(values.fat),
      carbs_100g: number(values.carbs),
      fiber_100g: number(values.fiber),
      // La lista entera sustituye a la anterior, que es como el servidor la
      // recibe. Las que se quedaron sin nombre o sin gramos no se mandan: una
      // fila a medio escribir no es una ración.
      portions: portions
        .filter((p) => p.label.trim() && number(p.grams) !== null)
        .map((p) => ({
          label: p.label.trim(),
          grams: number(p.grams),
          is_default: p.is_default,
        })),
    })
    // El congelado sigue siendo la regla: si no hay nada de este alimento en el
    // día que se está mirando, no hay nada que preguntar y esto se comporta
    // como siempre.
    if (affected > 0) {
      setPending(saved)
      setBusy(false)
      return
    }
    onSaved(saved)
  }

  async function recompute() {
    setBusy(true)
    try {
      await recomputeFoodDay(food.id, dayIso)
    } catch {
      // Sin esto, un fallo de red dejaba «Actualizar» desactivado para siempre
      // y sin decir por qué: la corrección ya está guardada, así que lo único
      // que se ha perdido es rehacer el día, y se puede volver a intentar.
      setFailed(true)
      setBusy(false)
      return
    }
    await onSaved(pending, { recomputed: true })
  }

  // Guardado, y con algo de este alimento en el día que se está mirando. La
  // oferta sustituye al formulario en vez de colgarse debajo: lo que hay que
  // decidir ahora es una cosa y sólo una, y el formulario ya no responde a
  // ninguna pregunta abierta.
  if (pending) {
    return (
      <div className="card card-compose food-edit food-recompute">
        <p className="food-editor-name">Corregido.</p>
        <p className="hint">
          {affected === 1
            ? '1 entrada de este día usa las cifras antiguas.'
            : `${affected} entradas de este día usan las cifras antiguas.`}
        </p>
        {failed && (
          <p className="hint food-recompute-failed">
            No se ha podido actualizar. El alimento sí quedó corregido.
          </p>
        )}
        <div className="food-editor-actions">
          <button type="button" className="primary" onClick={recompute} disabled={busy}>
            {failed ? 'Reintentar' : 'Actualizar'}
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => onSaved(pending)}
            disabled={busy}
          >
            Dejarlo como está
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className="card card-compose food-edit" onSubmit={submit}>
      <div className="field">
        <label htmlFor="edit-name">Nombre</label>
        <input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="edit-brand">Marca</label>
        <input
          id="edit-brand"
          autoComplete="off"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
        />
      </div>
      {EDIT_FIELDS.map((field) => (
        <div className="field" key={field.key}>
          <label htmlFor={`edit-${field.key}`}>{field.label}</label>
          <input
            id={`edit-${field.key}`}
            inputMode="decimal"
            value={values[field.key]}
            onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
          />
        </div>
      ))}
      <div className="field">
        <label htmlFor="edit-barcode">Código de barras</label>
        <input
          id="edit-barcode"
          inputMode="numeric"
          autoComplete="off"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
        />
      </div>

      {/* Las raciones son lo que hace que registrar «dos rebanadas» no te
          obligue a pesar el pan. La tabla existía en el servidor desde el
          principio y no había ninguna pantalla que las escribiera. */}
      <fieldset className="food-portions">
        <legend>Raciones</legend>
        {portions.map((portion, index) => (
          <div className="food-portion" key={index}>
            <input
              aria-label={`Ración ${index + 1}`}
              placeholder="rebanada"
              value={portion.label}
              onChange={(e) => setPortion(index, { label: e.target.value })}
            />
            <input
              aria-label={`Gramos de la ración ${index + 1}`}
              inputMode="decimal"
              placeholder="g"
              value={portion.grams}
              onChange={(e) => setPortion(index, { grams: e.target.value })}
            />
            {/* Con su rótulo a la vista. Sin él era un círculo ámbar suelto al
                lado de «Quitar»: el `aria-label` decía lo que hacía a quien
                navega a ciegas, y a quien mira no se lo decía nadie. */}
            <label className="food-portion-default">
              <input
                type="radio"
                name="portion-default"
                aria-label={`Ración ${index + 1} por defecto`}
                checked={portion.is_default}
                onChange={() => makeDefault(index)}
              />
              Por defecto
            </label>
            <button
              type="button"
              className="link-btn"
              aria-label={`Quitar la ración ${index + 1}`}
              onClick={() => setPortions(portions.filter((_, i) => i !== index))}
            >
              Quitar
            </button>
          </div>
        ))}
        <button
          type="button"
          className="link-btn"
          onClick={() =>
            setPortions([...portions, { label: '', grams: '', is_default: portions.length === 0 }])
          }
        >
          Añadir ración
        </button>
      </fieldset>

      <p className="hint">Lo que dejes en blanco queda como desconocido, no como cero.</p>
      <p className="hint">Corregir un alimento no cambia nada de lo que ya registraste.</p>

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

// Los cinco macros, en el mismo orden y con los mismos rótulos que el alta.
const EDIT_FIELDS = [
  { key: 'kcal', label: 'Kcal por 100 g' },
  { key: 'protein', label: 'Proteína por 100 g' },
  { key: 'fat', label: 'Grasa por 100 g' },
  { key: 'carbs', label: 'Hidratos por 100 g' },
  { key: 'fiber', label: 'Fibra por 100 g' },
]

// El alta manual: el pan de la panadería, los piquillos de tu madre.
//
// Sólo el nombre es obligatorio. Un macro que no escribes se manda como `null`,
// nunca como 0 — nadie lo ha medido, y un cero afirmaría que sí y que no hay.
function NewFood({ name: initialName, label = null, scan = null, onCreated, onCancel }) {
  const box = useRef(null)
  const [name, setName] = useState(initialName)
  // La marca va aparte del nombre porque es un dato distinto: se pinta aparte
  // en los resultados y se busca por su cuenta. De un producto envasado te
  // acuerdas por el súper —«el de Hacendado»— antes que por su nombre
  // comercial, así que escribirla aquí es lo que lo hace encontrable luego.
  const [brand, setBrand] = useState(label?.brand ?? scan?.brand ?? '')
  const [values, setValues] = useState(() => fromNutrients(label?.nutrients ?? scan?.nutrients))
  const [busy, setBusy] = useState(false)

  // El formulario se trae a la vista al aparecer.
  //
  // Nació contra un defecto que la hoja ya no tiene —cuando esto era un panel
  // en línea, `AddFood` se desplazaba sólo en su primer montaje y a la segunda
  // vuelta «Guardar alimento» nacía a 1047 px de una pantalla de 932—, y sigue
  // sirviendo dentro de ella: la hoja tiene techo (`max-height: 88dvh`) y su
  // contenido rueda, así que con siete campos el principio del formulario puede
  // nacer por encima del borde.
  //
  // Y con una etiqueta leída importa el doble: lo primero que hay que ver es la
  // línea que dice de qué columna salieron las cifras, que es lo que separa
  // confirmar de firmar en blanco.
  //
  // `?.` sobre el método porque jsdom no implementa `scrollIntoView`; lo que
  // esto hace de verdad se mide en `comida.browser-test.jsx`, en Chromium.
  useEffect(() => {
    box.current?.scrollIntoView?.({ block: 'start' })
  }, [])

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
      // El código que trajo el escaneo. Sin guardarlo, escanear el mismo yogur
      // mañana vuelve a preguntar a Open Food Facts por algo que ya tienes.
      barcode: scan?.barcode ?? null,
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
    <form className="card card-compose food-new" ref={box} onSubmit={submit}>
      {label && <LabelNote label={label} />}
      {scan && <ScanNote scan={scan} />}
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
