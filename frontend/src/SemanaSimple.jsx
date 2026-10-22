import { useEffect, useState } from 'react'

import { generatePlan, getShoppingList, getTargetProfile } from './api.js'
import EsperaIA from './EsperaIA.jsx'
import { HUECOS_HOY } from './HoyComida.jsx'
import { conMiles } from './Objetivo.jsx'
import { CambiarPlato, DIAS, Fila, delDia, diasDe, motivo } from './Plan.jsx'
import { slotLabel } from './food.js'

// Comida simple, fase 4 (lienzo, fila Premium · Semana y El domingo). La semana
// de un vistazo —siete días por cuatro comidas— y el día elegido debajo, donde
// se cambia un plato. La compra, una banda. La que viene se genera de un toque,
// con su espera, y queda «Tu semana, lista».

const CORTA = { desayuno: 'Desay.', comida: 'Comida', snack: 'Snack', cena: 'Cena' }

// El estado de una comida del plan en la cuadrícula. Uno, y dicho una vez:
// comido (lleno), previsto (gris), sin apuntar (contorno) o sin plan (nada).
export function estadoCasilla(entrada, hoy) {
  if (!entrada) return 'vacio'
  if (entrada.status) return 'comido'
  return entrada.log_date >= hoy ? 'previsto' : 'sin'
}

const ESTADO = { comido: 'comido', previsto: 'previsto', sin: 'sin apuntar', vacio: 'sin plan' }

