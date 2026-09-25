import { beforeEach, describe, expect, it, vi } from 'vitest'

// El plugin propio del APK (android/…/session/SessionPlugin.java). Se simula
// aquí como los de npm en los demás módulos de platform/.
const plugin = vi.hoisted(() => ({
  enqueue: vi.fn(),
  adopt: vi.fn(),
  drop: vi.fn(),
  dropFor: vi.fn(),
  rename: vi.fn(),
  snapshot: vi.fn(),
  flush: vi.fn(),
  setSession: vi.fn(),
  clearToken: vi.fn(),
  publish: vi.fn(),
  end: vi.fn(),
  skipRest: vi.fn(),
  ensureNotifications: vi.fn(),
  addListener: vi.fn(),
}))
vi.mock('@capacitor/core', () => ({ registerPlugin: vi.fn(() => plugin) }))
vi.mock('./native.js', () => ({ isNative: vi.fn(() => true) }))

import { isNative } from './native.js'
import { nativeSession, session } from './session.js'

describe('platform/session en el APK', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isNative.mockReturnValue(true)
    Object.values(plugin).forEach((fn) => fn.mockResolvedValue({ queue: [] }))
  })

  it('habla con el plugin FititSession', async () => {
    const entry = { tmpId: 't-1', workoutId: 1, payload: { exercise_name: 'Press' } }
    await session.enqueue(entry)
    await session.rename('Press', 'Press banca')
    await session.setSession('jwt', 'https://x/api', '0.5.0')

    expect(plugin.enqueue).toHaveBeenCalledWith({ entry })
    expect(plugin.rename).toHaveBeenCalledWith({ from: 'Press', to: 'Press banca' })
    expect(plugin.setSession).toHaveBeenCalledWith({
      token: 'jwt',
      apiBase: 'https://x/api',
      clientVersion: '0.5.0',
    })
  })

  it('publica el control, lo termina, salta el descanso y pide el permiso', async () => {
    const control = { workoutId: 1, exercise: 'Press banca' }
    plugin.ensureNotifications.mockResolvedValue({ granted: true })

    await session.publish(control)
    await session.skipRest()
    await session.end()

    expect(plugin.publish).toHaveBeenCalledWith({ control })
    expect(plugin.skipRest).toHaveBeenCalled()
    expect(plugin.end).toHaveBeenCalled()
    await expect(session.ensureNotifications()).resolves.toEqual({ granted: true })
  })

  it('llama al nativo de uno en uno, en el orden en que se pidió', async () => {
    // El puente es asíncrono. Un «renombrar» que adelantase al «encolar» de la
    // serie que renombra la dejaría con el nombre viejo.
    const order = []
    let release
    plugin.enqueue.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            order.push('enqueue')
            resolve({ queue: [] })
          }
        }),
    )
    plugin.rename.mockImplementation(async () => {
      order.push('rename')
      return { queue: [] }
    })

    const first = session.enqueue({ tmpId: 't-1' })
    const second = session.rename('a', 'b')
    await Promise.resolve()
    expect(plugin.rename).not.toHaveBeenCalled()

    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    release()
    await Promise.all([first, second])
    expect(order).toEqual(['enqueue', 'rename'])
  })

  it('un fallo no atasca las llamadas de detrás', async () => {
    plugin.drop.mockRejectedValueOnce(new Error('bridge'))

    await expect(session.drop('t-1')).rejects.toThrow('bridge')
    await expect(session.flush()).resolves.toBeDefined()
  })

  it('reparte el aviso de fin de envío', async () => {
    const remove = vi.fn()
    plugin.addListener.mockResolvedValue({ remove })
    const heard = vi.fn()

    const stop = session.onChanged(heard)
    const [event, handler] = plugin.addListener.mock.calls[0]
    expect(event).toBe('changed')
    handler({ sent: 1 })
    expect(heard).toHaveBeenCalledWith({ sent: 1 })

    stop()
    await vi.waitFor(() => expect(remove).toHaveBeenCalled())
  })
})

describe('platform/session en la web', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isNative.mockReturnValue(false)
  })

  it('no existe, y no llama a nada', async () => {
    expect(nativeSession()).toBe(false)
    await session.enqueue({ tmpId: 't-1' })
    await session.flush()
    session.onChanged(() => {})()

    Object.values(plugin).forEach((fn) => expect(fn).not.toHaveBeenCalled())
  })
})
