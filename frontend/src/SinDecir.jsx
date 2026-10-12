import { useCallback, useEffect, useState } from 'react'

import { getPlan, setPlanEntry } from './api.js'
import { PlanEnComida, lunesDe } from './Plan.jsx'

const ORDEN = ['desayuno', 'comida', 'cena', 'snack']
const NOMBRE = { desayuno: 'Desayuno', comida: 'Comida', cena: 'Cena', snack: 'Snack' }

// Cuántos días hacia atrás se sigue pidiendo lo que quedó sin decir (decisión
// del 12 oct). Después la comida se queda «sin decir» y deja de pedirse: una
// cena de hace una semana ya no se recuerda, y preguntarla es ruido.
const DIAS_ATRAS = 2

function diaAntes(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const fecha = new Date(Date.UTC(y, m - 1, d - n))
  return fecha.toISOString().slice(0, 10)
}

function diasPendientes(hoy) {
  return Array.from({ length: DIAS_ATRAS }, (_, i) => diaAntes(hoy, i + 1))
}

/**
 * Lo planificado de ayer y anteayer de lo que no dijiste nada, de lo más
 * reciente a lo más viejo y en el orden en que se come.
 *
 * `NULL` es «sin decir», no «saltado» (`plan_entries.status`): es justo lo que
 * esta franja recoge. Recibe varios planes porque ayer y anteayer pueden caer
 * en semanas distintas.
 */
export function pendientes(planes, hoy) {
  const dias = diasPendientes(hoy)
  return planes
    .flatMap((plan) => plan?.entries ?? [])
    .filter((e) => e.status == null && dias.includes(e.log_date))
    .sort(
      (a, b) =>
        b.log_date.localeCompare(a.log_date) || ORDEN.indexOf(a.slot) - ORDEN.indexOf(b.slot),
    )
}

/**
 * La línea que avisa, en un día pasado, de que su total no es el del día:
 * «Cena sin decir: este total no es el del día.» `null` si no hay nada que
 * decir — hoy, o con todo dicho.
 *
 * Avisa en vez de borrar el total: lo apuntado es un dato, y cambiarlo por una
 * raya escondería lo que sí se sabe. Lo que no se sabe es que esté completo.
 */
export function notaSinDecir(filas, dayIso, hoy) {
  if (dayIso >= hoy) return null
  const faltan = filas
    // «No sé» dice la comida, pero el total sigue sin ser el del día.
    .filter((e) => e.status == null || e.status === 'unknown')
    .sort((a, b) => ORDEN.indexOf(a.slot) - ORDEN.indexOf(b.slot))
    .map((e) => NOMBRE[e.slot] ?? e.slot)
  if (faltan.length === 0) return null
  const lista =
    faltan.length === 1
      ? faltan[0]
      : `${faltan.slice(0, -1).join(', ')} y ${faltan.at(-1).toLowerCase()}`
  const frase = lista.charAt(0).toUpperCase() + lista.slice(1).toLowerCase()
  return `${frase} sin decir: este total no es el del día.`
}

function rotulo(entrada, hoy) {
  const dia = entrada.log_date === diaAntes(hoy, 1) ? 'Ayer' : 'Anteayer'
  return `${dia} · ${NOMBRE[entrada.slot] ?? entrada.slot}`
}

/**
 * Registro sin huecos, fase 1: lo que quedó sin decir ayer y anteayer, arriba
 * de Comida y con las mismas tres salidas que dentro de su comida.
 *
 * Hasta el 12 oct una comida sólo se confirmaba el mismo día, y una que se
 * olvidaba quedaba sin cerrar para siempre: en prod, 1 de 56 comidas del plan
 * llegó a decirse. Cerrarla aquí la apunta en su día (`momentForDay`).
 */
export default function SinDecir({
  hoy,
  platos = [],
  onChanged = () => {},
  leerPlan = getPlan,
  setEntry = setPlanEntry,
}) {
  const [lista, setLista] = useState([])

  const cargar = useCallback(async () => {
    const semanas = [...new Set(diasPendientes(hoy).map(lunesDe))]
    try {
      const planes = await Promise.all(semanas.map((s) => leerPlan(s).catch(() => null)))
      setLista(pendientes(planes, hoy))
    } catch {
      setLista([])
    }
  }, [hoy, leerPlan])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (lista.length === 0) return null

  return (
    <section className="sin-decir" aria-label="Sin decir">
      {lista.map((entrada) => (
        <PlanEnComida
          key={entrada.id}
          entrada={entrada}
          hoy={hoy}
          etiqueta={rotulo(entrada, hoy)}
          platos={platos}
          setEntry={setEntry}
          onChanged={async () => {
            await cargar()
            await onChanged()
          }}
        />
      ))}
    </section>
  )
}
