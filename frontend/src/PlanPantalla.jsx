import { useCallback, useEffect, useRef, useState } from 'react'

import { generatePlan, getPlan, importPlan, importPlanText, listDishes, saveImportedPlan } from './api.js'
import { foodDayIso } from './food.js'
import { SemanaEntreno } from './HoyEntreno.jsx'
import ImportarPlan from './ImportarPlan.jsx'
import { lunesDe, lunesSiguiente, motivo } from './Plan.jsx'
import ListaCompra from './ListaCompra.jsx'
import { BandaCompra, QueViene, SemanaComida } from './SemanaSimple.jsx'
import TusPlatos from './TusPlatos.jsx'
import { Indice, ListRow } from './ui'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// «5 – 11 oct», o «28 sep – 4 oct» cuando la semana cruza de mes. En UTC, por
// lo mismo que `lunesDe`: un `Date` local de un `YYYY-MM-DD` cae el día antes.
export function rangoSemana(weekStart) {
  const [y, m, d] = weekStart.split('-').map(Number)
  const inicio = new Date(Date.UTC(y, m - 1, d))
  const fin = new Date(Date.UTC(y, m - 1, d + 6))
  const mesFin = MESES[fin.getUTCMonth()]
  if (inicio.getUTCMonth() === fin.getUTCMonth()) {
    return `${inicio.getUTCDate()} – ${fin.getUTCDate()} ${mesFin}`
  }
  return `${inicio.getUTCDate()} ${MESES[inicio.getUTCMonth()]} – ${fin.getUTCDate()} ${mesFin}`
}

/**
 * La pestaña Plan: lo que vas a comer, separado de lo que has comido.
 *
 * Hasta aquí el plan vivía dentro de Comida —una tarjeta entre los macros y el
 * diario, y la semana, la lista y tus platos colgando de dos enlaces dentro de
 * ella—. Son dos trabajos distintos: registrar es varias veces al día con el
 * móvil en una mano; planificar es una vez a la semana, el día que compras.
 * Comida se queda con el registro y con confirmar lo planificado de hoy, que es
 * donde se toca el plan con la comida delante.
 *
 * Dos semanas y no un calendario: la que estás viviendo (qué toca, cómo va) y la
 * que viene (revisar el objetivo, generar, comprar). No hay una tercera que
 * tenga sentido mirar desde aquí.
 */
// Por qué no se ha podido leer un PDF, en lo que hay que hacer al respecto.
function porQueNoSeLee(respuesta) {
  if (respuesta?.refusal === 'quota') {
    return respuesta.quota_scope === 'day'
      ? 'Se ha gastado la lectura de hoy. Prueba mañana.'
      : 'Demasiadas lecturas seguidas. Espera un minuto y prueba otra vez.'
  }
  return 'No se ha podido leer el plan. Prueba otra vez.'
}

function errorDeSubida(err) {
  if (err?.status === 415) return 'Sólo se leen PDF.'
  if (err?.status === 413) return 'El PDF es demasiado grande.'
  if (err?.status === 503) return 'La lectura de planes no está disponible.'
  return 'No se ha podido leer el plan. Prueba otra vez.'
}

// La compra que espera su ticket (plan v2): la semana cuya lista se mandó a
// Taski y cuyo ticket no se ha subido, mientras no haya pasado su domingo. Se
// mira en las dos semanas que ya están cargadas: el domingo se manda la de la
// que viene, y el lunes esa misma semana ya es «esta».
export function compraPendiente(planes, hoy) {
  return (
    Object.values(planes).find((p) => {
      if (!p?.shopping?.sent_at || p.shopping.ticket_at) return false
      const [y, m, d] = p.week_start.split('-').map(Number)
      const domingo = new Date(Date.UTC(y, m - 1, d + 6)).toISOString().slice(0, 10)
      return hoy <= domingo
    })?.week_start ?? null
  )
}

// Una semana sin nada dicho todavía se puede rehacer con la pauta. Una con
// comidas confirmadas no: regenerarla se llevaría lo que ya marcaste.
function rehacible(plan) {
  return !plan || plan.entries.every((e) => e.status == null)
}

// Las dos semanas van seguidas en un scroll (2026-10-23); sus píldoras son el
// índice. `inicial` abre ya bajada hasta «La que viene» (el aviso de la revisión).
const SECCIONES = [
  { id: 'semana-esta', label: 'Esta semana' },
  { id: 'semana-viene', label: 'La que viene' },
]

