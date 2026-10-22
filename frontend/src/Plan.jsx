import { useEffect, useState } from 'react'

import {
  correctDish,
  eatFromBatch,
  generateDishes,
  listDishes,
  notHere,
  replanEntry,
  setPlanEntry,
} from './api.js'
import { Sheet } from './ui'
import { foodDayIso, formatAmount, formatMacro, momentForDay, recipeMeasure, slotLabel } from './food.js'
import Fuera, { rotuloSitio } from './Fuera.jsx'
import EsperaIA from './EsperaIA.jsx'
import { motivo as motivoIdeas } from './Dish.jsx'

const leerTusSitios = () => listDishes('', 'fuera')

// Las partes de la olla que están a un toque (fase 5).
const PARTES = [
  [1 / 2, '½'],
  [1 / 3, '⅓'],
  [1 / 4, '¼'],
]

// Lo previsto de una olla: una ración de la receta, llevada a la parte más
// cercana de las que hay a un toque. Una receta de una ración cocinada en
// tanda no dice cuántas salen, y se propone ¼.
export function partePrevista(servings) {
  if (!servings || servings < 2) return PARTES[2]
  return PARTES.reduce((mejor, parte) =>
    Math.abs(parte[0] - 1 / servings) < Math.abs(mejor[0] - 1 / servings) ? parte : mejor,
  )
}

function gramosDeOlla(olla, parte) {
  return `${formatMacro(Math.round(olla.cooked_grams * parte))} g`
}

/**
 * Comer de la olla (registro sin huecos, fase 5): lo previsto a lo ancho —«¼
 * de la olla · 600 g»—, las otras partes a un toque y «Otra» para los gramos
 * que te serviste. La báscula ya se sacó al cocinar.
 */
function DeLaOlla({ olla, servings, busy, onParte }) {
  const [otra, setOtra] = useState(false)
  const [texto, setTexto] = useState('')
  const [prevista, simbolo] = partePrevista(servings)
  const gramos = Number(texto.replace(',', '.'))
  const valida = texto !== '' && gramos > 0 && gramos <= olla.cooked_grams

  return (
    <>
      <button type="button" className="primary plan-comer" disabled={busy} onClick={() => onParte(prevista)}>
        {`${simbolo} de la olla · ${gramosDeOlla(olla, prevista)}`}
      </button>
      <div className="plan-olla-partes" role="group" aria-label="Otra parte de la olla">
        {PARTES.filter(([parte]) => parte !== prevista).map(([parte, s]) => (
          <button key={s} type="button" className="chip" disabled={busy} onClick={() => onParte(parte)}>
            {`${s} · ${gramosDeOlla(olla, parte)}`}
          </button>
        ))}
        <button type="button" className="chip" disabled={busy} onClick={() => setOtra(true)}>
          Otra
        </button>
      </div>
      {otra && (
        <div className="plan-olla-otra">
          <input
            aria-label="Gramos que te serviste"
            inputMode="decimal"
            autoComplete="off"
            placeholder="g"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <button
            type="button"
            className="secondary"
            disabled={busy || !valida}
            onClick={() => onParte(Math.round((gramos / olla.cooked_grams) * 10000) / 10000)}
          >
            Apuntar
          </button>
        </div>
      )}
    </>
  )
}

// Lo que suma una fila del plan. Una comida fuera reservada (fase 4) lo dice
// con virgulilla y «reservadas»: es una cifra apartada, no una receta pesada.
function kcalDeFila(entrada) {
  if (entrada.kcal == null) return null
  return entrada.place
    ? `~${formatMacro(entrada.kcal)} kcal reservadas`
    : `${formatMacro(entrada.kcal)} kcal`
}

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

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

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
// Un plato «está en casa» (fase 6.2) cuando al menos la mitad de sus
// ingredientes salieron en un ticket de las dos últimas semanas. La sal y el
// aceite no salen en cada compra; exigirlos todos no dejaría ninguno.
export function enCasa(plato) {
  const total = plato.ingredients?.length ?? 0
  return total > 0 && (plato.at_home ?? 0) * 2 >= total
}

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

export function diasDe(weekStart) {
  const [y, m, d] = weekStart.split('-').map(Number)
  return Array.from({ length: 7 }, (_, i) => {
    const fecha = new Date(Date.UTC(y, m - 1, d + i))
    return fecha.toISOString().slice(0, 10)
  })
}

export function delDia(plan, iso) {
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
          {/* Sin « · » delante: es el separador entre ingredientes, y «13,5 g ·
              ≈ 1 cda» se leería como dos ingredientes. */}
          {/* La pieza manda sobre la cucharada (fase 4): «2 huevos» y no
              «110 g», y para lo que no va por piezas, la cucharada de siempre. */}
          {(item.measure ?? recipeMeasure(item.grams)) && (
            <span className="plan-item-measure"> ≈ {item.measure ?? recipeMeasure(item.grams)}</span>
          )}
        </span>
      ))}
    </span>
  )
}