export function Cuadricula({ plan, weekStart, hoy, elegido = null, onElegir = null, llegando = false, pensando = false }) {
  const dias = diasDe(weekStart)
  return (
    <div className="semana-rejilla" role="table" aria-label="Plan de la semana">
      <div className="semana-rejilla-fila is-cabecera" role="row">
        <span role="columnheader" />
        {HUECOS_HOY.map((slot) => (
          <span key={slot} role="columnheader" className="semana-rejilla-col">
            {CORTA[slot]}
          </span>
        ))}
      </div>
      {dias.map((iso, i) => {
        const filas = plan ? delDia(plan, iso) : []
        const porHueco = Object.fromEntries(filas.map((f) => [f.slot, f]))
        const dichas = filas.filter((f) => f.status).length
        const num = Number(iso.slice(8, 10))
        const cuenta = filas.length ? `${dichas} de ${filas.length} comidas` : 'sin comidas planificadas'
        return (
          <div
            key={iso}
            role="row"
            className={`semana-rejilla-fila${iso === hoy ? ' is-hoy' : ''}${iso === elegido ? ' is-elegido' : ''}`}
          >
            <span role="rowheader">
              {onElegir ? (
                <button
                  type="button"
                  className="semana-rejilla-dia"
                  aria-label={`${DIAS[i]} ${num}, ${cuenta}`}
                  aria-pressed={iso === elegido}
                  onClick={() => onElegir(iso)}
                >
                  <span className="semana-rejilla-dow">{DIAS[i].slice(0, 3)}</span>
                  <span className="semana-rejilla-num">{num}</span>
                </button>
              ) : (
                <span className="semana-rejilla-dia">
                  <span className="semana-rejilla-dow">{DIAS[i].slice(0, 3)}</span>
                  <span className="semana-rejilla-num">{num}</span>
                </span>
              )}
            </span>
            {HUECOS_HOY.map((slot, j) => {
              const estado = pensando ? 'pensando' : estadoCasilla(porHueco[slot], hoy)
              return (
                <span
                  key={slot}
                  role="cell"
                  data-estado={estado}
                  aria-label={`${slotLabel(slot)}: ${pensando ? 'pensando' : ESTADO[estado]}`}
                  className={`semana-casilla is-${estado}${llegando ? ' is-llega' : ''}`}
                  // Se llenan día a día, de lunes a domingo (lienzo «Mientras piensa»).
                  style={llegando ? { animationDelay: `${i * 70 + j * 18}ms` } : undefined}
                />
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// El día elegido, con sus comidas: tocar una que no ha pasado la cambia.
function DiaElegido({ plan, iso, weekStart, hoy, platos, onChanged }) {
  const [cambiando, setCambiando] = useState(null)
  const dias = diasDe(weekStart)
  const nombre = DIAS[dias.indexOf(iso)] ?? ''
  const filas = delDia(plan, iso).sort((a, b) => HUECOS_HOY.indexOf(a.slot) - HUECOS_HOY.indexOf(b.slot))
  const cambiable = (e) => Array.isArray(platos) && !e.status && e.log_date >= hoy
  return (
    <section className="semana-elegido" aria-label={nombre}>
      <div className="semana-elegido-head">
        <h2 className="semana-elegido-nombre">{iso === hoy ? 'Hoy' : nombre}</h2>
        {filas.some(cambiable) && <span className="semana-elegido-pista">toca un plato para cambiarlo</span>}
      </div>
      {filas.length === 0 ? (
        <p className="hint">Sin comidas planificadas.</p>
      ) : (
        <ul className="plan-lista">
          {filas.map((entrada) => (
            <Fila key={entrada.id} entrada={entrada} onAbrir={cambiable(entrada) ? setCambiando : null} />
          ))}
        </ul>
      )}
      {cambiando && (
        <CambiarPlato
          entrada={cambiando}
          dia={nombre}
          platos={platos}
          hoy={hoy}
          ideas={Boolean(plan?.dish_ideas)}
          onPlatosChanged={() => {}}
          onClose={() => setCambiando(null)}
          onCambiado={async () => {
            setCambiando(null)
            await onChanged()
          }}
        />
      )}
    </section>
  )
}

// La semana de comida: la cuadrícula y el día elegido. Hoy viene elegido si es
// de esta semana; si no, el lunes.
export function SemanaComida({ plan, weekStart, hoy, platos, onChanged }) {
  const dias = diasDe(weekStart)
  const [elegido, setElegido] = useState(dias.includes(hoy) ? hoy : dias[0])
  return (
    <>
      <Cuadricula plan={plan} weekStart={weekStart} hoy={hoy} elegido={elegido} onElegir={setElegido} />
      <p className="semana-leyenda" aria-hidden="true">
        <span className="semana-leyenda-item">
          <span className="semana-casilla is-comido" /> Comido
        </span>
        <span className="semana-leyenda-item">
          <span className="semana-casilla is-previsto" /> Previsto
        </span>
        <span className="semana-leyenda-item">
          <span className="semana-casilla is-sin" /> Sin apuntar
        </span>
      </p>
      <DiaElegido plan={plan} iso={elegido} weekStart={weekStart} hoy={hoy} platos={platos} onChanged={onChanged} />
    </>
  )
}

// Cuántas cosas trae la lista de la compra de una semana: `null` mientras no se
// sabe (y si no llega, que no es «cero»).
function useCuantasCosas(weekStart, plan) {
  const [cuantas, setCuantas] = useState(null)
  useEffect(() => {
    let vivo = true
    if (!plan) {
      setCuantas(null)
      return undefined
    }
    Promise.resolve()
      .then(() => getShoppingList(weekStart))
      .then((lista) => vivo && setCuantas((lista?.aisles ?? []).reduce((n, a) => n + (a.items?.length ?? 0), 0)))
      .catch(() => vivo && setCuantas(null))
    return () => {
      vivo = false
    }
  }, [weekStart, plan])
  return cuantas
}

// La compra de esta semana, en una banda: cuántas cosas y si ya se mandó.
export function BandaCompra({ weekStart, plan, onPreparar }) {
  const cuantas = useCuantasCosas(weekStart, plan)
  if (!plan) return null
  const mandada = Boolean(plan.shopping?.sent_at)
  return (
    <section className="semana-compra" aria-label="La compra">
      <span className="semana-compra-texto">
        <span className="semana-compra-titulo">La compra</span>
        <span className="semana-compra-pista">
          {cuantas != null && <span className="semana-compra-cifra">{cuantas}</span>}
          {cuantas != null ? ' cosas · ' : ''}
          {mandada ? 'en Taski' : 'sin mandar'}
        </span>
      </span>
      <button type="button" className="semana-compra-ir" onClick={onPreparar}>
        Preparar
      </button>
    </section>
  )
}

const PASOS_GENERAR = (kcal) => [
  'Eligiendo platos…',
  'Repartiendo las comidas…',
  kcal != null ? `Ajustando a ${conMiles(kcal)} kcal…` : 'Ajustando las cantidades…',
]

/**
 * La que viene: generarla de un toque, y comprar. Sin plan, qué se va a tener
 * en cuenta y un botón; generando, la espera con la cuadrícula a punto de
 * llenarse; con plan, «Tu semana, lista» y el paso siguiente, la compra.
 */
export function QueViene({ weekStart, plan, hoy, platos, onChanged, onComprar, generar = generatePlan, pauta = null }) {
  const [objetivo, setObjetivo] = useState(undefined)
  const [generando, setGenerando] = useState(false)
  const [recien, setRecien] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vivo = true
    getTargetProfile()
      .then((perfil) => vivo && setObjetivo(perfil?.objetivo_kcal ?? null))
      .catch(() => vivo && setObjetivo(undefined))
    return () => {
      vivo = false
    }
  }, [])

  async function generarSemana() {
    setGenerando(true)
    setError(null)
    try {
      await generar(weekStart, null)
      await onChanged()
      setRecien(true)
    } catch (err) {
      setError(motivo(err))
    } finally {
      setGenerando(false)
    }
  }

  if (generando) {
    return (
      <div className="semana-viene">
        <EsperaIA pasos={PASOS_GENERAR(objetivo)} filas={0} retraso={0} />
        <Cuadricula weekStart={weekStart} hoy={hoy} pensando />
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="semana-viene">
        <h2 className="semana-viene-titulo">Aún no hay plan</h2>
        <p className="semana-viene-texto">Lo hago con tus platos, en cuatro comidas al día y con tu objetivo:</p>
        {objetivo != null && (
          <p className="semana-viene-cifra">
            <span className="semana-viene-num">{conMiles(objetivo)}</span>
            <span className="semana-viene-unidad">kcal al día</span>
          </p>
        )}
        {objetivo === null && (
          <p className="hint">Todavía no tienes objetivo de kcal: la semana no se ajustará a ninguno.</p>
        )}
        {error && <p className="alert">{error}</p>}
        <button type="button" className="semana-viene-generar" onClick={generarSemana}>
          Generar la semana
        </button>
        <p className="semana-viene-pista">Luego cambias lo que no te apetezca, plato a plato.</p>
        {pauta}
      </div>
    )
  }

  const platosDistintos = new Set(plan.entries.map((e) => e.dish_id).filter(Boolean)).size
  return (
    <div className="semana-viene">
      <h2 className="semana-viene-titulo">Tu semana, lista</h2>
      <p className="semana-viene-cifras">
        <span>
          <span className="semana-viene-num">{plan.entries.length}</span> comidas
        </span>
        <span>
          <span className="semana-viene-num">{platosDistintos}</span> platos tuyos
        </span>
      </p>
      {recien ? (
        <Cuadricula plan={plan} weekStart={weekStart} hoy={hoy} llegando />
      ) : (
        <SemanaComida plan={plan} weekStart={weekStart} hoy={hoy} platos={platos} onChanged={onChanged} />
      )}
      <ol className="semana-pasos">
        <li className="is-hecho">Planificar la semana</li>
        <li>Hacer la compra</li>
      </ol>
      <button type="button" className="semana-viene-generar" onClick={onComprar}>
        Preparar la compra
      </button>
      {pauta}
    </div>
  )
}
