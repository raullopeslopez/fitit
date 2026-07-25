// App-shell service worker. The HTML shell is network-first so a fresh deploy's
// index.html — and the new hashed asset names it references — is picked up on the
// next load; hashed static assets stay cache-first since their names change per
// build. /api is always network. Bump CACHE to purge older caches on activate.
const CACHE = 'fitit-v3'

// The rest state, and the sets logged from the lock screen. Kept in a *separate*
// cache so the shell can be purged on every deploy without taking a set with it.
//
// Cache Storage as a key/value store, rather than IndexedDB: this worker needs
// to hold two small JSON blobs and nothing more, and it already talks to
// caches. The alternative is forty lines of IDB ceremony for the same
// durability class (both live in the origin's storage bucket and are evicted
// together).
const STATE = 'fitit-state'

// One rest at a time, so a new set replaces the notification instead of
// stacking a second one on the lock screen.
const REST_TAG = 'fitit-rest'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add('/')))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== STATE).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) return

  // The HTML shell (navigations) is network-first: a new deploy is seen on the
  // next load instead of being pinned to whatever was cached first. This is the
  // fix for "deploy succeeded but I still see the old build". Falls back to the
  // cached shell when offline.
  if (req.mode === 'navigate' || url.pathname === '/') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put('/', copy))
          }
          return res
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  // Hashed static assets are content-addressed (new name per build), so
  // cache-first is safe and keeps the app fast/offline-capable.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})

// ---------------------------------------------------------------------------
// The rest countdown, on the lock screen.
//
// The trip from pocket to card is the most expensive thing left in logging a
// set: wake the phone, unlock it, find the app, find the card, tap. So the rest
// timer becomes an Android notification carrying a `+1 serie` button, and a
// straight set is one tap on a locked phone.
//
// It has to live here rather than in the page, because the page is exactly what
// stops running when the screen goes off. The page hands over everything the
// tap will need — which workout, which set to repeat, and the token to send it
// with — and this worker owns the notification from then on.
// ---------------------------------------------------------------------------

async function readState(key, fallback) {
  try {
    const cache = await caches.open(STATE)
    const hit = await cache.match(`/__fitit/${key}`)
    return hit ? await hit.json() : fallback
  } catch {
    return fallback
  }
}

async function writeState(key, value) {
  const cache = await caches.open(STATE)
  await cache.put(`/__fitit/${key}`, new Response(JSON.stringify(value)))
}

const pad = (n) => String(n).padStart(2, '0')

