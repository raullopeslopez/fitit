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

export function notificationState() {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported'
  return Notification.permission
}

// Asked from a tap, never on load: a permission prompt that appears by itself
// is the one people dismiss without reading, and the browser only offers it once.
export async function askForNotifications() {
  if (notificationState() === 'unsupported') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

async function tellWorker(message) {
  if (!('serviceWorker' in navigator)) return false
  try {
    const registration = await navigator.serviceWorker.ready
    if (!registration.active) return false
    registration.active.postMessage(message)
    return true
  } catch {
    return false
  }
}

// `rest` carries everything the tap will need while the page is frozen: which
// workout, the set to repeat, the token to send it with, and how many sets the
// page still has unsent (so the worker knows not to jump the queue).
export function startRestNotice(rest) {
  return tellWorker({ type: 'rest-start', rest })
}

export function stopRestNotice() {
  return tellWorker({ type: 'rest-stop' })
}

// Take back the sets logged from the lock screen. `queued` are the ones still
// unsent — they go into the page's outbox, which is the only thing allowed to
// drain — and `sent` counts the ones that already reached the server, so the
// page knows the session on screen is out of date.
export async function claimLockScreenSets(timeoutMs = 2000) {
  const nothing = { queued: [], sent: 0 }
  if (!('serviceWorker' in navigator)) return nothing
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
  if (!('serviceWorker' in navigator)) return () => {}
  const listener = (event) => {
    if (event.data?.type === 'sets-logged') handler(event.data)
  }
  navigator.serviceWorker.addEventListener('message', listener)
  return () => navigator.serviceWorker.removeEventListener('message', listener)
}
