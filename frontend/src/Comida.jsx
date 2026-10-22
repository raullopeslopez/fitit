import { cloneElement, useCallback, useEffect, useReducer, useRef, useState } from 'react'

import HoyEntreno from './HoyEntreno.jsx'
import Weight from './Weight.jsx'
import Rueda from './Rueda.jsx'

import {
  correctFood,
  correctFoodEntry,
  boneReference,
  createFood,
  deleteFoodEntry,
  getCaredDays,
  getPlan,
  frequentFoods,
  getFood,
  listDishes,
  getFoodDay,
  logDish,
  logFood,
  readLabel,
  recomputeFoodDay,
  scanBarcode,
  searchFoods,
  usualAmounts,
  weighLeftoverBone,
} from './api.js'
import ObjetivoLinea from './ObjetivoLinea.jsx'
import PesoDeHoy from './PesoDeHoy.jsx'
import { PlanEnComida, lunesDe, planDelDia } from './Plan.jsx'
import SinDecir, { notaSinDecir } from './SinDecir.jsx'
import { fueraDelPlan } from './TiraDia.jsx'
import { Ahora, DiaCerrado, HUECOS_HOY, PuntosCuidados, SinPlan, dicha } from './HoyComida.jsx'
import {
  MACROS,
  MEAL_SLOTS,
  foodDayIso,
  foodMomentIso,
  formatAmount,
  agruparPorPlato,
  formatMacro,
  macroBar,
  momentForDay,
  previewNutrients,
  shiftDay,
  slotLabel,
  withoutEntry,
  droppedNote,
  edibleGrams,
  gramsOfMeasure,
  measureLabel,
  MEASURE_KEYS,
  unknownNote,
} from './food.js'
import { formatDayShort } from './format.js'
import { takePhoto, usesNativeCamera } from './platform/camera.js'
import { canScan, detectBarcodes } from './platform/scanner.js'
import { publishFood } from './widgetSummary.js'
import Voz from './Voz.jsx'
import { isKnownOffline } from './platform/network.js'

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