// The end time, not a countdown. A notification's text is written once and then
// sits there — on a locked phone it can sit for ten minutes — so a number that
// claims to be counting down would be lying within a second of being shown.
function endsAtLabel(endsAt) {
  const at = new Date(endsAt)
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`
}

// `done` = the rest is over (this is the moment it earns a buzz). `confirm` = a
// set was just logged from the lock screen and the notification is the receipt.
function showRest(rest, { done = false, confirm = false } = {}) {
  const count = rest.series > 0 ? `\n${rest.series} ${rest.series === 1 ? 'serie' : 'series'}` : ''
  return self.registration.showNotification(
    done ? 'Descanso terminado' : `Descanso hasta las ${endsAtLabel(rest.endsAt)}`,
    {
      tag: REST_TAG,
      body: `${rest.label}${count}`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      timestamp: rest.endsAt,
      // Every set puts this on screen, so it stays quiet until it has something
      // to say: the rest running out, or a set landing.
      silent: !done && !confirm,
      renotify: done || confirm,
      // Android would otherwise sweep it away while you are still under the bar.
      requireInteraction: true,
      vibrate: done ? [120, 60, 120] : confirm ? [40] : undefined,
      actions: [
        { action: 'log', title: '+1 serie' },
        { action: 'skip', title: 'Saltar' },
      ],
      data: { endsAt: rest.endsAt },
    },
  )
}

async function closeRest() {
  const open = await self.registration.getNotifications({ tag: REST_TAG })
  open.forEach((n) => n.close())
}

// Sit out the rest, then say so. If the worker is killed first we lose the buzz
// and nothing else: the notification is already on the lock screen with its
// button, which is the part that matters.
async function ringWhenDone(rest) {
  const wait = rest.endsAt - Date.now()
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  // Superseded by a newer set (or skipped) while we waited: that rest owns the
  // notification now, and re-showing this one would rewind the clock.
  const current = await readState('rest', null)
  if (!current || current.endsAt !== rest.endsAt) return
  await showRest(current, { done: true })
}

async function startRest(rest) {
  // The same rest handed over twice is an update, not a new one. The page sends
  // it again once its own outbox has drained, so `pending` below tells the
  // truth; counting it down a second time would double the buzz at the end.
  const current = await readState('rest', null)
  const isUpdate = current?.endsAt === rest.endsAt
  await writeState('rest', rest)
  await showRest(rest)
  if (!isUpdate) await ringWhenDone(rest)
}

// A set logged from the lock screen. On disk first, then the network — the same
// order the page uses (see offline.js), and for the same reason: a set you have
// already done must not depend on a request succeeding right now.
async function logAnother() {
  const rest = await readState('rest', null)
  if (!rest) return
  const queue = await readState('queue', [])
  await writeState('queue', [
    ...queue,
    { tmpId: `sw-${Date.now()}`, workoutId: rest.workoutId, payload: rest.payload },
  ])

  // Logging a set starts the rest, here as much as in the app.
  const next = { ...rest, series: (rest.series ?? 0) + 1, endsAt: Date.now() + rest.seconds * 1000 }
  await writeState('rest', next)
  await showRest(next, { confirm: true })
  // The deadline rides along: if the app happens to be awake, its own rest bar
  // has to follow the tap, or two clocks on the same phone disagree.
  await tellClients({ type: 'sets-logged', endsAt: next.endsAt })
  await drain(rest)
  await ringWhenDone(next)
}

// Same rules as the page's outbox: no status means no signal, 401 means a token
// to wait on, 5xx/429/408 mean the server is having a moment. Anything else is
// the server having judged the set and refused it, and retrying that forever
// blocks every set behind it.
function retryable(status) {
  if (status == null || status === 401) return true
  return status >= 500 || status === 429 || status === 408
}

async function drain(rest) {
  // The page's own outbox had unsent sets when it handed this over. Those are
  // older than anything logged here, and set_index is assigned in arrival
  // order, so sending now would reorder the session. They keep their place.
  if (rest.pending > 0) return
  let sent = await readState('sent', 0)
  let queue = await readState('queue', [])
  while (queue.length > 0) {
    const [head] = queue
    let status = null
    try {
      const res = await fetch(`/api/workouts/${head.workoutId}/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rest.token}` },
        body: JSON.stringify(head.payload),
      })
      if (res.ok) {
        queue = queue.slice(1)
        sent += 1
        await writeState('queue', queue)
        await writeState('sent', sent)
        continue
      }
      status = res.status
    } catch {
      // No signal. The set is on disk; it goes out when there is one.
    }
    if (retryable(status)) break
    // Judged and refused. Out loud, because this is the one case where a set
    // really is gone and nobody is looking at a screen to notice.
    queue = queue.slice(1)
    await writeState('queue', queue)
    await self.registration.showNotification('Fitit', {
      tag: 'fitit-rechazada',
      body: 'El servidor rechazó una serie. Vuelve a registrarla.',
      icon: '/icon-192.png',
    })
  }
}

async function tellClients(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  clients.forEach((client) => client.postMessage(message))
}

// The body of the notification, rather than a button: take me to the session.
async function openApp() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const open = clients.find((c) => 'focus' in c)
  if (open) return open.focus()
  return self.clients.openWindow('/')
}

// What the page takes back when it wakes up: the sets logged from the lock
// screen that are still unsent, plus how many did go out (so it knows to
// refetch). Handed over and cleared in one pass — the page writes them to its
// own outbox synchronously the moment it has them.
async function handOver(port) {
  const queue = await readState('queue', [])
  const sent = await readState('sent', 0)
  await writeState('queue', [])
  await writeState('sent', 0)
  port?.postMessage({ queued: queue, sent })
}

self.addEventListener('message', (event) => {
  const message = event.data || {}
  if (message.type === 'rest-start') {
    event.waitUntil(startRest(message.rest))
  } else if (message.type === 'rest-stop') {
    event.waitUntil(writeState('rest', null).then(closeRest))
  } else if (message.type === 'claim') {
    event.waitUntil(handOver(event.ports?.[0]))
  }
})

self.addEventListener('notificationclick', (event) => {
  if (event.action === 'log') {
    // Deliberately not closed: the same notification is rewritten as the
    // receipt, and closing it first makes it flicker off the lock screen.
    event.waitUntil(logAnother())
    return
  }
  event.notification.close()
  if (event.action === 'skip') {
    event.waitUntil(writeState('rest', null))
    return
  }
  event.waitUntil(openApp())
})
