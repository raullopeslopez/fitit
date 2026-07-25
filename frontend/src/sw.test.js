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
  const shown = []
  const live = []
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
    registration: {
      showNotification: vi.fn(async (title, options) => {
        const notification = { title, ...options, close: vi.fn() }
        shown.push(notification)
        live.push(notification)
      }),
      getNotifications: vi.fn(async ({ tag } = {}) =>
        live.filter((n) => tag == null || n.tag === tag),
      ),
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

  const state = async (key) => {
    const store = caches.stores.get('fitit-state')
    const hit = store?.get(`/__fitit/${key}`)
    return hit ? JSON.parse(hit.body) : undefined
  }

  return { self, caches, shown, live, dispatch, state, fetch }
}

const REST = {
  endsAt: 0, // filled in per test, relative to the frozen clock
  seconds: 90,
  workoutId: 7,
  label: 'Press banca · 60 kg x 8',
  payload: { exercise_name: 'Press banca', reps: 8, weight: 60 },
  token: 'jwt-123',
  pending: 0,
  series: 3,
}

const restNow = (overrides = {}) => ({ ...REST, endsAt: Date.now() + 90_000, ...overrides })

describe('the rest notification', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 25, 18, 40, 0))
  })

  afterEach(() => vi.useRealTimers())

  it('puts a +1 serie button on the lock screen the moment a set is logged', async () => {
    const worker = bootWorker()

    worker.dispatch('message', { data: { type: 'rest-start', rest: restNow() } })
    await vi.advanceTimersByTimeAsync(0)

    const [notice] = worker.shown
    // The end time, not a countdown: this text is written once and can sit on a
    // locked phone for ten minutes.
    expect(notice.title).toBe('Descanso hasta las 18:41')
    expect(notice.body).toContain('Press banca · 60 kg x 8')
    expect(notice.actions.map((a) => a.title)).toEqual(['+1 serie', 'Saltar'])
    // Every set puts this on screen, so it arrives without a sound.
    expect(notice.silent).toBe(true)
  })

  it('buzzes when the rest is actually over', async () => {
    const worker = bootWorker()

    const running = worker.dispatch('message', { data: { type: 'rest-start', rest: restNow() } })
    await vi.advanceTimersByTimeAsync(90_000)
    await running

    expect(worker.shown).toHaveLength(2)
    expect(worker.shown[1].title).toBe('Descanso terminado')
    expect(worker.shown[1].silent).toBe(false)
    expect(worker.shown[1].vibrate).toBeTruthy()
  })

  it('does not ring for a rest that a newer set already replaced', async () => {
    const worker = bootWorker()

    worker.dispatch('message', { data: { type: 'rest-start', rest: restNow() } })
    await vi.advanceTimersByTimeAsync(30_000)
    worker.dispatch('message', { data: { type: 'rest-start', rest: restNow() } })
    await vi.advanceTimersByTimeAsync(90_000)

    // Two rests started, one "terminado" — the first one's alarm would have
    // gone off a minute into the second one's countdown.
    expect(worker.shown.filter((n) => n.title === 'Descanso terminado')).toHaveLength(1)
  })

  it('the same rest sent twice is an update, not a second countdown', async () => {
    // The page sends it again once its own outbox has drained, so the worker
    // knows whether it may send. That must not buy a second alarm.
    const worker = bootWorker()
    const rest = restNow()

    worker.dispatch('message', { data: { type: 'rest-start', rest } })
    await vi.advanceTimersByTimeAsync(0)
    worker.dispatch('message', { data: { type: 'rest-start', rest: { ...rest, pending: 0 } } })
    await vi.advanceTimersByTimeAsync(90_000)

    expect(worker.shown.filter((n) => n.title === 'Descanso terminado')).toHaveLength(1)
  })

  it('skipping clears the rest and takes the notification off the screen', async () => {
    const worker = bootWorker()
    worker.dispatch('message', { data: { type: 'rest-start', rest: restNow() } })
    await vi.advanceTimersByTimeAsync(0)

    const close = vi.fn()
    await worker.dispatch('notificationclick', {
      action: 'skip',
      notification: { close },
    })

    expect(close).toHaveBeenCalled()
    expect(await worker.state('rest')).toBeNull()
    await vi.advanceTimersByTimeAsync(90_000)
    expect(worker.shown.some((n) => n.title === 'Descanso terminado')).toBe(false)
  })

  it('tapping the body opens the session rather than logging anything', async () => {
    const focus = vi.fn()
    const worker = bootWorker({ clients: [{ focus, postMessage: vi.fn() }] })
    worker.dispatch('message', { data: { type: 'rest-start', rest: restNow() } })
    await vi.advanceTimersByTimeAsync(0)

    await worker.dispatch('notificationclick', { notification: { close: vi.fn() } })

    expect(focus).toHaveBeenCalled()
    expect(await worker.state('queue')).toBeUndefined()
  })
})

