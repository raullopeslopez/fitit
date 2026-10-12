import { useEffect, useState } from 'react'

import {
  correctDish,
  generatePlan,
  getAdherence,
  replanEntry,
  setPlanEntry,
} from './api.js'
import { ListRow, Sheet } from './ui'
import { foodDayIso, formatAmount, formatMacro, momentForDay } from './food.js'
import Fuera from './Fuera.jsx'

// Los cuatro huecos, en el orden en que se comen. El mismo orden del backend;
// aquí está para que la lista no dependa de cómo vinieran las filas.
const HUECOS = ['desayuno', 'comida', 'cena', 'snack']

const NOMBRE = {
  desayuno: 'Desayuno',
  comida: 'Comida',
  cena: 'Cena',
  snack: 'Snack',
}

// En plural, para «No en desayunos»: lo que se quita es la comida entera, no
// la de ese día.
const EN_PLURAL = {
  desayuno: 'desayunos',
  comida: 'comidas',
  cena: 'cenas',
  snack: 'snacks',
}

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

// Con su artículo: la frase de lo que queda es prosa, no una lista de códigos.
const CON_ARTICULO = {
  desayuno: 'el desayuno',
  comida: 'la comida',
  cena: 'la cena',
  snack: 'el snack',
}

// Los platos tuyos que caben en ese hueco, menos el que ya estaba planificado.
// Del repertorio y no del catálogo: un sustituto calculado desde CIQUAL suena
// brillante y falla en la cocina, donde no hay tofu.
export function candidatos(platos, slot, salvo) {
  return (platos ?? []).filter(
    (p) => p.id !== salvo && (!p.slots || p.slots.length === 0 || p.slots.includes(slot)),
  )
}

// Lunes de la semana a la que pertenece un día. El plan se guarda por semana y
// la pantalla se mueve por días, así que alguien tiene que hacer esta cuenta.
// En ISO y sin `Date` local: construir un `Date` de un `YYYY-MM-DD` lo lee como
// medianoche UTC y en Madrid eso es el día anterior.
export function lunesDe(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const fecha = new Date(Date.UTC(y, m - 1, d))
  // `getUTCDay()` da 0 para el domingo; la semana empieza en lunes.
  const desde = (fecha.getUTCDay() + 6) % 7
  fecha.setUTCDate(fecha.getUTCDate() - desde)
  return fecha.toISOString().slice(0, 10)
}

// El lunes de la semana que viene: la que se planifica para comprar con ella.
export function lunesSiguiente(iso) {
  const [y, m, d] = lunesDe(iso).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10)
}

function diasDe(weekStart) {
  const [y, m, d] = weekStart.split('-').map(Number)
  return Array.from({ length: 7 }, (_, i) => {
    const fecha = new Date(Date.UTC(y, m - 1, d + i))
    return fecha.toISOString().slice(0, 10)
  })
}

function delDia(plan, iso) {
  // `Array.isArray` y no `?? []`: si lo que llega es una lista, `plan.entries`
  // es el iterador de `Array.prototype` —una función— y el `??` lo da por
  // bueno. Un cuerpo con otra forma de la esperada tiene que leerse como «no
  // hay plan», no reventar la pantalla del diario entera.
  const todas = Array.isArray(plan?.entries) ? plan.entries : []
  const filas = todas.filter((e) => e.log_date === iso)
  return HUECOS.map((slot) => filas.find((e) => e.slot === slot)).filter(Boolean)
}

// Lo planificado de un día, por comida: `{ desayuno: fila, comida: fila, … }`.
// Es lo que el diario necesita para poner cada plato dentro de su comida.
export function planDelDia(plan, iso) {
  return Object.fromEntries(delDia(plan, iso).map((fila) => [fila.slot, fila]))
}

