import { getSteps, putSteps } from './api.js'
import { ensureHealthAccess, healthSupported, readDailySteps } from './platform/health.js'

// Los pasos del teléfono, subidos a Fitit. Corre al abrir la app y cada vez que
// vuelve a primer plano (App.jsx), como mucho una vez cada cinco minutos: los
// pasos cambian a lo largo del día, pero no a cada vistazo.
//
// Lee 30 días porque es lo que Health Connect deja leer hacia atrás sin un
// permiso aparte, y así un teléfono que estuvo una semana sin abrir la app no
// deja huecos.

export const STEPS_SYNCED = 'fitit:steps-synced'
const EVERY_MS = 5 * 60 * 1000

let last = 0
let running = null

export function syncSteps({ now = Date.now(), force = false } = {}) {
  if (!healthSupported()) return Promise.resolve(false)
  if (running) return running
  if (!force && now - last < EVERY_MS) return Promise.resolve(false)
  running = (async () => {
    try {
      if (!(await ensureHealthAccess())) return false
      const days = await readDailySteps(30)
      if (days.length === 0) return false
      await putSteps(days)
      last = now
      window.dispatchEvent(new Event(STEPS_SYNCED))
      return true
    } catch {
      // Sin red, sin permiso o sin Health Connect: los pasos se quedan en el
      // teléfono hasta la próxima vez. No es un error que haya que enseñar.
      return false
    } finally {
      running = null
    }
  })()
  return running
}

// Sólo para los tests: el reloj de «una vez cada cinco minutos» vuelve a cero.
export function resetStepsSync() {
  last = 0
  running = null
}

// Pasos por fecha (`{ '2026-09-25': 8432 }`) para los días que se ven. Un día que
// no está en el objeto no tiene dato: se dibuja sin cifra, nunca como 0.
export async function stepsByDate(from, to) {
  const rows = await getSteps(from, to)
  return Object.fromEntries(rows.map((row) => [row.date, row.steps]))
}

// «8.432 pasos». El punto de miles siempre, también en 4 cifras, que es donde
// cae casi cualquier día.
export function formatSteps(steps) {
  const n = String(Math.round(steps)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${n} ${steps === 1 ? 'paso' : 'pasos'}`
}
