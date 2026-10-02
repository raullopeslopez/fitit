import { useCallback, useEffect, useState } from 'react'

import { getTargetProfile, getTargetProposal } from './api.js'
import ObjetivoSheet, { conMiles } from './Objetivo.jsx'
import { Chip } from './ui'

// El objetivo dicho como lo que estás haciendo, no como un ajuste: «Bajando»,
// no «Bajar». Es la línea que se lee cada día, y lee el día, no el formulario.
const HACIENDO = { cut: 'Bajando', maintain: 'Manteniendo', gain: 'Ganando' }

function texto(perfil, kcal) {
  if (kcal == null) return 'Sin objetivo todavía · Calcularlo'
  const cifra = `${conMiles(kcal)} kcal`
  const verbo = HACIENDO[perfil?.goal]
  if (!verbo) return `Objetivo · ${cifra}`
  if (perfil.goal === 'maintain' || !perfil.goal_rate) return `${verbo} · ${cifra}`
  return `${verbo} ${String(perfil.goal_rate).replace('.', ',')} kg/sem · ${cifra}`
}

/**
 * Lo que toca comer hoy, arriba de Comida, a un toque de saber de dónde sale.
 *
 * El objetivo vivía sólo en Perfil, y la propuesta se calculaba allí sin que
 * nada lo dijera: se podía pasar semanas con una cifra propuesta y Comida sin
 * objetivo, sin enterarse. Esta línea dice siempre una de las dos cosas —qué
 * plan llevas y cuántas kcal tocan, o que todavía no hay objetivo— y abre la
 * misma hoja «Tu objetivo» que Perfil, con su «Aceptar».
 *
 * `targetKcal` es el del día que se está mirando (el congelado), no el del
 * perfil: la línea dice lo mismo que la tarjeta de debajo.
 */
export default function ObjetivoLinea({ targetKcal, onAccepted }) {
  const [perfil, setPerfil] = useState(null)
  const [propuesta, setPropuesta] = useState(null)
  const [abierta, setAbierta] = useState(false)

  const pedirPerfil = useCallback(async () => {
    try {
      setPerfil((await getTargetProfile()) ?? {})
    } catch {
      // Sin perfil la línea sigue diciendo la cifra; sólo pierde el ritmo.
      setPerfil({})
    }
  }, [])

  const pedirPropuesta = useCallback(async () => {
    try {
      setPropuesta((await getTargetProposal()) ?? null)
    } catch {
      setPropuesta(null)
    }
  }, [])

  useEffect(() => {
    pedirPerfil()
  }, [pedirPerfil])

  // La propuesta se pide al abrir y no al cargar Comida: cuesta una consulta
  // de 28 días al servidor, y sólo hace falta para decidir.
  async function abrir() {
    setAbierta(true)
    await pedirPropuesta()
  }

  if (perfil === null) return null

  return (
    <div className="food-objetivo">
      <Chip onClick={abrir}>
        {texto(perfil, targetKcal)}
        <span className="food-objetivo-chevron" aria-hidden="true">
          ›
        </span>
      </Chip>
      {abierta && (
        <ObjetivoSheet
          perfil={perfil}
          propuesta={propuesta}
          onClose={() => setAbierta(false)}
          onSaved={async () => {
            await Promise.all([pedirPerfil(), pedirPropuesta()])
          }}
          onAccepted={async () => {
            setAbierta(false)
            await Promise.all([pedirPerfil(), onAccepted()])
          }}
        />
      )}
    </div>
  )
}
