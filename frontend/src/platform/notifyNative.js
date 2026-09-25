// El aviso del descanso dentro del APK, con notificaciones locales de Android.
//
// Es la otra implementación de `notify.js`: misma forma, mismas respuestas, para
// que `Workout.jsx` no sepa en cuál de los dos sitios corre. En la PWA esto lo
// hace el service worker (public/sw.js); aquí no hay ninguno, y lo que él
// guardaba en su caché viaja dentro de la propia notificación (`extra`), que es
// lo único que sobrevive a que Android mate la app.
//
// Lo que el plugin impone y cambia el trato respecto a la PWA:
//
// - Tocar un botón **abre la app** (el plugin sólo sabe lanzar la actividad).
//   Con el teléfono bloqueado, Android pide desbloquear antes. La serie no se
//   envía desde aquí: se guarda y se entrega a la página, que la mete en su
//   cola como cualquier otra (`claimLockScreenSets`). Un solo camino de escritura.
// - Cada publicación es una llegada nueva (el plugin quita la anterior antes de
//   poner la siguiente), así que no hay «actualizar sin volver a sonar», que es
//   de donde sacaba la PWA su silencio (DESIGN.md: suena una vez por sesión y
//   vuelve a llegar al primer ocultarse tras cada serie). Aquí el mismo
//   presupuesto se cumple publicando menos: con la app delante y el aviso ya en
//   la bandeja, una serie nueva no se publica — se guarda y llega al esconderse
//   la app (`announceNatively`). El canal no es silencioso, porque un aviso
//   silencioso no sale en la pantalla bloqueada en varias capas de Android.
// - El fin del descanso va en otro canal, que suena y vibra. Quererlos
//   distintos se cambia en Ajustes de Android, canal a canal.
// - El fin del descanso es una notificación programada con alarma: llega con la
//   pantalla bloqueada o la app en segundo plano, y también con la app cerrada.

import { LocalNotifications } from '@capacitor/local-notifications'

import { storage } from './storage.js'

// Enteros: Android identifica así cada notificación. Uno por papel, para que
// una serie nueva sustituya al aviso en vez de apilar otro.
export const REST_ID = 7301
export const END_ID = 7302
const FORMAT_ID = 7303

export const SESSION_CHANNEL = 'fitit-sesion'
export const END_CHANNEL = 'fitit-fin-descanso'
export const ACTION_TYPE = 'fitit-rest'

// Las series apuntadas desde la notificación, hasta que la página las recoge.
// En disco y no en memoria: si Android mató la app, la serie llega en el
// arranque, antes de que exista ninguna pantalla que la recoja.
const PENDING_KEY = 'fitit_lock_sets'

let permission = null // 'granted' | 'denied' | 'default', o null sin consultar
let exactAlarms = false
let current = null // el descanso vivo, sin el token
let ready = null
const handlers = new Set()

function asState(state) {
  if (state === 'granted' || state === 'denied') return state
  return 'default'
}

async function refreshExact() {
  try {
    const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting()
    exactAlarms = exact_alarm === 'granted'
  } catch {
    exactAlarms = false
  }
}

// Una vez por arranque, lo antes posible (main.jsx): si la app arranca porque
// alguien tocó «+1 serie» con ella cerrada, el plugin guarda ese toque hasta que
// haya quien lo escuche, y aquí es donde se escucha.
export function initNative() {
  if (ready) return ready
  ready = (async () => {
    try {
      LocalNotifications.addListener('localNotificationActionPerformed', onAction)
      LocalNotifications.addListener('localNotificationReceived', onReceived)
      await Promise.all([
        LocalNotifications.createChannel({
          id: SESSION_CHANNEL,
          name: 'Sesión en curso',
          description: 'El aviso con «+1 serie» mientras entrenas.',
          importance: 3,
          visibility: 1,
          vibration: false,
        }),
        LocalNotifications.createChannel({
          id: END_CHANNEL,
          name: 'Fin del descanso',
          description: 'Suena y vibra cuando se acaba el descanso.',
          importance: 4,
          visibility: 1,
          vibration: true,
        }),
        LocalNotifications.registerActionTypes({
          types: [
            {
              id: ACTION_TYPE,
              actions: [
                { id: 'log', title: '+1 serie' },
                { id: 'custom', title: 'Otra serie', input: true },
              ],
            },
          ],
        }),
      ])
      const { display } = await LocalNotifications.checkPermissions()
      permission = asState(display)
      await refreshExact()
    } catch {
      // Sin plugin o sin canal, el estado se queda en «sin preguntar» y la
      // barra de descanso en pantalla sigue como siempre.
    }
  })()
  return ready
}

