import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Las ramas del APK. `isNative` se fuerza a `true` y los plugins se sustituyen
// por dobles: aquí se comprueba que cada módulo llama al plugin que toca, no
// que el plugin funcione — eso sólo se ve en un teléfono.

vi.mock('./native.js', () => ({ isNative: vi.fn(() => true) }))
vi.mock('@capacitor-community/keep-awake', () => ({
  KeepAwake: {
    keepAwake: vi.fn(() => Promise.resolve()),
    allowSleep: vi.fn(() => Promise.resolve()),
  },
}))
vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn(), minimizeApp: vi.fn() },
}))
vi.mock('@capgo/capacitor-social-login', () => ({
  SocialLogin: { initialize: vi.fn(() => Promise.resolve()), login: vi.fn() },
}))

import { App } from '@capacitor/app'
import { KeepAwake } from '@capacitor-community/keep-awake'
import { SocialLogin } from '@capgo/capacitor-social-login'

import { handleBackButton } from './backButton.js'
import { showGoogleSignIn } from './googleIdentity.js'
import { notificationState, startRestNotice } from './notify.js'
import { registerServiceWorker } from './serviceWorker.js'
import { holdScreenAwake } from './wakelock.js'

describe('platform/ dentro del APK', () => {
  beforeEach(() => vi.clearAllMocks())

  it('la pantalla la sujeta Android y se suelta al acabar', () => {
    const release = holdScreenAwake()
    expect(KeepAwake.keepAwake).toHaveBeenCalledTimes(1)
    release()
    expect(KeepAwake.allowSleep).toHaveBeenCalledTimes(1)
  })

  it('no registra el service worker', () => {
    const register = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register },
      configurable: true,
    })
    const on = vi.spyOn(window, 'addEventListener')
    registerServiceWorker()
    expect(on).not.toHaveBeenCalledWith('load', expect.any(Function))
    delete navigator.serviceWorker
  })

  it('el aviso de pantalla de bloqueo no existe todavía, y no se queda esperando', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: new Promise(() => {}) },
      configurable: true,
    })
    expect(notificationState()).toBe('unsupported')
    await expect(startRestNotice({})).resolves.toMatchObject({ ok: false })
    delete navigator.serviceWorker
  })

  it('atrás vuelve si hay historial y, si no, manda la app al fondo', () => {
    handleBackButton()
    const [event, listener] = App.addListener.mock.calls[0]
    expect(event).toBe('backButton')

    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    listener({ canGoBack: true })
    expect(back).toHaveBeenCalled()

    listener({ canGoBack: false })
    expect(App.minimizeApp).toHaveBeenCalled()
  })

  describe('Continuar con Google', () => {
    let slot
    beforeEach(() => {
      slot = document.createElement('div')
      document.body.append(slot)
    })
    afterEach(() => slot.remove())

    function show(onCredential) {
      return showGoogleSignIn({
        clientId: 'web-client.apps.googleusercontent.com',
        slot: () => slot,
        isLive: () => true,
        onCredential,
      })
    }

    it('pinta un botón propio y entrega el ID token del selector de Android', async () => {
      SocialLogin.login.mockResolvedValue({ provider: 'google', result: { idToken: 'jwt' } })
      const onCredential = vi.fn()
      show(onCredential)

      const button = slot.querySelector('button')
      expect(button.textContent).toBe('Continuar con Google')
      button.click()

      await vi.waitFor(() => expect(onCredential).toHaveBeenCalledWith('jwt'))
      // El ID de cliente web: es la audiencia que el backend ya comprueba.
      expect(SocialLogin.initialize).toHaveBeenCalledWith({
        google: { webClientId: 'web-client.apps.googleusercontent.com' },
      })
    })

    it('cerrar el selector no cuenta como fallo', async () => {
      SocialLogin.login.mockRejectedValue({ code: 'USER_CANCELLED' })
      const onCredential = vi.fn()
      show(onCredential)
      slot.querySelector('button').click()
      await vi.waitFor(() => expect(SocialLogin.login).toHaveBeenCalled())
      await Promise.resolve()
      expect(onCredential).not.toHaveBeenCalled()
    })

    it('un fallo del selector llega como credencial vacía, para que salga el aviso', async () => {
      SocialLogin.login.mockRejectedValue(new Error('no android client'))
      const onCredential = vi.fn()
      show(onCredential)
      slot.querySelector('button').click()
      await vi.waitFor(() => expect(onCredential).toHaveBeenCalledWith(null))
    })
  })
})
