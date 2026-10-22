import { useEffect, useState } from 'react'

import { SemanaEntreno } from './HoyEntreno.jsx'
import {
  correctDish,
  eatFromBatch,
  generateDishes,
  generatePlan,
  getAdherence,
  dayVerdicts,
  listDishes,
  listRules,
  notHere,
  replanEntry,
  setPlanEntry,
} from './api.js'
import { ListRow, Sheet } from './ui'
import { frase } from './Reglas.jsx'
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
const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

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

// Proteína, hidrato y grasa de un plato en una barra de tres tramos, cada uno
// por las kcal que aporta (4, 4 y 9 por gramo): de qué está hecho, sin tabla.
// Sin una de las tres cifras no se dibuja — `null` no es cero (fase 6).
function BarraMacros({ macros, fina = false }) {
  const p = macros?.protein
  const h = macros?.carbs
  const g = macros?.fat
  if (p == null || h == null || g == null) return null
  const tramos = [
    { clase: 'is-p', kcal: p * 4, gramos: p },
    { clase: 'is-h', kcal: h * 4, gramos: h },
    { clase: 'is-g', kcal: g * 9, gramos: g },
  ]
  return (
    <span
      className={`barra-macros${fina ? ' is-fina' : ''}`}
      role="img"
      aria-label={`Proteína ${Math.round(p)} g, hidrato ${Math.round(h)} g, grasa ${Math.round(g)} g`}
    >
      <span className="barra-macros-tramos">
        {tramos.map((t) =>
          t.kcal > 0 ? <span key={t.clase} className={`barra-macros-tramo ${t.clase}`} style={{ flexGrow: t.kcal }} /> : null,
        )}
      </span>
      {!fina && (
        <span className="barra-macros-cifras" aria-hidden="true">
          {tramos.map((t) => (
            <span key={t.clase} className={`barra-macros-cifra ${t.clase}`} style={{ flexGrow: t.kcal || 1 }}>
              {`${Math.round(t.gramos)} g`}
            </span>
          ))}
        </span>
      )}
    </span>
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

// La tira de «Esta semana»: un botón por día que dice cuántas comidas llevas de
// las planificadas y salta a ese día. Un día sin plan es «—», no «0/0»: no hay
// nada que llevar, que es distinto de no haber llevado nada.
function TiraSemana({ plan, dias, hoy }) {
  return (
    <nav className="plan-tira" aria-label="Ir a un día">
      {dias.map((iso, i) => {
        const filas = delDia(plan, iso)
        const llevas = filas.filter((f) => f.status).length
        const num = Number(iso.slice(8, 10))
        const cuenta = filas.length ? `${llevas} de ${filas.length} comidas` : 'sin comidas planificadas'
        return (
          <button
            key={iso}
            type="button"
            className={`plan-tira-dia${iso === hoy ? ' is-today' : ''}`}
            aria-label={`${DIAS[i]} ${num}, ${cuenta}`}
            onClick={() => document.getElementById(`plan-dia-${iso}`)?.scrollIntoView({ block: 'start' })}
          >
            <span className="plan-tira-letra">{LETRAS[i]}</span>
            <span className="plan-tira-num">{num}</span>
            <span className="plan-tira-cuenta">{filas.length ? `${llevas}/${filas.length}` : '—'}</span>
          </button>
        )
      })}
    </nav>
  )
}

// De cómo va la semana, en «Esta semana» sólo queda lo que se puede hacer algo:
// dónde se cae el plan. Lo comido contra lo planificado ya lo dice Comida.
export function DondeSeCae({ informe, hoy, leerVeredictos = dayVerdicts, leerReglas = listRules }) {
  // Marcador: debajo, las reglas que esta semana van sin cumplir, por su
  // nombre. Las semanales se juzgan con la semana entera que contiene hoy.
  const [rotas, setRotas] = useState([])
  useEffect(() => {
    let vivo = true
    Promise.all([
      Promise.resolve().then(() => leerVeredictos(hoy)),
      Promise.resolve().then(() => leerReglas()),
    ])
      .then(([v, reglas]) => {
        if (!vivo) return
        const porId = Object.fromEntries((reglas ?? []).map((r) => [r.id, r]))
        setRotas(
          (v?.verdicts ?? [])
            .filter((x) => x.state === 'broken' && porId[x.rule_id])
            .map((x) => frase(porId[x.rule_id])),
        )
      })
      .catch(() => vivo && setRotas([]))
    return () => {
      vivo = false
    }
  }, [hoy, leerVeredictos, leerReglas])

  if (!informe?.weakest_slot && rotas.length === 0) return null
  return (
    <section className="card plan-adherencia is-tonal">
      <p className="card-eyebrow">Cómo va la semana</p>
      {informe?.weakest_slot && (
        <p className="plan-adh-linea">
          Donde se cae es {CON_ARTICULO[informe.weakest_slot] ?? informe.weakest_slot}.
        </p>
      )}
      {rotas.length > 0 && <p className="plan-adh-reglas">{`Reglas sin cumplir: ${rotas.join(' · ')}`}</p>}
      <p className="plan-adh-revision">La revisión de la semana sale aquí el domingo.</p>
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
  leerSitios = leerTusSitios,
  proponer = generateDishes,
  noAqui = notHere,
  embebida = false,
  // «Esta semana» (plan v2): la tira de días, la próxima comida de hoy marcada
  // y, de cómo va, sólo dónde se cae.
  seguir = false,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [informe, setInforme] = useState(null)
  // La fila del plan que se está cambiando, o `null`.
  const [cambiando, setCambiando] = useState(null)
  const dias = diasDe(weekStart)
  const [abiertos, setAbiertos] = useState(() => new Set([hoy]))
  const alternar = (iso) =>
    setAbiertos((antes) => {
      const despues = new Set(antes)
      if (despues.has(iso)) despues.delete(iso)
      else despues.add(iso)
      return despues
    })
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
        {seguir ? <SemanaEntreno /> : <Adherencia informe={informe} />}
        {seguir && (
          <div className="semana-bloque-head semana-comida-head">
            <h2>Comida</h2>
            <span>dichas / del plan</span>
          </div>
        )}

        {dias.map((iso, i) => {
          const filas = delDia(plan, iso)
          const siguiente = seguir && iso === hoy ? filas.find((f) => !f.status)?.id : undefined
          // En «Esta semana» cada día es una fila: su menú y cuántas llevas.
          // Tocarla despliega sus comidas; hoy viene desplegado.
          const plegado = seguir && !abiertos.has(iso)
          const llevas = filas.filter((f) => f.status).length
          return (
            <section key={iso} id={`plan-dia-${iso}`} className={`plan-dia${iso === hoy ? ' is-today' : ''}${seguir ? ' is-fila' : ''}`}>
              {seguir ? (
                <button
                  type="button"
                  className={`semana-dia${iso < hoy ? ' is-pasado' : ''}`}
                  aria-expanded={!plegado}
                  aria-label={`${DIAS[i]} ${Number(iso.slice(8, 10))}, ${
                    filas.length ? `${llevas} de ${filas.length} comidas` : 'sin comidas planificadas'
                  }`}
                  onClick={() => alternar(iso)}
                >
                  <span className="semana-dia-fecha">
                    <span className="semana-dia-dow">{iso === hoy ? 'HOY' : DIAS[i].slice(0, 3).toUpperCase()}</span>
                    <span className="semana-dia-num">{Number(iso.slice(8, 10))}</span>
                  </span>
                  <span className="semana-dia-menu">
                    {filas.length ? filas.map((f) => (f.dish_name ? nombreCorto(f.dish_name) : '—')).join(' · ') : 'Sin comidas planificadas'}
                  </span>
                  <span className="semana-dia-cuenta">{filas.length ? `${llevas}/${filas.length}` : '—'}</span>
                </button>
              ) : (
                <h3 className="plan-dia-nombre">
                  {DIAS[i]}
                  {iso === hoy && <span className="plan-dia-hoy">Hoy</span>}
                </h3>
              )}
              {!plegado && (
              <>
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
                      siguiente={entrada.id === siguiente}
                    />
                  ))}
                </ul>
              )}
              </>
              )}
            </section>
          )
        })}
        {seguir && <DondeSeCae informe={informe} hoy={hoy} />}

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
          leerSitios={leerSitios}
          proponer={proponer}
          noAqui={noAqui}
          ideas={Boolean(plan?.dish_ideas)}
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
