import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api.js', () => ({ putSteps: vi.fn(), getSteps: vi.fn() }))
vi.mock('./platform/health.js', () => ({
  healthSupported: vi.fn(() => true),
  ensureHealthAccess: vi.fn(() => Promise.resolve(true)),
  readDailySteps: vi.fn(),
}))

import { getSteps, putSteps } from './api.js'
import { ensureHealthAccess, healthSupported, readDailySteps } from './platform/health.js'
import { STEPS_SYNCED, formatSteps, resetStepsSync, stepsByDate, syncSteps } from './steps.js'

describe('syncSteps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStepsSync()
    healthSupported.mockReturnValue(true)
    ensureHealthAccess.mockResolvedValue(true)
    putSteps.mockResolvedValue({ saved: 1 })
  })
  afterEach(() => resetStepsSync())

  it('sube los pasos del teléfono y avisa a Días', async () => {
    readDailySteps.mockResolvedValue([{ date: '2026-09-25', steps: 8432 }])
    const heard = vi.fn()
    window.addEventListener(STEPS_SYNCED, heard)

    await expect(syncSteps({ now: 1_000_000 })).resolves.toBe(true)

    expect(putSteps).toHaveBeenCalledWith([{ date: '2026-09-25', steps: 8432 }])
    expect(heard).toHaveBeenCalledTimes(1)
    window.removeEventListener(STEPS_SYNCED, heard)
  })

  it('no vuelve a subir antes de cinco minutos', async () => {
    readDailySteps.mockResolvedValue([{ date: '2026-09-25', steps: 10 }])
    await syncSteps({ now: 1_000_000 })
    await syncSteps({ now: 1_000_000 + 60_000 })
    expect(putSteps).toHaveBeenCalledTimes(1)
    await syncSteps({ now: 1_000_000 + 5 * 60_000 })
    expect(putSteps).toHaveBeenCalledTimes(2)
  })

  it('fuera del APK no hace nada', async () => {
    healthSupported.mockReturnValue(false)
    await expect(syncSteps()).resolves.toBe(false)
    expect(ensureHealthAccess).not.toHaveBeenCalled()
  })

  it('sin permiso no lee ni sube nada', async () => {
    ensureHealthAccess.mockResolvedValue(false)
    await expect(syncSteps()).resolves.toBe(false)
    expect(readDailySteps).not.toHaveBeenCalled()
    expect(putSteps).not.toHaveBeenCalled()
  })

  it('sin pasos que subir no llama al servidor', async () => {
    readDailySteps.mockResolvedValue([])
    await syncSteps()
    expect(putSteps).not.toHaveBeenCalled()
  })

  it('un fallo de red se traga: los pasos siguen en el teléfono', async () => {
    readDailySteps.mockResolvedValue([{ date: '2026-09-25', steps: 10 }])
    putSteps.mockRejectedValue(new Error('offline'))
    await expect(syncSteps()).resolves.toBe(false)
  })
})

describe('stepsByDate', () => {
  it('convierte las filas en un mapa por fecha', async () => {
    getSteps.mockResolvedValue([{ date: '2026-09-24', steps: 5000 }])
    await expect(stepsByDate('2026-09-01', '2026-09-30')).resolves.toEqual({ '2026-09-24': 5000 })
  })
})

describe('formatSteps', () => {
  it('pone punto de miles también con cuatro cifras', () => {
    expect(formatSteps(8432)).toBe('8.432 pasos')
    expect(formatSteps(12345)).toBe('12.345 pasos')
    expect(formatSteps(950)).toBe('950 pasos')
    expect(formatSteps(1)).toBe('1 paso')
  })
})
