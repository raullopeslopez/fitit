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
  kcalFromMacros,
  macroBar,
  previewNutrients,
  shiftDay,
  slotLabel,
  withoutEntry,
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
  // Por qué no se puede leer una etiqueta ahora mismo: `null`, o
  // `{ kind: 'minute' | 'day' | 'off', until? }`.
  //
  // Vive aquí y no dentro de la pantalla de añadir porque no es de la pantalla:
  // la cuota es de la cuenta y del día, y la clave es del servidor. Guardándolo
  // abajo, cerrar y volver a abrir devolvía una cámara que ya sabíamos que iba a
  // contestar lo mismo — y cada intento gasta de lo que ya no hay.
  const [labelBlock, setLabelBlock] = useState(null)
  // La entrada cuyo borrado se está confirmando. `null` mientras no haya nada
  // que confirmar — borrar es lo único irreversible de la pantalla.
  const [confirming, setConfirming] = useState(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  // El filtro que abre el chip de nutrientes desconocidos: sólo las entradas
  // a las que les falta algo, para poder corregirlas sin buscarlas a ojo.
  const [onlyIncomplete, setOnlyIncomplete] = useState(false)
  // El objetivo diario, en su propio cajón — no es del día, es del perfil.
  const [targetOpen, setTargetOpen] = useState(false)
  const [targets, setTargets_] = useState({ protein: '', carbs: '', fat: '' })
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

  // Borrar ya no vive en el formulario: se desliza la fila, y lo que queda es
  // un «Deshacer» donde estaba la entrada, no un aviso que caduca solo.
  async function handleDeleteEntry(entry) {
    setConfirming(null)
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
    const show = (value) => (value != null ? String(value) : '')
    setTargets_({
      protein: show(day?.target_protein),
      carbs: show(day?.target_carbs),
      fat: show(day?.target_fat),
    })
    setTargetOpen(true)
  }

  async function saveTarget(values) {
    const parse = (raw) => (String(raw).trim() === '' ? null : Number(String(raw).replace(',', '.')))
    setSavingTarget(true)
    try {
      // Sin kcal: las deriva el servidor del reparto (`atwater_kcal`).
      await setTargets({
        protein: parse(values.protein),
        carbs: parse(values.carbs),
        fat: parse(values.fat),
      })
      setTargetOpen(false)
      await load(dayIso)
    } finally {
      setSavingTarget(false)
    }
  }

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
          no en un control permanente sobre las cifras que sí cambian a diario.
          Lo que abre es una hoja, no un panel en línea: es corto y edita algo
          concreto, que es la forma que le toca. */}
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
      </div>

      {targetOpen && (
        <div className="sheet-scrim" onClick={() => setTargetOpen(false)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Objetivos diarios"
            onClick={(e) => e.stopPropagation()}
          >
            <Objetivos
              initial={targets}
              busy={savingTarget}
              onSave={saveTarget}
              onCancel={() => setTargetOpen(false)}
            />
          </div>
        </div>
      )}

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
              onDelete={setConfirming}
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
          <ClosingLine day={day} onSummary={() => setSummaryOpen(true)} />
        </>
      )}

      {/* Añadir ocupa la pantalla entera, no una hoja.
          Es una tarea con lista larga —el catálogo devuelve hasta treinta
          filas— y con cámara, y las dos cosas piden alto: una hoja anclada al
          pie tiene techo (`max-height: 88dvh`) y crece hacia arriba, así que
          con el teclado subiendo se comía su propia cabecera. La regla de forma
          del rediseño lo dice sin rodeos: pantalla completa para lo que tiene
          muchos resultados o necesita cámara, hoja para lo corto.

          Editar una entrada sí se queda en hoja: es un campo y dos botones. */}
      {adding && (
        <AddFood
          slot={adding.slot}
          dayIso={dayIso}
          isToday={isToday}
          entries={day?.entries ?? []}
          siempre={siempre}
          labelReading={day?.label_reading ?? false}
          block={labelBlock}
          onBlocked={setLabelBlock}
          onDone={afterWrite}
          // Rehacer el día desde la corrección reescribe entradas que ya están
          // pintadas, y no cierra la pantalla: estabas registrando algo cuando
          // te diste cuenta de la errata, y sigues estándolo.
          onDayChanged={() => load(dayIso)}
          onCancel={closeSheet}
        />
      )}

      {confirming && (
        <ConfirmarBorrado
          entry={confirming}
          day={day}
          onConfirm={() => handleDeleteEntry(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}

      {summaryOpen && day && (
        <div className="sheet-scrim" onClick={() => setSummaryOpen(false)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Resumen del día"
            onClick={(e) => e.stopPropagation()}
          >
            <Resumen day={day} dayIso={dayIso} onClose={() => setSummaryOpen(false)} />
          </div>
        </div>
      )}

      {!adding && editingEntry && (
        <div className="sheet-scrim" onClick={closeSheet}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Editar entrada"
            onClick={(e) => e.stopPropagation()}
          >
            <EntryEditor entry={editingEntry} onDone={afterWrite} onCancel={closeSheet} />
          </div>
        </div>
      )}
    </div>
  )
}

// Los objetivos diarios: gramos por macro, y las kcal como consecuencia.
//
// Antes se fijaban las kcal y la proteína, cada una por su lado, y eso dejaba
// guardar un total que sus propios macros no daban —2.600 kcal con 160 g de
// proteína, 300 de hidratos y 80 de grasa son 2.560— con las dos cifras en
// pantalla y nada que dijera cuál mandaba. Ahora se reparte en gramos y el total
// sale de ahí: una sola cifra que no se puede contradecir.
//
// El total se recalcula al teclear, antes de guardar nada, porque el reparto es
// justo lo que hay que ver mientras se decide. La cuenta es la misma que hace el
// servidor al guardar (`atwater_kcal`), y hay una prueba que ata las dos.
function Objetivos({ initial, busy, onSave, onCancel }) {
  const [values, setValues] = useState(initial)
  const number = (raw) => {
    const value = Number(String(raw).replace(',', '.'))
    return String(raw).trim() === '' || !Number.isFinite(value) ? null : value
  }
  const macros = {
    protein: number(values.protein),
    carbs: number(values.carbs),
    fat: number(values.fat),
  }
  // Sin un solo macro repartido no hay total, y `null` se imprime `—`. Un 0 aquí
  // diría «tu objetivo es no comer», que es otra afirmación — y además es la que
  // el servidor se niega a guardar.
  const derived = Object.values(macros).some((v) => v != null) ? kcalFromMacros(macros) : null
  const set = (key) => (e) => setValues({ ...values, [key]: e.target.value })

  return (
    <form
      className="sheet-body food-goals"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(values)
      }}
    >
      <Asa />
      <header className="food-detail-head">
        <h2 className="food-detail-name">Objetivos diarios</h2>
        <button type="button" className="link-btn" onClick={onCancel} disabled={busy}>
          Cerrar
        </button>
      </header>

      <div className="field">
        <label htmlFor="target-protein">Proteína (g)</label>
        <input
          id="target-protein"
          inputMode="decimal"
          placeholder="p. ej. 160"
          value={values.protein}
          onChange={set('protein')}
        />
      </div>
      <div className="row">
        <div className="field stepper-field">
          <label htmlFor="target-carbs">Hidratos (g)</label>
          <input
            id="target-carbs"
            inputMode="numeric"
            placeholder="300"
            value={values.carbs}
            onChange={set('carbs')}
          />
        </div>
        <div className="field stepper-field">
          <label htmlFor="target-fat">Grasa (g)</label>
          <input
            id="target-fat"
            inputMode="numeric"
            placeholder="80"
            value={values.fat}
            onChange={set('fat')}
          />
        </div>
      </div>

      {/* Sólo lectura, y por eso no es un campo: es lo que sale de lo de arriba,
          no otra cosa que decidir. */}
      <p className="card food-goals-total">
        <span className="food-detail-label">Total derivado</span>
        <span className="food-detail-value">{formatMacro(derived)} kcal</span>
      </p>

      <button type="submit" className="primary btn-full" disabled={busy}>
        Guardar objetivos
      </button>
      <p className="hint food-goals-foot">
        Las kcal no se teclean: salen de repartir los gramos.
      </p>
    </form>
  )
}

