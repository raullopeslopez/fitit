// Keeping the screen on while a session is open.
//
// A phone that locks itself between sets costs a wake, an unlock and a hunt for
// the card — the pocket-to-card trip that is the most expensive thing left in
// logging a set. The screen staying lit removes it outright while you are
// standing at the rack.
//
// The lock is not something you take once. Android hands it back the moment the
// tab is hidden or the screen is turned off by hand, and a hidden page is not
// allowed to ask for it again — so the only thing to do is take it again on the
// way back.

import { KeepAwake } from '@capacitor-community/keep-awake'

import { isNative } from './native.js'

// Holds a screen wake lock until the returned function is called. Safe to call
// on any browser: with no Wake Lock API this is an expensive no-op and the
// session behaves exactly as it did before.
export function holdScreenAwake() {
  if (isNative()) return holdNatively()

  let sentinel = null
  let held = true

  async function take() {
    if (!held || sentinel) return
    if (!navigator.wakeLock?.request) return
    try {
      const lock = await navigator.wakeLock.request('screen')
      // Released while the browser was deciding: drop it now, or the screen
      // stays lit for a session that is already over.
      if (!held) {
        lock.release?.()
        return
      }
      sentinel = lock
      lock.addEventListener?.('release', () => {
        if (sentinel === lock) sentinel = null
      })
    } catch {
      // Low battery, no user gesture, not a secure context. All real, all
      // outside the session's control, and none of them worth a message: the
      // workout logs fine with the screen going dark, just slower.
    }
  }

  function onVisible() {
    if (document.visibilityState === 'visible') {
      take()
      return
    }
    // Hidden means the platform has already taken the lock back, whether or not
    // it got round to firing `release`. Letting go of the sentinel here is what
    // makes the next `take()` actually ask for a new one instead of deciding it
    // is still holding a lock that stopped existing.
    sentinel = null
  }

  document.addEventListener('visibilitychange', onVisible)
  take()

  return function release() {
    held = false
    document.removeEventListener('visibilitychange', onVisible)
    sentinel?.release?.()
    sentinel = null
  }
}

// Dentro del APK la pantalla la sujeta Android (`FLAG_KEEP_SCREEN_ON`), y la
// ventana la conserva aunque se oculte y vuelva: no hay que volver a pedirla.
function holdNatively() {
  KeepAwake.keepAwake().catch(() => {})
  return function release() {
    KeepAwake.allowSleep().catch(() => {})
  }
}
