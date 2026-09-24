import { useEffect, useState } from 'react'

import { generatePlan, getAdherence, setPlanEntry } from './api.js'
import { foodDayIso, formatMacro } from './food.js'

// Los cuatro huecos, en el orden en que se comen. El mismo orden del backend;
// aquí está para que la lista no dependa de cómo vinieran las filas.
const HUECOS = ['desayuno', 'comida', 'cena', 'snack']

const NOMBRE = {
  desayuno: 'Desayuno',
  comida: 'Comida',
  cena: 'Cena',
  snack: 'Snack',
}

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

// Con su artículo: la frase de lo que queda es prosa, no una lista de códigos.
const CON_ARTICULO = {
  desayuno: 'el desayuno',
  comida: 'la comida',
  cena: 'la cena',
  snack: 'el snack',
}

// Enumeración en castellano: comas y una «y» antes del último.
function enumerar(cosas) {
  if (cosas.length <= 1) return cosas.join('')
  return `${cosas.slice(0, -1).join(', ')} y ${cosas[cosas.length - 1]}`
}

// Lo que queda por comer hoy, que es una lista de platos y no un número de
// macros: accionable sin traducir nada (§3 del brainstorming). La cabecera de
// arriba sigue diciendo cuánto falta de cada macro; esto dice qué hacer.
export function queQueda(filas) {
  const pendientes = filas.filter((e) => !e.status)
  if (pendientes.length === 0) return 'Nada más por hoy.'
  const huecos = enumerar(pendientes.map((e) => CON_ARTICULO[e.slot] ?? e.slot))
  const verbo = pendientes.length === 1 ? 'Te queda' : 'Te quedan'
  const kcal = pendientes.map((e) => e.kcal)
  // Un `null` deja la suma desconocida: no se puede decir cuánto queda si una
  // de las comidas no sabe lo que suma.
  if (kcal.some((k) => k == null)) return `${verbo} ${huecos}.`
  return `${verbo} ${huecos}: ${formatMacro(kcal.reduce((a, b) => a + b, 0))} kcal.`
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

// Por qué no se ha podido generar. Cada forma de no haber podido se nombra por
// separado: una despensa vacía manda a dar de alta platos, y un hueco sin
// candidatos manda a mirar ese hueco. «No se ha podido» no dice qué hacer.
function motivo(err) {
  const detalle = err?.detail
  if (detalle?.slot) {
    return `No hay platos que puedan ir en la ${NOMBRE[detalle.slot]?.toLowerCase() ?? detalle.slot}.`
  }
  if (detalle?.motivo) {
    return 'Necesitas platos en tu repertorio antes de que haya semana que generar.'
  }
  return 'No se ha podido generar la semana.'
}

function Fila({ entrada, puedeConfirmar, busy, onMarcar, onCambiar, cambiando, platos, onElegir, onCancelar }) {
  const hecho = entrada.status === 'done'
  const saltado = entrada.status === 'skipped' || entrada.status === 'swapped'
  return (
    <li className={`plan-fila${hecho ? ' is-done' : ''}${saltado ? ' is-skipped' : ''}`}>
      <span className="card-eyebrow plan-slot">{NOMBRE[entrada.slot] ?? entrada.slot}</span>
      <span className="plan-plato">{entrada.dish_name}</span>
      {entrada.kcal != null && (
        <span className="plan-kcal">{formatMacro(entrada.kcal)} kcal</span>
      )}
      {/* El estado se dice distinto de la acción: «Me lo salté» es lo que
          pulsas, «Saltado» es lo que quedó. Las mismas palabras para las dos
          cosas hacen que la fila parezca ofrecer lo que ya hizo. */}
      {hecho && <span className="plan-estado">Comido</span>}
      {saltado && (
        <span className="plan-estado">
          {entrada.status === 'swapped' ? 'Cambiado' : 'Saltado'}
        </span>
      )}
      {/* Ni comido ni saltado es **no dicho**, no incumplido: sigue ofreciendo
          las dos cosas hasta que alguien diga una. */}
      {!hecho && !saltado && puedeConfirmar && (
        <span className="plan-acciones">
          <button
            type="button"
            className="primary plan-comer"
            disabled={busy}
            onClick={() => onMarcar(entrada, 'done')}
          >
            Lo comí
          </button>
          <button
            type="button"
            className="link-btn plan-saltar"
            disabled={busy}
            onClick={() => onMarcar(entrada, 'skipped')}
          >
            Me lo salté
          </button>
          {/* Cambiar es de primera clase, no borrar y volver a añadir (§4):
              cambiar no es incumplir. */}
          <button
            type="button"
            className="link-btn plan-saltar"
            disabled={busy}
            onClick={() => onCambiar(entrada)}
          >
            Lo cambié
          </button>
        </span>
      )}
      {cambiando && (
        <span className="plan-cambiar">
          <span className="card-eyebrow">¿Por cuál?</span>
          {platos.length === 0 ? (
            <span className="hint">No tienes otro plato para esta comida.</span>
          ) : (
            platos.map((plato) => (
              <button
                key={plato.id}
                type="button"
                className="chip plan-sustituto"
                disabled={busy}
                onClick={() => onElegir(entrada, plato)}
              >
                {plato.name}
                {plato.per_serving?.kcal != null && (
                  <span className="plan-sustituto-kcal">
                    {formatMacro(plato.per_serving.kcal)} kcal
                  </span>
                )}
              </button>
            ))
          )}
          <button type="button" className="link-btn plan-cancelar" onClick={onCancelar}>
            Cancelar
          </button>
        </span>
      )}
    </li>
  )
}

export default function PlanDelDia({
  plan,
  dayIso,
  isToday,
  onChanged,
  onVerSemana = null,
  platos = [],
  // Inyectables para que los tests no tengan que interceptar el módulo de red.
  generar = generatePlan,
  setEntry = setPlanEntry,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // La fila cuyo sustituto se está eligiendo, o `null`.
  const [cambiando, setCambiando] = useState(null)
  const filas = delDia(plan, dayIso)

  async function marcar(entrada, status, dishId = null) {
    setBusy(true)
    setError(null)
    try {
      await setEntry(entrada.id, status, dishId)
      setCambiando(null)
      await onChanged()
    } catch (err) {
      setError(err?.detail?.motivo ?? 'No se ha podido guardar.')
    } finally {
      setBusy(false)
    }
  }

  async function generarSemana() {
    setBusy(true)
    setError(null)
    try {
      await generar(lunesDe(dayIso), null)
      await onChanged()
    } catch (err) {
      setError(motivo(err))
    } finally {
      setBusy(false)
    }
  }

  if (!plan) {
    return (
      <section className="card plan-card">
        <p className="card-eyebrow">Tu plan</p>
        <p className="hint">Todavía no hay plan para esta semana.</p>
        {error && <p className="alert">{error}</p>}
        <button type="button" className="primary" disabled={busy} onClick={generarSemana}>
          Generar la semana
        </button>
      </section>
    )
  }

  if (filas.length === 0) return null

  return (
    <section className="card plan-card">
      <p className="card-eyebrow">Tu plan</p>
      {/* Qué te queda por comer, que es una lista de platos y no un número de
          macros. Sólo en el día que estás viviendo: en otro, «te quedan» no
          significa nada. */}
      {isToday && <p className="plan-queda">{queQueda(filas)}</p>}
      <ul className="plan-lista">
        {filas.map((entrada) => (
          <Fila
            key={entrada.id}
            entrada={entrada}
            puedeConfirmar={isToday}
            busy={busy}
            onMarcar={marcar}
            onCambiar={(fila) => setCambiando(fila.id)}
            cambiando={cambiando === entrada.id}
            platos={candidatos(platos, entrada.slot, entrada.dish_id)}
            onElegir={(fila, plato) => marcar(fila, 'swapped', plato.id)}
            onCancelar={() => setCambiando(null)}
          />
        ))}
      </ul>
      {/* El día que tienes delante no es el que estás viviendo: una entrada del
          diario se fecha por el instante en que la escribes. */}
      {!isToday && <p className="hint">Sólo se confirma el día de hoy.</p>}
      {error && <p className="alert">{error}</p>}
      {onVerSemana && (
        <button type="button" className="link-btn plan-ver" onClick={onVerSemana}>
          Ver la semana
        </button>
      )}
    </section>
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
  generar = generatePlan,
  hoy = foodDayIso(),
  leerAdherencia = getAdherence,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [informe, setInforme] = useState(null)

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

  return (
    <div className="food-screen" role="dialog" aria-modal="true" aria-label="Tu semana">
      <header className="food-screen-head">
        <p className="food-screen-title">
          <span className="card-eyebrow">Lo que toca</span>
          <span className="food-screen-slot">Tu semana</span>
        </p>
        <button type="button" className="link-btn" onClick={onClose}>
          Cerrar
        </button>
      </header>

      <div className="food-screen-body">
        <Adherencia informe={informe} />

        {diasDe(weekStart).map((iso, i) => {
          const filas = delDia(plan, iso)
          return (
            <section key={iso} className="plan-dia">
              <h3 className="plan-dia-nombre">
                {DIAS[i]}
                {iso === hoy && <span className="plan-dia-hoy">Hoy</span>}
              </h3>
              {filas.length === 0 ? (
                <p className="hint">Sin comidas planificadas.</p>
              ) : (
                <ul className="plan-lista">
                  {filas.map((entrada) => (
                    <Fila key={entrada.id} entrada={entrada} puedeConfirmar={false} />
                  ))}
                </ul>
              )}
            </section>
          )
        })}

        {error && <p className="alert">{error}</p>}
        <button type="button" className="primary plan-otra" disabled={busy} onClick={otra}>
          Generar otra
        </button>
      </div>
    </div>
  )
}
