// App-shell service worker. The HTML shell is network-first so a fresh deploy's
// index.html — and the new hashed asset names it references — is picked up on the
// next load; hashed static assets stay cache-first since their names change per
// build. /api is always network. Bump CACHE to purge older caches on activate.
const CACHE = 'fitit-v2'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add('/')))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
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