// Una fila de la semana: la comida, el plato y lo que suma, y cómo quedó. En la
// semana no se confirma —eso se hace en el diario, con la comida delante—; un
// plato que todavía no ha llegado se toca para cambiarlo.
export function Fila({ entrada, onAbrir = null, siguiente = false }) {
  const hecho = entrada.status === 'done'
  const saltado = entrada.status === 'skipped' || entrada.status === 'swapped'
  return (
    <li className={`plan-fila${hecho ? ' is-done' : ''}${saltado ? ' is-skipped' : ''}`}>
      <span className="card-eyebrow plan-slot">
        {NOMBRE[entrada.slot] ?? entrada.slot}
        {/* En tinta y no en ámbar: es una etiqueta, y el ámbar es para lo que
            ha pasado (DESIGN.md). */}
        {siguiente && <span className="plan-siguiente"> · Lo siguiente</span>}
      </span>
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
          {entrada.kcal != null && <span className="plan-kcal">{kcalDeFila(entrada)}</span>}
          <span className="plan-plato-chev" aria-hidden="true">›</span>
        </button>
      ) : (
        <>
          <span className="plan-plato">
            {entrada.dish_name}
            <Ingredientes items={entrada.items} />
          </span>
          {entrada.kcal != null && <span className="plan-kcal">{kcalDeFila(entrada)}</span>}
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
  comerOlla = eatFromBatch,
  // Marcador: en la fila de la comida, sólo el botón «Comido» (lo previsto, un
  // toque). Lo que pide elegir —ración de la olla, sitio reservado— abre la
  // comida con `onAbrir`; el resto de opciones está desplegándola.
  compacto = false,
  onAbrir = () => {},
  // Comida simple: el botón compacto en grande («Comido» de «Ahora») o como
  // círculo a la izquierda de su fila, que se nombra con la comida.
  className = 'hoy-comido',
  circulo = false,
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
  const plato = (platos ?? []).find((p) => p.id === entrada.dish_id)
  const olla = plato?.batch ?? null

  async function deLaOlla(parte) {
    setBusy(true)
    setError(null)
    try {
      await comerOlla(entrada.id, parte, momentForDay(entrada.log_date))
      onComido()
      await onChanged()
    } catch (err) {
      setError(err?.detail?.motivo ?? 'No se ha podido guardar.')
    } finally {
      setBusy(false)
    }
  }

  if (compacto) {
    if (futuro) return null
    if (saltado) {
      return (
        <span className="hoy-estado">
          {{ swapped: 'Cambiado', unknown: 'No sé' }[entrada.status] ?? 'Saltado'}
        </span>
      )
    }
    const directo = !olla && !entrada.place
    const texto = entrada.place ? 'Confirmar' : 'Comido'
    return (
      <button
        type="button"
        className={circulo ? 'hoy-circulo' : className}
        aria-label={circulo ? `${texto}: ${slotLabel(entrada.slot)}` : undefined}
        disabled={busy}
        onClick={() => (directo ? marcar('done') : onAbrir())}
      >
        {!circulo && texto}
      </button>
    )
  }

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
          entrada.kcal != null && <span className="plan-kcal">{kcalDeFila(entrada)}</span>
        )}
      </p>
      {!saltado && <Ingredientes items={entrada.items} />}
      {/* El hidrato que el entreno de hoy movió aquí, o que esta comida cedió
          (épica de cuatro comidas, fase 2). Los gramos de arriba ya lo llevan. */}
      {!saltado && entrada.carbs_shift ? (
        <p className={`plan-hidrato${entrada.carbs_shift > 0 ? ' is-gana' : ''}`}>
          {entrada.carbs_shift > 0 ? '+' : '−'}
          {Math.round(Math.abs(entrada.carbs_shift))} g de hidrato · por el entreno
        </p>
      ) : null}

      {/* Ni comido ni saltado es **no dicho**, no incumplido: sigue ofreciendo
          las tres cosas hasta que alguien diga una. También en un día pasado:
          una cena olvidada se cierra después, en su día. Lo que no ha llegado,
          no. */}
      {/* Fase 4: una comida fuera reservada se confirma de un toque, con las
          cifras del sitio; si acabaste en otro, se cuenta como cualquier
          comida fuera. */}
      {!saltado && !futuro && entrada.place && (
        <div className="plan-en-comida-acciones is-fuera">
          <button
            type="button"
            className="primary plan-comer"
            disabled={busy}
            onClick={() => marcar('out', entrada.dish_id)}
          >
            Confirmar
          </button>
          <button type="button" className="link-btn plan-saltar" disabled={busy} onClick={() => setFuera(true)}>
            Otro sitio
          </button>
          <button type="button" className="link-btn plan-saltar" disabled={busy} onClick={() => marcar('skipped')}>
            Me lo salté
          </button>
          <button type="button" className="link-btn plan-saltar" disabled={busy} onClick={() => marcar('unknown')}>
            No sé
          </button>
        </div>
      )}

      {!saltado && !futuro && !cambiando && !entrada.place && (
        <div className="plan-en-comida-acciones">
          {olla ? (
            <DeLaOlla olla={olla} servings={plato.servings} busy={busy} onParte={deLaOlla} />
          ) : (
            <button type="button" className="primary plan-comer" disabled={busy} onClick={() => marcar('done')}>
              Lo comí
            </button>
          )}
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
          {otros.length === 0 ? (
            <>
              <span className="card-eyebrow">¿Por cuál?</span>
              <span className="hint">No tienes otro plato para esta comida.</span>
            </>
          ) : otros.some(enCasa) ? (
            // Fase 6.2: lo que se puede cocinar con lo comprado, primero.
            <>
              <span className="card-eyebrow">Tienes en casa</span>
              <div className="plan-sustitutos" role="group" aria-label="Tienes en casa">
                {otros.filter(enCasa).map((plato) => (
                  <Sustituto key={plato.id} plato={plato} busy={busy} onElegir={() => marcar('swapped', plato.id)} />
                ))}
              </div>
              {otros.some((p) => !enCasa(p)) && (
                <>
                  <span className="card-eyebrow">Otros platos</span>
                  <div className="plan-sustitutos" role="group" aria-label="Otros platos">
                    {otros
                      .filter((p) => !enCasa(p))
                      .map((plato) => (
                        <Sustituto
                          key={plato.id}
                          plato={plato}
                          busy={busy}
                          onElegir={() => marcar('swapped', plato.id)}
                        />
                      ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <span className="card-eyebrow">¿Por cuál?</span>
              {otros.map((plato) => (
                <Sustituto key={plato.id} plato={plato} busy={busy} onElegir={() => marcar('swapped', plato.id)} />
              ))}
            </>
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

function Sustituto({ plato, busy, onElegir }) {
  return (
    <button type="button" className="chip plan-sustituto" disabled={busy} onClick={onElegir}>
      {plato.name}
      {plato.per_serving?.kcal != null && (
        <span className="plan-sustituto-kcal">{formatMacro(plato.per_serving.kcal)} kcal</span>
      )}
    </button>
  )
}

// Cambiar un plato de un día que no ha llegado. **No es «Lo cambié»**: aquel es
// «hoy comí otra cosa» y escribe el diario; esto cambia lo que el plan dice que
// vas a comer, y la fila sigue por confirmar (`replanEntry`).
// «Lo que sueles cenar»: el verbo de cada comida, para la espera.
const VERBO_COMIDA = { desayuno: 'desayunar', comida: 'comer', cena: 'cenar', snack: 'tomar de snack' }

export function CambiarPlato({
  entrada,
  dia,
  platos,
  hoy,
  replanear = replanEntry,
  corregirPlato = correctDish,
  leerSitios = leerTusSitios,
  proponer = generateDishes,
  noAqui = notHere,
  // Si el servidor sabe buscar ideas (`plan.dish_ideas`).
  ideas = false,
  onPlatosChanged,
  onClose,
  onCambiado,
}) {
  const [sitios, setSitios] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [quitado, setQuitado] = useState(false)
  // Fase 6: lo que la IA propone para esta comida, y las que dijiste «Aquí no».
  const [propuestas, setPropuestas] = useState(null)
  const [pensando, setPensando] = useState(false)
  const [sinIdeas, setSinIdeas] = useState(null)
  const slot = entrada.slot
  const otros = candidatos(platos, slot, entrada.dish_id)

  // Las comidas del plato tal y como el planificador las lee: sin ninguna
  // marcada, todas. Quitar la única que tiene lo dejaría sin ninguna, que es
  // «cualquiera» — justo lo contrario de lo que se pide —, así que entonces no
  // se ofrece.
  const plato = (platos ?? []).find((p) => p.id === entrada.dish_id)
  const suyas = plato?.slots?.length ? plato.slots : HUECOS
  const puedeQuitar = Boolean(plato) && suyas.includes(slot) && suyas.length > 1

  // Fase 4: tus sitios, para reservar una comida fuera. Sin ellos la hoja
  // sigue como siempre.
  useEffect(() => {
    let vivo = true
    Promise.resolve(leerSitios())
      .then((lista) => vivo && setSitios((lista ?? []).filter((s) => s.id !== entrada.dish_id)))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [leerSitios, entrada.dish_id])

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
      // «Aquí no» y no un PATCH de comidas: así se recuerda, y el modelo no
      // vuelve con él (fase 5).
      await noAqui(plato.id, slot)
      setQuitado(true)
      await onPlatosChanged()
    } catch {
      setError('No se ha podido guardar.')
    } finally {
      setBusy(false)
    }
  }

  // Ideas para esta comida (fase 6): la comida es un dato que se le da al
  // modelo, y lo que vuelve ya está guardado como plato tuyo de esa comida.
  async function pedirIdeas() {
    setPensando(true)
    setSinIdeas(null)
    try {
      const out = await proponer({ slot, n: 3 })
      const creados = out?.created ?? []
      setPropuestas(creados)
      if (creados.length === 0) setSinIdeas(motivoIdeas(out?.refusal, out?.quota_scope))
      else await onPlatosChanged()
    } catch {
      setSinIdeas(motivoIdeas('unavailable'))
    } finally {
      setPensando(false)
    }
  }

  // Comida simple, fase 5 (lienzo fila 5): la hoja es elegir. Las tuyas, de
  // un toque; tres nuevas si las pides, con su espera, y «Probar» pone una. Lo
  // demás —un sitio fuera, «no en las cenas»— va al pie, en pequeño.
  return (
    <Sheet open title={`Cambiar ${CON_ARTICULO[slot] ?? slot}`} onClose={onClose}>
      <p className="card-eyebrow">{`${dia} · ${NOMBRE[slot] ?? slot}`}</p>
      <p className="cambiar-ahora">{`Ahora: ${entrada.dish_name}`}</p>

      <h3 className="cambiar-seccion" id="cambiar-tuyas">
        Tuyas
      </h3>
      {otros.length === 0 ? (
        <p className="hint">No tienes otro plato para esta comida.</p>
      ) : (
        <ul className="cambiar-lista" aria-labelledby="cambiar-tuyas">
          {otros.map((otro) => (
            <li key={otro.id}>
              <button type="button" className="cambiar-fila" disabled={busy} onClick={() => elegir(otro)}>
                <span className="cambiar-fila-nombre">{otro.name}</span>
                {otro.per_serving?.kcal != null && (
                  <span className="plan-kcal">{`${formatMacro(otro.per_serving.kcal)} kcal`}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="cambiar-nuevas-head">
        <h3 className="cambiar-seccion" id="cambiar-nuevas">
          Nuevas para ti
        </h3>
        {propuestas?.length > 0 && !pensando && (
          <button type="button" className="link-btn cambiar-otras" disabled={busy} onClick={pedirIdeas}>
            Otras tres
          </button>
        )}
      </div>
      {pensando ? (
        <EsperaIA
          pasos={[`Mirando lo que sueles ${VERBO_COMIDA[slot] ?? 'comer'}…`, 'Pensando platos…', 'Calculando gramos…']}
          filas={3}
          retraso={0}
        />
      ) : propuestas?.length > 0 ? (
        <ul className="cambiar-lista" aria-labelledby="cambiar-nuevas">
          {propuestas.map((p, i) => (
            <li key={p.id} className="cambiar-nueva is-llega" style={{ animationDelay: `${i * 90}ms` }}>
              <span className="cambiar-fila-nombre is-titular">
                {p.name}
                <Ingredientes items={racion(p)} />
              </span>
              <button
                type="button"
                className="cambiar-probar"
                aria-label={`Probar ${p.name}`}
                disabled={busy}
                onClick={() => elegir(p)}
              >
                Probar
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <button type="button" className="secondary cambiar-pedir" disabled={busy} onClick={pedirIdeas}>
          Proponme algo nuevo
        </button>
      )}
      {sinIdeas && <p className="hint">{sinIdeas}</p>}

      <p className="hint cambiar-pie">
        Toca uno y queda cambiado. Las cantidades se ajustan solas a tu objetivo.
      </p>

      {sitios.length > 0 && (
        <>
          <p className="card-eyebrow">Comer fuera</p>
          <ul className="plan-otros">
            {sitios.map((sitio) => (
              <li key={sitio.id}>
                <button type="button" className="plan-otro" disabled={busy} onClick={() => elegir(sitio)}>
                  {rotuloSitio(sitio)}
                </button>
              </li>
            ))}
          </ul>
          <p className="hint">Reserva sus kcal y reajusta lo que queda del día.</p>
        </>
      )}

      {(puedeQuitar || quitado) &&
        (quitado ? (
          <p className="plan-quitado">{`Ya no saldrá en ${EN_PLURAL[slot]}. Elige por cuál cambiarlo.`}</p>
        ) : (
          <button type="button" className="link-btn plan-quitar" disabled={busy} onClick={quitar}>
            {`No en ${EN_PLURAL[slot]}`}
          </button>
        ))}

      {error && <p className="alert">{error}</p>}
    </Sheet>
  )
}