// `abiertas` arranca con todas las comidas desplegadas (sus entradas a la
// vista); por defecto son filas plegadas.
export default function Comida({ onTrain, onPlan = null, abiertas = false }) {
  // El día que se está mirando. Arranca en el día alimentario en curso, que a
  // las 02:00 sigue siendo el de ayer — misma regla que el servidor usa para
  // fechar lo que escribes.
  const [dayIso, setDayIso] = useState(() => foodDayIso())
  const [day, setDay] = useState(null)
  // `null` = cerrado. Si no, `{ slot }`: la comida por cuyo `+` has entrado.
  const [adding, setAdding] = useState(null)
  // Dictando: `{ slot }`, la comida desde la que se abrió (o `null`: por la hora).
  const [voz, setVoz] = useState(null)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState(null)
  // Lo de siempre: lo que más repites, a un toque. No depende del día que se
  // esté mirando, así que se lee aparte y no se vuelve a pedir al pasar de día.
  const [siempre, setSiempre] = useState([])
  // Tus platos. Se cargan con los frecuentes y por lo mismo: los dos son
  // atajos para no volver a teclear lo que ya has tecleado una vez.
  const [platos, setPlatos] = useState([])
  // El plan de la semana a la que pertenece el día que se está mirando, para
  // poner cada plato planificado dentro de su comida. `null` es «esa semana no
  // se ha generado»: planificarla es de la pestaña Plan, no de aquí.
  const [plan, setPlan] = useState(null)
  // Los días cuidados de los últimos siete (comida simple): los siete puntos.
  const [cuidados, setCuidados] = useState([])
  // Tras confirmar una comida del plan, la pregunta del peso de hoy (si falta).
  const [pedirPeso, setPedirPeso] = useState(false)
  // id → nombre, para que el diario pueda titular un grupo sin pedir nada más.
  // El nombre no está congelado en la entrada a propósito: es una etiqueta de
  // agrupación, no un dato del día, así que renombrar el plato retitula bien.
  const dishNames = Object.fromEntries(platos.map((d) => [d.id, d.name]))
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
  // La última entrada borrada, con un «Deshacer» que vive donde estaba —no
  // un aviso flotante que se va antes de que te des cuenta de lo que hiciste.
  const [deleted, setDeleted] = useState(null)
  const [undoing, setUndoing] = useState(false)
  // Lienzo «Movimiento → borrar y deshacer»: la fila borrada se va a la
  // izquierda y las de debajo suben a su hueco; la que vuelve con Deshacer
  // entra en su sitio y aparta a las demás. `saliendo` y `vuelve` son ids.
  const [saliendo, setSaliendo] = useState(null)
  const [vuelve, setVuelve] = useState(null)
  const antesDeDeshacer = useRef(null)

  const load = useCallback(async (iso) => {
    try {
      const fetched = await getFoodDay(iso)
      setDay(fetched)
      setError(null)
      // La pantalla Comida del widget enseña hoy: mirar un día pasado no la toca.
      if (iso === foodDayIso()) publishFood(fetched)
    } catch {
      setError('No se ha podido cargar el día.')
    }
    // Y el plan igual, por lo mismo: un plan que no llega no puede dejarte sin
    // diario. `getPlan` ya distingue «no hay plan» de «no se ha podido».
    try {
      setPlan(await getPlan(lunesDe(iso)))
    } catch {
      setPlan(null)
    }
    try {
      // La ventana es la de hoy, no la del día que se mira: los puntos son
      // también el camino de vuelta a hoy.
      const hoy = foodDayIso()
      setCuidados((await getCaredDays(shiftDay(hoy, -6), hoy))?.days ?? [])
    } catch {
      setCuidados([])
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
    try {
      setPlatos((await listDishes()) ?? [])
    } catch {
      setPlatos([])
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
    setPedirPeso(false)
  }, [dayIso])

  // Hoy es el último día al que se puede llegar: no se registra por adelantado.
  const isToday = dayIso === foodDayIso()
  // La voz usa la misma clave del modelo que la lectura de etiquetas.
  const voiceOn = Boolean(day?.label_reading)
  const totals = day?.totals ?? {}
  const note = unknownNote(day?.unknown)
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
    setSaliendo(entry.id)
    setDeleted(entry)
    // 200 ms hacia la izquierda y 200 ms cerrando el hueco (styles.css,
    // `mov-fila-sale`); después ya puede irse del día.
    await new Promise((r) => setTimeout(r, 400))
    await Promise.all([load(dayIso), loadSiempre()])
    setSaliendo(null)
  }

  // La que acaba de volver es la única id que no estaba antes de deshacer.
  useEffect(() => {
    if (!antesDeDeshacer.current || !day) return
    const nueva = day.entries.find((e) => !antesDeDeshacer.current.has(e.id))
    antesDeDeshacer.current = null
    if (nueva) setVuelve(nueva.id)
  }, [day])

  // Deshacer es volver a registrar lo mismo, con la hora original — no una
  // papelera: `log_entries` congela, así que no hay nada que «recuperar», sólo
  // algo que volver a escribir igual que se escribió la primera vez.
  async function handleUndo() {
    if (!deleted) return
    setUndoing(true)
    antesDeDeshacer.current = new Set((day?.entries ?? []).map((e) => e.id))
    try {
      await logFood({
        foodId: deleted.food_id,
        grams: deleted.grams,
        mealSlot: deleted.meal_slot,
        // Pesada con hueso, se vuelve a pesar con hueso: si no, la misma
        // bandeja contaría el hueso como carne al recuperarse.
        withBone: deleted.edible_grams != null,
        // El sello vuelve a salir con el reloj de pared del móvil. El servidor
        // devuelve el instante en UTC, y mandárselo tal cual lo fechaba por un
        // reloj que no era el tuyo: entre las 04:00 y las 04:00 más tu offset,
        // deshacer un borrado movía la entrada al día anterior. Misma regla que
        // al escribirla por primera vez (`foodMomentIso`).
        loggedAt: foodMomentIso(new Date(deleted.logged_at)),
      })
      await afterWrite()
    } catch {
      setError('No se ha podido deshacer el borrado.')
    } finally {
      setUndoing(false)
    }
  }

  const planHoy = planDelDia(plan, dayIso)
  // Mientras comes lo previsto, Hoy no enseña cifras (épica de cuatro comidas,
  // fase 3): la tira del día dice cómo va, y los anillos vuelven en cuanto algo
  // se sale del plan, con lo que descuadra dentro de su comida. Sin plan no hay
  // nada que cumplir y todo sigue como estaba.
  const hayPlan = Object.keys(planHoy).length > 0
  const fuera = hayPlan && day ? fueraDelPlan(day.entries, planHoy) : []
  const notaPasado = notaSinDecir(Object.values(planHoy), dayIso, foodDayIso())
  // Comida simple, fase 1: la primera comida del plan sin decir es la que toca,
  // y con las cuatro dichas el día se cierra. Sólo hoy: un día pasado se
  // repasa, no se vive.
  const railDe = (slot) => (day ? rails(day).find((r) => r.key === slot) : null)
  const conPlan = HUECOS_HOY.filter((slot) => planHoy[slot])
  const hechas = conPlan.filter((slot) => dicha(planHoy[slot], railDe(slot)))
  const siguiente = isToday && day ? (conPlan.find((slot) => !hechas.includes(slot)) ?? null) : null
  const cerrado = isToday && day && hayPlan && hechas.length === conPlan.length
  const manana = planDelDia(plan, shiftDay(dayIso, 1))[HUECOS_HOY[0]]?.dish_name ?? null

  return (
    <div className="comida">
      {/* El día como título —«Hoy», «Ayer», o su nombre— y la fecha encima en
          sello. Que estés en hoy se dice con una palabra, no se deduce de una
          flecha apagada. */}
      <header className="food-head">
        <span className="card-eyebrow food-daystamp-date">{formatDayShort(dayIso)}</span>
        <h1 className="food-title">{tituloDia(dayIso)}</h1>
      </header>

      {/* Los siete puntos (comida simple): los días cuidados de la última
          semana y, a la vez, el camino a cada uno de esos días. En su propia
          fila: junto al título no caben siete objetivos de dedo. */}
      <PuntosCuidados hoy={foodDayIso()} dayIso={dayIso} cuidados={cuidados} onPick={setDayIso} />

      {isToday && onTrain && <HoyEntreno onTrain={onTrain} />}

      {error && <p className="alert">{error}</p>}

      {/* Sin objetivo todavía, o sin plan: la línea del objetivo. Con plan, el
          objetivo ya está dentro de lo que el plan pone en cada comida. */}
      {day && isToday && (!hayPlan || day.target_kcal == null) && (
        <ObjetivoLinea targetKcal={day.target_kcal ?? null} onAccepted={() => load(dayIso)} />
      )}

      {day && isToday && !hayPlan && <SinPlan onPlan={onPlan} />}

      {siguiente && (
        <Ahora
          entrada={planHoy[siguiente]}
          hechas={hechas}
          platos={platos}
          onChanged={() => load(dayIso)}
          onComido={() => setPedirPeso(true)}
          onOtraCosa={() => setAdding({ slot: siguiente })}
        />
      )}

      {cerrado && (
        <DiaCerrado cuenta={cuidados.length} manana={manana} />
      )}

      {/* Sin plan, las cifras del día: no hay otra cosa con la que medirlo. Con
          plan, lo que se sale lo dice su comida («Fuera del plan · +150 kcal»). */}
      {day && !hayPlan && <MacroCard day={day} />}

      {/* Un día pasado con comidas del plan sin decir: lo apuntado es un dato,
          pero no es el día entero, y el total no puede pasar por serlo. */}
      {notaPasado && <p className="food-sin-decir">{notaPasado}</p>}

      {/* Una raya en un total se lee como "no comí nada de eso", que es lo
          contrario de lo que dice. Así que se explica en voz alta — y ahora se
          toca: filtra el día a esas entradas, que es lo único que se puede
          corregir. */}
      {note && !hayPlan && (
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
          {/* Un diario continuo, no una pila de tarjetas: las cuatro comidas
              siempre, en el orden en que se comen, cada una con su banda de
              color. Una comida vacía también se dibuja —es por donde se entra a
              registrar en ella— y lleva dentro lo que el plan ponía, si algo. */}
          {hayPlan && isToday && <p className="hoy-tudia">Tu día</p>}
          <div className={`food-diario${hayPlan && isToday ? ' con-plan' : ''}`}>
            {rails(day)
              .filter((rail) => siguiente == null || rail.key !== siguiente)
              .map((rail) => (
              <SlotCard
                key={rail.key ?? 'sin-asignar'}
                abierta0={abiertas}
                rail={rail}
                entries={onlyIncomplete ? rail.entries.filter(isIncomplete) : rail.entries}
                dishNames={dishNames}
                deleted={deleted && (deleted.meal_slot ?? null) === rail.key ? deleted : null}
                undoing={undoing}
                saliendo={saliendo}
                vuelve={vuelve}
                onUndo={handleUndo}
                onAdd={() => setAdding({ slot: rail.key })}
                onEdit={setEditing}
                onDelete={setConfirming}
                cifras={!hayPlan || fuera.some((e) => (e.meal_slot ?? null) === rail.key)}
                fueraKcal={hayPlan ? kcalFuera(fuera, rail.key) : undefined}
                planificado={
                  rail.key && planHoy[rail.key] ? (
                    <PlanEnComida
                      entrada={planHoy[rail.key]}
                      hoy={foodDayIso()}
                      platos={platos}
                      onChanged={() => load(dayIso)}
                      onComido={() => setPedirPeso(true)}
                    />
                  ) : null
                }
                previsto={rail.key && planHoy[rail.key] ? planHoy[rail.key].dish_name : null}
                hecha={Boolean(rail.key && ['done', 'out'].includes(planHoy[rail.key]?.status))}
                planComido={
                  rail.key && planHoy[rail.key] ? (
                    <PlanEnComida
                      compacto
                      circulo
                      entrada={planHoy[rail.key]}
                      hoy={foodDayIso()}
                      platos={platos}
                      onChanged={() => load(dayIso)}
                      onComido={() => setPedirPeso(true)}
                    />
                  ) : null
                }
              />
            ))}
          </div>
          {/* Lo que no es ninguna de las cuatro comidas: un picoteo, un café.
              Era el botón flotante «Añadir comida»; ahora va al pie del día,
              porque lo normal se apunta desde su comida. */}
          <button type="button" className="hoy-algo-mas" onClick={() => setAdding({ slot: null })}>
            <span aria-hidden="true">+</span> Algo más, fuera de las comidas
          </button>
          {/* El día que tienes delante no es el que estás viviendo: una entrada
              del diario se fecha por el instante en que la escribes. */}
          {pedirPeso && isToday && <PesoDeHoy />}
          {!hayPlan && <ClosingLine day={day} onSummary={() => setSummaryOpen(true)} />}
        </>
      )}

      {/* Lo que quedó sin decir ayer y anteayer, para cerrarlo sin tener que ir
          a aquel día. Sólo en hoy, y debajo de hoy (reorganización del 17 oct):
          arriba obligaba a bajar las tarjetas de otros días para llegar al
          desayuno de hoy. Bajar no es un toque más; plegarlo lo habría sido. */}
      {isToday && <SinDecir hoy={dayIso} platos={platos} />}

      {/* El peso, la última fila de Hoy: tocarla es pesarte. */}
      {isToday && onTrain && <Weight fila />}

      {/* Añadir ocupa la pantalla entera, no una hoja.
          Es una tarea con lista larga —el catálogo devuelve hasta treinta
          filas— y con cámara, y las dos cosas piden alto: una hoja anclada al
          pie tiene techo (`max-height: 88dvh`) y crece hacia arriba, así que
          con el teclado subiendo se comía su propia cabecera. La regla de forma
          del rediseño lo dice sin rodeos: pantalla completa para lo que tiene
          muchos resultados o necesita cámara, hoja para lo corto.

          Editar una entrada sí se queda en hoja: es un campo y dos botones. */}
      {/* Comida simple: sin botones flotantes. Se apunta desde la comida que
          toca («Comido» / «Otra cosa»), desde su fila, o al pie del día; el
          micro vive dentro de añadir. */}

      {voz && (
        <Voz
          slot={voz.slot}
          dayIso={dayIso}
          onDone={async () => {
            setVoz(null)
            await afterWrite()
          }}
          onClose={() => setVoz(null)}
        />
      )}

      {adding && (
        <AddFood
          slot={adding.slot}
          dayIso={dayIso}
          isToday={isToday}
          entries={day?.entries ?? []}
          siempre={siempre}
          platos={platos}
          onDishesChanged={loadSiempre}
          labelReading={day?.label_reading ?? false}
          onVoice={
            voiceOn
              ? () => {
                  setVoz({ slot: adding.slot })
                  setAdding(null)
                }
              : null
          }
          block={labelBlock}
          onBlocked={setLabelBlock}
          previsto={isToday && adding.slot ? (planHoy[adding.slot]?.dish_name ?? null) : null}
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

// Las kcal de lo que se sale del plan en una comida: `undefined` si nada se
// sale, `null` si algo no tiene kcal medidas (NULL no es 0), y si no la suma.
function kcalFuera(fuera, slot) {
  const suyas = fuera.filter((e) => (e.meal_slot ?? null) === slot)
  if (!suyas.length) return undefined
  if (suyas.some((e) => e.kcal == null)) return null
  return suyas.reduce((total, e) => total + e.kcal, 0)
}

const DIAS_LARGOS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

// El día de la semana de un ISO, con el lunes en 0. En UTC: un `Date` local de
// un `YYYY-MM-DD` es medianoche UTC, y en Madrid eso cae el día anterior.
function diaSemana(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

// El título del día: «Hoy», «Ayer», o el nombre del día. Es la pregunta más
// simple de la pantalla —¿qué día estoy mirando?— y se contesta con una palabra.
function tituloDia(iso, hoy = foodDayIso()) {
  if (iso === hoy) return 'Hoy'
  if (iso === shiftDay(hoy, -1)) return 'Ayer'
  return DIAS_LARGOS[diaSemana(iso)]
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
// Con objetivo, dos anillos (proteína fuera, kcal dentro) y debajo hidratos y
// grasa en barra fina. La proteína manda con grosor y con el acento; lo demás
// acompaña en tinta. Un solo color en toda la app.
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

  const kcal = macroBar(totals.kcal, day.target_kcal)

  return (
    <div className="card food-macros" data-testid="food-macros">
      <div className="food-macros-top">
        <MacroRings protein={bar} kcal={kcal}>
          {/* Cerrado, el número deja de ser una resta y pasa a ser el marcador:
              «160 / 160». Un «te falta 0» sería la misma cifra diciendo lo
              contrario de lo que ha pasado. */}
          <span className={`food-macros-number${closed ? ' is-closed' : ''}`}>
            {closed
              ? `${formatMacro(totals.protein)} / ${formatMacro(target)}`
              : <Rueda valor={day.remaining_protein}>{formatMacro(day.remaining_protein)}</Rueda>}
          </span>
          <span className={`food-ring-caption${closed ? ' is-closed' : ''}`}>
            {closed ? 'Cerrado' : 'g faltan'}
          </span>
        </MacroRings>

        {/* La leyenda de los dos anillos: cada cifra lleva el punto del color
            de su anillo, que es lo que dice cuál es cuál sin rotularlos. */}
        <div className="food-ring-legend">
          <p className="food-ring-item">
            <span className="food-ring-label">
              <span className="food-ring-dot is-protein" aria-hidden="true" />
              Proteína
            </span>
            <span className="food-ring-value">
              {formatMacro(totals.protein)}
              <span className="food-ring-of"> / {formatMacro(target)} g</span>
            </span>
          </p>
          {day.target_kcal != null && (
            <p className="food-ring-item">
              <span className="food-ring-label">
                <span className="food-ring-dot is-kcal" aria-hidden="true" />
                Kcal
              </span>
              <span className="food-ring-value">
                <Rueda valor={totals.kcal}>{formatMacro(totals.kcal)}</Rueda>
                <span className="food-ring-of"> / {formatMacro(day.target_kcal)}</span>
              </span>
              {/* La resta la hace el servidor (`restante`). Pasarse sale en
                  negativo, y «quedan -200» se lee mal: se dice lo que sobra. */}
              {day.remaining_kcal != null && (
                <span className="food-ring-note">
                  {day.remaining_kcal < 0
                    ? `${formatMacro(-day.remaining_kcal)} de más`
                    : <>quedan <Rueda valor={day.remaining_kcal}>{formatMacro(day.remaining_kcal)}</Rueda></>}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="food-macros-rows is-pair">
        <MacroRow label="Hidratos" eaten={totals.carbs} target={day.target_carbs} />
        <MacroRow label="Grasa" eaten={totals.fat} target={day.target_fat} />
      </div>
    </div>
  )
}

// Los dos anillos: proteína fuera, gruesa y en el acento; kcal dentro, fina y
// en tinta. La jerarquía sigue diciéndose con grosor (12 frente a 7, y 6 las
// barras de debajo), no con un tono por macro.
//
// Un arco de 0 no se dibuja: con el extremo redondo dejaría un punto, que se lee
// «algo comido». Cerrada la proteína, su anillo entero pasa a `--pr`.
const RING = { size: 140, outer: 62, inner: 46 }
function MacroRings({ protein, kcal, children }) {
  const c = RING.size / 2
  const arc = (r, done) => {
    const length = 2 * Math.PI * r
    return `${(length * done) / 100} ${length}`
  }
  return (
    <div className="food-ring">
      <svg
        width={RING.size}
        height={RING.size}
        viewBox={`0 0 ${RING.size} ${RING.size}`}
        aria-hidden="true"
      >
        <circle className="food-ring-track is-protein" cx={c} cy={c} r={RING.outer} />
        {protein && (protein.closed || protein.done > 0) && (
          <circle
            className={`food-ring-arc is-protein${protein.closed ? ' is-closed' : ''}`}
            cx={c}
            cy={c}
            r={RING.outer}
            strokeDasharray={arc(RING.outer, protein.closed ? 100 : protein.done)}
            transform={`rotate(-90 ${c} ${c})`}
          />
        )}
        {kcal && (
          <>
            <circle className="food-ring-track is-kcal" cx={c} cy={c} r={RING.inner} />
            {kcal.done > 0 && (
              <circle
                className="food-ring-arc is-kcal"
                cx={c}
                cy={c}
                r={RING.inner}
                strokeDasharray={arc(RING.inner, kcal.done)}
                transform={`rotate(-90 ${c} ${c})`}
              />
            )}
          </>
        )}
      </svg>
      <p className="food-ring-center">{children}</p>
    </div>
  )
}

// Un macro: su nombre, su cifra y su barra.
//
// La barra sólo se dibuja si hay objetivo — es lo que la hace medir algo. Sin él
// queda la línea de texto, que es toda la información que existe.
//
// La proteína ya no pasa por aquí: con objetivo va en el anillo de fuera.
function MacroRow({ label, eaten, target = null, decimals = 0 }) {
  const bar = macroBar(eaten, target)
  return (
    <div className="food-macro">
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

// Una comida del diario: su banda con el nombre, el subtotal y el `+`; lo que
// el plan ponía, si algo; y lo registrado.
//
// Ya no es una tarjeta: el día se lee de arriba abajo como un diario, y cada
// comida es una sección a todo el ancho. La banda de color sigue siendo de la
// comida (DESIGN.md → Color por comida) y el `+` vive en ella, donde está el
// nombre de lo que vas a añadir — antes era un pie con «+ Añadir a …» que se
// repetía cuatro veces.
function SlotCard({
  rail,
  entries,
  dishNames = {},
  deleted,
  undoing,
  saliendo = null,
  vuelve = null,
  onUndo,
  onAdd,
  onEdit,
  onDelete,
  planificado = null,
  // Marcador: el estado de la comida en su fila —«Comido» si falta decir lo
  // planificado— y el texto de lo previsto, para la línea de debajo del nombre.
  planComido = null,
  previsto = null,
  abierta0 = false,
  // Dicha en el plan (comida o fuera): lleva su «✓» aunque no haya entradas.
  hecha = false,
  cifras = true,
  fueraKcal = undefined,
}) {
  const label = slotLabel(rail.key)
  const vacia = entries.length === 0
  const [abierta, setAbierta] = useState(abierta0)
  // De previsto a hecho (lienzo «Movimiento → Comido»): cuando la fila deja de
  // estar vacía delante de ti, el contorno discontinuo se va y entran el «✓» y
  // lo comido en 200 ms. Al abrir la pantalla con la comida ya dicha, quieto.
  const estabaVacia = useRef(vacia)
  const [recien, setRecien] = useState(false)
  useEffect(() => {
    if (estabaVacia.current && !vacia) {
      setRecien(true)
      const t = setTimeout(() => setRecien(false), 300)
      estabaVacia.current = vacia
      return () => clearTimeout(t)
    }
    estabaVacia.current = vacia
    return undefined
  }, [vacia])
  // Lo comido, por su nombre: un plato una vez, un alimento suelto por el suyo.
  const comido = agruparPorPlato(entries, dishNames)
    .map((g) => g.name ?? g.entries.map((e) => e.food_name).join(' · '))
    .join(' · ')
  const linea = comido || previsto || 'Nada todavía'
  return (
    <section
      className={`food-slot hoy-fila${vacia ? ' is-empty' : ''}${abierta ? ' is-open' : ''}${recien ? ' is-recien' : ''}`}
      data-slot={rail.key ?? undefined}
    >
      <div className="hoy-fila-head">
        {/* Tocar la fila la abre: sus entradas, para corregir o borrar, y las
            demás respuestas al plan (cambié, fuera, salté, no sé). */}
        <button
          type="button"
          className="hoy-fila-toggle"
          aria-expanded={abierta}
          onClick={() => setAbierta((v) => !v)}
        >
          <h3 className="hoy-fila-nombre">{label}</h3>
          {/* Abierta, lo comido y lo previsto ya están debajo: no se repiten. */}
          {!(abierta && (comido || previsto)) && (
            <span className={`hoy-fila-linea${comido ? '' : ' is-muted'}`}>{linea}</span>
          )}
          {fueraKcal !== undefined && (
            <span className="hoy-fila-fuera">
              Fuera del plan · {fueraKcal == null ? '—' : `+${formatMacro(fueraKcal)}`} kcal
            </span>
          )}
        </button>
        {planComido && !hecha ? (
          // Lo que pide elegir (ración de la olla, sitio) abre la fila.
          cloneElement(planComido, { onAbrir: () => setAbierta(true) })
        ) : (
          (!vacia || hecha) && (
            <span className="hoy-check" aria-label="Comido">
              ✓
            </span>
          )
        )}
        {rail.key !== null && (
          <button
            type="button"
            className="hoy-add"
            aria-label={`Añadir a ${label.toLowerCase()}`}
            onClick={onAdd}
          >
            +
          </button>
        )}
      </div>
      {(abierta || deleted) && (
        <div className="hoy-fila-cuerpo">
          {abierta && planificado}
          {abierta &&
            agruparPorPlato(entries, dishNames).map((grupo) => (
              <div key={grupo.entries[0].id} className={grupo.name ? 'food-dish-group' : undefined}>
                {grupo.name && <p className="food-dish-name">{grupo.name}</p>}
                {grupo.entries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    movimiento={entry.id === saliendo ? 'is-sale' : entry.id === vuelve ? 'is-vuelve' : ''}
                    onEdit={() => onEdit(entry.id)}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            ))}
          {abierta && !vacia && cifras && (
            <p className="hoy-fila-cifras">
              {formatMacro(rail.totals.protein)} P · {formatMacro(rail.totals.kcal)} kcal
            </p>
          )}
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
        </div>
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
function EntryRow({ entry, movimiento = '', onEdit, onDelete }) {
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
    <div className={`food-entry-swipe${movimiento ? ` ${movimiento}` : ''}`}>
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
          <span className="food-entry-amount">
            {/* «2 cdas» en tinta, porque es lo que hiciste; «· ~30 g» apagado
                como el resto de cantidades. Mismo texto que `entryAmount`. */}
            {entry.measure ? (
              <>
                <span className="food-entry-measure">{measureLabel(entry.measure, entry.measure_count)}</span>
                {` · ~${formatAmount(entry.grams)}`}
              </>
            ) : (
              entryAmount(entry)
            )}
          </span>
        </span>
        <span className="food-entry-protein">{formatMacro(entry.protein)} P</span>
      </button>
    </div>
  )
}

// El micrófono de dictar: trazo, sin relleno, en la tinta del botón.
function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  )
}

// «Lo que sueles cenar»: el verbo de cada comida.
const VERBO = { desayuno: 'desayunar', comida: 'comer', cena: 'cenar', snack: 'tomar de snack' }

// La cantidad de una entrada. Pesada con hueso, las dos cifras: lo que pesaste
// y lo que se come, que es de donde salen sus números.
export function entryAmount(entry) {
  // Lo comido fuera lleva gramos que puso un modelo y revisaste tú: se dice.
  if (entry.entry_source === 'estimated') return `~${formatAmount(entry.grams)} · estimado`
  // Apuntado en cucharadas: lo que hiciste, y los gramos que la tabla le da,
  // con `~` porque no salieron de una báscula (docs/medidas-caseras.md).
  if (entry.measure) return `${measureLabel(entry.measure, entry.measure_count)} · ~${formatAmount(entry.grams)}`
  if (entry.edible_grams == null) return formatAmount(entry.grams)
  return `${formatAmount(entry.grams)} con hueso · ${formatAmount(entry.edible_grams)} comestibles`
}

// Repesar lo ya registrado. Los gramos son lo único editable aquí: los
// nutrientes se reescalan en el servidor desde lo que se congeló, y no hay
// ninguna pantalla desde la que se puedan escribir a mano. Borrar ya no vive
// aquí — se desliza la fila que abrió este editor.
function EntryEditor({ entry, onDone, onCancel }) {
  const [grams, setGrams] = useState(String(entry.grams))
  const [bone, setBone] = useState('')
  const [busy, setBusy] = useState(false)
  // Sólo una entrada pesada con hueso, y con kcal de la carne, tiene un hueso
  // que pesar: en las demás no cambiaría ninguna cifra.
  const withBone = entry.edible_grams != null

  async function save(event) {
    event.preventDefault()
    const value = Number(grams.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) return
    const boneValue = bone.trim() ? Number(bone.replace(',', '.')) : null
    if (boneValue != null && !(boneValue > 0 && boneValue < value)) return
    setBusy(true)
    // Repesar primero: el hueso se reparte sobre lo que pesaste, así que tiene
    // que ir contra el peso bueno. Y sólo si cambió — no se repesa lo que no
    // se tocó.
    if (value !== entry.grams) await correctFoodEntry(entry.id, { grams: value })
    if (boneValue != null) await weighLeftoverBone(entry.id, boneValue)
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
      {withBone && (
        <div className="field">
          <label htmlFor={`bone-${entry.id}`}>Hueso que ha sobrado</label>
          <input
            id={`bone-${entry.id}`}
            inputMode="decimal"
            placeholder="g"
            value={bone}
            onChange={(e) => setBone(e.target.value)}
          />
          <p className="hint">
            Pésalo al terminar y se ajusta lo que has comido
            {entry.food_id != null ? ' y el hueso de este alimento, si es tuyo' : ''}.
          </p>
        </div>
      )}
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
  // La comida desde la que entraste; se cambia arriba, en «A qué comida».
  slot: slotInicial = null,
  dayIso,
  isToday = true,
  entries = [],
  siempre = [],
  platos = [],
  onDishesChanged = () => {},
  labelReading = false,
  onVoice = null,
  block = null,
  onBlocked = () => {},
  // Comida simple: el plato del plan al que esto sustituye («en vez de …»).
  previsto = null,
  onDone,
  onDayChanged,
  onCancel,
}) {
  const [slot, setSlot] = useState(slotInicial)
  // Lo que sueles comer en esta comida, con la cantidad de esta comida. Sin
  // comida elegida, el repertorio de siempre.
  const [deEsta, setDeEsta] = useState(null)
  useEffect(() => {
    if (!slot || !isToday) {
      setDeEsta(null)
      return undefined
    }
    let vivo = true
    frequentFoods(6, slot)
      .then((items) => vivo && setDeEsta(items ?? []))
      .catch(() => vivo && setDeEsta(null))
    return () => {
      vivo = false
    }
  }, [slot, isToday])
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
      await logFood({
        foodId: item.food_id,
        // Lo que repites en cucharadas vuelve en cucharadas: la entrada nueva
        // dice «2 cdas», igual que las que la hicieron frecuente.
        ...(item.measure
          ? { grams: null, measure: item.measure, quantity: item.measure_count }
          : { grams: item.grams }),
        mealSlot: slot,
        // Como la última vez: con hueso o sin él.
        withBone: Boolean(item.with_bone),
        // El día que la pantalla tiene en la cabecera, no el reloj del móvil.
        loggedAt: momentForDay(dayIso),
      })
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
  //
  // En el APK la escalada es la misma, con la foto de la cámara de Android y el
  // código decodificado en ella con ML Kit. Hubo un escáner en vivo de Google
  // delante (2026-09-25 → 09-28) y se quitó: su pantalla no tiene obturador,
  // así que la tabla quedaba detrás de cerrarla, y en esos días no llegó al
  // servidor ni un código ni una lectura. Una foto sirve para los dos peldaños.
  //
  // `event` es el `change` del `input` en la web. En el APK no hay input: el
  // botón llama sin nada, y la foto la pide `takePhoto`.
  async function openCamera(event) {
    let file = null
    if (event) {
      file = take(event)
      if (!file) return
    }
    setEscalating(null)
    setBarcode(null)
    setResolved(null)

    if (!event) {
      file = await nativePhoto()
      if (!file) return
    }

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
          await resolveCode(codes[0])
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

  // Un código leído en la foto, hasta el final: `GET /foods/barcode/{ean}`, y si
  // la ficha pública sirve, `POST /foods` — la única puerta. Lanza si no hay
  // red, y quien llama intenta la tabla con la misma foto.
  async function resolveCode(code) {
    setBarcode(code)
    const found = await scanBarcode(code)
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
        setResolved(await createFood(fromScan(found, code)))
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
  }

  // La foto de la cámara de Android. `null` si volviste sin hacerla, que no
  // es un error. Si la cámara falla de verdad, el formulario: un botón que no
  // hace nada no se distingue de uno roto.
  async function nativePhoto() {
    try {
      return await takePhoto()
    } catch {
      setReading(null)
      setEscalating(null)
      setUnreadable(false)
      setCreating(true)
      return null
    }
  }

  // La segunda foto: la de la tabla, ya con el código descartado.
  async function shootTable(event) {
    const file = event ? take(event) : await nativePhoto()
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

  // Dar de alta un plato ocupa la pantalla entera, igual que dar de alta un
  // alimento: nombre, raciones, cómo se pesa y una lista de ingredientes no
  // caben en un hueco. Al guardar, el plato se registra en la comida por la
  // que entraste — que es a lo que habías venido.


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
  // Lo que repites, con la cantidad de siempre. Sólo en el día en curso.
  //
  // El motivo original ya no existe: el toque fechaba con el reloj del móvil y
  // en un día pasado escribía en hoy, y eso lo arregla `momentForDay` — un
  // frecuente se fecharía ahora en el día que tienes en la cabecera, igual que
  // cualquier otra escritura. Lo que queda es una decisión de producto: si los
  // frecuentes deben aparecer también al rellenar un día pasado. Se mantiene
  // fuera hasta que se decida, no porque registraría mal.
  const frecuentes = isToday ? (deEsta ?? siempre) : []
  // Tus platos de esta comida: los que dicen que van en ella, o en cualquiera.
  const platosDeEsta = isToday
    ? platos.filter((d) => d.kind !== 'fuera' && (!slot || !d.slots?.length || d.slots.includes(slot)))
    : []

  // Un frecuente con otra cantidad: la hoja de cantidad necesita el alimento
  // entero (porciones, nutrientes), que el frecuente no trae.
  async function cambiarCantidad(item) {
    try {
      setChosen(await getFood(item.food_id))
    } catch {
      // Sin el alimento no hay hoja: el toque se queda en nada, sin romper.
    }
  }

  async function apuntarPlato(dish) {
    setQuick(`plato-${dish.id}`)
    try {
      await logDish(dish.id, { servings: 1, meal_slot: slot })
      await onDone()
    } finally {
      setQuick(null)
    }
  }

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
          <span className="food-screen-slot">{slot ? `${destino} · otra cosa` : 'Algo más'}</span>
          {previsto && slot === slotInicial && (
            <span className="food-screen-envez">en vez de {previsto}</span>
          )}
        </p>
        <button type="button" className="link-btn" onClick={onCancel}>
          Cancelar
        </button>
      </header>

      <div className="food-screen-body">
        {/* A qué comida va, cambiable sin salir (Marcador): la elegida en tinta. */}
        {/* Con la hoja de cantidad abierta se esconde: ella tiene su propio
            selector, y dos a la vez se pisarían. */}
        {!chosen && (
        <div className="add-comidas" role="group" aria-label="A qué comida">
          {MEAL_SLOTS.map((s) => (
            <button
              key={s.key}
              type="button"
              className="add-comida"
              aria-pressed={slot === s.key}
              aria-label={`Destino: ${s.label}`}
              onClick={() => setSlot(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
        )}

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
          {/* Dictar en vez de teclear, ya con esta comida elegida. */}
          {onVoice && (
            <button
              type="button"
              className="voz-boton"
              aria-label="Dictar"
              disabled={isKnownOffline()}
              onClick={onVoice}
            >
              <MicIcon />
            </button>
          )}
          {/* La cámara, dentro del buscador (comida simple): un disparador que
              escala solo del código a la etiqueta. Cuando no puede, el aviso va
              debajo, con la salida que queda. */}
          {labelReading && !block && (
            <Obturador
              id="food-photo"
              className={`food-search-camara${reading ? ' is-busy' : ''}`}
              name="Abrir la cámara"
              busy={Boolean(reading)}
              disabled={Boolean(reading)}
              onShoot={openCamera}
            >
              <CameraIcon />
            </Obturador>
          )}
        </div>
        {reading && (
          <p className="hint food-search-note">
            <Disparador leyendo>Leyendo…</Disparador>
          </p>
        )}

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

        {/* Lo que sueles comer en esta comida, una fila cada uno: el «+» lo
            apunta con tu cantidad, y la cantidad se toca para cambiarla. */}
        {frecuentes.length > 0 && (
          <section className="add-lista">
            <h3 className="add-lista-head" id="add-sueles">
              {slot ? `Lo que sueles ${VERBO[slot] ?? 'comer'}` : 'Lo de siempre'}
            </h3>
            <ul className="add-filas" aria-labelledby="add-sueles">
              {frecuentes.map((item) => (
                <li key={item.food_id} className="add-fila">
                  <span className="add-fila-nombre">{item.name}</span>
                  <button
                    type="button"
                    className="add-fila-cantidad"
                    aria-label={`Cambiar cantidad de ${item.name}`}
                    onClick={() => cambiarCantidad(item)}
                  >
                    {item.measure ? measureLabel(item.measure, item.measure_count) : formatAmount(item.grams)}
                  </button>
                  <button
                    type="button"
                    className="add-fila-mas"
                    aria-label={`Apuntar ${item.name}`}
                    disabled={quick !== null}
                    onClick={() => quickAdd(item)}
                  >
                    +
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {platosDeEsta.length > 0 && (
          <section className="add-lista">
            <h3 className="add-lista-head" id="add-platos">
              {slot ? `Tus platos de ${destino.toLowerCase()}` : 'Tus platos'}
            </h3>
            <ul className="add-filas" aria-labelledby="add-platos">
              {platosDeEsta.map((dish) => (
                <li key={dish.id} className="add-fila">
                  <span className="add-fila-nombre">{dish.name}</span>
                  <span className="add-fila-cantidad is-fija">1 ración</span>
                  <button
                    type="button"
                    className="add-fila-mas"
                    aria-label={`Apuntar ${dish.name}`}
                    disabled={quick !== null}
                    onClick={() => apuntarPlato(dish)}
                  >
                    +
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* La cámara cuando no puede: el aviso y la salida que queda. Lo
            normal —poder— ya está dentro del buscador. */}
        {block && (
          <Camara
            available={labelReading}
            block={block}
            busy={Boolean(reading)}
            onShoot={openCamera}
            onType={() => setCreating(true)}
            onExpired={() => onBlocked(null)}
          />
        )}
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
      <Obturador
        id="food-photo"
        className={`btn-full food-camera-shoot${busy || left ? ' is-busy' : ''}`}
        name="Abrir la cámara"
        busy={busy}
        disabled={busy || Boolean(left)}
        onShoot={onShoot}
      >
        {left ? (
          <span className="food-camera-count">Espera {left} s</span>
        ) : (
          <Disparador leyendo={busy}>Abrir la cámara</Disparador>
        )}
      </Obturador>
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
            <Obturador
              id="food-table"
              className={`set-action food-escalada-shoot${busy ? ' is-busy' : ''}`}
              name={shoot}
              disabled={busy}
              onShoot={onShoot}
            >
              <Disparador leyendo={busy}>{shoot}</Disparador>
            </Obturador>
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
// Una cantidad tuya, dicha como la dirías: «2 × rebanada» si son raciones
// exactas del alimento, sus gramos si no. El diario sólo guarda gramos, así que
// la ración se deduce dividiendo; con decimales sueltos no lo es.
function usualChoice({ grams, times, measure = null, measure_count: count = null }, portions = []) {
  // Una medida casera se dice como se apuntó, aunque pese lo que una ración.
  if (measure) return { grams, times, portion: null, measure, count, label: measureLabel(measure, count) }
  for (const portion of portions ?? []) {
    const count = grams / portion.grams
    const whole = Math.round(count)
    if (whole >= 1 && Math.abs(count - whole) < 0.01) {
      return { grams, times, portion, measure: null, count: whole, label: `${whole} × ${portion.label}` }
    }
  }
  return { grams, times, portion: null, measure: null, count: null, label: formatAmount(grams) }
}

// Con qué cantidad se abre la hoja: la que más repites **en la unidad de tu
// última entrada**. Si la última fue en cucharadas, se abre en cucharadas
// aunque en gramos lo hayas apuntado más veces: volver a hacer lo de la última
// vez es lo probable (docs/medidas-caseras.md, pregunta 8).
function openingChoice(found) {
  const latest = found.find((u) => u.latest)
  if (!latest) return found[0]
  return found.find((u) => (u.measure ?? null) === (latest.measure ?? null)) ?? latest
}

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
  // Una medida casera («cda»), o `null` para gramos. Con ella, `quantity` es
  // cuántas, como con una ración.
  const [measure, setMeasure] = useState(null)
  const [quantity, setQuantity] = useState('1')
  const [grams, setGrams] = useState(preset ? '' : '100')
  // Ya contestado por el raíl del que vienes. Sigue siendo cambiable: la
  // pregunta desaparece, la libertad no.
  const [slot, setSlot] = useState(initialSlot ?? '')
  const [busy, setBusy] = useState(false)
  // Con hueso por defecto cuando el alimento lo lleva: lo que tienes en la mano
  // es la bandeja, y es lo que pesa la báscula.
  const hasBone = food.refuse_pct != null
  const [withBone, setWithBone] = useState(hasBone)
  const portion = food.portions?.find((p) => p.id === portionId) ?? null
  // Tus cantidades de este alimento. Llegan después de abrir la hoja —se piden
  // al abrirla, no en cada resultado de búsqueda—, así que sólo rellenan el
  // campo si todavía no has tocado nada: lo que llega tarde no pisa lo escrito.
  const [usual, setUsual] = useState([])
  const touched = useRef(false)
  const choices = usual.map((u) => usualChoice(u, food.portions))

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const found = (await usualAmounts(food.id)) ?? []
        if (!alive) return
        setUsual(found)
        if (found.length > 0 && !touched.current) apply(usualChoice(openingChoice(found), food.portions))
      } catch {
        // Sin red no hay memoria, y la hoja sigue como siempre.
      }
    })()
    return () => {
      alive = false
    }
    // Una vez por alimento: corregirlo en la hoja no cambia lo que comiste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [food.id])

  function apply(choice) {
    if (choice.measure) {
      setPortionId(null)
      setMeasure(choice.measure)
      setQuantity(String(choice.count))
    } else if (choice.portion) {
      setMeasure(null)
      setPortionId(choice.portion.id)
      setQuantity(String(choice.count))
    } else {
      setMeasure(null)
      setPortionId(null)
      setGrams(String(choice.grams))
    }
  }

  function isCurrent(choice) {
    if (choice.measure) return measure === choice.measure && number(quantity) === choice.count
    if (choice.portion) return portionId === choice.portion.id && number(quantity) === choice.count
    return !portionId && !measure && number(grams) === choice.grams
  }

  // Cambiar a una medida empieza en una: «1 cda». Volver a gramos deja los que
  // hubiera escritos.
  function chooseUnit(value) {
    touched.current = true
    if (value === 'g') {
      setMeasure(null)
      return
    }
    setPortionId(null)
    setMeasure(value)
    setQuantity('1')
  }

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
    touched.current = true
    // Las cucharadas, de media en media, y nunca por debajo de media.
    if (measure) {
      const next = Math.max(0.5, (number(quantity) ?? 1) + delta * 0.5)
      setQuantity(String(next))
      return
    }
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
    const counted = portionId || measure
    if (!counted && !(written > 0)) return
    setBusy(true)
    await logFood({
      foodId: food.id,
      // Gramos, porción o medida, nunca dos: son cantidades distintas y
      // adivinar cuál se quiso decir es como un diario se estropea en silencio.
      grams: counted ? null : written,
      portionId,
      measure,
      quantity: counted ? number(quantity) || 1 : 1,
      mealSlot: slot || null,
      // El día que estás mirando, no el que marca el móvil. Sin esto, lo que
      // apuntabas en un día pasado se guardaba en hoy: las kcal faltaban en la
      // pantalla que tenías delante y sobraban en otra que no.
      loggedAt: momentForDay(dayIso),
      withBone: bone.on,
    })
    await onDone()
  }

  // Decir a qué se refieren las kcal de un alimento tuyo. Se guarda en el
  // alimento —es un dato suyo, no de esta comida— y la hoja sigue donde estaba.
  async function setBasis(basis) {
    setBusy(true)
    try {
      setFood(await correctFood(food.id, { kcal_basis: basis }))
    } finally {
      setBusy(false)
    }
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
  const amount = measure
    ? gramsOfMeasure(measure, number(quantity) ?? 0)
    : number(portionId ? (portion?.grams ?? 0) * (number(quantity) ?? 0) : grams)
  const bone = {
    on: hasBone && withBone,
    edible: hasBone && withBone && food.kcal_basis === 'edible' ? edibleGrams(amount, food.refuse_pct) : null,
    // Sin saber a qué son las kcal no hay cifra honesta: la diferencia entre
    // las dos lecturas es justo el hueso.
    blocked: hasBone && withBone && food.kcal_basis === 'unknown',
  }
  const preview = bone.blocked ? null : previewNutrients(food, bone.edible ?? amount)

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
              onClick={() => {
                touched.current = true
                setMeasure(null)
                setPortionId(portionId === p.id ? null : p.id)
              }}
            >
              {p.label} · {formatAmount(p.grams)}
            </button>
          ))}
        </div>
      )}

      {/* Lo que tú repites, después de las raciones del alimento y antes del
          campo: son una respuesta a «cuánto», no una propiedad del alimento. */}
      {choices.length > 0 && (
        <div className="food-usual">
          <p className="food-usual-label">Tus cantidades</p>
          <div className="food-usual-chips">
            {choices.map((choice) => (
              <button
                type="button"
                key={choice.label}
                className={`chip${isCurrent(choice) ? ' is-active' : ''}`}
                aria-pressed={isCurrent(choice)}
                onClick={() => {
                  touched.current = true
                  apply(choice)
                }}
              >
                {choice.label} <span className="food-usual-times">· {choice.times === 1 ? '1 vez' : `${choice.times} veces`}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="food-qty">{portionId || measure ? 'Cuántas' : 'Cantidad'}</label>
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
            value={portionId || measure ? quantity : grams}
            onChange={(e) => {
              touched.current = true
              if (portionId || measure) setQuantity(e.target.value)
              else setGrams(e.target.value)
            }}
          />
          <button
            type="button"
            className="stepper-btn"
            aria-label={portionId ? 'Más raciones' : 'Más cantidad'}
            onClick={() => step(1)}
          >
            +
          </button>
          {/* La unidad, junto a la cifra a la que da sentido. Con una ración
              del alimento elegida no hay unidad que escoger: ya son raciones. */}
          {!portionId && (
            <select
              className="food-unit"
              aria-label="Unidad"
              value={measure ?? 'g'}
              onChange={(e) => chooseUnit(e.target.value)}
            >
              <option value="g">g</option>
              {MEASURE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          )}
        </div>
        {/* Lo que pesa la medida según la tabla: aproximado, y se dice. */}
        {measure && <p className="hint food-unit-grams">≈ {formatAmount(amount)}</p>}
      </div>

      {/* Debajo de la cantidad, porque habla de ella: cuánto de lo que pesas se
          come. Sólo en alimentos con hueso. */}
      {hasBone && (
        <BoneNote
          food={food}
          amount={amount}
          bone={bone}
          busy={busy}
          onToggle={() => setWithBone(!withBone)}
          onBasis={setBasis}
        />
      )}

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
        Añadir {measure ? measureLabel(measure, number(quantity) ?? 0) : formatAmount(amount)} ·{' '}
        {formatMacro(preview?.protein)} P
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

      {/* Las ideas de recetas vivían aquí, y desde aquí se planificaba. Desde
          el 17 oct salen en Plan → «Cambiar este plato»: planificar es de Plan. */}
    </form>
  )
}

// El hueso de lo que se va a registrar: si se pesa con él, cuánto se come, y
// —cuando hace falta— a qué se refieren las kcal de la etiqueta.
//
// Tres casos, según `kcal_basis`:
//   edible   — «300 g con hueso → 210 g comestibles»: los números salen de ahí.
//   as_sold  — la etiqueta ya cuenta el hueso; se calcula con lo pesado.
//   unknown  — se pregunta, y no se deja añadir hasta tener respuesta.
// Nadie lo supone a partir del número de la etiqueta: lo dice quien dio de alta
// el alimento. La base del catálogo no se discute: CIQUAL es comestible.
function BoneNote({ food, amount, bone, busy, onToggle, onBasis }) {
  const typical = food.refuse_source === 'referencia' ? 'típico' : 'medido'
  const canAnswer = food.is_mine && food.kcal_basis === 'unknown'
  return (
    <div className="food-bone">
      <button
        type="button"
        className={`chip${bone.on ? ' is-active' : ''}`}
        aria-pressed={bone.on}
        onClick={onToggle}
        disabled={busy}
      >
        Pesado con hueso
      </button>
      {bone.on && bone.edible != null && (
        <p className="hint food-bone-note">
          {formatAmount(amount)} con hueso → {formatAmount(bone.edible)} comestibles ·{' '}
          {formatMacro(food.refuse_pct)} % de hueso, {typical}
        </p>
      )}
      {bone.on && food.kcal_basis === 'as_sold' && (
        <p className="hint food-bone-note">
          Las kcal de la etiqueta ya cuentan el hueso: se calcula con lo que pesas.
        </p>
      )}
      {bone.on && canAnswer && (
        <div className="food-bone-basis">
          <p className="hint">{BASIS_QUESTION}</p>
          <div className="food-slots">
            {BASIS_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.key}
                className={`chip${food.kcal_basis === option.key ? ' is-active' : ''}`}
                aria-pressed={food.kcal_basis === option.key}
                onClick={() => onBasis(option.key)}
                disabled={busy}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// La pregunta que decide la cuenta de un alimento con hueso, y sus respuestas.
// Una etiqueta de 190 kcal por 100 g en una bandeja de muslos puede ser de la
// bandeja (1 kg = 1.900 kcal) o de la carne limpia (700 g = 1.330 kcal), y no lo
// dice. Antes se suponía comparando la cifra con una tabla; ahora se pregunta,
// en palabras de quien tiene la bandeja en la mano.
const BASIS_QUESTION = '¿Las kcal de la etiqueta cuentan el hueso?'
const BASIS_OPTIONS = [
  { key: 'edible', label: 'No, son solo de la carne' },
  { key: 'as_sold', label: 'Sí, son de la pieza entera' },
]

const pctNumber = (raw) => {
  const text = String(raw ?? '').trim()
  const value = Number(text.replace(',', '.'))
  return text === '' || !Number.isFinite(value) ? null : value
}
const pctText = (value) => (value == null ? '' : String(value).replace('.', ','))

// ¿Se puede guardar lo que dice el hueso? Con hueso hay que contestar la
// pregunta, y si las kcal son de la carne hace falta el % para descontarlo.
function boneProblem({ on, pct, basis }) {
  if (!on) return null
  if (!basis) return 'Contéstalo para poder guardar.'
  const n = pctNumber(pct)
  if (basis === 'edible' && n == null) return 'Falta el % de hueso para descontarlo.'
  if (n != null && !(n > 0 && n < 100)) return 'El % de hueso va entre 0 y 100.'
  return null
}

// «Lleva hueso», en el alta y en la corrección: los mismos controles en los dos
// sitios, porque es el mismo dato. Controlado por quien lo usa. `strict` dice
// si lo que falta bloquea el guardado; sólo entonces se avisa.
function BoneFields({ id, value, onChange, disabled, strict = true }) {
  const problem = strict ? boneProblem(value) : null
  return (
    <div className="food-bone food-bone-fields">
      <button
        type="button"
        className={`chip${value.on ? ' is-active' : ''}`}
        aria-pressed={value.on}
        onClick={() => onChange({ on: !value.on })}
        disabled={disabled}
      >
        Lleva hueso
      </button>
      {value.on && (
        <div className="food-bone-basis">
          <p className="hint">{BASIS_QUESTION}</p>
          <div className="food-slots">
            {BASIS_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.key}
                className={`chip${value.basis === option.key ? ' is-active' : ''}`}
                aria-pressed={value.basis === option.key}
                onClick={() => onChange({ basis: option.key })}
                disabled={disabled}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* El % sólo cuando se usa: con las kcal de la pieza entera se calcula
          con lo que pesas y el hueso no entra en la cuenta. */}
      {value.on && value.basis === 'edible' && (
        <div className="field food-bone-pct">
          <label htmlFor={`${id}-refuse`}>% de hueso</label>
          <input
            id={`${id}-refuse`}
            inputMode="decimal"
            placeholder="—"
            value={value.pct}
            onChange={(e) => onChange({ pct: e.target.value })}
            disabled={disabled}
          />
        </div>
      )}
      {problem && <p className="hint food-bone-note">{problem}</p>}
    </div>
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

// El control que hace la foto, en cada sitio con lo que allí la hace.
//
// En la web, un `label` y no un botón, porque lo que abre la cámara es el
// `input`: envolverlo es la única forma de que el disparador tenga el aspecto de
// un control y siga siendo el control real. `capture` pide la trasera del
// móvil; en un ordenador el navegador lo ignora y ofrece un fichero, que para
// probar va igual de bien.
//
// En el APK no hay `input` que envolver: la cámara la abre el plugin
// (`platform/camera.js`, `platform/scanner.js`), así que es un botón y llama
// a `onShoot` sin evento.
//
// `name` fijo en los dos: el texto visible pasa a «Leyendo…» o a la cuenta
// mientras tanto, y sin esto el nombre del control se iría con él.
function Obturador({ id, className, name, busy, disabled, onShoot, children }) {
  if (usesNativeCamera()) {
    return (
      <button
        type="button"
        className={className}
        aria-label={name}
        aria-busy={busy ? true : undefined}
        disabled={disabled}
        onClick={() => onShoot()}
      >
        {children}
      </button>
    )
  }
  return (
    <label className={className} htmlFor={id} aria-busy={busy ? true : undefined}>
      {children}
      <input
        id={id}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label={name}
        disabled={disabled}
        onChange={onShoot}
      />
    </label>
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
  // El hueso tal como está, para mandar sólo lo que cambie. Un alimento cuya
  // pregunta nadie contestó sale con «Lleva hueso» y sin respuesta elegida.
  const boneAtStart = {
    on: food.refuse_pct != null,
    pct: pctText(food.refuse_pct),
    basis: ['edible', 'as_sold'].includes(food.kcal_basis) ? food.kcal_basis : null,
  }
  const [bone, setBone] = useState(boneAtStart)
  const boneTouched =
    bone.on !== boneAtStart.on ||
    bone.basis !== boneAtStart.basis ||
    pctNumber(bone.pct) !== pctNumber(boneAtStart.pct)
  // Sólo bloquea si lo has tocado: corregir la proteína de unos muslos no puede
  // exigir contestar lo del hueso. Lo sin contestar se pregunta al registrar.
  const boneBlocked = boneTouched && boneProblem(bone) != null
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
    if (!name.trim() || boneBlocked) return
    setBusy(true)
    const boneFields = {}
    if (boneTouched) {
      if (!bone.on) {
        boneFields.refuse_pct = 0
      } else {
        boneFields.kcal_basis = bone.basis
        // Vaciar el % lo devuelve a la tabla (`null`); un % distinto es tuyo.
        if (pctNumber(bone.pct) !== pctNumber(boneAtStart.pct) || !boneAtStart.on) {
          boneFields.refuse_pct = pctNumber(bone.pct)
        }
      }
    }
    const saved = await correctFood(food.id, {
      ...boneFields,
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

      <BoneFields
        id="edit"
        value={bone}
        strict={boneTouched}
        onChange={(patch) => setBone({ ...bone, ...patch })}
        disabled={busy}
      />

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
        <button type="submit" className="primary" disabled={busy || boneBlocked}>
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
  // El hueso típico del nombre, según la tabla del servidor. Mientras no
  // toques «Lleva hueso» ni el %, lo siguen: `on`/`pct` a `null` es «lo que diga
  // la tabla». La respuesta a la pregunta nunca viene puesta.
  const [boneRef, setBoneRef] = useState(null)
  const [boneChoice, setBoneChoice] = useState({ on: null, pct: null, basis: null })
  const bone = {
    on: boneChoice.on ?? boneRef != null,
    pct: boneChoice.pct ?? pctText(boneRef),
    basis: boneChoice.basis,
  }
  const firstLookup = useRef(true)

  // Se pregunta por el nombre al abrir y, con una pausa, cada vez que cambia.
  // Sin red no hay propuesta y el alta sigue igual que antes.
  useEffect(() => {
    const text = name.trim()
    let alive = true
    const timer = setTimeout(
      async () => {
        if (!text) return
        try {
          const found = await boneReference(text)
          if (alive) setBoneRef(found?.refuse_pct ?? null)
        } catch {
          if (alive) setBoneRef(null)
        }
      },
      firstLookup.current ? 0 : 300,
    )
    firstLookup.current = false
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [name])

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

  const boneBlocked = boneProblem(bone) != null

  async function submit(event) {
    event.preventDefault()
    if (!name.trim() || boneBlocked) return
    setBusy(true)
    // Sin hueso, a un nombre que la tabla daría por con hueso se le dice 0 %:
    // «no lleva», que es distinto de no haberlo dicho. Con hueso, el % de la
    // tabla sin tocar no se guarda como tuyo (`null` sigue a la tabla).
    const pct = pctNumber(bone.pct)
    const boneFields = bone.on
      ? {
          kcal_basis: bone.basis,
          refuse_pct: bone.basis === 'edible' && pct !== boneRef ? pct : null,
        }
      : { kcal_basis: null, refuse_pct: boneRef != null ? 0 : null }
    const food = await createFood({
      ...boneFields,
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

        <BoneFields
          id="food"
          value={bone}
          onChange={(patch) => setBoneChoice({ ...boneChoice, ...bone, ...patch })}
          disabled={busy}
        />

        <p className="hint">Lo que dejes en blanco queda como desconocido, no como cero.</p>

        {label?.rows?.length > 0 && <Transcripcion rows={label.rows} />}

        <button type="submit" className="primary btn-full" disabled={busy || boneBlocked}>
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
