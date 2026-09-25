import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  blockedNotice,
  announceRestNotice,
  askForNotifications,
  claimLockScreenSets,
  notificationState,
  onLockScreenSets,
  startRestNotice,
  stopRestNotice,
} from './notify.js'

// A service worker registration that answers `claim` the way public/sw.js does.
function mockWorker({
  active = true,
  reply = { queued: [], sent: 0 },
  restReply = { ok: true, shown: 1 },
  answers = true,
} = {}) {
  const posted = []
  const activeWorker = {
    postMessage: (message, transfer) => {
      posted.push(message)
      if (!answers) return
      if (message.type === 'claim') transfer?.[0]?.postMessage(reply)
      if (message.type === 'rest-start') transfer?.[0]?.postMessage(restReply)
    },
  }
  const listeners = []
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({ active: active ? activeWorker : null }),
      addEventListener: (type, fn) => listeners.push([type, fn]),
      removeEventListener: (type, fn) => {
        const at = listeners.findIndex(([t, f]) => t === type && f === fn)
        if (at >= 0) listeners.splice(at, 1)
      },
    },
  })
  return { posted, emit: (data) => listeners.forEach(([, fn]) => fn({ data })), listeners }
}

function mockPermission(permission, request) {
  globalThis.Notification = { permission, requestPermission: request }
}

afterEach(() => {
  delete navigator.serviceWorker
  delete globalThis.Notification
  vi.useRealTimers()
})

describe('permission', () => {
  it('a blocked permission is the browser’s to give back', () => {
    expect(blockedNotice()).toBe('Bloqueado en el navegador.')
  })

  it('reports a browser that cannot do this at all', () => {
    expect(notificationState()).toBe('unsupported')
  })

  it('reports what the user already answered', () => {
    mockWorker()
    mockPermission('denied')
    expect(notificationState()).toBe('denied')
  })

  it('asks, and says whether it got a yes', async () => {
    mockWorker()
    mockPermission('default', vi.fn().mockResolvedValue('granted'))
    await expect(askForNotifications()).resolves.toBe(true)

    mockPermission('default', vi.fn().mockResolvedValue('denied'))
    await expect(askForNotifications()).resolves.toBe(false)
  })

  it('a browser that throws instead of asking is just a no', async () => {
    mockWorker()
    mockPermission('default', vi.fn().mockRejectedValue(new Error('nope')))
    await expect(askForNotifications()).resolves.toBe(false)
  })
})

describe('handing the rest over to the worker', () => {
  const rest = { endsAt: 1, seconds: 90, workoutId: 7, payload: {}, token: 't', pending: 0 }

  it('sends the rest, and everything the tap will need with it', async () => {
    const worker = mockWorker()

    await startRestNotice(rest)

    expect(worker.posted).toEqual([{ type: 'rest-start', rest }])
  })

  it('sends the stop when the rest is skipped or the session is left', async () => {
    const worker = mockWorker()

    await stopRestNotice()

    expect(worker.posted).toEqual([{ type: 'rest-stop' }])
  })

  it('asks the worker to say it again when the phone is being pocketed', async () => {
    const worker = mockWorker()

    await announceRestNotice()

    expect(worker.posted).toEqual([{ type: 'rest-announce' }])
  })

  it('brings back what the worker made of it', async () => {
    // Everything this feature does happens where the app cannot see it, so
    // "posted the message" is not evidence of anything.
    mockWorker({ restReply: { ok: true, shown: 1 } })

    await expect(startRestNotice(rest)).resolves.toEqual({ ok: true, shown: 1 })
  })

  it('brings back the failure too, as a sentence', async () => {
    mockWorker({ restReply: { ok: false, error: 'permission denied' } })

    await expect(startRestNotice(rest)).resolves.toEqual({
      ok: false,
      error: 'permission denied',
    })
  })

  it('says so when there is no worker to talk to', async () => {
    await expect(startRestNotice(rest)).resolves.toMatchObject({ ok: false })
    mockWorker({ active: false })
    await expect(startRestNotice(rest)).resolves.toEqual({
      ok: false,
      error: 'el service worker no está activo',
    })
  })

  it('says so when the worker takes the message and never answers', async () => {
    vi.useFakeTimers()
    mockWorker({ answers: false })

    const asked = startRestNotice(rest)
    await vi.advanceTimersByTimeAsync(3000)

    await expect(asked).resolves.toEqual({
      ok: false,
      error: 'el service worker no responde',
    })
  })
})

describe('claiming the sets logged from the lock screen', () => {
  it('hands back what the worker is holding', async () => {
    const queued = [{ tmpId: 'sw-1', workoutId: 7, payload: { reps: 8 } }]
    mockWorker({ reply: { queued, sent: 2 } })

    await expect(claimLockScreenSets()).resolves.toEqual({ queued, sent: 2 })
  })

  it('gives up rather than hanging the screen you are logging into', async () => {
    vi.useFakeTimers()
    mockWorker({ answers: false })

    const claim = claimLockScreenSets(2000)
    await vi.advanceTimersByTimeAsync(2000)

    // Nothing is lost by giving up: the sets stay on the worker's side and the
    // next claim picks them up.
    await expect(claim).resolves.toEqual({ queued: [], sent: 0 })
  })

  it('answers empty on a browser with no service worker', async () => {
    await expect(claimLockScreenSets()).resolves.toEqual({ queued: [], sent: 0 })
  })
})

describe('the worker shouting back', () => {
  it('calls the handler when a set is logged behind the app', () => {
    const worker = mockWorker()
    const onSets = vi.fn()

    const stop = onLockScreenSets(onSets)
    worker.emit({ type: 'sets-logged' })
    worker.emit({ type: 'something-else' })

    expect(onSets).toHaveBeenCalledTimes(1)
    stop()
    expect(worker.listeners).toHaveLength(0)
  })

  it('unsubscribes cleanly on a browser with no service worker', () => {
    expect(() => onLockScreenSets(vi.fn())()).not.toThrow()
  })
})
