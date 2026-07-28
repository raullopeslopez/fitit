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
  // No wording on the wire: the worker writes it from the set, because it has
  // to rewrite it anyway the moment a different set is typed in.
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
    // Two slots is all Android gives, so the second one is the text field
    // rather than a Saltar the swipe already does.
    expect(notice.actions.map((a) => a.title)).toEqual(['+1 serie', 'Otra serie'])
    expect(notice.actions[1]).toMatchObject({ type: 'text', placeholder: '32.5x12' })
    // Never silent: Android files a silent notification away from the lock
    // screen on several skins, which is the one place this has to be. The quiet
    // comes from `renotify` instead — a replacement under the same tag does not
    // re-alert, so it sounds once a session and then updates without a peep.
    expect(notice.silent).toBeUndefined()
    expect(notice.renotify).toBe(false)
    // The badge is not the app icon: Android keeps only its silhouette, and a
    // full-bleed square silhouettes as a grey block with no F in it.
    expect(notice.icon).toBe('/icon-192.png')
    expect(notice.badge).toBe('/badge-96.png')
  })

  it('buzzes when the rest is actually over', async () => {
    const worker = bootWorker()

    const running = worker.dispatch('message', { data: { type: 'rest-start', rest: restNow() } })
    await vi.advanceTimersByTimeAsync(90_000)
    await running

    expect(worker.shown).toHaveLength(2)
    expect(worker.shown[1].title).toBe('Descanso terminado')
    // This one has earned the right to interrupt, so it asks to be re-alerted
    // even though it is replacing a notification already on screen.
    expect(worker.shown[1].renotify).toBe(true)
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

  describe('with no rest to count', () => {
    const untimed = (overrides = {}) => ({ ...REST, endsAt: null, seconds: 0, ...overrides })

    it('stands as a plain remote: the exercise leads, no clock at all', async () => {
      // Not timing your rests must not cost you the lock screen.
      const worker = bootWorker()

      worker.dispatch('message', { data: { type: 'rest-start', rest: untimed() } })
      await vi.advanceTimersByTimeAsync(0)

      const [notice] = worker.shown
      expect(notice.title).toBe('Press banca')
      expect(notice.body).toBe('60 kg x 8\n3 series')
      expect(notice.actions.map((a) => a.title)).toEqual(['+1 serie', 'Otra serie'])
      expect(notice.timestamp).toBeUndefined()
    })

    it('never rings, because nothing is counting down', async () => {
      const worker = bootWorker()

      const running = worker.dispatch('message', { data: { type: 'rest-start', rest: untimed() } })
      await vi.advanceTimersByTimeAsync(600_000)
      await running

      expect(worker.shown).toHaveLength(1)
    })

    it('keeps the clock off after a set logged from the notification', async () => {
      const fetch = vi.fn().mockResolvedValue(new FakeResponse('{}'))
      const worker = bootWorker({ fetch })
      worker.dispatch('message', { data: { type: 'rest-start', rest: untimed() } })
      await vi.advanceTimersByTimeAsync(0)

      worker.dispatch('notificationclick', { action: 'log' })
      await vi.advanceTimersByTimeAsync(0)

      expect((await worker.state('rest')).endsAt).toBeNull()
      const receipt = worker.shown[worker.shown.length - 1]
      expect(receipt.title).toBe('Press banca')
      expect(receipt.body).toContain('4 series')
    })
  })

  describe('answering the app', () => {
    it('reports that the platform is holding the notification', async () => {
      const worker = bootWorker()
      const port = { postMessage: vi.fn() }

      worker.dispatch('message', { data: { type: 'rest-start', rest: restNow() }, ports: [port] })
      await vi.advanceTimersByTimeAsync(0)

      expect(port.postMessage).toHaveBeenCalledWith({ ok: true, shown: 1 })
    })

    it('reports a platform that took it and kept nothing', async () => {
      // The worker did everything right and Android dropped it anyway. From
      // the app that used to look exactly like the worker never running.
      const worker = bootWorker()
      worker.self.registration.getNotifications = vi.fn(async () => [])
      const port = { postMessage: vi.fn() }

      worker.dispatch('message', { data: { type: 'rest-start', rest: restNow() }, ports: [port] })
      await vi.advanceTimersByTimeAsync(0)

      expect(port.postMessage).toHaveBeenCalledWith({ ok: true, shown: 0 })
    })

    it('reports a refusal instead of dying quietly inside the worker', async () => {
      const worker = bootWorker()
      worker.self.registration.showNotification = vi.fn(async () => {
        throw new TypeError('no está permitido')
      })
      const port = { postMessage: vi.fn() }

      worker.dispatch('message', { data: { type: 'rest-start', rest: restNow() }, ports: [port] })
      await vi.advanceTimersByTimeAsync(0)

      expect(port.postMessage).toHaveBeenCalledWith({ ok: false, error: 'no está permitido' })
    })

    it('still works for a page that is not listening', async () => {
      const worker = bootWorker()

      worker.dispatch('message', { data: { type: 'rest-start', rest: restNow() } })
      await vi.advanceTimersByTimeAsync(0)

      expect(worker.shown).toHaveLength(1)
    })
  })

  // Verified on the user's Xiaomi: MIUI draws on a locked screen what *arrives*
  // while locked, and redraws nothing that was already in the shade. The
  // end-of-rest alert reached the lock screen for that reason alone; the one
  // born when you tapped Registrar never did.
  describe('arriving again when the phone is pocketed', () => {
    it('re-announces the notification so it lands on a locked screen', async () => {
      const worker = bootWorker()
      worker.dispatch('message', { data: { type: 'rest-start', rest: restNow() } })
      await vi.advanceTimersByTimeAsync(0)

      await worker.dispatch('message', { data: { type: 'rest-announce' } })

      const again = worker.shown[worker.shown.length - 1]
      expect(worker.shown).toHaveLength(2)
      expect(again.renotify).toBe(true)
      expect(again.title).toBe('Descanso hasta las 18:41')
      // Same tag, so it replaces rather than piling a second card on the screen.
      expect(again.tag).toBe(worker.shown[0].tag)
    })

    it('works for a session with no rest at all, which is the case that needed it', async () => {
      const worker = bootWorker()
      const untimed = { ...REST, endsAt: null, seconds: 0 }
      worker.dispatch('message', { data: { type: 'rest-start', rest: untimed } })
      await vi.advanceTimersByTimeAsync(0)

      await worker.dispatch('message', { data: { type: 'rest-announce' } })

      expect(worker.shown[1].title).toBe('Press banca')
      expect(worker.shown[1].renotify).toBe(true)
    })

    it('does not put a deadline back on screen that already passed', async () => {
      const worker = bootWorker()
      const running = worker.dispatch('message', { data: { type: 'rest-start', rest: restNow() } })
      await vi.advanceTimersByTimeAsync(90_000)
      await running

      await worker.dispatch('message', { data: { type: 'rest-announce' } })

      expect(worker.shown[worker.shown.length - 1].title).toBe('Descanso terminado')
    })

    it('has nothing to announce outside a session', async () => {
      const worker = bootWorker()

      await worker.dispatch('message', { data: { type: 'rest-announce' } })

      expect(worker.shown).toHaveLength(0)
    })
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

  it('the app skipping clears the rest and takes the notification off the screen', async () => {
    const worker = bootWorker()
    worker.dispatch('message', { data: { type: 'rest-start', rest: restNow() } })
    await vi.advanceTimersByTimeAsync(0)

    await worker.dispatch('message', { data: { type: 'rest-stop' } })

    expect(worker.live.every((n) => n.close.mock.calls.length > 0)).toBe(true)
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

  it('logs the weight and reps typed into the notification', async () => {
    // Pyramids and drop sets: the load changes, and the trip to the pocket was
    // exactly what this is for.
    const fetch = vi.fn().mockResolvedValue(new FakeResponse('{}'))
    const worker = await resting({ fetch })

    worker.dispatch('notificationclick', { action: 'custom', reply: '32.5x12' })
    await vi.advanceTimersByTimeAsync(0)

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      exercise_name: 'Press banca',
      reps: 12,
      weight: 32.5,
    })
    expect(worker.shown[worker.shown.length - 1].body).toContain('Press banca · 32.5 kg x 12')
  })

  it.each([
    ['32,5 x 12', 32.5, 12],
    ['32.5 12', 32.5, 12],
    ['30kg x 8', 30, 8],
    ['  60X5  ', 60, 5],
  ])('reads "%s" as the set you meant', async (reply, weight, reps) => {
    // One field, typed one-handed on a lock screen. Every shape of the same
    // sentence is the same set; being strict here just loses the set.
    const fetch = vi.fn().mockResolvedValue(new FakeResponse('{}'))
    const worker = await resting({ fetch })

    worker.dispatch('notificationclick', { action: 'custom', reply })
    await vi.advanceTimersByTimeAsync(0)

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ weight, reps })
    expect(worker.shown.some((n) => /No entendí/.test(n.body ?? ''))).toBe(false)
  })

  it.each(['', 'un poco', '12', '30 x 0', '30 x 8.5', '-5 x 8'])(
    'refuses "%s" and says what it wanted, without losing the rest',
    async (reply) => {
      const fetch = vi.fn().mockResolvedValue(new FakeResponse('{}'))
      const worker = await resting({ fetch })

      worker.dispatch('notificationclick', { action: 'custom', reply })
      await vi.advanceTimersByTimeAsync(0)

      // Nothing invented, nothing queued — and the countdown is untouched, so
      // the +1 button is still there to fall back on.
      expect(fetch).not.toHaveBeenCalled()
      expect(await worker.state('queue')).toBeUndefined()
      expect(worker.shown.some((n) => /No entendí/.test(n.body ?? ''))).toBe(true)
      expect((await worker.state('rest')).series).toBe(3)
    },
  )

  // Fondos and dominadas carry no weight, so the lock screen has no kilos to
  // print and the text field has nothing to disambiguate: a lone number can
  // only be reps. Spec: backend/tests/features/bodyweight_set.feature
  it('reads a lone number as reps when the set carries no weight', async () => {
    const fetch = vi.fn().mockResolvedValue(new FakeResponse('{}'))
    const worker = await resting({
      fetch,
      rest: { payload: { exercise_name: 'Fondos', reps: 12, weight: null } },
    })

    const [notice] = worker.shown
    expect(notice.body).toContain('Fondos · Corporal x 12')
    expect(notice.actions[1]).toMatchObject({ placeholder: '15' })

    worker.dispatch('notificationclick', { action: 'custom', reply: '15' })
    await vi.advanceTimersByTimeAsync(0)

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      exercise_name: 'Fondos',
      reps: 15,
      weight: null,
    })
  })

  it('makes the typed set the one +1 serie repeats from then on', async () => {
    // You are on the way down a drop set: the next repeat is the weight you
    // just typed, not the one you started the pyramid with.
    const fetch = vi.fn().mockResolvedValue(new FakeResponse('{}'))
    const worker = await resting({ fetch })

    worker.dispatch('notificationclick', { action: 'custom', reply: '25x15' })
    await vi.advanceTimersByTimeAsync(0)
    worker.dispatch('notificationclick', { action: 'log' })
    await vi.advanceTimersByTimeAsync(0)

    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ weight: 25, reps: 15 })
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
