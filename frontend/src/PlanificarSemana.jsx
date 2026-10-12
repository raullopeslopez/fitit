import { useEffect, useState } from 'react'

import { generatePlan, getTargetProfile } from './api.js'
import { formatIsoDayMonth as semanaDel } from './format.js'
import { conMiles } from './Objetivo.jsx'
import { Semana, motivo } from './Plan.jsx'
import RevisionSemanal from './RevisionSemanal.jsx'
import ListaCompra from './ListaCompra.jsx'
import TusPlatos from './TusPlatos.jsx'
import { ListRow } from './ui'

/**
 * Planificar la semana que viene: revisar, generar y comprar.
 *
 * La revisión sigue aquí, encima, porque es donde se decide el objetivo con el
 * que se planifica: un jueves de compra no debe planificar con el objetivo
 * viejo. Pero ya no es un peaje. Hasta el 12 oct había que contestarla antes de
 * ver «Generar la semana» o la lista de la compra, y una pregunta sobre lo que
 * registraste se ponía delante de ir a comprar (auditoría del recorrido plan →
 * compra). Contestarla antes de generar sigue siendo lo natural: está arriba.
 */
export default function PlanificarSemana({
  weekStart,
  plan,
  onClose,
  onChanged,
  // Tus platos, para decir cuántos hay; y a quién avisar si cambian.
  platos = [],
  onPlatosChanged = () => {},
  generar = generatePlan,
  // Dentro de la pestaña Plan: sin cabecera ni «Cerrar», porque no es una
  // pantalla encima de otra sino el contenido de la pestaña.
  embebida = false,
}) {
  // Sube cada vez que la revisión termina: el objetivo se vuelve a leer, por si
  // en ella aceptaste otro.
  const [revisada, setRevisada] = useState(0)
  const [objetivo, setObjetivo] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [platosOpen, setPlatosOpen] = useState(false)
  const [listaOpen, setListaOpen] = useState(false)

  // El objetivo con el que se va a planificar; si la revisión acepta otro, ése.
  useEffect(() => {
    let vivo = true
    getTargetProfile()
      .then((perfil) => vivo && setObjetivo(perfil?.objetivo_kcal ?? null))
      .catch(() => vivo && setObjetivo(undefined))
    return () => {
      vivo = false
    }
  }, [revisada])

  // Tus platos, a pantalla completa por encima de todo: es lo que el plan va a
  // barajar, y se mira antes de generar.
  if (platosOpen) {
    return <TusPlatos onClose={() => setPlatosOpen(false)} onChanged={onPlatosChanged} />
  }

  if (listaOpen) {
    return <ListaCompra weekStart={weekStart} onClose={() => setListaOpen(false)} />
  }

  const revision = <RevisionSemanal onAccepted={onChanged} onDone={() => setRevisada((n) => n + 1)} />

  if (plan) {
    const semana = (
      <Semana
        embebida={embebida}
        plan={plan}
        weekStart={weekStart}
        onClose={onClose}
        onChanged={onChanged}
        antetitulo="La semana que viene"
        onLista={() => setListaOpen(true)}
        titulo={`Semana del ${semanaDel(weekStart)}`}
        platos={platos}
        onPlatos={() => setPlatosOpen(true)}
        onPlatosChanged={onPlatosChanged}
      />
    )
    if (!embebida) return semana
    return (
      <div className="plan-planificar">
        {revision}
        {semana}
      </div>
    )
  }

  async function generarSemana() {
    setBusy(true)
    setError(null)
    try {
      await generar(weekStart, null)
      await onChanged()
    } catch (err) {
      setError(motivo(err))
    } finally {
      setBusy(false)
    }
  }

  const cuerpo = (
    <>
      {revision}

      <section className="card plan-card">
        <p className="card-eyebrow">Tu plan</p>
        {/* Sin perfil que leer no se dice nada: una línea que no llega no
            es «no tienes objetivo». */}
        {objetivo !== undefined && (
          <p className="hint">
            {objetivo != null
              ? `Se planifica con tu objetivo de ${conMiles(objetivo)} kcal al día.`
              : 'Todavía no tienes objetivo de kcal: la semana no se ajustará a ninguno.'}
          </p>
        )}
        <ListRow label="Tus platos" value={String(platos.length)} onClick={() => setPlatosOpen(true)} />
        {error && <p className="alert">{error}</p>}
        <button type="button" className="primary" disabled={busy} onClick={generarSemana}>
          Generar la semana
        </button>
      </section>
    </>
  )

  if (embebida) return <div className="plan-planificar">{cuerpo}</div>

  return (
    <div className="food-screen" role="dialog" aria-modal="true" aria-label="Planificar la semana que viene">
      <header className="food-screen-head">
        <p className="food-screen-title">
          <span className="card-eyebrow">La semana que viene</span>
          <span className="food-screen-slot">{`Semana del ${semanaDel(weekStart)}`}</span>
        </p>
        <button type="button" className="link-btn" onClick={onClose}>
          Cerrar
        </button>
      </header>

      <div className="food-screen-body">{cuerpo}</div>
    </div>
  )
}
