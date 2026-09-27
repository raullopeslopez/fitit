import { beforeEach, describe, expect, it, vi } from 'vitest'

// La cola en el APK: la tiene el nativo (platform/session.js) y la envía él. La
// página guarda una copia para pintar las filas «sin enviar» sin esperar al
// puente, y cada cambio se lo manda al nativo como una operación suelta.
const session = vi.hoisted(() => ({
  enqueue: vi.fn(),
  adopt: vi.fn(),
  drop: vi.fn(),
  dropFor: vi.fn(),
  forget: vi.fn(),
  rename: vi.fn(),
  snapshot: vi.fn(),
  flush: vi.fn(),
  setSession: vi.fn(),
  clearToken: vi.fn(),
  onChanged: vi.fn(),
}))
vi.mock('./platform/session.js', () => ({ nativeSession: vi.fn(() => true), session }))

import {
  checkInNativeQueue,
  dropQueuedFor,
  enqueueSet,
  forgetWorkout,
  onNativeSend,
  readQueue,
  renameQueued,
  sendsNatively,
  startNativeQueue,
  stopNativeQueue,
} from './offline.js'
import { nativeSession } from './platform/session.js'

const bench = (tmpId, weight = 60) => ({
  tmpId,
  workoutId: 1,
  payload: { exercise_name: 'Bench Press', reps: 8, weight },
})

// Una promesa que el test resuelve cuando quiere: el puente, a medio contestar.
function pending() {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}

describe('la cola en el APK', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    nativeSession.mockReturnValue(true)
    Object.values(session).forEach((fn) => fn.mockResolvedValue({ queue: [] }))
  })

  it('la envía el nativo, no la página', () => {
    expect(sendsNatively()).toBe(true)
  })

  it('encola en el nativo la misma serie que guarda la copia, con su client_id', async () => {
    enqueueSet(bench('t-1'))

    const [local] = readQueue()
    expect(session.enqueue).toHaveBeenCalledWith(local)
    expect(local.payload.client_id).toBeTruthy()
  })

  it('lo que dice el nativo manda sobre la copia', async () => {
    // El nativo envió t-1 en segundo plano; la copia aún lo tiene.
    localStorage.setItem('fitit_outbox', JSON.stringify([bench('t-1'), bench('t-2', 65)]))
    let hear
    session.onChanged.mockImplementation((listener) => {
      hear = listener
      return () => {}
    })
    const heard = vi.fn()
    onNativeSend(heard)

    hear({ queue: [bench('t-2', 65)], sent: 1, rejected: 0, workout: { id: 1, sets: [] } })

    expect(readQueue().map((e) => e.tmpId)).toEqual(['t-2'])
    expect(heard).toHaveBeenCalledWith(expect.objectContaining({ sent: 1 }))
  })

  it('no pierde de la copia una serie que aún va de camino al nativo', async () => {
    // Encolada aquí, el puente todavía no ha contestado, y llega un aviso con
    // la cola del nativo sin ella: tiene que seguir en pantalla.
    const bridge = pending()
    session.enqueue.mockReturnValue(bridge.promise)
    let hear
    session.onChanged.mockImplementation((listener) => {
      hear = listener
      return () => {}
    })
    onNativeSend(() => {})

    enqueueSet(bench('t-2', 65))
    hear({ queue: [], sent: 1, rejected: 0 })

    expect(readQueue().map((e) => e.tmpId)).toEqual(['t-2'])

    bridge.resolve({ queue: [readQueue()[0]] })
    await vi.waitFor(() => expect(readQueue().map((e) => e.tmpId)).toEqual(['t-2']))
  })

  it('renombrar y borrar un ejercicio también le llega al nativo', () => {
    localStorage.setItem('fitit_outbox', JSON.stringify([bench('t-1')]))

    renameQueued('Bench Press', 'Press banca')
    dropQueuedFor('Press banca')

    expect(session.rename).toHaveBeenCalledWith('Bench Press', 'Press banca')
    expect(session.dropFor).toHaveBeenCalledWith('Press banca')
  })

  it('un entreno borrado se olvida también en el nativo', async () => {
    // El nativo tiene series que la copia no ve (un +1 del widget) y el control
    // del widget y la notificación: las dos cosas son suyas de quitar.
    localStorage.setItem(
      'fitit_outbox',
      JSON.stringify([bench('t-1'), { ...bench('t-2'), workoutId: 2 }]),
    )
    session.forget.mockResolvedValue({ queue: [{ ...bench('t-2'), workoutId: 2 }] })

    forgetWorkout(1)

    expect(session.forget).toHaveBeenCalledWith(1)
    expect(readQueue().map((e) => e.tmpId)).toEqual(['t-2'])
  })

  it('al entrar le da el token y le entrega la cola que la página tenía', async () => {
    // Lo que quedó sin enviar en la versión anterior del APK, en la copia.
    localStorage.setItem('fitit_outbox', JSON.stringify([bench('t-1')]))

    startNativeQueue('jwt-abc')

    expect(session.setSession).toHaveBeenCalledWith(
      'jwt-abc',
      expect.stringMatching(/\/api$/),
      expect.any(String),
    )
    expect(session.adopt).toHaveBeenCalledWith([bench('t-1')])
  })

  it('al salir le quita el token', () => {
    stopNativeQueue()
    expect(session.clearToken).toHaveBeenCalled()
  })

  it('al abrir pregunta si el servidor rechazó algo mientras no mirabas', async () => {
    session.snapshot.mockResolvedValue({ queue: [], rejected: 2 })

    await expect(checkInNativeQueue()).resolves.toBe(2)
  })
})

describe('la cola en la web', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    nativeSession.mockReturnValue(false)
  })

  it('la envía la página, y el nativo no se entera de nada', async () => {
    expect(sendsNatively()).toBe(false)
    enqueueSet(bench('t-1'))
    renameQueued('Bench Press', 'Press banca')
    startNativeQueue('jwt')
    await expect(checkInNativeQueue()).resolves.toBe(0)

    expect(readQueue()).toHaveLength(1)
    Object.values(session).forEach((fn) => expect(fn).not.toHaveBeenCalled())
  })
})
