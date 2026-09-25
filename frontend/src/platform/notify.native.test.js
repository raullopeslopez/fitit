import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// El aviso del descanso dentro del APK. `isNative` se fuerza a `true` y el
// plugin es un doble: aquí se comprueba qué se le pide a Android (qué se
// programa, con qué botones, qué se quita al parar) y que un toque en
// «+1 serie» vuelve a la página con la forma que el service worker usaba.

vi.mock('./native.js', () => ({ isNative: vi.fn(() => true) }))

const listeners = {}
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    addListener: vi.fn((event, fn) => {
      listeners[event] = fn
      return Promise.resolve({ remove: () => {} })
    }),
    createChannel: vi.fn(() => Promise.resolve()),
    registerActionTypes: vi.fn(() => Promise.resolve()),
    checkPermissions: vi.fn(() => Promise.resolve({ display: 'granted' })),
    requestPermissions: vi.fn(() => Promise.resolve({ display: 'granted' })),
    checkExactNotificationSetting: vi.fn(() => Promise.resolve({ exact_alarm: 'granted' })),
    changeExactNotificationSetting: vi.fn(() => Promise.resolve({ exact_alarm: 'granted' })),
    schedule: vi.fn(() => Promise.resolve({ notifications: [] })),
    cancel: vi.fn(() => Promise.resolve()),
    removeDeliveredNotificationsById: vi.fn(() => Promise.resolve()),
    getDeliveredNotifications: vi.fn(() => Promise.resolve({ notifications: [{ id: 7301 }] })),
  },
}))

import { LocalNotifications } from '@capacitor/local-notifications'

import {
  announceRestNotice,
  askForNotifications,
  claimLockScreenSets,
  initNotifications,
  notificationState,
  onLockScreenSets,
  startRestNotice,
  stopRestNotice,
} from './notify.js'
import { END_ID, REST_ID, resetNativeForTests } from './notifyNative.js'

const NOW = new Date(2026, 8, 25, 19, 30, 0).getTime()

function rest(overrides = {}) {
  return {
    endsAt: NOW + 90_000,
    seconds: 90,
    workoutId: 42,
    token: 'secreto',
    pending: 0,
    series: 2,
    payload: { exercise_name: 'Press banca', weight: 60, reps: 8 },
    ...overrides,
  }
}

// Lo que se programó en la última llamada, por id.
function scheduled(call = -1) {
  const calls = LocalNotifications.schedule.mock.calls
  const { notifications } = calls.at(call)[0]
  return Object.fromEntries(notifications.map((n) => [n.id, n]))
}

// El primer `getDeliveredNotifications` de un `startRestNotice` es la pregunta
// «¿hay ya un aviso en la bandeja?».
function nothingShowing() {
  LocalNotifications.getDeliveredNotifications.mockResolvedValueOnce({ notifications: [] })
}

