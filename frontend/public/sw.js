// App-shell service worker. The HTML shell is network-first so a fresh deploy's
// index.html — and the new hashed asset names it references — is picked up on the
// next load; hashed static assets stay cache-first since their names change per
// build. /api is always network. Bump CACHE to purge older caches on activate.
// Bumped to v5 to throw away any shell cached before the guard below existed —
// which on a phone that opened the app cold could be Render's waiting page.
const CACHE = 'fitit-v5'

// Render's free plan answers the first request of the day itself, with its own
// "application loading" page, HTTP 200, while the container wakes. It is a
// perfectly successful response that simply isn't us. index.html carries this
// marker so the worker can tell the difference.
const SHELL_MARK = 'name="fitit-shell"'

const looksLikeOurShell = (res) =>
  res
    .clone()
    .text()
    .then((body) => body.includes(SHELL_MARK))
    .catch(() => false)

// A cache kept separate from the shell, so the shell can be purged on every
// deploy without taking whatever else lives here with it.
const STATE = 'fitit-state'

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

  // The HTML shell (navigations) is network-first, so a new deploy is seen on the
  // next load instead of being pinned to whatever was cached first — the fix for
  // "deploy succeeded but I still see the old build".
  //
  // But "the network answered" is not the same as "the app answered". A sleeping
  // container gets Render's own waiting page, 200 and fast, and serving that
  // means none of our code runs: no shell, no React, and so no ColdStart screen
  // to explain the wait. Anything without our marker is treated as a miss, which
  // hands over the shell we already have — and from there the app discovers the
  // cold backend through /api and puts its own waiting screen up.
  //
  // With nothing cached (a phone opening the app for the first time) there is
  // nothing to fall back to, so the hosting page goes through. Unavoidable here:
  // the fix for that one lives in how the site is served, not in the worker.
  if (req.mode === 'navigate' || url.pathname === '/') {
    event.respondWith(
      fetch(req)
        .then(async (res) => {
          const ours = res.ok && url.origin === self.location.origin && (await looksLikeOurShell(res))
          if (!ours) return (await caches.match('/')) || res
          const copy = res.clone()
          event.waitUntil(caches.open(CACHE).then((c) => c.put('/', copy)))
          return res
        })
        .catch(async () => caches.match('/')),
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
