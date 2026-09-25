import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The service worker is a plain script in public/ (no build step, no imports —
// it has to be servable as-is at /sw.js). So it is tested the way the browser
// runs it: pulled in as text, evaluated against a scope we control, then driven
// with the events a real worker gets. The alternative — extracting its logic
// into a module — buys nothing, since none of it means anything without a
// `self` to hang it on.
import SOURCE from '../public/sw.js?raw'

class FakeResponse {
  constructor(body, { status = 200 } = {}) {
    this.body = body
    this.status = status
    this.ok = status >= 200 && status < 300
  }

  async json() {
    return JSON.parse(this.body)
  }

  async text() {
    return this.body
  }

  clone() {
    return this
  }
}

function fakeCaches() {
  const stores = new Map()
  const keyOf = (req) => String(req?.url ?? req)
  const open = async (name) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const store = stores.get(name)
    return {
      match: async (req) => store.get(keyOf(req)),
      put: async (req, res) => void store.set(keyOf(req), res),
      add: async () => {},
    }
  }
  return {
    stores,
    open,
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (req) => {
      for (const store of stores.values()) if (store.has(keyOf(req))) return store.get(keyOf(req))
      return undefined
    },
  }
}

function bootWorker({ fetch = vi.fn(), clients = [] } = {}) {
  const listeners = new Map()
  const caches = fakeCaches()

  const self = {
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, [])
      listeners.get(type).push(fn)
    },
    skipWaiting: vi.fn(),
    location: { origin: 'https://fitit.test' },
    clients: {
      claim: vi.fn(),
      matchAll: vi.fn(async () => clients),
      openWindow: vi.fn(async () => ({})),
    },
  }

  // eslint-disable-next-line no-new-func
  new Function('self', 'caches', 'fetch', 'Response', SOURCE)(self, caches, fetch, FakeResponse)

  // Fire an event the way the browser would, and hand back whatever the handler
  // asked us to wait on.
  const dispatch = (type, event = {}) => {
    const waited = []
    const full = { ...event, waitUntil: (p) => waited.push(p) }
    ;(listeners.get(type) ?? []).forEach((fn) => fn(full))
    return Promise.all(waited)
  }

  // A fetch event is answered, not awaited: the handler hands its response back
  // through respondWith. Drive one and get that response, once anything the
  // handler parked on waitUntil (the background cache write) has settled too.
  const navigate = (url = 'https://fitit.test/') => {
    let answered
    const waited = []
    const event = {
      request: { method: 'GET', url, mode: 'navigate' },
      respondWith: (p) => void (answered = p),
      waitUntil: (p) => waited.push(p),
    }
    ;(listeners.get('fetch') ?? []).forEach((fn) => fn(event))
    return Promise.resolve(answered).then(async (res) => {
      await Promise.all(waited)
      return res
    })
  }

  return { self, caches, dispatch, navigate, fetch }
}

// What Render's free plan answers with while the container wakes up: its own
// page, HTTP 200, from its edge — the app never gets a say. Nothing of ours in it.
const RENDER_WAITING_PAGE =
  '<!doctype html><html><body><h1>APPLICATION LOADING</h1><p>SERVICE WAKING UP ...</p></body></html>'

const SHELL = (build = 'a') =>
  `<!doctype html><html><head><meta name="fitit-shell" content="1" /></head>` +
  `<body><div id="root"></div><script src="/assets/index-${build}.js"></script></body></html>`

describe('opening the app on a sleeping backend', () => {
  it('shows our own screen instead of the hosting page while the container wakes', async () => {
    const worker = bootWorker({ fetch: vi.fn(async () => new FakeResponse(RENDER_WAITING_PAGE)) })
    await (await worker.caches.open('fitit-v5')).put('/', new FakeResponse(SHELL()))

    const res = await worker.navigate()

    expect(await res.text()).toContain('id="root"')
  })

  it('never lets the hosting page take the place of the cached app', async () => {
    const worker = bootWorker({ fetch: vi.fn(async () => new FakeResponse(RENDER_WAITING_PAGE)) })
    await (await worker.caches.open('fitit-v5')).put('/', new FakeResponse(SHELL()))

    await worker.navigate()

    const kept = await (await worker.caches.open('fitit-v5')).match('/')
    expect(await kept.text()).toContain('id="root"')
  })

  it('hands the hosting page through on a phone that has never opened the app', async () => {
    const worker = bootWorker({ fetch: vi.fn(async () => new FakeResponse(RENDER_WAITING_PAGE)) })

    const res = await worker.navigate()

    expect(await res.text()).toContain('APPLICATION LOADING')
  })

  it('still picks up a fresh deploy when the server answers with the app', async () => {
    const worker = bootWorker({ fetch: vi.fn(async () => new FakeResponse(SHELL('new'))) })
    await (await worker.caches.open('fitit-v5')).put('/', new FakeResponse(SHELL('old')))

    const res = await worker.navigate()

    expect(await res.text()).toContain('index-new.js')
    const stored = await (await worker.caches.open('fitit-v5')).match('/')
    expect(await stored.text()).toContain('index-new.js')
  })

  it('falls back to the cached app with no network at all', async () => {
    const worker = bootWorker({ fetch: vi.fn(async () => { throw new Error('offline') }) })
    await (await worker.caches.open('fitit-v5')).put('/', new FakeResponse(SHELL()))

    const res = await worker.navigate()

    expect(await res.text()).toContain('id="root"')
  })
})

describe('the shell cache', () => {
  it('purges old builds without taking the queued sets with them', async () => {
    const worker = bootWorker()
    await worker.caches.open('fitit-v2')
    await worker.caches.open('fitit-state')
    await worker.caches.open('fitit-v5')

    await worker.dispatch('activate')

    expect([...worker.caches.stores.keys()].sort()).toEqual(['fitit-state', 'fitit-v5'])
  })
})