// El asa de una hoja: 38×4 px, centrada, y nada más.
//
// Dice dos cosas sin una palabra: que esto es una hoja y no una pantalla, y que
// se puede echar hacia abajo. Vive aquí y no en `.sheet` a propósito — esa clase
// la comparten las hojas de Entreno, y cambiarla las tocaría todas sin que nadie
// lo haya pedido. Si convence, subirla es una línea.
function Asa() {
  return <span className="sheet-grip" aria-hidden="true" />
}

// Confirmar un borrado, diciendo qué se pierde.
//
// El único diálogo **centrado** de la pantalla, y a propósito: una hoja se
// descarta deslizando hacia abajo, y esto no puede descartarse por accidente.
// Todo lo demás de Comida se edita o se cancela; esto es lo único que no se
// deshace solo — hay un «Deshacer» detrás, pero vuelve a escribir la entrada,
// no la recupera, porque `log_entries` congela.
//
// Y nunca se borra sin decir qué se pierde. Un «¿seguro?» pide una decisión sin
// darte con qué tomarla: lo que hay que saber es en qué queda el día.
function ConfirmarBorrado({ entry, day, onConfirm, onCancel }) {
  return (
    <div className="sheet-scrim food-confirm-scrim" onClick={onCancel}>
      <div
        className="card food-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-label={`Borrar ${entry.food_name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="food-confirm-title">¿Borrar «{entry.food_name}»?</h2>
        <p className="hint food-confirm-impact" data-testid="food-delete-impact">
          <Impacto entry={entry} day={day} />
        </p>
        <button type="button" className="btn-full food-confirm-go" onClick={onConfirm}>
          Borrar
        </button>
        <button type="button" className="secondary btn-full" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// En qué queda el día si se borra esta entrada.
//
// Tres frases, no una con huecos: lo que se puede afirmar cambia según lo que se
// sepa, y rellenar un hueco con una raya deja una frase que no dice nada («tu
// día baja a — g»). De más informativa a menos:
//
// 1. Con objetivo y total conocidos: a cuánto baja y cuánto queda por debajo.
// 2. Con el total conocido y sin objetivo: a cuánto baja, sin comparar con nada.
// 3. Con el total desconocido: lo único que sí se sabe es lo que se va.
function Impacto({ entry, day }) {
  const queda = withoutEntry(day?.totals?.protein, entry.protein)
  if (queda == null) {
    if (entry.protein == null) return <>Esta entrada no tiene la proteína medida.</>
    return (
      <>
        Se van <strong>{formatMacro(entry.protein)} g</strong> de proteína del día.
      </>
    )
  }
  const falta = withoutEntry(day?.target_protein, queda)
  if (falta == null || falta <= 0) {
    return (
      <>
        Tu día baja a <strong>{formatMacro(queda)} g</strong> de proteína.
      </>
    )
  }
  return (
    <>
      Tu día baja a <strong>{formatMacro(queda)} g</strong> de proteína,{' '}
      <strong>{formatMacro(falta)} g</strong> por debajo del objetivo.
    </>
  )
}

// El resumen del día: cuánto se ha cumplido, y por dónde ha entrado.
//
// **Sin juicio moral.** Informa; no felicita ni riñe. Pasarse de grasa se dice
// con el porcentaje, no con rojo ni con un icono — `--danger` en esta app es
// para borrar y para error, y comerse un aguacate de más no es ninguna de las
// dos cosas.
function Resumen({ day, dayIso, onClose }) {
  const totals = day.totals ?? {}
  return (
    <div className="sheet-body food-summary">
      <Asa />
      <header className="food-detail-head">
        <h2 className="food-detail-name">Resumen del día</h2>
        <button type="button" className="link-btn" onClick={onClose}>
          Cerrar
        </button>
      </header>
      <p className="food-detail-per">{formatDayShort(dayIso)}</p>

      <div className="card food-summary-card">
        {SUMMARY_MACROS.map((macro) => (
          <SummaryBar
            key={macro.key}
            label={macro.label}
            eaten={totals[macro.key]}
            target={day[macro.target]}
            lead={macro.key === 'protein'}
          />
        ))}
      </div>

      <div className="card food-summary-card">
        <p className="food-summary-head">
          <span className="card-eyebrow">Reparto por comida</span>
          <span className="food-summary-kcal">{formatMacro(totals.kcal)} kcal</span>
        </p>
        {/* Los subtotales llegan del servidor: una comida vacía suma `null`, no
            0, y esa regla vive en `sumar_nutrientes` y en ningún otro sitio. */}
        {(day.by_slot ?? [])
          .filter((group) => group.slot != null || group.totals?.kcal != null)
          .map((group) => (
            <p className="food-summary-slot" key={group.slot ?? 'sin-asignar'}>
              <span className="food-detail-label">{slotLabel(group.slot)}</span>
              <span className="food-detail-value">
                {formatMacro(group.totals?.protein)} P · {formatMacro(group.totals?.kcal)} kcal
              </span>
            </p>
          ))}
      </div>
    </div>
  )
}

// Una barra de cumplimiento. El ancho se recorta a 100 —una barra no se sale de
// su caja— y el porcentaje no, porque es una cifra y pasarse es un dato del día.
function SummaryBar({ label, eaten, target, lead }) {
  const bar = macroBar(eaten, target)
  return (
    <div className={`food-summary-row${lead ? ' is-lead' : ''}`}>
      <p className="food-macro-line">
        <span className="food-macro-label">{label}</span>
        {/* El porcentaje sólo existe si se sabe cuánto llevas. Un «0 %» con el
            total desconocido afirma que no has comido nada de eso, que es la
            misma mentira que un 0 en un nutriente sin medir — aquí escondida
            dentro de un porcentaje, que es donde más fácil se cuela. */}
        <span className="food-macro-value">
          {formatMacro(eaten)} / {formatMacro(target)} g
          {bar && eaten != null ? ` · ${bar.percent} %` : ''}
        </span>
      </p>
      <span className="food-summary-bar" aria-hidden="true">
        {bar && <span className="food-summary-fill" style={{ width: `${bar.done}%` }} />}
      </span>
    </div>
  )
}

const SUMMARY_MACROS = [
  { key: 'protein', label: 'Proteína', target: 'target_protein' },
  { key: 'carbs', label: 'Hidratos', target: 'target_carbs' },
  { key: 'fat', label: 'Grasa', target: 'target_fat' },
]

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

      {/* «Cumplido» era el rótulo de esta fila, y con `985 / 2560` al lado decía
          justo lo contrario de lo que enseñaba. «Energía» es lo que una etiqueta
          llama a esto, no afirma nada, y deja la unidad al final como en las
          filas de macro de arriba. */}
      {day.target_kcal != null && (
        <p className="food-macros-kcal">
          <span>Energía</span>
          <span className="food-macros-kcal-value">
            {formatMacro(totals.kcal)} / {formatMacro(day.target_kcal)} kcal
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
function ClosingLine({ day, onSummary }) {
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
      <button type="button" className="link-btn" onClick={onSummary}>
        Resumen
      </button>
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
        <label htmlFor={`grams-${entry.id}`}>Cantidad</label>
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
function AddFood({
  slot = null,
  dayIso,
  isToday = true,
  entries = [],
  siempre = [],
  labelReading = false,
  block = null,
  onBlocked = () => {},
  onDone,
  onDayChanged,
  onCancel,
}) {
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
  // Por qué peldaño va la lectura: 'scan', 'label' o ninguno. Ya no distingue
  // dos disparadores —hay uno—, sino en qué punto de la escalada estás, que es
  // lo que la pantalla tendrá que contar cuando escale (paso siguiente).
  const [reading, setReading] = useState(null)
  // El frecuente que se está registrando, para apagar la fila mientras viaja.
  const [quick, setQuick] = useState(null)
  // El peldaño de en medio: el código se leyó, no lo conoce nadie, y hace falta
  // una segunda foto — de la tabla, que suele estar en otra cara del envase.
  // Lleva el motivo dentro porque «no está en ninguna base» y «no he podido
  // preguntar» piden frases distintas.
  const [escalating, setEscalating] = useState(null)
  // El código que la foto traía, decodificado y ya descartado como atajo.
  // Sobrevive a la escalada a propósito: acabes leyendo la tabla o tecleando el
  // alimento entero, guardarlo con su código es lo que hace que mañana el mismo
  // envase se resuelva en el peldaño gratis. Sin esto, escalar tiraba el único
  // dato que la foto sí había dado.
  const [barcode, setBarcode] = useState(null)
  // El alimento que la ficha pública acaba de meter en tu catálogo. Distinto de
  // `chosen` (lo elegiste en la lista) y de `scan.food` (ya era tuyo) porque la
  // pantalla lo cuenta distinto: éste no estaba y ahora sí.
  const [resolved, setResolved] = useState(null)
  // La foto no se pudo leer. Es el único rechazo que se arregla repitiéndola, y
  // por eso es el único que la ofrece.
  const [unreadable, setUnreadable] = useState(false)
  const latest = useRef(0)
  const field = useRef(null)

  // El cursor entra en la búsqueda al abrir: es lo siguiente que ibas a hacer
  // de todas formas, y es la primera capa de ahorro — la mayoría de las veces
  // el alimento ya está y no hace falta ni cámara ni formulario.
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
      setResults(byOrigin(found))
      setSearching(false)
    }, 180)
    return () => clearTimeout(timer)
  }, [query, chosen, creating])

  // Un frecuente, registrado de un toque con la cantidad de siempre y en la
  // comida por la que has entrado —no en la que sueles usar para ese alimento:
  // aquí ya has dicho a dónde va, y contradecirte sería raro.
  async function quickAdd(item) {
    setQuick(item.food_id)
    try {
      await logFood({ foodId: item.food_id, grams: item.grams, mealSlot: slot })
      await onDone()
    } finally {
      setQuick(null)
    }
  }

  // El único disparador de cámara, y la escalada detrás de él.
  //
  // El usuario no elige tecnología. Antes había dos botones —«Código de barras»
  // y «Etiqueta»— que eran dos implementaciones de una sola intención, y la
  // elección la tenías que hacer tú sin saber cuál de las dos iba a funcionar
  // con el envase que tenías delante. Ahora se prueba el peldaño gratis y sólo
  // se sube al caro cuando el gratis ha fallado:
  //
  //   1. Código de barras, decodificado **en el móvil**. `BarcodeDetector` es
  //      nativo, así que no cuesta red, ni clave, ni cuota, ni un byte de
  //      bundle: la foto no sale de aquí, al servidor sólo viaja el número.
  //   2. La tabla nutricional leída con el modelo. Con cuota y con espera.
  //
  // Un fallo de red no puede dejarte mirando un botón que no hace nada: se
  // acaba abriendo el formulario, que es donde estabas antes de que el botón
  // existiera.
  async function openCamera(event) {
    const file = take(event)
    if (!file) return
    setEscalating(null)
    setBarcode(null)
    setResolved(null)

    // Peldaño 1: el código. Sólo donde el navegador sabe decodificar — en un
    // Chrome de Android está, en un Safari no —, y si no sabe, la escalada
    // empieza un peldaño más arriba en vez de ofrecer un botón que no puede
    // funcionar.
    if (canScan()) {
      setReading('scan')
      setLabel(null)
      setCreating(false)
      try {
        const codes = await detectBarcodes(file)
        if (codes.length > 0) {
          setBarcode(codes[0])
          const found = await scanBarcode(codes[0])
          // Con ficha utilizable se acabó: ni tabla, ni modelo, ni cuota.
          if (found?.food) {
            setReading(null)
            setScan(found)
            return
          }
          if (!found?.refusal) {
            // Y se guarda sin preguntar. Un formulario delante de esto sería
            // pedir una firma sin lectura: nadie corrige campo por campo una
            // ficha que no ha medido, y el código identifica el producto mejor
            // que cualquier nombre que uno teclee. Guardarlo es lo que convierte
            // «veinte fotos al día» en «veinte productos nuevos al día».
            //
            // Sin preguntar no significa inventando: un nutriente que la ficha
            // no trae viaja `null`, igual que si nadie lo hubiera tecleado.
            try {
              setResolved(await createFood(fromScan(found, codes[0])))
            } catch {
              // Si el guardado no llega, no se pierde la lectura: el formulario
              // se abre con lo que la ficha traía y se guarda a mano.
              setScan(found)
              setCreating(true)
            } finally {
              setReading(null)
            }
            return
          }
          setReading(null)
          // El código se leyó y no sirve. Aquí **no** se lee la tabla de esta
          // misma foto: el código y la tabla están en caras distintas del
          // envase, así que esa foto casi nunca tiene tabla que leer y gastar
          // cuota en ella es pagar por un fallo seguro. Se pide otra, y se dice
          // por qué — un paso con motivo, no un menú por adelantado.
          // Tres motivos, tres frases: que nadie lo conozca, que no se haya
          // podido preguntar y que la ficha exista pero no sirva son cosas
          // distintas, y la de en medio no se arregla esperando.
          setEscalating(found.refusal)
          return
        }
      } catch {
        // Ni red ni decodificador. La foto sigue siendo del envase, así que la
        // tabla puede estar en ella: se intenta, en vez de pedir otra igual.
      }
    }

    // Peldaño 2: la tabla. Se paga aquí, cuando lo gratis ya ha fallado —o
    // cuando no había peldaño gratis que probar.
    await readTable(file)
  }

  // La segunda foto: la de la tabla, ya con el código descartado.
  function shootTable(event) {
    const file = take(event)
    if (file) readTable(file)
  }

  // La lectura cara. Un fallo aquí no puede dejarte mirando un botón que no
  // hace nada: se abre el formulario igual, en blanco, que es donde estabas
  // antes de que la cámara existiera.
  async function readTable(file) {
    setReading('label')
    setScan(null)
    setEscalating(null)
    setUnreadable(false)
    let read
    try {
      read = await readLabel(file)
    } catch (error) {
      // Un 503 es «el servidor no tiene esto configurado», que no es lo mismo
      // que «no he podido leer la etiqueta»: contarlo como lo segundo te deja
      // repitiendo la foto contra algo que no puede funcionar. Pasó de verdad,
      // el 2026-09-04, y costó una sesión de depuración.
      read = { refusal: error?.status === 503 ? 'off' : 'unreadable' }
    } finally {
      setReading(null)
    }

    // Cinco causas y cinco salidas. Tres de ellas **no** abren el formulario,
    // porque el formulario no es su salida: sin cuota o sin clave lo que hay
    // que hacer es dejar de ofrecer la cámara, y con una foto ilegible lo que
    // hay que ofrecer es repetirla.
    const parada = detiene(read)
    if (parada) {
      onBlocked(parada)
      return
    }
    if (read.refusal === 'unreadable') {
      setUnreadable(true)
      return
    }
    // Lo que queda —la columna equivocada, y la lectura que salió bien— sí
    // acaba en el formulario. Una en blanco, la otra rellena.
    setLabel(read)
    setCreating(true)
  }

  if (creating) {
    return (
      <NewFood
        name={label?.name || query.trim()}
        label={label}
        barcode={barcode}
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

  // El peldaño de en medio ocupa la pantalla: es una pregunta con dos salidas y
  // nada más que decidir mientras esté abierta.
  if (escalating || unreadable) {
    return (
      <Escalada
        reason={unreadable ? 'unreadable' : escalating}
        slot={slot}
        busy={Boolean(reading)}
        onShoot={shootTable}
        onType={() => {
          setEscalating(null)
          setUnreadable(false)
          setCreating(true)
        }}
        onCancel={onCancel}
      />
    )
  }

  // Los dos caminos que llegan al detalle sin pasar por un formulario: el que ya
  // era tuyo y el que la ficha pública acaba de guardar.
  const conocido = scan?.food ?? resolved
  const cerrarDetalle = () => {
    setChosen(null)
    setScan(null)
    setResolved(null)
  }

  const destino = slotLabel(slot)
  const term = query.trim()
  // Lo que repites, con la cantidad de siempre. Sólo en el día en curso:
  // `logFood` fecha con el reloj del móvil, así que en un día pasado el toque
  // escribiría en hoy y la entrada aparecería en una pantalla que no estás
  // mirando, sin error por ninguna parte.
  const frecuentes = isToday ? siempre : []

  return (
    <div
      className="food-screen"
      role="dialog"
      aria-modal="true"
      aria-label={`Añadir a ${destino.toLowerCase()}`}
    >
      {/* El destino ya viene resuelto por la comida desde la que has entrado,
          así que la cabecera lo afirma en vez de preguntarlo. */}
      <header className="food-screen-head">
        <p className="food-screen-title">
          <span className="card-eyebrow">Añadir a</span>
          <span className="food-screen-slot">{destino}</span>
        </p>
        <button type="button" className="link-btn" onClick={onCancel}>
          Cancelar
        </button>
      </header>

      <div className="food-screen-body">
        {/* Sin rótulo a la vista: el cursor ya está dentro y lo que se espera de
            un campo vacío al abrir esta pantalla no admite duda. El nombre sigue
            estando para quien navega a ciegas. */}
        <div className="field food-search-field">
          <input
            id="food-q"
            ref={field}
            aria-label="Buscar alimento"
            autoComplete="off"
            placeholder="Buscar alimento"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {(results.length > 0 || term) && (
          <div className="card food-results-card">
            <ul className="food-results">
              {results.map((food) => (
                <li key={food.id}>
                  <button
                    type="button"
                    className="link-row food-result"
                    onClick={() => setChosen(food)}
                  >
                    <span className="food-result-main">
                      <span className="food-result-name">{food.name}</span>
                      {/* La procedencia va en **texto**, no en color. Se evaluó
                          un segundo tono para marcarla y se descartó: el color
                          de esta pantalla codifica progreso, y un dato importado
                          no es un progreso. Además el color solo nunca puede ser
                          el único canal. */}
                      <span className="food-result-meta">
                        {food.brand ? `${food.brand} · ` : ''}
                        {origen(food)}
                      </span>
                    </span>
                    <span className="food-result-protein">
                      {formatMacro(food.protein_100g)} P
                    </span>
                  </button>
                </li>
              ))}
              {/* Dar de alta lo que no está, dentro de la propia lista y como su
                  última fila: es el desenlace de esta búsqueda, no una
                  alternativa a la cámara. Como hermano del disparador se leería
                  como «o haz una foto, o tecléalo», que es justo la elección de
                  tecnología que este rediseño quita de en medio. */}
              {term && !searching && (
                <li>
                  <button
                    type="button"
                    className="link-row food-result food-create"
                    /* El nombre calculado arrastraría la submeta —«Crear «pan»
                       ninguno de éstos es el tuyo»—, que describe la fila y no
                       lo que el control hace. */
                    aria-label={`Crear «${term}»`}
                    onClick={() => setCreating(true)}
                  >
                    <span className="food-result-main">
                      <span className="food-result-name">Crear «{term}»</span>
                      <span className="food-result-meta">
                        {results.length === 0
                          ? 'ningún alimento se llama así'
                          : 'ninguno de éstos es el tuyo'}
                      </span>
                    </span>
                  </button>
                </li>
              )}
            </ul>
            {term && searching && <p className="hint food-search-note">Buscando…</p>}
          </div>
        )}

        {/* Los frecuentes, con la cantidad de siempre dentro del propio chip: un
            toque registra eso, sin pasar por «cuánto». */}
        {frecuentes.length > 0 && (
          <section className="food-frequent">
            <p className="card-eyebrow">Frecuentes</p>
            <div className="food-frequent-chips">
              {frecuentes.map((item) => (
                <button
                  type="button"
                  key={item.food_id}
                  className="chip food-frequent-chip"
                  disabled={quick !== null}
                  onClick={() => quickAdd(item)}
                >
                  <span className="food-frequent-name">{item.name}</span>
                  <span className="food-frequent-grams">{formatAmount(item.grams)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Una cámara, no dos.
            Antes había que elegir entre «Código de barras» y «Etiqueta»: dos
            implementaciones de una sola intención, y la elección la tenías que
            hacer tú sin saber cuál iba a funcionar. Ahora hay un disparador y el
            sistema escala solo, del camino gratis al caro, y lo cuenta después.

            Cambia de forma según lo que la impida: apagada con su cuenta cuando
            sólo hay que esperar, retirada cuando esperar no arregla nada. */}
        <Camara
          available={labelReading}
          block={block}
          busy={Boolean(reading)}
          onShoot={openCamera}
          onType={() => setCreating(true)}
          onExpired={() => onBlocked(null)}
        />

        <p className="hint food-screen-foot">
          Sin envase —una manzana, un guiso de casa— se busca o se teclea arriba.
        </p>
      </div>

      {/* El detalle es una **hoja** sobre esta pantalla, no otra pantalla.
          Es corto —una cantidad, un destino— y edita algo concreto, así que la
          regla de forma del rediseño lo manda a una hoja; y dejar el buscador
          detrás es lo que hace que cerrarla te devuelva a la lista en vez de al
          día, que es donde estabas.

          `conocido` cubre los dos caminos que llegan aquí sin pasar por un
          formulario: el que ya era tuyo y el que la ficha pública acaba de
          guardar. Los dos son la misma situación —producto identificado, sólo
          falta la cantidad—, así que se pintan igual. */}
      {(chosen || conocido) && (
        <div className="sheet-scrim" onClick={cerrarDetalle}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Detalle del alimento"
            onClick={(e) => e.stopPropagation()}
          >
            <Amount
              food={chosen ?? conocido}
              initialSlot={slot}
              dayIso={dayIso}
              entries={entries}
              source={chosen ? null : scan?.food ? 'catalogo' : 'codigo'}
              onDone={onDone}
              onDayChanged={onDayChanged}
              onCancel={cerrarDetalle}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// La tarjeta de la cámara, y las tres formas que toma cuando no puede leer.
//
// El principio: un control que no puede funcionar es peor que uno que no está,
// porque al pulsarlo no hay forma de saber por qué no ha pasado nada. De ahí que
// no haya una sola tarjeta apagada para todo, sino tres respuestas distintas a
// tres impedimentos distintos:
//
// - **Nada que impida** — la tarjeta de siempre.
// - **La cuota del minuto** — no vacía la pantalla: sólo apaga el botón y pone
//   la cuenta. Esperar es una salida real, y quitarla la escondería.
// - **La cuota del día, o la clave que falta** — la cámara se va. Ninguna de las
//   dos se arregla hoy, así que dejar el botón apagado sería dejar una promesa
//   que no se puede cumplir en la pantalla todo el día.
function Camara({ available, block, busy, onShoot, onType, onExpired }) {
  const left = useCountdown(block?.kind === 'minute' ? block.until : null, onExpired)

  if (!available || block?.kind === 'day' || block?.kind === 'off') {
    if (!block) return null
    return (
      <div className="card food-camera-card">
        <p className="food-label-warn food-camera-off" role="alert">
          {block.kind === 'day'
            ? 'Se han acabado las fotos de hoy. Tecléalo.'
            : 'La lectura de etiquetas no está configurada en el servidor.'}
        </p>
        {/* Sin botón de reintento: no hay nada que reintentar. La única salida
            que queda es la que siempre estuvo. */}
        <button type="button" className="secondary btn-full" onClick={onType}>
          Dar de alta a mano
        </button>
      </div>
    )
  }

  return (
    <div className="card food-camera-card">
      <div className="food-camera-head">
        <p className="food-camera-title">Foto del envase</p>
        <p className="hint food-camera-sub">Para productos envasados que no tengas todavía.</p>
      </div>
      {block?.kind === 'minute' && (
        <p className="food-label-warn food-camera-wait" role="alert">
          Demasiadas fotos seguidas. Espera un minuto, o tecléalo.
        </p>
      )}
      {/* Un `label` y no un botón porque lo que abre la cámara es el `input`:
          envolverlo es la única forma de que el disparador tenga el aspecto de un
          control y siga siendo el control real. `capture` pide la trasera del
          móvil; en un ordenador el navegador lo ignora y ofrece un fichero, que
          para probar va igual de bien. */}
      <label
        className={`btn-full food-camera-shoot${busy || left ? ' is-busy' : ''}`}
        htmlFor="food-photo"
        aria-busy={busy ? true : undefined}
      >
        {left ? (
          <span className="food-camera-count">Espera {left} s</span>
        ) : (
          <Disparador leyendo={busy}>Abrir la cámara</Disparador>
        )}
        {/* `aria-label` fijo: el texto visible pasa a «Leyendo…» o a la cuenta
            mientras tanto, y sin esto el nombre del control se iría con él. */}
        <input
          id="food-photo"
          type="file"
          accept="image/*"
          capture="environment"
          aria-label="Abrir la cámara"
          disabled={busy || Boolean(left)}
          onChange={onShoot}
        />
      </label>
    </div>
  )
}

// Los segundos que quedan de una espera, o `0` si no hay ninguna.
//
// Cuenta de verdad, un tick por segundo: un botón apagado sin decir hasta cuándo
// no se distingue de uno roto, y a los treinta segundos ya nadie sabe si sigue
// esperando o si la app se ha quedado colgada.
function useCountdown(until, onExpired) {
  const [left, setLeft] = useState(() => remaining(until))
  const done = useRef(onExpired)
  done.current = onExpired

  useEffect(() => {
    if (!until) {
      setLeft(0)
      return undefined
    }
    setLeft(remaining(until))
    const timer = setInterval(() => {
      const value = remaining(until)
      setLeft(value)
      // Al llegar a cero el bloqueo se levanta solo: la ventana corta se pasa
      // esperando, así que hacer volver a alguien a por el botón sería cobrarle
      // el minuto dos veces.
      if (value === 0) done.current?.()
    }, 1000)
    return () => clearInterval(timer)
  }, [until])

  return left
}

const remaining = (until) => (until ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0)

// ¿Este rechazo deja de ofrecer la cámara, y por cuánto?
//
// Los tres que la retiran tienen en común que repetir la foto no los arregla:
// la del minuto se pasa esperando, la del día no se pasa hasta mañana, y la
// clave que falta la pone quien administra el servidor. Decirle «inténtalo otra
// vez» a cualquiera de los tres es mandar a gastar una foto contra un fallo
// seguro — y en el caso de la cuota, además, gastar de lo que ya no hay.
function detiene(read) {
  if (read.refusal === 'off') return { kind: 'off' }
  if (read.refusal !== 'quota') return null
  if (read.quota_scope === 'day') return { kind: 'day' }
  return { kind: 'minute', until: Date.now() + MINUTE }
}

// Lo que dura la ventana corta de la cuota, del lado del modelo.
const MINUTE = 60_000

// Una ficha de la base pública, en lo que `POST /foods` espera.
//
// `??` y no `||`: un nutriente que vale 0 en la ficha es una medición —un agua
// con cero grasa—, y `||` lo convertiría en `null`, que dice lo contrario. Lo
// que sí sale `null` es lo que la ficha no trae, porque no se sabe.
function fromScan(found, code) {
  const n = found.nutrients ?? {}
  return {
    name: found.name,
    brand: found.brand || null,
    barcode: found.barcode ?? code ?? null,
    kcal_100g: n.kcal ?? null,
    protein_100g: n.protein ?? null,
    fat_100g: n.fat ?? null,
    carbs_100g: n.carbs ?? null,
    fiber_100g: n.fiber ?? null,
  }
}

// La foto de un `input[type=file]`, y el input limpio detrás.
//
// Sin limpiarlo, elegir la misma foto dos veces seguidas no dispara `change` y
// el botón parece roto la segunda vez.
function take(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  return file ?? null
}

// El peldaño de en medio de la escalada.
//
// Existe por una razón física: el código de barras y la tabla nutricional están
// en caras distintas del envase, así que la foto que resolvió —o no— el código
// casi nunca trae tabla que leer. Pedir otra no es un trámite: es lo único que
// puede contestar la pregunta, y se pide **después** de que lo gratis haya
// fallado, no en un menú por adelantado.
//
// Dos salidas y las dos válidas. «Teclearlo» no es rendirse: para un guiso de
// casa o una panadería es la vía normal, y aquí además es más rápida que otra
// foto.
function Escalada({ reason, slot, busy, onShoot, onType, onCancel }) {
  // Dos motivos para pedir otra foto, y no piden lo mismo. La escalada quiere
  // una foto **de otra cara del envase**; la lectura ilegible quiere la misma
  // foto mejor hecha. Un botón que dijera «Repetir» en los dos casos mandaría a
  // repetir la foto del código de barras, que ya sabemos que no sirve.
  const ilegible = reason === 'unreadable'
  const shoot = ilegible ? 'Repetir la foto' : 'Enfocar la tabla'
  return (
    <div
      className="food-screen"
      role="dialog"
      aria-modal="true"
      aria-label={`Añadir a ${slotLabel(slot).toLowerCase()}`}
    >
      <header className="food-screen-head">
        <p className="food-screen-title">
          <span className="card-eyebrow">Añadir a</span>
          <span className="food-screen-slot">{slotLabel(slot)}</span>
        </p>
        <button type="button" className="link-btn" onClick={onCancel}>
          Cancelar
        </button>
      </header>
      <div className="food-screen-body">
        <div className="card food-escalada">
          <p className="food-escalada-line" role="alert">
            {
              {
                offline: 'No he podido preguntar por ese código.',
                unusable: 'Los datos de ese código no me sirven.',
                unreadable: 'No he podido leer la etiqueta.',
              }[reason] ?? 'Ese código no está en ninguna base.'
            }
          </p>
          <p className="food-escalada-line">
            {ilegible
              ? 'Prueba otra vez, más cerca y con más luz.'
              : 'Acerca la foto a la tabla nutricional y la leo.'}
          </p>
          <div className="food-escalada-actions">
            <label
              className={`set-action food-escalada-shoot${busy ? ' is-busy' : ''}`}
              htmlFor="food-table"
            >
              <Disparador leyendo={busy}>{shoot}</Disparador>
              <input
                id="food-table"
                type="file"
                accept="image/*"
                capture="environment"
                aria-label={shoot}
                disabled={busy}
                onChange={onShoot}
              />
            </label>
            <button
              type="button"
              className="set-action secondary"
              onClick={onType}
              disabled={busy}
            >
              Teclearlo
            </button>
          </div>
        </div>
        <p className="hint food-screen-foot">
          {ilegible
            ? 'Sin reintento automático: repetir una foto igual cuesta lo mismo y falla igual.'
            : 'El paso caro entra aquí, cuando el gratis ya ha fallado.'}
        </p>
      </div>
    </div>
  )
}

// De dónde sale un alimento, dicho con palabras.
//
// «tu comida» —una receta guardada— todavía no existe: no hay tabla ni endpoint
// que la sostenga, así que no se nombra. Inventar la etiqueta antes que el dato
// sería prometer en pantalla algo que no se puede cumplir.
function origen(food) {
  return food.is_mine ? 'tuyo' : 'base pública'
}

// Los resultados, agrupados por procedencia: primero lo tuyo, luego la base
// pública, y dentro de cada grupo el orden que ya trae el servidor (mejor
// coincidencia primero, `_rank` en `routers/foods.py`).
//
// Se agrupa aquí y no allí porque es una decisión de pantalla, no de búsqueda:
// el servidor sigue puntuando por lo bien que casa lo que escribiste, que es lo
// que decide **qué** treinta filas vuelven. Esto sólo decide en qué orden se
// leen. La consecuencia de esa frontera: un alimento tuyo que case mal puede
// quedarse fuera del corte del servidor y entonces no hay grupo que lo salve.
function byOrigin(foods) {
  return [...foods.filter((f) => f.is_mine), ...foods.filter((f) => !f.is_mine)]
}

// Cuánto, y a qué comida. La porción por defecto llega ya elegida cuando el
// alimento tiene una: registrar "una rebanada" no puede obligarte a pensar en
// gramos.
function Amount({
  food: initialFood,
  initialSlot = null,
  dayIso,
  entries = [],
  source = null,
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
  const portion = food.portions?.find((p) => p.id === portionId) ?? null

  const number = (raw) => {
    const value = Number(String(raw).replace(',', '.'))
    return Number.isFinite(value) ? value : null
  }

  // El paso del stepper: de diez en diez para gramos, de uno en uno para
  // raciones. Media rebanada de pan existe; media unidad de «diez gramos» no
  // significa nada, y diez raciones de golpe tampoco.
  //
  // El suelo es lo que hay, no cero: bajar de cinco gramos a menos cinco no es
  // una cantidad más pequeña, es otra cosa.
  function step(delta) {
    if (portionId) {
      const next = Math.max(1, (number(quantity) ?? 1) + delta)
      setQuantity(String(next))
      return
    }
    const current = number(grams) ?? 0
    const next = current + delta * 10
    if (next <= 0) return
    setGrams(String(next))
  }

  async function submit(event) {
    event.preventDefault()
    const written = number(grams)
    if (!portionId && !(written > 0)) return
    setBusy(true)
    await logFood({
      foodId: food.id,
      // Gramos o porción, nunca las dos: son dos cantidades distintas y
      // adivinar cuál se quiso decir es como un diario se estropea en silencio.
      grams: portionId ? null : written,
      portionId,
      quantity: portionId ? number(quantity) || 1 : 1,
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

  // Lo que se va a registrar, calculado a cada tecla. Con una ración elegida, la
  // cantidad son sus gramos por cuántas; sin ella, los gramos que escribes.
  const amount = number(portionId ? (portion?.grams ?? 0) * (number(quantity) ?? 0) : grams)
  const preview = previewNutrients(food, amount)

  return (
    <form className="sheet-body food-detail" onSubmit={submit}>
      <Asa />
      <header className="food-detail-head">
        <h2 className="food-detail-name">{food.name}</h2>
        <button type="button" className="link-btn" onClick={onCancel} disabled={busy}>
          Cerrar
        </button>
      </header>
      {/* Lo que rinde el alimento, antes de que decidas cuánto: es la cifra con
          la que se compara mentalmente todo lo demás. */}
      <p className="food-detail-per">
        {formatMacro(food.protein_100g)} P · {formatMacro(food.kcal_100g)} kcal / 100 g
      </p>
      <Procedencia source={source} />

      {/* Las raciones primero: registrar «una rebanada» no puede obligarte a
          pensar en gramos, y si el alimento trae una por defecto ya viene puesta. */}
      {food.portions?.length > 0 && (
        <div className="food-portions">
          {food.portions.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`chip${portionId === p.id ? ' is-active' : ''}`}
              aria-pressed={portionId === p.id}
              onClick={() => setPortionId(portionId === p.id ? null : p.id)}
            >
              {p.label} · {formatAmount(p.grams)}
            </button>
          ))}
        </div>
      )}

      <div className="field">
        <label htmlFor="food-qty">{portionId ? 'Cuántas' : 'Cantidad'}</label>
        <div className="stepper">
          <button
            type="button"
            className="stepper-btn"
            aria-label={portionId ? 'Menos raciones' : 'Menos cantidad'}
            onClick={() => step(-1)}
          >
            −
          </button>
          <input
            id="food-qty"
            className="stepper-input"
            inputMode="decimal"
            value={portionId ? quantity : grams}
            onChange={(e) => (portionId ? setQuantity(e.target.value) : setGrams(e.target.value))}
          />
          <button
            type="button"
            className="stepper-btn"
            aria-label={portionId ? 'Más raciones' : 'Más cantidad'}
            onClick={() => step(1)}
          >
            +
          </button>
        </div>
      </div>

      {/* Los macros de **esta** cantidad, no los del alimento. La proteína en
          acento porque es la que la pantalla persigue; las otras tres en tinta,
          que el color de esta app codifica progreso y no categoría. */}
      <div className="card food-detail-macros">
        {DETAIL_ROWS.map((row) => (
          <p className={`food-detail-row${row.key === 'protein' ? ' is-lead' : ''}`} key={row.key}>
            <span className="food-detail-label">{row.label}</span>
            <span className="food-detail-value">
              {formatMacro(preview?.[row.key], { decimals: row.decimals })} g
            </span>
          </p>
        ))}
        <p className="food-detail-row food-detail-total">
          <span className="food-detail-label">Total</span>
          <span className="food-detail-value">{formatMacro(preview?.kcal)} kcal</span>
        </p>
      </div>

      <div className="food-detail-slot">
        <span className="hint">Se añade a</span>
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

      {/* La cantidad dentro del botón: sin ella hay que mirar arriba para saber
          qué se está a punto de hacer, y el pulgar ya está abajo. */}
      <button type="submit" className="primary btn-full" disabled={busy || !preview}>
        Añadir {formatAmount(amount)} · {formatMacro(preview?.protein)} P
      </button>

      {/* Corregir es un acto raro y registrar es el de cada comida, así que no
          compite con el botón: enlace, al pie, y sólo donde funcionaría — el
          catálogo compartido no es tuyo para corregirlo. */}
      {food.is_mine && (
        <button
          type="button"
          className="link-btn food-detail-correct"
          onClick={() => setCorrecting(true)}
          disabled={busy}
        >
          Corregir este alimento
        </button>
      )}
    </form>
  )
}

// Las cuatro filas de macros de la hoja de detalle, en el orden en que se leen.
const DETAIL_ROWS = [
  { key: 'protein', label: 'Proteína', decimals: 1 },
  { key: 'carbs', label: 'Hidratos', decimals: 1 },
  { key: 'fat', label: 'Grasa', decimals: 1 },
  { key: 'fiber', label: 'Fibra', decimals: 1 },
]

// De dónde ha salido este alimento, contado **después** de resolverlo.
//
// El orden importa: un menú por adelantado —«¿escaneo o leo la etiqueta?»— te
// hace elegir una tecnología antes de saber cuál funciona. Contarlo después es
// una explicación, no una pregunta, y es lo que deja que el peldaño barato pase
// desapercibido cuando acierta.
//
// Sólo aparece cuando la cámara ha hecho algo. Si has elegido el alimento en la
// lista no hay nada que contar: ya sabes de dónde salió, lo has tocado tú.
function Procedencia({ source }) {
  if (source === 'catalogo') {
    return (
      <p className="hint food-source">
        Leído del código de barras. Ya lo tenías en tus alimentos.
      </p>
    )
  }
  if (source !== 'codigo') return null
  return (
    <>
      <p className="hint food-source">Leído del código de barras. No ha hecho falta la tabla.</p>
      <p className="hint food-source">Se guarda en tus alimentos, con su código.</p>
    </>
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
// Ya casi nunca se pinta. Los rechazos del código —desconocido, sin red, ficha
// inservible— dejaron de acabar en un formulario cuando la escalada se llevó
// esos tres casos a su propio peldaño, que además ofrece volver a intentarlo
// con una foto de la tabla. Aquí sólo queda el camino que la escalada no
// cubre: la ficha llegó bien y el guardado automático no pudo escribirla, así
// que se abre el formulario con lo que traía.
//
// Lo que sí sigue haciendo falta decir es de qué unidad salen los números y si
// no cuadran entre sí, porque eso viaja con la ficha buena.
function ScanNote({ scan }) {
  return (
    <>
      {scan.per === '100ml' && (
        <p className="food-label-warn" role="alert">
          Los números son por 100 ml, no por 100 g. Los guardo tal cual.
        </p>
      )}
      <MismatchNote mismatch={scan.mismatch} />
    </>
  )
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
// Lo que el modelo dice haber transcrito, a un toque.
//
// Existe porque un veredicto no contesta a «¿qué ha leído?». Con las filas
// delante se ve de un vistazo si leyó bien y el backend descartó las cifras, o
// si leyó mal desde el principio — dos problemas distintos, con dos arreglos
// distintos, que sin esto se ven exactamente igual.
//
// Plegada por defecto: cuando la lectura sale bien es ruido, porque lo que hace
// falta ya está en los campos. Y cuando sale mal, está a un toque.
function Transcripcion({ rows }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="food-transcript">
      <p className="food-transcript-head">
        <span className="card-eyebrow">Lo que transcribí</span>
        <button type="button" className="link-btn" onClick={() => setOpen(!open)}>
          {open ? 'Ocultar' : 'Ver'}
        </button>
      </p>
      {open && (
        <div className="card food-transcript-rows">
          {rows.map((row, index) => (
            <p className={`food-transcript-row${backsAField(row) ? '' : ' is-aside'}`} key={index}>
              {row}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}

// Las palabras con las que el backend reconoce la fila de un nutriente
// (`ROW_WORDS`, en `app/label.py`). Aquí sólo deciden **opacidad**: una fila que
// no respalda ningún campo —«de las cuales saturadas»— se lee más apagada para
// que las que sí sostienen una cifra salten a la vista.
//
// Que esta lista se separe de la del backend no rompe nada: allí decide si una
// cifra se guarda, aquí sólo cuánta tinta lleva un renglón.
const ROW_WORDS = /kcal|energ|calor|protein|grasa|lipid|hidrato|carbohidrat|glucid|fibra/i

function backsAField(row) {
  const folded = String(row).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  // «de las cuales …» es siempre un desglose de la fila de arriba, nunca la
  // fila que respalda un campo.
  if (/de (las |los )?cual/i.test(folded)) return false
  return ROW_WORDS.test(folded)
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
  // Aquí ya no llegan ni `unreadable`, ni `off`, ni `quota`. Los tres dejaron de
  // acabar en un formulario cuando cada rechazo se ganó su propia salida: la
  // foto ilegible ofrece repetirse, y las otras dos retiran la cámara en vez de
  // abrir un formulario que nadie ha pedido. Lo que queda aquí es lo que sí es
  // un alta: la columna equivocada —en blanco— y la lectura que salió bien.

  // Una lectura de la que no sale ninguna cifra no es una lectura buena, por
  // mucho que la llamada haya ido bien. Visto en producción el 2026-09-04: el
  // servidor devolvió 200, la pantalla abrió siete campos vacíos y lo único
  // escrito era un «Leído de …» en gris. Ni datos ni explicación — que es peor
  // que un error, porque un error al menos se entiende.
  const anyRead = Object.values(label.nutrients ?? {}).some((value) => value != null)
  if (!anyRead) {
    return (
      <p className="food-label-warn" role="alert">
        No he sacado ninguna cifra de la foto. Tecléalas.
      </p>
    )
  }

  // De dónde salen las cifras, en su propio bloque y antes que los campos.
  //
  // Una cifra que no dice de dónde viene no se puede confirmar, sólo firmar en
  // blanco. Así que el bloque contesta a las tres preguntas por orden: **cuántas**
  // cifras salieron de las cinco, **de qué columna**, y **qué se hizo con ellas**.
  const kept = Object.values(label.nutrients ?? {}).filter((v) => v != null).length
  const dropped = droppedNote(label.dropped)
  return (
    <div className="card food-origin">
      <p className="food-origin-head">
        <span className="card-eyebrow">Procedencia</span>
        <span className="food-origin-count">{kept} de 5 cifras</span>
      </p>
      {label.column_header && (
        <p className="food-origin-column">Leído de «{label.column_header}»</p>
      )}
      {/* «sin conversión» no es un adorno: es la afirmación de que nadie ha
          multiplicado nada por un factor que no estaba impreso. */}
      <p className="food-origin-how">
        columna única · {label.per === '100ml' ? 'por 100 ml' : 'sin conversión'}
      </p>
      {/* En tinta y no en `--muted`, y no en `--danger`: no es un error, es lo
          que pasó. Un hueco sin explicar se lee como «la etiqueta no lo
          declara», que aquí es justo lo contrario. `role="alert"` porque
          aparecen al llegar a la pantalla y hay que oírlos, no buscarlos. */}
      {label.per === '100ml' && (
        <p className="food-label-warn" role="alert">
          Los números son por 100 ml, no por 100 g. Los guardo tal cual.
        </p>
      )}
      {dropped && (
        <p className="food-label-warn" role="alert">
          {dropped}
        </p>
      )}
      <MismatchNote mismatch={label.mismatch} />
    </div>
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
function NewFood({ name: initialName, label = null, scan = null, barcode = null, onCreated, onCancel }) {
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
      // El código que trajo la foto. Sin guardarlo, fotografiar el mismo yogur
      // mañana vuelve a preguntar por algo que ya tienes — y llega hasta aquí
      // aunque la escalada haya acabado en un formulario en blanco, porque el
      // código se leyó igual.
      barcode,
      kcal_100g: number(values.kcal),
      protein_100g: number(values.protein),
      fat_100g: number(values.fat),
      carbs_100g: number(values.carbs),
      fiber_100g: number(values.fiber),
    })
    onCreated(food)
  }

  // ¿Vino esto de una lectura que sacó cifras, o es un formulario en blanco?
  // No es lo mismo: uno se **revisa** y el otro se rellena, y la pantalla lo
  // dice desde el título.
  const leido = Boolean(label && !label.refusal && anyValue(label.nutrients))
  const campo = (key) => ({
    id: `food-${key}`,
    inputMode: 'decimal',
    value: values[key],
    onChange: (e) => setValues({ ...values, [key]: e.target.value }),
  })

  return (
    <div className="food-screen" role="dialog" aria-modal="true" aria-label="Alta de alimento">
      <header className="food-screen-head">
        <p className="food-screen-title">
          <span className="card-eyebrow">Alta de alimento</span>
          <span className="food-screen-slot">{leido ? 'Revisa la lectura' : 'Nuevo alimento'}</span>
        </p>
        <button type="button" className="link-btn" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </header>

      <form className="food-screen-body food-new" ref={box} onSubmit={submit}>
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

        {/* Los cinco números, en dos filas de dos y uno.
            Cinco `.field` a lo ancho eran cinco renglones de «… por 100 g»
            repetido, que es la misma frase cinco veces para distinguir cinco
            cosas que ya se distinguen por su nombre. La unidad se dice una vez,
            arriba, y los rótulos se quedan con lo que cambia.

            El `aria-label` sí la conserva entera: quien navega a ciegas oye el
            campo suelto, sin el encabezado que lo enmarca. Y contiene el rótulo
            visible, que es lo que WCAG pide de un nombre accesible más largo. */}
        <p className="card-eyebrow food-new-unit">Por 100 g</p>
        <div className="row">
          <div className="field stepper-field">
            <label htmlFor="food-kcal">Kcal</label>
            <input {...campo('kcal')} aria-label="Kcal por 100 g" />
          </div>
          <div className="field stepper-field">
            <label htmlFor="food-protein">Proteína</label>
            <input {...campo('protein')} aria-label="Proteína por 100 g" />
          </div>
        </div>
        <div className="row">
          <div className="field stepper-field">
            <label htmlFor="food-fat">Grasa</label>
            <input {...campo('fat')} aria-label="Grasa por 100 g" />
          </div>
          <div className="field stepper-field">
            <label htmlFor="food-carbs">Hidratos</label>
            <input {...campo('carbs')} aria-label="Hidratos por 100 g" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="food-fiber">Fibra</label>
          {/* Marcador de posición `—`, no `0`. Un cero ahí es una afirmación:
              «medido, y no tiene». La raya dice lo que pasa de verdad. */}
          <input {...campo('fiber')} aria-label="Fibra por 100 g" placeholder="—" />
        </div>

        <p className="hint">Lo que dejes en blanco queda como desconocido, no como cero.</p>

        {label?.rows?.length > 0 && <Transcripcion rows={label.rows} />}

        <button type="submit" className="primary btn-full" disabled={busy}>
          {leido ? 'Dar de alta y continuar' : 'Guardar alimento'}
        </button>
        <p className="hint food-new-foot">
          Nada entra en tu catálogo hasta que lo confirmes aquí.
        </p>
      </form>
    </div>
  )
}

// ¿Sacó la lectura alguna cifra?
const anyValue = (nutrients) => Object.values(nutrients ?? {}).some((v) => v != null)
