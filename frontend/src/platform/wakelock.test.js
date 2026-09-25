import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { holdScreenAwake } from './wakelock.js'

// A stand-in for the sentinel the browser hands back, plus the `release` event
// it fires when the platform takes the lock away (screen off, tab hidden).
function fakeSentinel() {
  const listeners = []
  return {
    released: false,
    release: vi.fn(function release() {
      this.released = true
    }),
    addEventListener: (type, fn) => listeners.push([type, fn]),
    fire: (type) => listeners.filter(([t]) => t === type).forEach(([, fn]) => fn()),
  }
}

function mockWakeLock(request) {
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
}

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('holding the screen awake', () => {
  // Every hold in this file is let go afterwards: a leftover one stays
  // subscribed to visibilitychange and would take the *next* test's mock lock.
  const holds = []
  const hold = () => {
    const release = holdScreenAwake()
    holds.push(release)
    return release
  }

  beforeEach(() => setVisibility('visible'))

  afterEach(() => {
    holds.splice(0).forEach((release) => release())
    delete navigator.wakeLock
  })

  it('takes a screen lock while the session is open', async () => {
    const request = vi.fn().mockResolvedValue(fakeSentinel())
    mockWakeLock(request)

    hold()
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('screen'))
  })

  it('takes it again when the app comes back and the phone had dropped it', async () => {
    // Android releases the lock whenever the tab is hidden, and a hidden page
    // is not allowed to ask for it again — so the only moment to re-take it is
    // on the way back. Without this, one glance at WhatsApp mid-session leaves
    // the screen sleeping for the rest of the workout.
    const request = vi.fn().mockImplementation(async () => fakeSentinel())
    mockWakeLock(request)

    hold()
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))

    setVisibility('hidden')
    setVisibility('visible')
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  })

  it('does not stack locks while one is still held', async () => {
    const request = vi.fn().mockResolvedValue(fakeSentinel())
    mockWakeLock(request)

    hold()
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))

    setVisibility('visible')
    setVisibility('visible')
    await new Promise((r) => setTimeout(r, 0))
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('releases on the way out and stops taking it again', async () => {
    const sentinel = fakeSentinel()
    const request = vi.fn().mockResolvedValue(sentinel)
    mockWakeLock(request)

    const release = hold()
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    release()

    expect(sentinel.release).toHaveBeenCalled()
    setVisibility('hidden')
    setVisibility('visible')
    await new Promise((r) => setTimeout(r, 0))
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('leaving mid-request does not strand a lock nobody will drop', async () => {
    // Walking out of the session while the browser is still deciding: the
    // sentinel arrives after the release, with nothing left holding it.
    const sentinel = fakeSentinel()
    let hand = null
    mockWakeLock(() => new Promise((resolve) => (hand = resolve)))

    const release = hold()
    await vi.waitFor(() => expect(hand).not.toBeNull())
    release()
    hand(sentinel)
    await new Promise((r) => setTimeout(r, 0))

    expect(sentinel.release).toHaveBeenCalled()
  })

  it('a browser that refuses is not an error the lifter can act on', async () => {
    // Low battery, no user gesture, not a secure context — all real, all
    // outside the session's control. The workout works without the lock.
    mockWakeLock(vi.fn().mockRejectedValue(new Error('NotAllowedError')))

    const release = hold()
    await new Promise((r) => setTimeout(r, 0))
    expect(() => release()).not.toThrow()
  })

  it('survives a browser with no Wake Lock at all', () => {
    expect(() => hold()()).not.toThrow()
  })
})