// Por qué no se ha podido generar. Cada forma de no haber podido se nombra por
// separado: una despensa vacía manda a dar de alta platos, y un hueco sin
// candidatos manda a mirar ese hueco. «No se ha podido» no dice qué hacer.
export function motivo(err) {
  const detalle = err?.detail
  if (detalle?.slot) {
    return `No hay platos que puedan ir en la ${NOMBRE[detalle.slot]?.toLowerCase() ?? detalle.slot}.`
  }
  if (detalle?.motivo) {
    return 'Necesitas platos en tu repertorio antes de que haya semana que generar.'
  }
  return 'No se ha podido generar la semana.'
}

// El nombre del catálogo hasta la primera coma: «Pollo, pechuga, sin piel,
// cruda» es «Pollo». En una línea de ingredientes lo que hace falta es saber qué
// coger; el resto del nombre está en el alimento.
function nombreCorto(nombre) {
  return nombre.split(',')[0].trim()
}

// Una ración de la receta, que es lo que el plan pone al cambiar a ese plato.
function racion(plato) {
  const raciones = plato.servings || 1
  return (plato.ingredients ?? []).map((i) => ({ food_name: i.food_name, grams: i.grams / raciones }))
}

// Qué cocinar: cada ingrediente con sus gramos. Las kcal dicen cuánto suma el
// plato, no cuánto echar de cada cosa. El nombre va en `--muted` y la cifra en
// la tinta de una cifra (DESIGN.md), para que se lea primero lo que se pesa.
function Ingredientes({ items }) {
  if (!items?.length) return null
  return (
    <span className="plan-items" role="group" aria-label="Ingredientes">
      {items.map((item, i) => (
        <span key={i} className="plan-item">
          {i > 0 && ' · '}
          {nombreCorto(item.food_name)} <span className="plan-item-g">{formatAmount(item.grams)}</span>
        </span>
      ))}
    </span>
  )
}

// Las kcal no llevan rótulo: «−230 kcal» ya dice qué es.
const NUTRIENTE = { protein: 'Proteína', fat: 'Grasa', carbs: 'Hidratos' }

// Lo que el día se sale de su objetivo, con signo: «+83 g», «−71 g», «+120 kcal».
// El menos es el signo tipográfico (U+2212), no un guion.
function desvioTexto({ nutrient, diff }) {
  const signo = diff > 0 ? '+' : '−'
  const cifra = formatMacro(Math.abs(diff))
  return nutrient === 'kcal' ? `${signo}${cifra} kcal` : `${signo}${cifra} g`
}

// Lo que las cantidades no han podido arreglar en ese día: con estos platos,
// el objetivo no cabe. Se dice con la cifra, no con un color.
function Desvios({ desvios, dia }) {
  if (!desvios?.length) return null
  return (
    <p className="plan-desvios" aria-label={`Fuera del objetivo el ${dia.toLowerCase()}`}>
      Fuera del objetivo:{' '}
      {desvios.map((d, i) => (
        <span key={d.nutrient}>
          {i > 0 && ' · '}
          {NUTRIENTE[d.nutrient] && `${NUTRIENTE[d.nutrient]} `}
          <span className="plan-desvio-cifra">{desvioTexto(d)}</span>
        </span>
      ))}
    </p>
  )
}

