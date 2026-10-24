import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api.js', () => ({
  listDays: vi.fn(),
  createWorkout: vi.fn(),
}))

import * as api from './api.js'
import { entrenoDeHoy } from './entrenoDeHoy.js'

describe('entrenoDeHoy', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(() => vi.useRealTimers())

  it('sin sesión hoy, crea una sin nombre', async () => {
    vi.setSystemTime(new Date(2026, 6, 19, 12, 0))
    api.listDays.mockResolvedValue([])
    api.createWorkout.mockResolvedValue({ id: 3, date: '2026-07-19', name: null, sets: [] })

    expect(await entrenoDeHoy()).toEqual(expect.objectContaining({ id: 3 }))
    expect(api.createWorkout).toHaveBeenCalledWith({ date: '2026-07-19', name: null })
  })

  // Un segundo entreno en un día ya entrenado es como una sesión acaba partida
  // en dos: si hoy existe, se vuelve a él.
  it('continúa la sesión de hoy en vez de empezar otra', async () => {
    vi.setSystemTime(new Date(2026, 6, 16, 12, 0))
    api.listDays.mockResolvedValue([
      { id: 2, date: '2026-07-16', workouts: [{ id: 5, name: 'Push', sets: [] }] },
    ])

    expect(await entrenoDeHoy()).toEqual({ id: 5, name: 'Push', sets: [], date: '2026-07-16' })
    expect(api.createWorkout).not.toHaveBeenCalled()
  })

  it('a las 03:00, «hoy» sigue siendo el día anterior: continúa esa sesión', async () => {
    vi.setSystemTime(new Date(2026, 6, 17, 3, 0))
    api.listDays.mockResolvedValue([
      { id: 2, date: '2026-07-16', workouts: [{ id: 5, name: 'Push', sets: [] }] },
    ])

    expect(await entrenoDeHoy()).toEqual(expect.objectContaining({ id: 5 }))
    expect(api.createWorkout).not.toHaveBeenCalled()
  })

  it('a las 04:00 empieza el día nuevo, en la fecha local', async () => {
    vi.setSystemTime(new Date(2026, 6, 17, 4, 0))
    api.listDays.mockResolvedValue([
      { id: 2, date: '2026-07-16', workouts: [{ id: 5, name: 'Push', sets: [] }] },
    ])
    api.createWorkout.mockResolvedValue({ id: 3, date: '2026-07-17', name: null, sets: [] })

    await entrenoDeHoy()
    expect(api.createWorkout).toHaveBeenCalledWith({ date: '2026-07-17', name: null })
  })
})
