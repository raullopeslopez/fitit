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
// The session, on the lock screen.
//
// The trip from pocket to card is the most expensive thing left in logging a
// set: wake the phone, unlock it, find the app, find the card, tap. So the
// session gets an Android notification carrying `+1 serie` and a field for a
// different set, and a straight set is one tap on a locked phone.
//
// The rest countdown rides on that notification when there is one — an end time
// in the title, a buzz when it runs out — but it is not what the notification
// is *for*. Somebody who doesn't time their rests still wants the button, so
// `endsAt: null` is a first-class case throughout: same remote, no clock.
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

// One decimal, no trailing ".0" — the same rule the app's readouts follow.
const showKg = (kg) => Math.round(kg * 10) / 10

// The end time, not a countdown. A notification's text is written once and then
// sits there — on a locked phone it can sit for ten minutes — so a number that
// claims to be counting down would be lying within a second of being shown.
function endsAtLabel(endsAt) {
  const at = new Date(endsAt)
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`
}

// `done` = the rest is over (this is the moment it earns a buzz). `confirm` = a
// set was just logged from the lock screen and the notification is the receipt.
//
// With no rest to count (`endsAt` null) the same notification stands as a plain
// remote for the session: the exercise leads, and the clock simply isn't part
// of it. Not timing your rests must not cost you the lock screen.
// `announce` = the phone has just gone into a pocket and this needs to *arrive*
// again. See the message handler below for why that is not the same as being on
// screen already.
function showRest(rest, { done = false, confirm = false, announce = false } = {}) {
  const count = rest.series > 0 ? `\n${rest.series} ${rest.series === 1 ? 'serie' : 'series'}` : ''
  const set = `${showKg(rest.payload.weight)} kg x ${rest.payload.reps}`
  const timed = rest.endsAt != null
  const title = done
    ? 'Descanso terminado'
    : timed
      ? `Descanso hasta las ${endsAtLabel(rest.endsAt)}`
      : rest.payload.exercise_name
  return self.registration.showNotification(
    title,
    {
      tag: REST_TAG,
      // Timed, the exercise has to ride in the body because the title is the
      // clock. Untimed it is already the title, so the body is just the set.
      body: `${timed || done ? `${rest.payload.exercise_name} · ` : ''}${set}${count}`,
      icon: '/icon-192.png',
      // Not the app icon. Android throws the badge's colour away and tints its
      // silhouette, so a full-bleed square silhouettes as… a square — which is
      // the grey block this used to draw. `badge-96.png` is the mark alone on
      // transparent, and the gaps between its three bars are what survive the
      // treatment as a shape.
      badge: '/badge-96.png',
      ...(timed ? { timestamp: rest.endsAt } : {}),
      // Not `silent`, however tempting. It was, on the reasoning that every set
      // puts this on screen so it is the normal case rather than news — and
      // Android duly filed it as a silent notification, which several skins
      // (One UI among them) hide from the lock screen by default. It reached
      // the shade and nowhere else, which is the one place it is useless: the
      // whole feature is "without unlocking the phone".
      //
      // `renotify` carries the quiet instead, and carries it better: a
      // replacement under the same tag does not re-alert, so this makes one
      // sound when it first appears in a session and then updates in silence,
      // set after set. Wanting it fully mute is a real preference, and it
      // belongs in Android's own per-site channel, not in a flag here that
      // costs the lock screen.
      renotify: done || confirm || announce,
      // Android would otherwise sweep it away while you are still under the bar.
      requireInteraction: true,
      vibrate: done ? [120, 60, 120] : confirm ? [40] : undefined,
      // Android gives two slots and no more. The second one is a text field
      // rather than a `Saltar`, because a swipe already dismisses this and the
      // countdown runs out on its own — while a pyramid or a drop set had no
      // way in at all. One field, not two: that is all the platform offers, so
      // `parseSet` below takes every shape of the same sentence.
      actions: [
        { action: 'log', title: '+1 serie' },
        { action: 'custom', type: 'text', title: 'Otra serie', placeholder: '32.5x12' },
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
  // No rest to sit out. The notification stands as a remote and nothing is
  // owed at the end of a countdown that isn't running.
  if (rest.endsAt == null) return
  const wait = rest.endsAt - Date.now()
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  // Superseded by a newer set (or skipped) while we waited: that rest owns the
  // notification now, and re-showing this one would rewind the clock.
  const current = await readState('rest', null)
  if (!current || current.endsAt !== rest.endsAt) return
  await showRest(current, { done: true })
}

// `port` is how the app finds out whether any of this worked. Everything here
// happens where the page cannot see it, so a failure that only throws inside
// the worker is a failure nobody will ever hear about — and the symptom is a
// feature that silently does nothing.
async function startRest(rest, port) {
  let isUpdate = false
  try {
    // The same rest handed over twice is an update, not a new one. The page
    // sends it again once its own outbox has drained, so `pending` tells the
    // truth; counting it down a second time would double the buzz at the end.
    const current = await readState('rest', null)
    isUpdate = current?.endsAt === rest.endsAt
    await writeState('rest', rest)
    await showRest(rest)
    // What the platform admits to holding afterwards. `ok` with zero here means
    // the worker did its job and Android dropped the notification anyway, which
    // is a completely different problem from the worker throwing.
    const open = await self.registration.getNotifications({ tag: REST_TAG })
    port?.postMessage({ ok: true, shown: open.length })
  } catch (error) {
    port?.postMessage({ ok: false, error: String(error?.message ?? error) })
    return
  }
  if (!isUpdate) await ringWhenDone(rest)
}

// What was typed into the notification's one text field. Weight first, reps
// second — the order the log itself reads in ("30 kg x 15") — with every
// separator a thumb might produce on a lock screen treated the same: `32.5x12`,
// `32,5 x 12`, `30kg x 8`, `60 5`. Being strict here does not teach anyone the
// format, it just loses the set.
//
// What it will not do is guess. A lone number could be reps at the same weight
// or a weight at the same reps, and a set invented from a coin flip is worse
// than one not logged — so it comes back null and says so out loud.
function parseSet(text) {
  const cleaned = String(text ?? '')
    .trim()
    .replace(/,/g, '.')
    .replace(/kg/gi, ' ')
  const parts = cleaned.split(/\s*[x*×]\s*|\s+/i).filter(Boolean)
  if (parts.length !== 2) return null
  const weight = Number(parts[0])
  const reps = Number(parts[1])
  // The backend's own bounds, mirrored: reps is a whole number of 1 or more,
  // weight is 0 or more (bodyweight work is a real 0).
  if (!Number.isFinite(weight) || weight < 0) return null
  if (!Number.isInteger(reps) || reps < 1) return null
  return { weight, reps }
}


// A set logged from the lock screen: `+1 serie` repeats the last one, the text
// field names a different one. On disk first, then the network — the same order
// the page uses (see offline.js), and for the same reason: a set you have
// already done must not depend on a request succeeding right now.
async function logAnother(custom = null) {
  const rest = await readState('rest', null)
  if (!rest) return
  const payload = custom ? { ...rest.payload, ...custom } : rest.payload
  const queue = await readState('queue', [])
  await writeState('queue', [
    ...queue,
    { tmpId: `sw-${Date.now()}`, workoutId: rest.workoutId, payload },
  ])

  // Logging a set starts the rest, here as much as in the app — unless there is
  // no rest to start, in which case the notification just stands there as the
  // remote it is. The typed set also becomes the one `+1 serie` repeats from now
  // on: on the way down a drop set, the next repeat is the weight you just named.
  const next = {
    ...rest,
    payload,
    series: (rest.series ?? 0) + 1,
    endsAt: rest.seconds > 0 ? Date.now() + rest.seconds * 1000 : null,
  }
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
      badge: '/badge-96.png',
    })
  }
}

// Say it again, now that the phone is going away.
//
// Android decides for itself what reaches a locked screen, and MIUI's rule —
// verified on the user's own phone — is that it draws what *arrives* while
// locked and nothing else. A notification already sitting in the shade when you
// press the power button is not redrawn. That is why the end-of-rest alert
// showed up on the lock screen and the one born the moment you tapped Registrar
// never did: same notification, different arrival time.
//
// So the page tells us when it is being hidden, which is exactly when the phone
// is pocketed or locked, and the notification arrives a second time — under the
// same tag, so it replaces rather than stacks. No timer guessing at how long
// somebody takes to put a phone away.
async function announceRest() {
  const rest = await readState('rest', null)
  if (!rest) return
  // A rest that already ran out keeps saying so. Re-announcing the countdown
  // form would put a deadline back on screen that passed minutes ago.
  const done = rest.endsAt != null && rest.endsAt <= Date.now()
  await showRest(rest, { done, announce: true })
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
    event.waitUntil(startRest(message.rest, event.ports?.[0]))
  } else if (message.type === 'rest-announce') {
    event.waitUntil(announceRest())
  } else if (message.type === 'rest-stop') {
    event.waitUntil(writeState('rest', null).then(closeRest))
  } else if (message.type === 'claim') {
    event.waitUntil(handOver(event.ports?.[0]))
  }
})

self.addEventListener('notificationclick', (event) => {
  // Deliberately not closed on either logging path: the same notification is
  // rewritten as the receipt, and closing it first makes it flicker off the
  // lock screen.
  if (event.action === 'log') {
    event.waitUntil(logAnother())
    return
  }
  if (event.action === 'custom') {
    const custom = parseSet(event.reply)
    // Nothing invented, and the rest left exactly as it was — so `+1 serie` is
    // still sitting there to fall back on. A notification is the only channel
    // back to someone holding a locked phone, so the complaint carries the
    // format instead of just refusing.
    event.waitUntil(
      custom
        ? logAnother(custom)
        : self.registration.showNotification('Fitit', {
            tag: 'fitit-formato',
            body: 'No entendí esa serie. Escríbela como 32.5x12 — peso, luego reps.',
            icon: '/icon-192.png',
            badge: '/badge-96.png',
          }),
    )
    return
  }
  event.notification.close()
  event.waitUntil(openApp())
})