export default function PlanPantalla({ hoy = foodDayIso(), inicial = 'esta' }) {
  const esta = lunesDe(hoy)
  const viene = lunesSiguiente(hoy)
  // `undefined` = cargando; `null` = esa semana no se ha generado.
  const [planes, setPlanes] = useState({ [esta]: undefined, [viene]: undefined })
  const [platos, setPlatos] = useState([])
  const [error, setError] = useState(null)
  const [platosOpen, setPlatosOpen] = useState(false)
  // La semana cuya lista de la compra está abierta, o `null`.
  const [listaDe, setListaDe] = useState(null)
  // La pauta del nutricionista, plegada al pie de la que viene.
  const [pautaOpen, setPautaOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // Subir plan: `leyendo` mientras el PDF va y vuelve; `lectura` es lo leído,
  // y mientras la hay la pantalla es la de revisarlo.
  const [leyendo, setLeyendo] = useState(false)
  const [lectura, setLectura] = useState(null)
  // { texto }: lo que ha pasado al guardar una pauta.
  const [aviso, setAviso] = useState(null)
  const archivo = useRef(null)
  // El cuadro para pegar a mano: `null` cerrado; si no, lo escrito en él.
  const [pegado, setPegado] = useState(null)

  const cargar = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([getPlan(esta), getPlan(viene)])
      setPlanes({ [esta]: a, [viene]: b })
      setError(null)
    } catch {
      setError('No se ha podido cargar el plan.')
    }
  }, [esta, viene])

  // Aparte del plan: unos platos que no llegan dejan la semana a la vista, sólo
  // sin aviso ni con qué cambiar un plato.
  const cargarPlatos = useCallback(async () => {
    try {
      setPlatos((await listDishes()) ?? [])
    } catch {
      setPlatos([])
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    cargarPlatos()
  }, [cargarPlatos])

  async function generarEsta() {
    setBusy(true)
    setError(null)
    try {
      await generatePlan(esta, null)
      await cargar()
    } catch (err) {
      setError(motivo(err))
    } finally {
      setBusy(false)
    }
  }

  async function subir(file) {
    if (!file) return
    setLeyendo(true)
    setError(null)
    setAviso(null)
    try {
      const respuesta = await importPlan(file)
      if (respuesta?.refusal) setError(porQueNoSeLee(respuesta))
      else setLectura(respuesta)
    } catch (err) {
      setError(errorDeSubida(err))
    } finally {
      setLeyendo(false)
    }
  }

  // Pegar plan: lo normal es que el portapapeles ya tenga lo que escribió
  // Claude, y entonces es un toque. Si el navegador no deja leerlo (permiso
  // denegado, la WebView del APK), se abre un cuadro para pegarlo a mano.
  async function pegar() {
    if (leyendo) return
    let texto = ''
    try {
      texto = (await navigator.clipboard?.readText?.()) ?? ''
    } catch {
      texto = ''
    }
    if (texto.trim()) await leerTexto(texto)
    else setPegado('')
  }

  async function leerTexto(texto) {
    setLeyendo(true)
    setError(null)
    setAviso(null)
    try {
      const respuesta = await importPlanText(texto)
      if (respuesta?.refusal) {
        setError('Eso no parece un plan. Pega la respuesta entera de Claude.')
      } else {
        setPegado(null)
        setLectura({ ...respuesta, origen: 'Pegar plan' })
      }
    } catch {
      setError('No se ha podido leer el plan. Prueba otra vez.')
    } finally {
      setLeyendo(false)
    }
  }

  async function guardado() {
    // Guardar una pauta es el momento de ir a comprar, así que deja planificadas
    // las dos semanas que se pueden rehacer: esta si no tiene nada confirmado, y
    // la que viene **aunque no existiera**. Antes la que viene esperaba a la
    // revisión y a «Generar la semana», y la lista de la compra con ella.
    const rehacerEsta = rehacible(planes[esta])
    const semanas = [...(rehacerEsta ? [esta] : []), ...(rehacible(planes[viene]) ? [viene] : [])]
    const hechas = new Set()
    for (const semana of semanas) {
      try {
        await generatePlan(semana, null)
        hechas.add(semana)
      } catch {
        // La pauta ya está guardada; una semana que no se rehace ahora se
        // rehará al pulsar «Generar la semana».
      }
    }
    // Se guarda desde «La que viene», que ya tiene su lista de la compra justo
    // debajo: el aviso sólo dice qué semanas siguen la pauta.
    setLectura(null)
    setAviso({
      texto: rehacerEsta
        ? hechas.has(viene)
          ? 'Pauta guardada. Esta semana y la que viene ya siguen el plan.'
          : 'Pauta guardada. Tu semana ya sigue el plan.'
        : 'Pauta guardada. Esta semana ya tiene comidas confirmadas: el plan se aplica desde la que viene.',
    })
    await Promise.all([cargar(), cargarPlatos()])
  }

  if (lectura) {
    return (
      <ImportarPlan
        lectura={lectura}
        weekStart={esta}
        guardar={saveImportedPlan}
        onGuardado={guardado}
        onClose={() => setLectura(null)}
        titulo={lectura.origen}
      />
    )
  }

  // La lista de la compra de una semana, a pantalla completa. Al volver se
  // recarga: mandarla a Taski cambia la banda («en Taski»).
  if (listaDe) {
    return (
      <ListaCompra
        weekStart={listaDe}
        onClose={() => {
          setListaDe(null)
          cargar()
        }}
      />
    )
  }

  if (platosOpen) {
    return (
      <TusPlatos
        onClose={() => setPlatosOpen(false)}
        onChanged={async () => {
          await cargarPlatos()
        }}
      />
    )
  }

  const planEsta = planes[esta]
  const planViene = planes[viene]

  // La pauta del nutricionista: la excepción, plegada al pie de la que viene.
  const pauta = (
    <section className="plan-bloque semana-pauta" aria-label="Otras formas de hacer el plan" data-seccion>
      <button
        type="button"
        className="semana-pauta-abrir"
        aria-expanded={pautaOpen}
        onClick={() => setPautaOpen((v) => !v)}
      >
        ¿Tienes una pauta del nutricionista?
      </button>
      {pautaOpen && (
        <>
          <ListRow
            label={leyendo ? 'Leyendo el plan…' : 'Subir plan'}
            hint={leyendo ? 'Puede tardar hasta un minuto.' : 'PDF del nutricionista'}
            value=""
            onClick={() => !leyendo && archivo.current?.click()}
          />
          <input
            ref={archivo}
            type="file"
            accept="application/pdf"
            aria-label="PDF del plan"
            hidden
            onChange={(e) => {
              subir(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <ListRow label="Pegar plan" hint="El que te escribe Claude" value="" onClick={pegar} />
          {pegado !== null && (
            <div className="card plan-pegar">
              <textarea
                aria-label="Plan en texto"
                placeholder="Pega aquí la respuesta de Claude"
                rows={6}
                autoFocus
                value={pegado}
                onChange={(e) => setPegado(e.target.value)}
              />
              <div className="plan-pegar-acciones">
                <button type="button" className="link-btn" onClick={() => setPegado(null)}>
                  Cerrar
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={leyendo || !pegado.trim()}
                  onClick={() => leerTexto(pegado)}
                >
                  Leer
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )

  return (
    <div className="plan-pantalla">
      <header className="plan-head">
        <h1 className="plan-title">Semana</h1>
      </header>

      <Indice label="Semana" secciones={SECCIONES} inicial={inicial === 'viene' ? 'semana-viene' : undefined} />

      {error && <p className="alert">{error}</p>}
      {aviso && <p className="plan-aviso">{aviso.texto}</p>}

      {/* Esta semana (comida simple): el entreno, la cuadrícula de la comida con
          el día elegido, y la compra en una banda. Sin revisión del domingo,
          sin «cómo va», sin ticket. */}
      <section id="semana-esta" className="seccion-indice" aria-labelledby="semana-esta-titulo">
        <div className="seccion-head">
          <h2 id="semana-esta-titulo" className="seccion-titulo">
            Esta semana
          </h2>
          <span className="card-eyebrow">{rangoSemana(esta)}</span>
        </div>
        <SemanaEntreno />
        {planEsta !== undefined &&
          (planEsta ? (
            <>
              <SemanaComida key={esta} plan={planEsta} weekStart={esta} hoy={hoy} platos={platos} onChanged={cargar} />
              <BandaCompra weekStart={esta} plan={planEsta} onPreparar={() => setListaDe(esta)} />
            </>
          ) : (
            <section className="semana-viene" data-seccion>
              <h3 className="semana-viene-titulo">Esta semana no hay plan</h3>
              <button type="button" className="semana-viene-generar" disabled={busy} onClick={generarEsta}>
                Generar la semana
              </button>
            </section>
          ))}
      </section>

      <section id="semana-viene" className="seccion-indice" aria-labelledby="semana-viene-titulo">
        <div className="seccion-head" data-seccion>
          <h2 id="semana-viene-titulo" className="seccion-titulo">
            La que viene
          </h2>
          <span className="card-eyebrow">{rangoSemana(viene)}</span>
        </div>
        {planViene !== undefined && (
          <QueViene
            key={viene}
            weekStart={viene}
            plan={planViene}
            hoy={hoy}
            platos={platos}
            onChanged={cargar}
            onComprar={() => setListaDe(viene)}
            pauta={pauta}
          />
        )}
      </section>
    </div>
  )
}
