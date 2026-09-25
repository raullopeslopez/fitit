// The wire between the session on screen and the service worker that owns the
// lock-screen notification.
//
// Android is the whole reason this works: a PWA notification there can carry
// action buttons, so `+1 serie` is one tap on a locked phone instead of a wake,
// an unlock, a hunt for the app and a hunt for the card. (iOS has no action
// buttons on web notifications; there the session simply behaves as it did.)
//
// Nothing here is load-bearing. Every function is safe to call on a browser
// with no service worker, no Notification API, or a permission the user said no
// to — the rest bar on screen keeps working exactly as before.

import { isNative } from './native.js'
import {
  announceNatively,
  askNatively,
  claimNatively,
  initNative,
  listenNatively,
  nativeNotificationState,
  startNatively,
  stopNatively,
} from './notifyNative.js'

// Dentro del APK no hay service worker: cada función pasa a notifyNative.js,
// que hace lo mismo con notificaciones locales de Android y contesta con las
// mismas formas. `hasWorker` sigue mirando `isNative` porque en el APK el
// WebView puede anunciar `navigator.serviceWorker` sin que haya ninguno
// registrado, y `ready` no se resolvería nunca.
function hasWorker() {
  return !isNative() && 'serviceWorker' in navigator
}

// Al arrancar la app (main.jsx). En el navegador no hace nada; en el APK deja
// escuchando los toques en «+1 serie», también el que arrancó la app.
export function initNotifications() {
  if (isNative()) initNative()
}

export function notificationState() {
  if (isNative()) return nativeNotificationState()
  if (typeof Notification === 'undefined' || !hasWorker()) return 'unsupported'
  return Notification.permission
}

// Asked from a tap, never on load: a permission prompt that appears by itself
// is the one people dismiss without reading, and the browser only offers it once.
export async function askForNotifications() {
  if (isNative()) return askNatively()
  if (notificationState() === 'unsupported') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

async function tellWorker(message) {
  if (!hasWorker()) return false
  try {
    const registration = await navigator.serviceWorker.ready
    if (!registration.active) return false
    registration.active.postMessage(message)
    return true
  } catch {
    return false
  }
}

// Like `tellWorker`, but waits for the worker to say how it went. Everything
// this feature does happens somewhere the app cannot see — another thread, then
// the platform's own notification shade — so "posted the message" is not
// evidence of anything. Every failure comes back as a sentence instead.
async function askWorker(message, timeoutMs = 3000) {
  if (!hasWorker()) {
    return { ok: false, error: 'este navegador no tiene service worker' }
  }
  try {
    const registration = await navigator.serviceWorker.ready
    if (!registration.active) return { ok: false, error: 'el service worker no está activo' }
    return await new Promise((resolve) => {
      const channel = new MessageChannel()
      const timer = setTimeout(
        () => resolve({ ok: false, error: 'el service worker no responde' }),
        timeoutMs,
      )
      channel.port1.onmessage = (event) => {
        clearTimeout(timer)
        resolve(event.data ?? { ok: true })
      }
      registration.active.postMessage(message, [channel.port2])
    })
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}

// `rest` carries everything the tap will need while the page is frozen: which
// workout, the set to repeat, the token to send it with, and how many sets the
// page still has unsent (so the worker knows not to jump the queue).
//
// Answers `{ ok, shown }` — `shown` being how many notifications the platform
// admits to holding afterwards. Zero with `ok: true` is the interesting case:
// the worker did everything right and Android threw it away anyway.
export function startRestNotice(rest) {
  if (isNative()) return startNatively(rest)
  return askWorker({ type: 'rest-start', rest })
}

// The page is being hidden — the phone is going into a pocket. Ask the worker to
// make the notification *arrive* again, because Android draws on a locked screen
// what arrives while locked, not what was already sitting in the shade.
export function announceRestNotice() {
  if (isNative()) return announceNatively()
  return tellWorker({ type: 'rest-announce' })
}

export function stopRestNotice() {
  if (isNative()) return stopNatively()
  return tellWorker({ type: 'rest-stop' })
}

// Take back the sets logged from the lock screen. `queued` are the ones still
// unsent — they go into the page's outbox, which is the only thing allowed to
// drain — and `sent` counts the ones that already reached the server, so the
// page knows the session on screen is out of date.
export async function claimLockScreenSets(timeoutMs = 2000) {
  if (isNative()) return claimNatively()
  const nothing = { queued: [], sent: 0 }
  if (!hasWorker()) return nothing
  try {
    const registration = await navigator.serviceWorker.ready
    if (!registration.active) return nothing
    return await new Promise((resolve) => {
      const channel = new MessageChannel()
      // A worker that never answers must not hang the screen you are logging
      // into. Nothing is lost by giving up: the sets stay on its side of the
      // wire and the next claim picks them up.
      const timer = setTimeout(() => resolve(nothing), timeoutMs)
      channel.port1.onmessage = (event) => {
        clearTimeout(timer)
        resolve(event.data ?? nothing)
      }
      registration.active.postMessage({ type: 'claim' }, [channel.port2])
    })
  } catch {
    return nothing
  }
}

// The worker shouting that a set was logged while the app was up (you tapped
// the notification from the notification shade rather than the lock screen).
export function onLockScreenSets(handler) {
  if (isNative()) return listenNatively(handler)
  if (!hasWorker()) return () => {}
  const listener = (event) => {
    if (event.data?.type === 'sets-logged') handler(event.data)
  }
  navigator.serviceWorker.addEventListener('message', listener)
  return () => navigator.serviceWorker.removeEventListener('message', listener)
}