// Una fila de la semana: la comida, el plato y lo que suma, y cómo quedó. En la
// semana no se confirma —eso se hace en el diario, con la comida delante—; un
// plato que todavía no ha llegado se toca para cambiarlo.
function Fila({ entrada, onAbrir = null }) {
  const hecho = entrada.status === 'done'
  const saltado = entrada.status === 'skipped' || entrada.status === 'swapped'
  return (
    <li className={`plan-fila${hecho ? ' is-done' : ''}${saltado ? ' is-skipped' : ''}`}>
      <span className="card-eyebrow plan-slot">{NOMBRE[entrada.slot] ?? entrada.slot}</span>
      {/* La fila entera es el botón —nombre, kcal y `›` al final—: la fila no
          tiene otro control que le dispute el toque. */}
      {onAbrir ? (
        <button
          type="button"
          className="plan-plato-btn"
          aria-label={`Cambiar ${entrada.dish_name}`}
          onClick={() => onAbrir(entrada)}
        >
          <span className="plan-plato">
            {entrada.dish_name}
            <Ingredientes items={entrada.items} />
          </span>
          {entrada.kcal != null && <span className="plan-kcal">{formatMacro(entrada.kcal)} kcal</span>}
          <span className="plan-plato-chev" aria-hidden="true">›</span>
        </button>
      ) : (
        <>
          <span className="plan-plato">
            {entrada.dish_name}
            <Ingredientes items={entrada.items} />
          </span>
          {entrada.kcal != null && <span className="plan-kcal">{formatMacro(entrada.kcal)} kcal</span>}
        </>
      )}
      {/* El estado se dice distinto de la acción: «Me lo salté» es lo que
          pulsas, «Saltado» es lo que quedó. */}
      {hecho && <span className="plan-estado">Comido</span>}
      {saltado && (
        <span className="plan-estado">{entrada.status === 'swapped' ? 'Cambiado' : 'Saltado'}</span>
      )}
    </li>
  )
}

/**
 * Lo planificado para una comida, dentro de esa comida del diario.
 *
 * Antes era una tarjeta aparte —«Tu plan»— entre los macros y las comidas, y
 * partía el día en dos: lo que toca arriba, lo que has comido abajo, y el mismo
 * desayuno contado en los dos sitios. Aquí el plato planificado está donde se
 * registra, y confirmarlo lo convierte en una entrada más de esa comida.
 *
 * Lo ya comido no se pinta: está en el diario con sus cifras, y repetirlo
 * encima contaría dos veces lo mismo. Lo saltado o cambiado sí, en voz baja,
 * porque es lo único que dice que el plan ponía otra cosa.
 */