// Síncrono, porque se lee durante el render. Hasta que Android conteste,
// «sin preguntar»: la sesión no publica nada con eso, y la respuesta llega en
// milisegundos, mucho antes de la primera serie.
export function nativeNotificationState() {
  if (!ready) initNative()
  return permission ?? 'default'
}

export async function askNatively() {
  await initNative()
  try {
    const { display } = await LocalNotifications.requestPermissions()
    permission = asState(display)
  } catch {
    return false
  }
  if (permission !== 'granted') return false
  // Sin alarma exacta, Android puede retrasar el aviso del fin varios minutos,
  // que en un descanso de noventa segundos es no avisar. Se pide en el mismo
  // toque que el permiso, para que la pantalla de Ajustes llegue con la
  // pregunta ya hecha; decir que no deja el aviso funcionando, pero impreciso.
  await refreshExact()
  if (!exactAlarms) {
    try {
      const { exact_alarm } = await LocalNotifications.changeExactNotificationSetting()
      exactAlarms = exact_alarm === 'granted'
    } catch {
      exactAlarms = false
    }
  }
  return true
}

// --- El contenido: el mismo que escribe public/sw.js (`showRest`) -----------

const pad = (n) => String(n).padStart(2, '0')
const showKg = (kg) => Math.round(kg * 10) / 10

