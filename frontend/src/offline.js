import { CLIENT_VERSION, apiUrl } from './platform/http.js'
import { nativeSession, session } from './platform/session.js'
import { storage } from './platform/storage.js'

// What lets the app work with no network. Gyms are basements and the free tier
// sleeps, so a set you have already done must never depend on a request
// succeeding right now.
//
// localStorage, not IndexedDB, on purpose: writes are synchronous, so a phone
// that dies the instant after you tap has the set on disk already. Sets are a
// few dozen bytes; the quota is not in play.

// ---------------------------------------------------------------------------
// The outbox: sets logged locally that the server has not acknowledged yet.
// ---------------------------------------------------------------------------

const OUTBOX_KEY = 'fitit_outbox'

// [{ tmpId, workoutId, payload }] in the order they were logged. Order is not
// cosmetic: set_index is assigned server-side on arrival, so a queue that
// drains out of order rewrites the session.
export function readQueue() {
  try {
    const stored = JSON.parse(storage.getItem(OUTBOX_KEY))
    return Array.isArray(stored) ? stored : []
  } catch {
    // A parse error must not be able to take the log screen down with it.
    return []
  }
}

function writeQueue(entries) {
  if (entries.length === 0) storage.removeItem(OUTBOX_KEY)
  else storage.setItem(OUTBOX_KEY, JSON.stringify(entries))
}

// Each set carries an id of its own from the moment it is queued, and every
// retry resends it: a set the server saved but whose answer never arrived comes
// back with the same id, and the server answers "already logged" instead of
// logging it twice. A set that already has one keeps it — it is the same set.
// Spec: backend tests/features/log_set.feature
//
// `randomUUID` only exists in a secure context (https, localhost, the APK).
// Opened over plain http — the dev server by LAN IP — the set goes without an
// id, exactly as before: losing the dedup is fine, losing the set is not.
export function enqueueSet(entry) {
  const id = entry.payload.client_id ?? globalThis.crypto?.randomUUID?.()
  const payload = id ? { ...entry.payload, client_id: id } : entry.payload
  const stamped = { ...entry, payload }
  writeQueue([...readQueue(), stamped])
  if (nativeSession()) {
    // Hasta que el nativo conteste, la serie sólo está en la copia: ninguna
    // cola que llegue de él mientras tanto puede borrarla de la pantalla.
    inFlight.set(stamped.tmpId, stamped)
    session
      .enqueue(stamped)
      .then(adoptNativeQueue)
      .catch(() => {})
      .finally(() => inFlight.delete(stamped.tmpId))
  }
}

export function dropQueued(tmpId) {
  writeQueue(readQueue().filter((e) => e.tmpId !== tmpId))
  if (nativeSession()) session.drop(tmpId).then(adoptNativeQueue).catch(() => {})
}

export function clearQueued() {
  writeQueue([])
}

// An exercise renamed while sets are still unsent. The outbox names its
// exercise by string and the server takes that name at face value, so a queued
// set would quietly stand the old exercise back up on the next drain — the very
// duplicate the rename was there to get rid of.
export function renameQueued(from, to) {
  if (nativeSession()) session.rename(from, to).then(adoptNativeQueue).catch(() => {})
  const entries = readQueue()
  if (!entries.some((e) => e.payload?.exercise_name === from)) return
  writeQueue(
    entries.map((e) =>
      e.payload?.exercise_name === from
        ? { ...e, payload: { ...e.payload, exercise_name: to } }
        : e,
    ),
  )
}

// An exercise deleted while sets are still unsent. Same reasoning as the rename
// above, and the same failure: the outbox names its exercise by string, so a
// queued set drained after the delete would stand the exercise straight back up
// — with one set, under the name you just threw away.
export function dropQueuedFor(name) {
  if (nativeSession()) session.dropFor(name).then(adoptNativeQueue).catch(() => {})
  const entries = readQueue()
  const left = entries.filter((e) => e.payload?.exercise_name !== name)
  if (left.length !== entries.length) writeQueue(left)
}

// A workout deleted — here, from Días, or found gone on the server. Nothing it
// left behind is owed to anyone: its unsent sets would only earn a 404, and its
// cached copy is what would stand it back up as a live session the next time it
// is opened. In the APK the native side holds more than the copy knows about (a
// +1 from the widget) and the control the widget and the notification show, so
// it is told to forget the workout too.
export function forgetWorkout(workoutId) {
  if (nativeSession()) session.forget(workoutId).then(adoptNativeQueue).catch(() => {})
  const entries = readQueue()
  const left = entries.filter((e) => e.workoutId !== workoutId)
  if (left.length !== entries.length) writeQueue(left)
  const answers = readAnswers()
  const kept = answers.filter((a) => a.workoutId !== workoutId)
  if (kept.length !== answers.length) writeAnswers(kept)
  if (cachedWorkout(workoutId)) storage.removeItem(WORKOUT_KEY)
}