export function PlanEnComida({
  entrada,
  // El día alimentario de hoy: lo de antes se cierra con el sello de aquel día,
  // lo de después todavía no se confirma.
  hoy = foodDayIso(),
  // Lo que dice el rótulo de arriba: «Planificado» dentro de su comida, «Ayer ·
  // Cena» en la franja de lo que quedó sin decir.
  etiqueta = 'Planificado',
  onChanged,
  // Comer —lo planificado o un cambio— es cuando tienes el móvil en la mano:
  // el diario aprovecha para preguntar el peso de hoy si falta.
  onComido = () => {},
  platos = [],
  setEntry = setPlanEntry,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [cambiando, setCambiando] = useState(false)
  const [fuera, setFuera] = useState(false)

  // Lo comido —hecho o fuera— ya está en el diario con sus cifras.
  if (entrada.status === 'done' || entrada.status === 'out') return null

  const saltado = ['skipped', 'swapped', 'unknown'].includes(entrada.status)
  const futuro = entrada.log_date > hoy

  async function marcar(status, dishId = null) {
    setBusy(true)
    setError(null)
    try {
      // Registro sin huecos, fase 1: una comida pasada se apunta en su día. Hoy,
      // `momentForDay` es «ahora»; antes, el mediodía de aquel día.
      await setEntry(entrada.id, status, dishId, momentForDay(entrada.log_date))
      setCambiando(false)
      if (status !== 'skipped' && status !== 'unknown') onComido()
      await onChanged()
    } catch (err) {
      setError(err?.detail?.motivo ?? 'No se ha podido guardar.')
    } finally {
      setBusy(false)
    }
  }

  const otros = candidatos(platos, entrada.slot, entrada.dish_id)

  return (
    <div className={`plan-en-comida${saltado ? ' is-skipped' : ''}`}>
      <span className="card-eyebrow">{etiqueta}</span>
      <p className="plan-en-comida-top">
        <span className="plan-en-comida-nombre">{entrada.dish_name}</span>
        {saltado ? (
          <span className="plan-estado">
            {{ swapped: 'Cambiado', unknown: 'No sé' }[entrada.status] ?? 'Saltado'}
          </span>
        ) : (
          entrada.kcal != null && <span className="plan-kcal">{formatMacro(entrada.kcal)} kcal</span>
        )}
      </p>
      {!saltado && <Ingredientes items={entrada.items} />}

      {/* Ni comido ni saltado es **no dicho**, no incumplido: sigue ofreciendo
          las tres cosas hasta que alguien diga una. También en un día pasado:
          una cena olvidada se cierra después, en su día. Lo que no ha llegado,
          no. */}
      {!saltado && !futuro && !cambiando && (
        <div className="plan-en-comida-acciones">
          <button type="button" className="primary plan-comer" disabled={busy} onClick={() => marcar('done')}>
            Lo comí
          </button>
          {/* Cambiar es de primera clase, no borrar y volver a añadir: cambiar
              no es incumplir. */}
          <button type="button" className="link-btn plan-saltar" disabled={busy} onClick={() => setCambiando(true)}>
            Lo cambié
          </button>
          {/* Fase 2: comí fuera, con lo que comiste revisado; y «no sé», que
              dice la comida sin inventar el dato. */}
          <button type="button" className="link-btn plan-saltar" disabled={busy} onClick={() => setFuera(true)}>
            Fuera
          </button>
          <button type="button" className="link-btn plan-saltar" disabled={busy} onClick={() => marcar('skipped')}>
            Me lo salté
          </button>
          <button type="button" className="link-btn plan-saltar" disabled={busy} onClick={() => marcar('unknown')}>
            No sé
          </button>
        </div>
      )}

      {fuera && (
        <Fuera
          guardar={(items, sitio) =>
            setEntry(entrada.id, 'out', null, momentForDay(entrada.log_date), items, sitio)
          }
          guardarSitio={(dishId) => setEntry(entrada.id, 'out', dishId, momentForDay(entrada.log_date))}
          onGuardado={async () => {
            setFuera(false)
            onComido()
            await onChanged()
          }}
          onClose={() => setFuera(false)}
        />
      )}

      {cambiando && (
        <div className="plan-cambiar">
          <span className="card-eyebrow">¿Por cuál?</span>
          {otros.length === 0 ? (
            <span className="hint">No tienes otro plato para esta comida.</span>
          ) : (
            otros.map((plato) => (
              <button
                key={plato.id}
                type="button"
                className="chip plan-sustituto"
                disabled={busy}
                onClick={() => marcar('swapped', plato.id)}
              >
                {plato.name}
                {plato.per_serving?.kcal != null && (
                  <span className="plan-sustituto-kcal">{formatMacro(plato.per_serving.kcal)} kcal</span>
                )}
              </button>
            ))
          )}
          <button type="button" className="link-btn plan-cancelar" onClick={() => setCambiando(false)}>
            Cancelar
          </button>
        </div>
      )}

      {!saltado && futuro && <p className="hint">Todavía no ha llegado.</p>}
      {error && <p className="alert">{error}</p>}
    </div>
  )
}

export function Adherencia({ informe }) {
  if (!informe) return null
  const cerrada = informe.days > 0 && informe.eaten_kcal != null && informe.planned_kcal != null
  const sobra = cerrada ? informe.eaten_kcal - informe.planned_kcal : 0
  return (
    <section className="card plan-adherencia">
      <p className="card-eyebrow">Cómo fue</p>
      {/* La nutricional es la que se enseña, y sólo cuando hay días cerrados:
          a media mañana diría 15 % y sería la hora, no la semana. */}
      {cerrada ? (
        <>
          <p className="plan-adh-linea">
            Comiste {formatMacro(informe.eaten_kcal)} de {formatMacro(informe.planned_kcal)} kcal
            planificadas.
          </p>
          {/* Lo que va bien se dice en voz baja; lo que se sale de la banda
              se dice con la tinta de la línea de arriba, porque es la
              respuesta a «¿diste los números?» y no una nota al pie. */}
          {informe.within_tolerance ? (
            <p className="hint">Dentro de lo previsto.</p>
          ) : (
            <p className="plan-adh-linea">
              {sobra > 0
                ? `Te pasaste ${formatMacro(sobra)} kcal.`
                : `Te faltaron ${formatMacro(-sobra)} kcal.`}
            </p>
          )}
        </>
      ) : (
        <p className="hint">Todavía no hay días cerrados esta semana.</p>
      )}

      {/* La literal es para diagnosticar, no para puntuarte. */}
      {informe.decided > 0 && (
        <p className="plan-adh-linea">
          Seguiste {informe.followed} de {informe.decided} comidas.
        </p>
      )}
      {/* Lo callado se cuenta aparte: un plan que no confirmaste no es un plan
          incumplido, y meterlo en la cifra de arriba sería contarlo como tal. */}
      {informe.silent > 0 && (
        <p className="hint">
          {informe.silent === 1
            ? 'Otra pasó sin que dijeras nada.'
            : `Otras ${informe.silent} pasaron sin que dijeras nada.`}
        </p>
      )}
      {informe.weakest_slot && (
        <p className="hint">
          Donde se cae el plan es {CON_ARTICULO[informe.weakest_slot] ?? informe.weakest_slot}:{' '}
          {informe.weakest_missed} días.
        </p>
      )}
      {informe.pending > 0 && (
        <p className="hint">
          {informe.pending === 1
            ? 'Queda una comida por delante.'
            : `Quedan ${informe.pending} comidas por delante.`}
        </p>
      )}
    </section>
  )
}

export function Semana({
  plan,
  weekStart,
  onClose,
  onChanged,
  titulo = 'Tu semana',
  antetitulo = 'Lo que toca',
  // Si llega, la semana ofrece su lista de la compra encima de los días.
  onLista = null,
  generar = generatePlan,
  hoy = foodDayIso(),
  leerAdherencia = getAdherence,
  // Tus platos. Sin ellos la semana sólo se mira: no hay con qué cambiar un
  // plato ni forma de saber cuáles valen para cualquier comida.
  platos = null,
  // Abre Tus platos, para decir a qué comida va cada uno.
  onPlatos = null,
  onPlatosChanged = () => {},
  replanear = replanEntry,
  corregirPlato = correctDish,
  embebida = false,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [informe, setInforme] = useState(null)
  // La fila del plan que se está cambiando, o `null`.
  const [cambiando, setCambiando] = useState(null)
  const dias = diasDe(weekStart)
  // Un hueco que ya pasó o del que ya dijiste algo no se replanifica: el
  // servidor lo rechazaría, y ofrecerlo sería prometer lo que no se puede.
  const cambiable = (entrada) => Array.isArray(platos) && !entrada.status && entrada.log_date >= hoy

  useEffect(() => {
    let vivo = true
    // Aparte del plan y sin tumbarlo: cómo fue la semana es información sobre
    // la semana, no la semana.
    leerAdherencia(weekStart)
      .then((datos) => vivo && setInforme(datos))
      .catch(() => vivo && setInforme(null))
    return () => {
      vivo = false
    }
  }, [weekStart, leerAdherencia, plan])

  async function otra() {
    setBusy(true)
    setError(null)
    try {
      // Otra semilla, o el generador es determinista y saldría exactamente la
      // misma semana: es la propiedad que hace útil la semilla, mirada del
      // otro lado.
      await generar(weekStart, Math.floor(Math.random() * 100000) + 1)
      await onChanged()
    } catch (err) {
      setError(motivo(err))
    } finally {
      setBusy(false)
    }
  }

  const cuerpo = (
    <>
        {onPlatos && <SinComida platos={platos} onPlatos={onPlatos} />}
        {onLista && <ListRow label="Lista de la compra" value="" onClick={onLista} />}
        <Adherencia informe={informe} />

        {dias.map((iso, i) => {
          const filas = delDia(plan, iso)
          return (
            <section key={iso} className={`plan-dia${iso === hoy ? ' is-today' : ''}`}>
              <h3 className="plan-dia-nombre">
                {DIAS[i]}
                {iso === hoy && <span className="plan-dia-hoy">Hoy</span>}
              </h3>
              <Desvios desvios={(plan.desvios ?? []).filter((d) => d.log_date === iso)} dia={DIAS[i]} />
              {filas.length === 0 ? (
                <p className="hint">Sin comidas planificadas.</p>
              ) : (
                <ul className="plan-lista">
                  {filas.map((entrada) => (
                    <Fila
                      key={entrada.id}
                      entrada={entrada}
                      onAbrir={cambiable(entrada) ? setCambiando : null}
                    />
                  ))}
                </ul>
              )}
            </section>
          )
        })}

        {onPlatos && (
          <ListRow
            label="Tus platos"
            value={Array.isArray(platos) ? String(platos.length) : ''}
            onClick={onPlatos}
          />
        )}
        {error && <p className="alert">{error}</p>}
        {/* Con pauta, los platos los dijo el nutricionista: otra semana
            sólo barajaría lo que la pauta deja libre, y se leería como que
            el plan se puede cambiar entero. */}
        {!plan.has_pauta && (
          <button type="button" className="primary plan-otra" disabled={busy} onClick={otra}>
            Generar otra
          </button>
        )}
    </>
  )

  const hoja = cambiando && (
        <CambiarPlato
          entrada={cambiando}
          dia={DIAS[dias.indexOf(cambiando.log_date)] ?? ''}
          platos={platos}
          hoy={hoy}
          replanear={replanear}
          corregirPlato={corregirPlato}
          onPlatosChanged={onPlatosChanged}
          onClose={() => setCambiando(null)}
          onCambiado={async () => {
            setCambiando(null)
            await onChanged()
          }}
        />
      )

  // Dentro de la pestaña Plan la semana es el contenido, no una pantalla encima
  // de otra: sin cabecera ni «Cerrar».
  if (embebida) {
    return (
      <div className="plan-semana">
        {cuerpo}
        {hoja}
      </div>
    )
  }

  return (
    <div className="food-screen" role="dialog" aria-modal="true" aria-label={titulo}>
      <header className="food-screen-head">
        <p className="food-screen-title">
          <span className="card-eyebrow">{antetitulo}</span>
          <span className="food-screen-slot">{titulo}</span>
        </p>
        <button type="button" className="link-btn" onClick={onClose}>
          Cerrar
        </button>
      </header>
      <div className="food-screen-body">{cuerpo}</div>
      {hoja}
    </div>
  )
}

// Cuántos de tus platos valen para cualquier comida, y por qué importa. Es la
// causa de las lentejas en el desayuno: un plato sin comidas marcadas el
// planificador lo lee como «vale para todas» (`PlatoCandidato.slots`). Se dice
// aquí, delante de la semana que lo ha hecho, y no sólo dentro de Tus platos.
function SinComida({ platos, onPlatos }) {
  const n = (platos ?? []).filter((p) => !p.slots?.length).length
  if (n === 0) return null
  return (
    <section className="platos-aviso plan-sin-comida">
      <p className="card-eyebrow">{n === 1 ? '1 plato sin comida' : `${n} platos sin comida`}</p>
      <p className="plan-sin-comida-texto">
        {n === 1
          ? 'Vale para cualquier comida, y por eso puede salir en el desayuno.'
          : 'Valen para cualquier comida, y por eso pueden salir en el desayuno.'}
      </p>
      <button type="button" className="secondary plan-sin-comida-btn" onClick={onPlatos}>
        Decir a qué comida van
      </button>
    </section>
  )
}

// Cambiar un plato de un día que no ha llegado. **No es «Lo cambié»**: aquel es
// «hoy comí otra cosa» y escribe el diario; esto cambia lo que el plan dice que
// vas a comer, y la fila sigue por confirmar (`replanEntry`).
function CambiarPlato({ entrada, dia, platos, hoy, replanear, corregirPlato, onPlatosChanged, onClose, onCambiado }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [quitado, setQuitado] = useState(false)
  const slot = entrada.slot
  const otros = candidatos(platos, slot, entrada.dish_id)

  // Las comidas del plato tal y como el planificador las lee: sin ninguna
  // marcada, todas. Quitar la única que tiene lo dejaría sin ninguna, que es
  // «cualquiera» — justo lo contrario de lo que se pide —, así que entonces no
  // se ofrece.
  const plato = (platos ?? []).find((p) => p.id === entrada.dish_id)
  const suyas = plato?.slots?.length ? plato.slots : HUECOS
  const puedeQuitar = Boolean(plato) && suyas.includes(slot) && suyas.length > 1

  async function elegir(otro) {
    setBusy(true)
    setError(null)
    try {
      await replanear(entrada.id, otro.id, hoy)
      await onCambiado()
    } catch (err) {
      const porque = err?.detail?.motivo
      setError(porque ? `No se ha podido cambiar: ${porque}.` : 'No se ha podido cambiar.')
      setBusy(false)
    }
  }

  async function quitar() {
    setBusy(true)
    setError(null)
    try {
      // En el orden del día, como lo guarda Tus platos.
      await corregirPlato(plato.id, { slots: HUECOS.filter((s) => suyas.includes(s) && s !== slot) })
      setQuitado(true)
      await onPlatosChanged()
    } catch {
      setError('No se ha podido guardar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open title="Cambiar este plato" onClose={onClose}>
      <p className="card-eyebrow">{`${dia} · ${NOMBRE[slot] ?? slot}`}</p>

      <div className="plan-propuesto">
        <span className="card-eyebrow">Propuesto</span>
        <span className="plan-propuesto-nombre">{entrada.dish_name}</span>
        {entrada.kcal != null && <span className="plan-kcal">{`${formatMacro(entrada.kcal)} kcal`}</span>}
        <Ingredientes items={entrada.items} />
      </div>

      <p className="card-eyebrow">{`Otros platos de ${(NOMBRE[slot] ?? slot).toLowerCase()}`}</p>
      {otros.length === 0 ? (
        <p className="hint">No tienes otro plato para esta comida.</p>
      ) : (
        <ul className="plan-otros">
          {otros.map((otro) => (
            <li key={otro.id}>
              <button type="button" className="plan-otro" disabled={busy} onClick={() => elegir(otro)}>
                <span className="plan-otro-nombre">
                  {otro.name}
                  <Ingredientes items={racion(otro)} />
                </span>
                {otro.per_serving?.kcal != null && (
                  <span className="plan-kcal">{`${formatMacro(otro.per_serving.kcal)} kcal`}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">{`Sólo cambia el ${dia.toLowerCase()}. El resto del día no se reajusta.`}</p>

      {(puedeQuitar || quitado) && (
        <>
          <p className="card-eyebrow">Para que no vuelva a pasar</p>
          {quitado ? (
            <p className="plan-quitado">{`Ya no saldrá en ${EN_PLURAL[slot]}. Elige por cuál cambiarlo.`}</p>
          ) : (
            <button type="button" className="secondary plan-quitar" disabled={busy} onClick={quitar}>
              {`No en ${EN_PLURAL[slot]}`}
            </button>
          )}
        </>
      )}

      {error && <p className="alert">{error}</p>}
    </Sheet>
  )
}