function endsAtLabel(endsAt) {
  const at = new Date(endsAt)
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`
}

export function restText(rest, { done = false } = {}) {
  const count = rest.series > 0 ? `\n${rest.series} ${rest.series === 1 ? 'serie' : 'series'}` : ''
  const set =
    rest.payload.weight == null
      ? `Corporal x ${rest.payload.reps}`
      : `${showKg(rest.payload.weight)} kg x ${rest.payload.reps}`
  const timed = rest.endsAt != null
  const title = done
    ? 'Descanso terminado'
    : timed
      ? `Descanso hasta las ${endsAtLabel(rest.endsAt)}`
      : rest.payload.exercise_name
  const body = `${timed || done ? `${rest.payload.exercise_name} · ` : ''}${set}${count}`
  return { title, body }
}

function notification(id, rest, { done = false, channelId = SESSION_CHANNEL, at = null } = {}) {
  return {
    id,
    ...restText(rest, { done }),
    channelId,
    actionTypeId: ACTION_TYPE,
    // Lo que el toque necesitará si la app ya no existe cuando llegue.
    extra: { rest },
    autoCancel: false,
    ...(at != null
      ? { schedule: { at: new Date(at), allowWhileIdle: true }, isExactNotification: exactAlarms }
      : {}),
  }
}

// El token no viaja: la página envía con el suyo, y una notificación no es
// sitio para guardar una credencial (el plugin la escribe en disco).
function strip(rest) {
  const { token: _token, pending: _pending, ...kept } = rest
  return kept
}

async function clear(ids) {
  await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) })
  await LocalNotifications.removeDeliveredNotificationsById({ ids })
}

// Publica el aviso de la sesión (si `session`) y deja programado el del fin.
async function post(rest, { done = false, session = true } = {}) {
  const list = session ? [notification(REST_ID, rest, { done })] : []
  const ringsLater = !done && rest.endsAt != null && rest.endsAt > Date.now()
  if (ringsLater) {
    list.push(notification(END_ID, rest, { done: true, channelId: END_CHANNEL, at: rest.endsAt }))
  } else {
    // Un fin programado para un descanso que ya no existe sonaría a destiempo.
    await clear([END_ID])
  }
  if (list.length > 0) await LocalNotifications.schedule({ notifications: list })
}

async function showing() {
  const { notifications } = await LocalNotifications.getDeliveredNotifications()
  return notifications.filter((n) => n.id === REST_ID).length
}

export async function startNatively(rest) {
  await initNative()
  const next = strip(rest)
  try {
    // La página lo entrega dos veces por serie (antes y después de vaciar su
    // cola). Aquí cada publicación suena de nuevo, así que la segunda no se
    // publica: sólo cambiaría `pending`, que en el APK no se usa.
    const same =
      current != null &&
      current.endsAt === next.endsAt &&
      current.series === next.series &&
      current.workoutId === next.workoutId &&
      JSON.stringify(current.payload) === JSON.stringify(next.payload)
    current = next
    if (!same) {
      // Publicar es sonar. Sólo cuando no hay aviso (la primera serie de la
      // sesión, o lo quitaste deslizando) o la app ya no está delante; si no,
      // llega al esconderse. El fin sí se reprograma siempre: no suena hasta
      // su hora.
      const hidden = document.visibilityState === 'hidden'
      await post(next, { session: hidden || (await showing()) === 0 })
    }
    return { ok: true, shown: await showing() }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}

// La página se esconde: que el aviso vuelva a *llegar*, que es lo que algunas
// capas de Android (MIUI) pintan en la pantalla bloqueada. Ver sw.js.
export async function announceNatively() {
  if (!current) return false
  try {
    const done = current.endsAt != null && current.endsAt <= Date.now()
    await post(current, { done })
    return true
  } catch {
    return false
  }
}

export async function stopNatively() {
  current = null
  try {
    await clear([REST_ID, END_ID])
    return true
  } catch {
    return false
  }
}

// --- El toque ----------------------------------------------------------------

function readPending() {
  try {
    const stored = JSON.parse(storage.getItem(PENDING_KEY))
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

// La misma forma que el `claim` del service worker. `sent` siempre es 0: aquí
// nada se envía por su cuenta, todo pasa por la cola de la página.
export function claimNatively() {
  const queued = readPending()
  storage.removeItem(PENDING_KEY)
  return { queued, sent: 0 }
}

export function listenNatively(handler) {
  handlers.add(handler)
  return () => handlers.delete(handler)
}

// Idéntico a `parseSet` en public/sw.js; allí no se puede importar un módulo.
export function parseSet(text, { weightless = false } = {}) {
  const cleaned = String(text ?? '')
    .trim()
    .replace(/,/g, '.')
    .replace(/kg/gi, ' ')
  const parts = cleaned.split(/\s*[x*×]\s*|\s+/i).filter(Boolean)
  if (parts.length === 1 && weightless) {
    const reps = Number(parts[0])
    return Number.isInteger(reps) && reps >= 1 ? { weight: null, reps } : null
  }
  if (parts.length !== 2) return null
  const weight = Number(parts[0])
  const reps = Number(parts[1])
  if (!Number.isFinite(weight) || weight < 0) return null
  if (!Number.isInteger(reps) || reps < 1) return null
  return { weight, reps }
}

// Una serie apuntada desde la notificación. Como en sw.js (`logAnother`), la
// copia lleva la hora del toque, y la serie tecleada pasa a ser la que repite
// el siguiente «+1 serie».
async function logAnother(rest, custom = null) {
  const template = custom ? { ...rest.payload, ...custom } : rest.payload
  const entry = {
    tmpId: `nt-${Date.now()}`,
    workoutId: rest.workoutId,
    payload: { ...template, performed_at: new Date().toISOString() },
  }
  storage.setItem(PENDING_KEY, JSON.stringify([...readPending(), entry]))

  const next = {
    ...rest,
    payload: template,
    series: (rest.series ?? 0) + 1,
    endsAt: rest.seconds > 0 ? Date.now() + rest.seconds * 1000 : null,
  }
  current = next
  handlers.forEach((handler) => handler({ type: 'sets-logged', endsAt: next.endsAt }))
  try {
    await post(next)
  } catch {
    // La serie ya está a salvo; lo que falla es el recibo.
  }
}

async function onAction({ actionId, inputValue, notification: tapped } = {}) {
  // Con la app viva manda lo que ella sabe; si Android la mató, lo que llevaba
  // la notificación.
  const rest = current ?? tapped?.extra?.rest
  if (!rest) return
  if (actionId === 'log') return logAnother(rest)
  if (actionId !== 'custom') return
  const weightless = rest.payload?.weight == null
  const custom = parseSet(inputValue, { weightless })
  if (custom) return logAnother(rest, custom)
  // Nada inventado y el descanso intacto. El plugin quitó el aviso al tocarlo,
  // así que vuelve, con la queja al lado.
  try {
    await post(rest)
    await LocalNotifications.schedule({
      notifications: [
        {
          id: FORMAT_ID,
          title: 'Fitit',
          body: weightless
            ? 'No entendí esa serie. Escribe solo las reps, como 15.'
            : 'No entendí esa serie. Escríbela como 32.5x12 — peso, luego reps.',
          channelId: SESSION_CHANNEL,
        },
      ],
    })
  } catch {
    // Nada que hacer: la app ya está abierta delante.
  }
}

// Ha sonado el fin con la app viva: el aviso de la sesión, con su «hasta las»
// ya pasado, sobra — el del fin lleva el mismo botón.
function onReceived(received) {
  if (received?.id !== END_ID) return
  LocalNotifications.removeDeliveredNotificationsById({ ids: [REST_ID] }).catch(() => {})
}

// Sólo para los tests: el módulo guarda estado entre llamadas.
export function resetNativeForTests() {
  permission = null
  exactAlarms = false
  current = null
  ready = null
  handlers.clear()
}