describe('+1 serie, from the lock screen', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 25, 18, 40, 0))
  })

  afterEach(() => vi.useRealTimers())

  async function resting(options = {}) {
    const worker = bootWorker(options)
    worker.dispatch('message', {
      data: { type: 'rest-start', rest: restNow(options.rest ?? {}) },
    })
    await vi.advanceTimersByTimeAsync(0)
    return worker
  }

  it('sends the repeat of the set you just did', async () => {
    const fetch = vi.fn().mockResolvedValue(new FakeResponse('{}'))
    const worker = await resting({ fetch })

    worker.dispatch('notificationclick', { action: 'log' })
    await vi.advanceTimersByTimeAsync(0)

    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('/api/workouts/7/sets')
    expect(options.headers.Authorization).toBe('Bearer jwt-123')
    expect(JSON.parse(options.body)).toEqual(REST.payload)
    expect(await worker.state('queue')).toEqual([])
    expect(await worker.state('sent')).toBe(1)
  })

  it('writes the set to disk before it goes anywhere near the network', async () => {
    // Same order the page uses: a set you have already done must not depend on
    // a request succeeding right now.
    let queueWhenSent
    const fetch = vi.fn().mockImplementation(async () => {
      queueWhenSent = await worker.state('queue')
      return new FakeResponse('{}')
    })
    const worker = await resting({ fetch })

    worker.dispatch('notificationclick', { action: 'log' })
    await vi.advanceTimersByTimeAsync(0)

    expect(queueWhenSent).toHaveLength(1)
    expect(queueWhenSent[0].payload).toEqual(REST.payload)
  })

  it('keeps the set and confirms it anyway with no signal', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const worker = await resting({ fetch })

    worker.dispatch('notificationclick', { action: 'log' })
    await vi.advanceTimersByTimeAsync(0)

    // On disk, and the lock screen says the set counted — because it did.
    expect(await worker.state('queue')).toHaveLength(1)
    const receipt = worker.shown[worker.shown.length - 1]
    expect(receipt.body).toContain('4 series')
    expect(receipt.renotify).toBe(true)
  })

  it('restarts the rest, the same as logging in the app does', async () => {
    const worker = await resting({ fetch: vi.fn().mockResolvedValue(new FakeResponse('{}')) })

    await vi.advanceTimersByTimeAsync(60_000)
    worker.dispatch('notificationclick', { action: 'log' })
    await vi.advanceTimersByTimeAsync(0)

    // 18:41:00 + 90s: the clock starts over on the tap, it doesn't inherit the
    // 30 seconds left from the rest you interrupted.
    expect(worker.shown[worker.shown.length - 1].title).toBe('Descanso hasta las 18:42')
  })

  it('says so, out loud, when the server refuses the set', async () => {
    // The one case where a set really is gone — and there is nobody looking at
    // a screen to notice it.
    const fetch = vi.fn().mockResolvedValue(new FakeResponse('{}', { status: 422 }))
    const worker = await resting({ fetch })

    worker.dispatch('notificationclick', { action: 'log' })
    await vi.advanceTimersByTimeAsync(0)

    expect(await worker.state('queue')).toEqual([])
    expect(worker.shown.some((n) => /rechazó una serie/.test(n.body))).toBe(true)
  })

  it('keeps a set the server was merely too busy for', async () => {
    const fetch = vi.fn().mockResolvedValue(new FakeResponse('{}', { status: 503 }))
    const worker = await resting({ fetch })

    worker.dispatch('notificationclick', { action: 'log' })
    await vi.advanceTimersByTimeAsync(0)

    expect(await worker.state('queue')).toHaveLength(1)
  })

  it('waits its turn when the app still has unsent sets of its own', async () => {
    // set_index is assigned server-side in arrival order. The page's queue is
    // older, so sending from here first would reorder the session.
    const fetch = vi.fn().mockResolvedValue(new FakeResponse('{}'))
    const worker = await resting({ fetch, rest: { pending: 2 } })

    worker.dispatch('notificationclick', { action: 'log' })
    await vi.advanceTimersByTimeAsync(0)

    expect(fetch).not.toHaveBeenCalled()
    expect(await worker.state('queue')).toHaveLength(1)
  })

  it('hands the unsent sets to the app when it comes back', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const worker = await resting({ fetch })
    worker.dispatch('notificationclick', { action: 'log' })
    await vi.advanceTimersByTimeAsync(0)

    const port = { postMessage: vi.fn() }
    await worker.dispatch('message', { data: { type: 'claim' }, ports: [port] })

    const [handed] = port.postMessage.mock.calls[0]
    expect(handed.queued).toHaveLength(1)
    expect(handed.queued[0].payload).toEqual(REST.payload)
    // Handed over means gone from here: the page owns them now, and two owners
    // is how one set gets logged twice.
    expect(await worker.state('queue')).toEqual([])
  })

  it('tells the app how many sets went out without it', async () => {
    const fetch = vi.fn().mockResolvedValue(new FakeResponse('{}'))
    const worker = await resting({ fetch })
    worker.dispatch('notificationclick', { action: 'log' })
    await vi.advanceTimersByTimeAsync(0)

    const port = { postMessage: vi.fn() }
    await worker.dispatch('message', { data: { type: 'claim' }, ports: [port] })

    // Nothing to absorb, but the session on screen is a set out of date.
    expect(port.postMessage.mock.calls[0][0]).toEqual({ queued: [], sent: 1 })
  })

  it('wakes a live app so the row appears there too', async () => {
    const postMessage = vi.fn()
    const worker = await resting({
      fetch: vi.fn().mockResolvedValue(new FakeResponse('{}')),
      clients: [{ postMessage, focus: vi.fn() }],
    })

    worker.dispatch('notificationclick', { action: 'log' })
    await vi.advanceTimersByTimeAsync(0)

    // The deadline rides along so the app's own rest bar follows the tap.
    expect(postMessage).toHaveBeenCalledWith({
      type: 'sets-logged',
      endsAt: Date.now() + 90_000,
    })
  })
})

describe('the shell cache', () => {
  it('purges old builds without taking the queued sets with them', async () => {
    const worker = bootWorker()
    await worker.caches.open('fitit-v2')
    await worker.caches.open('fitit-state')
    await worker.caches.open('fitit-v3')

    await worker.dispatch('activate')

    expect([...worker.caches.stores.keys()].sort()).toEqual(['fitit-state', 'fitit-v3'])
  })
})