async function ready() {
  initNotifications()
  await vi.waitFor(() => expect(LocalNotifications.checkExactNotificationSetting).toHaveBeenCalled())
  await Promise.resolve()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  resetNativeForTests()
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('aviso del descanso en el APK', () => {
  it('al arrancar prepara los dos canales y el botón «+1 serie»', async () => {
    await ready()
    expect(LocalNotifications.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fitit-sesion', name: 'Sesión en curso', importance: 3 }),
    )
    expect(LocalNotifications.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fitit-fin-descanso', name: 'Fin del descanso', vibration: true }),
    )
    expect(LocalNotifications.registerActionTypes).toHaveBeenCalledWith({
      types: [
        {
          id: 'fitit-rest',
          actions: [
            { id: 'log', title: '+1 serie' },
            { id: 'custom', title: 'Otra serie', input: true },
          ],
        },
      ],
    })
    expect(listeners.localNotificationActionPerformed).toEqual(expect.any(Function))
  })

  it('el permiso se lee de Android y se sirve síncrono', async () => {
    LocalNotifications.checkPermissions.mockResolvedValueOnce({ display: 'prompt' })
    expect(notificationState()).toBe('default')
    await ready()
    expect(notificationState()).toBe('default')

    resetNativeForTests()
    await ready()
    expect(notificationState()).toBe('granted')
  })

  it('pedirlo pide también la alarma exacta si falta', async () => {
    LocalNotifications.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'denied' })
    await expect(askForNotifications()).resolves.toBe(true)
    expect(LocalNotifications.changeExactNotificationSetting).toHaveBeenCalled()
    expect(notificationState()).toBe('granted')
    LocalNotifications.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'granted' })
  })

  it('un no al permiso no abre Ajustes', async () => {
    LocalNotifications.requestPermissions.mockResolvedValueOnce({ display: 'denied' })
    await expect(askForNotifications()).resolves.toBe(false)
    expect(LocalNotifications.changeExactNotificationSetting).not.toHaveBeenCalled()
    expect(notificationState()).toBe('denied')
  })

  it('la primera serie publica la sesión y programa el fin, que vibra', async () => {
    await ready()
    nothingShowing()
    await expect(startRestNotice(rest())).resolves.toEqual({ ok: true, shown: 1 })

    const { [REST_ID]: session, [END_ID]: end } = scheduled()
    expect(session).toMatchObject({
      title: 'Descanso hasta las 19:31',
      body: 'Press banca · 60 kg x 8\n2 series',
      channelId: 'fitit-sesion',
      actionTypeId: 'fitit-rest',
    })
    expect(session.schedule).toBeUndefined()
    expect(end).toMatchObject({
      title: 'Descanso terminado',
      body: 'Press banca · 60 kg x 8\n2 series',
      channelId: 'fitit-fin-descanso',
      actionTypeId: 'fitit-rest',
      schedule: { at: new Date(NOW + 90_000), allowWhileIdle: true },
      isExactNotification: true,
    })
    // El token no se guarda en la notificación.
    expect(session.extra.rest.token).toBeUndefined()
    expect(end.extra.rest).toMatchObject({ workoutId: 42, seconds: 90 })
  })

  it('sin descanso queda el mando: el ejercicio de título y nada programado', async () => {
    await ready()
    nothingShowing()
    await startRestNotice(rest({ endsAt: null, payload: { exercise_name: 'Fondos', weight: null, reps: 12 } }))
    const list = scheduled()
    expect(list[REST_ID]).toMatchObject({ title: 'Fondos', body: 'Corporal x 12\n2 series' })
    expect(list[END_ID]).toBeUndefined()
    expect(LocalNotifications.cancel).toHaveBeenCalledWith({ notifications: [{ id: END_ID }] })
  })

  it('con la app delante y el aviso ya en la bandeja, la serie nueva espera a que se esconda', async () => {
    await ready()
    await startRestNotice(rest())
    const list = scheduled()
    expect(list[REST_ID]).toBeUndefined()
    expect(list[END_ID]).toBeDefined()

    await announceRestNotice()
    expect(scheduled()[REST_ID].title).toBe('Descanso hasta las 19:31')
  })

  it('con la app escondida se publica al momento', async () => {
    await ready()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await startRestNotice(rest())
    expect(scheduled()[REST_ID]).toBeDefined()
    visibility.mockRestore()
  })

  it('la misma serie entregada dos veces no vuelve a sonar', async () => {
    await ready()
    await startRestNotice(rest())
    await startRestNotice(rest({ pending: 3 }))
    expect(LocalNotifications.schedule).toHaveBeenCalledTimes(1)
  })

  it('no espera a un service worker que en el APK no existe', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: new Promise(() => {}) },
      configurable: true,
    })
    await ready()
    await expect(startRestNotice(rest())).resolves.toEqual({ ok: true, shown: 1 })
    await expect(claimLockScreenSets()).resolves.toEqual({ queued: [], sent: 0 })
    delete navigator.serviceWorker
  })

  it('si Android lo rechaza, lo dice', async () => {
    await ready()
    LocalNotifications.schedule.mockRejectedValueOnce(new Error('Notifications not enabled'))
    await expect(startRestNotice(rest())).resolves.toEqual({
      ok: false,
      error: 'Notifications not enabled',
    })
  })

  it('parar quita el aviso y el fin programado', async () => {
    await ready()
    await startRestNotice(rest())
    await stopRestNotice()
    expect(LocalNotifications.cancel).toHaveBeenLastCalledWith({
      notifications: [{ id: REST_ID }, { id: END_ID }],
    })
    expect(LocalNotifications.removeDeliveredNotificationsById).toHaveBeenLastCalledWith({
      ids: [REST_ID, END_ID],
    })
  })

  it('al esconderse la página el aviso vuelve a llegar, ya terminado si el tiempo pasó', async () => {
    await ready()
    await startRestNotice(rest())
    vi.setSystemTime(NOW + 120_000)
    await announceRestNotice()
    expect(scheduled()[REST_ID].title).toBe('Descanso terminado')
    expect(scheduled()[END_ID]).toBeUndefined()
  })

  describe('«+1 serie»', () => {
    it('entrega la serie a la página por la misma vía que el service worker', async () => {
      await ready()
      await startRestNotice(rest())
      const heard = vi.fn()
      const stop = onLockScreenSets(heard)

      vi.setSystemTime(NOW + 100_000)
      await listeners.localNotificationActionPerformed({
        actionId: 'log',
        notification: { id: END_ID, extra: { rest: {} } },
      })

      expect(heard).toHaveBeenCalledWith({ type: 'sets-logged', endsAt: NOW + 190_000 })
      const { queued, sent } = await claimLockScreenSets()
      expect(sent).toBe(0)
      expect(queued).toEqual([
        {
          tmpId: expect.stringMatching(/^nt-/),
          workoutId: 42,
          payload: {
            exercise_name: 'Press banca',
            weight: 60,
            reps: 8,
            performed_at: new Date(NOW + 100_000).toISOString(),
          },
        },
      ])
      // Se entrega una vez: la página las mete en su cola.
      await expect(claimLockScreenSets()).resolves.toEqual({ queued: [], sent: 0 })
      // El recibo: una serie más y el descanso vuelve a contar.
      expect(scheduled()[REST_ID].body).toBe('Press banca · 60 kg x 8\n3 series')
      expect(scheduled()[END_ID].schedule.at).toEqual(new Date(NOW + 190_000))
      stop()
    })

    it('con la app muerta usa lo que llevaba la notificación', async () => {
      await ready()
      await listeners.localNotificationActionPerformed({
        actionId: 'log',
        notification: { id: REST_ID, extra: { rest: rest({ token: undefined }) } },
      })
      const { queued } = await claimLockScreenSets()
      expect(queued).toHaveLength(1)
      expect(queued[0].workoutId).toBe(42)
    })

    it('«Otra serie» acepta lo que teclee un pulgar', async () => {
      await ready()
      await startRestNotice(rest())
      await listeners.localNotificationActionPerformed({
        actionId: 'custom',
        inputValue: '32,5 x 12',
        notification: { id: REST_ID },
      })
      const { queued } = await claimLockScreenSets()
      expect(queued[0].payload).toMatchObject({ weight: 32.5, reps: 12 })
      expect(scheduled()[REST_ID].body).toBe('Press banca · 32.5 kg x 12\n3 series')
    })

    it('lo que no entiende no lo inventa: se queja y no apunta nada', async () => {
      await ready()
      await startRestNotice(rest())
      await listeners.localNotificationActionPerformed({
        actionId: 'custom',
        inputValue: '12',
        notification: { id: REST_ID },
      })
      await expect(claimLockScreenSets()).resolves.toEqual({ queued: [], sent: 0 })
      expect(scheduled()[7303]).toMatchObject({
        body: 'No entendí esa serie. Escríbela como 32.5x12 — peso, luego reps.',
      })
    })

    it('tocar el cuerpo sólo abre la app', async () => {
      await ready()
      await startRestNotice(rest())
      await listeners.localNotificationActionPerformed({ actionId: 'tap', notification: { id: REST_ID } })
      await expect(claimLockScreenSets()).resolves.toEqual({ queued: [], sent: 0 })
    })
  })

  it('cuando suena el fin con la app viva, el aviso con la hora pasada se retira', async () => {
    await ready()
    listeners.localNotificationReceived({ id: END_ID })
    expect(LocalNotifications.removeDeliveredNotificationsById).toHaveBeenCalledWith({ ids: [REST_ID] })
  })
})
