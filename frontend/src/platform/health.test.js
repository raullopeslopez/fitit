import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./native.js', () => ({ isNative: vi.fn(() => true) }))
vi.mock('@capgo/capacitor-health', () => ({
  Health: {
    isAvailable: vi.fn(),
    requestAuthorization: vi.fn(),
    queryAggregated: vi.fn(),
    saveSample: vi.fn(),
  },
}))

import { Health } from '@capgo/capacitor-health'

import { ensureHealthAccess, readDailySteps, saveWeightToHealth } from './health.js'
import { isNative } from './native.js'

describe('platform/health en el APK', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isNative.mockReturnValue(true)
    Health.isAvailable.mockResolvedValue({ available: true })
  })

  it('pide sólo leer pasos y escribir peso', async () => {
    Health.requestAuthorization.mockResolvedValue({
      readAuthorized: ['steps'],
      readDenied: [],
      writeAuthorized: ['weight'],
      writeDenied: [],
    })
    await expect(ensureHealthAccess()).resolves.toBe(true)
    expect(Health.requestAuthorization).toHaveBeenCalledWith({ read: ['steps'], write: ['weight'] })
  })

  it('sin Health Connect no pide nada', async () => {
    Health.isAvailable.mockResolvedValue({ available: false })
    await expect(ensureHealthAccess()).resolves.toBe(false)
    expect(Health.requestAuthorization).not.toHaveBeenCalled()
  })

  it('en la web no existe', async () => {
    isNative.mockReturnValue(false)
    await expect(ensureHealthAccess()).resolves.toBe(false)
    expect(Health.isAvailable).not.toHaveBeenCalled()
  })

  it('agrega los pasos por día y descarta los días sin pasos (no son un 0)', async () => {
    Health.queryAggregated.mockResolvedValue({
      samples: [
        { startDate: new Date(2026, 8, 23).toISOString(), value: 0 },
        { startDate: new Date(2026, 8, 24).toISOString(), value: 6120.4 },
        { startDate: new Date(2026, 8, 25).toISOString(), value: 8432 },
      ],
    })
    const days = await readDailySteps(3, new Date(2026, 8, 25, 18, 0))
    expect(days).toEqual([
      { date: '2026-09-24', steps: 6120 },
      { date: '2026-09-25', steps: 8432 },
    ])
    const [request] = Health.queryAggregated.mock.calls[0]
    expect(request).toMatchObject({ dataType: 'steps', bucket: 'day', aggregation: 'sum' })
    expect(new Date(request.startDate)).toEqual(new Date(2026, 8, 23))
  })

  it('escribe el peso tecleado en kilos', async () => {
    const when = new Date(2026, 8, 25, 8, 30)
    await saveWeightToHealth(78.4, when)
    expect(Health.saveSample).toHaveBeenCalledWith({
      dataType: 'weight',
      value: 78.4,
      unit: 'kilogram',
      startDate: when.toISOString(),
      endDate: when.toISOString(),
    })
  })

  it('un fallo al escribir no sale de aquí', async () => {
    Health.saveSample.mockRejectedValue(new Error('no permission'))
    await expect(saveWeightToHealth(78.4)).resolves.toBeUndefined()
  })
})