// ---------------------------------------------------------------------------
// Las respuestas a «¿Cuántas te quedaban?» que el servidor aún no tiene.
// ---------------------------------------------------------------------------
//
// Una cola aparte, y en la web también dentro del APK: la del nativo sólo sabe
// crear series, y esto corrige una que ya existe. Guarda el RPE y nada más —ni
// reps ni peso—, porque el PATCH reemplaza la fila entera y una copia de la
// serie tomada al contestar pisaría cualquier corrección hecha después. Quien
// la envía rellena el resto con lo que la serie dice en ese momento.
//
// Una serie que aún está en la cola no tiene id de servidor, sólo su `tmp-N` y
// el `client_id` que le puso `enqueueSet`. La respuesta se ata a ese id y
// encuentra la serie cuando el servidor la devuelve con él, aunque la app se
// haya cerrado entremedias.

const ANSWERS_KEY = 'fitit_rir_outbox'

// [{ workoutId, setId?, clientId?, rpe }], una por serie: contestar otra vez la
// sustituye. `setId` cuando la serie ya estaba en el servidor, `clientId`
// cuando se sabe —siempre que la registró este móvil—.

function readAnswers() {
  try {
    const stored = JSON.parse(storage.getItem(ANSWERS_KEY))
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

function writeAnswers(entries) {
  if (entries.length === 0) storage.removeItem(ANSWERS_KEY)
  else storage.setItem(ANSWERS_KEY, JSON.stringify(entries))
}

export function queueAnswer(entry) {
  const same = (a) =>
    (entry.setId != null && a.setId === entry.setId) ||
    (entry.clientId != null && a.clientId === entry.clientId)
  writeAnswers([...readAnswers().filter((a) => !same(a)), entry])
}

// ¿Es ésta la serie de la respuesta? Por id de servidor, o por el `client_id`
// con que la registró este móvil —en la cola todavía, o ya de vuelta—.
export function answerIsFor(answer, set) {
  if (answer.setId != null && !set.pending && set.id === answer.setId) return true
  return answer.clientId != null && set.client_id === answer.clientId
}

export function answersFor(workoutId) {
  return readAnswers().filter((a) => a.workoutId === workoutId)
}

// Sólo si sigue siendo la misma respuesta: la que se contestó mientras la
// anterior iba de camino tiene que salir en la vuelta siguiente, no borrarse.
export function dropAnswer({ setId, clientId, rpe }) {
  const entries = readAnswers()
  const left = entries.filter(
    (a) => !(a.setId === setId && a.clientId === clientId && a.rpe === rpe),
  )
  if (left.length !== entries.length) writeAnswers(left)
}

// ---------------------------------------------------------------------------
// En el APK la cola la tiene el nativo, y la envía él con la app abierta o
// cerrada (docs/widgets-entreno.md, fase 1). `fitit_outbox` pasa a ser una copia
// para pintar las filas «sin enviar» sin esperar al puente: cada cambio de
// arriba se escribe en ella y se le manda al nativo como una operación suelta, y
// lo que el nativo conteste manda sobre la copia. En la web nada de esto hace
// nada, y la página sigue enviando su cola como siempre.
// ---------------------------------------------------------------------------

// Series encoladas aquí que el nativo todavía no ha confirmado.
const inFlight = new Map()

// La cola del nativo pasa a la copia, más lo que aún va de camino hacia él.
function adoptNativeQueue(result) {
  if (!Array.isArray(result?.queue)) return
  const there = new Set(result.queue.map((e) => e.tmpId))
  writeQueue([...result.queue, ...[...inFlight.values()].filter((e) => !there.has(e.tmpId))])
}

// ¿Envía el nativo? Entonces la página no manda nada: sólo pide que se envíe.
export function sendsNatively() {
  return nativeSession()
}

export function flushNatively() {
  return session.flush().catch(() => {})
}

// Al entrar (o al abrir la app con sesión): el token, dónde enviar, y lo que la
// página tuviera en su cola —de antes de esta versión, o de antes de entrar—.
export function startNativeQueue(token) {
  if (!nativeSession()) return
  session.setSession(token, apiUrl(''), CLIENT_VERSION).catch(() => {})
  session.adopt(readQueue()).then(adoptNativeQueue).catch(() => {})
}

// Cerrar sesión: el nativo olvida el token. Las series no, igual que la web.
export function stopNativeQueue() {
  if (nativeSession()) session.clearToken().catch(() => {})
}

// Al abrir Entreno: la cola al día, y cuántas series rechazó el servidor
// mientras nadie miraba (con la app cerrada, el aviso no tuvo a quién llegar).
export async function checkInNativeQueue() {
  if (!nativeSession()) return 0
  try {
    const result = await session.snapshot()
    adoptNativeQueue(result)
    return result?.rejected ?? 0
  } catch {
    return 0
  }
}

// Un envío del nativo terminó: `{ queue, sent, rejected, workout }`. La copia se
// pone al día antes de avisar, para que quien pinte no vea dos veces una serie
// que ya está en el servidor.
export function onNativeSend(listener) {
  return session.onChanged((event) => {
    adoptNativeQueue(event)
    listener(event)
  })
}

// The backlog belonging to one workout. Another session's unsent sets are still
// owed to the server, but they have no business on this card.
export function queuedFor(workoutId) {
  return readQueue().filter((e) => e.workoutId === workoutId)
}

// Is this failure worth keeping the set for? No status means fetch itself threw
// — no signal, the case the queue exists for. 5xx/429/408 are the server being
// down or busy, which passes. Any other 4xx is the server having judged the set
// and refused it: a 422 will be a 422 forever, and retrying it forever blocks
// every set behind it in the queue. That is how one bad row loses a session.
export function retryable(error) {
  const status = error?.status
  if (status == null) return true
  // A token that expired mid-session is the one 4xx worth waiting on: you log
  // back in and the queue drains. Dropping the set instead would punish the
  // user for the clock running out on a JWT.
  if (status === 401) return true
  return status >= 500 || status === 429 || status === 408
}

// ---------------------------------------------------------------------------
// The workout cache: one slot, so reopening the app with no signal isn't a
// dead end. Without it `getWorkout` fails, the screen renders its error state,
// and the queue below is holding sets for a session you can no longer see.
// One slot is enough — you can only be inside one workout at a time.
// ---------------------------------------------------------------------------

const WORKOUT_KEY = 'fitit_workout_cache'

export function cacheWorkout(workout) {
  if (workout?.id == null) return
  storage.setItem(WORKOUT_KEY, JSON.stringify(workout))
}

export function cachedWorkout(id) {
  try {
    const stored = JSON.parse(storage.getItem(WORKOUT_KEY))
    // A different workout's copy is not an answer about this one.
    return stored?.id === id && Array.isArray(stored.sets) ? stored : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// The previous-marks cache: what to show on a card opened with no signal.
// ---------------------------------------------------------------------------

const MARKS_KEY = 'fitit_marks_cache'

function readMarks() {
  try {
    const stored = JSON.parse(storage.getItem(MARKS_KEY))
    return stored && typeof stored === 'object' ? stored : {}
  } catch {
    return {}
  }
}

export function cacheMarks(name, marks) {
  storage.setItem(MARKS_KEY, JSON.stringify({ ...readMarks(), [name]: marks }))
}

// Flagged `stale` on the way out, and the caller has to honour it. The entry was
// fetched excluding some *other* session, so it can understate the real history
// — and a mark to beat that is lower than the truth manufactures records that
// never happened. Good enough to show as "última vez"; never good enough to
// award a PR against.
export function cachedMarks(name) {
  const hit = readMarks()[name]
  return hit ? { ...hit, stale: true } : null
}

// ---------------------------------------------------------------------------
// The boot summary: five numbers about the user, kept so the launch screen has
// something true to show while the first request is still out. Not the log
// itself — that is hundreds of sets and growing, and this is read on a launch
// where nothing has arrived yet.
// ---------------------------------------------------------------------------

const BOOT_KEY = 'fitit_boot_summary'

export function cacheBootSummary(summary) {
  if (!summary) return
  try {
    storage.setItem(BOOT_KEY, JSON.stringify(summary))
  } catch {
    // A full quota must never take down the screen that just loaded fine.
  }
}

export function cachedBootSummary() {
  try {
    const stored = JSON.parse(storage.getItem(BOOT_KEY))
    return stored && typeof stored === 'object' ? stored : null
  } catch {
    return null
  }
}
