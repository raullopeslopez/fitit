import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./platform/session.js', () => ({
  nativeSession: vi.fn(() => true),
  session: { summary: vi.fn(() => Promise.resolve()) },
}))

import { nativeSession, session } from './platform/session.js'
import {
  lastWorkoutOf,
  publishLastWorkout,
  publishSteps,
  publishStepsGoal,
  stepsSummary,
} from './widgetSummary.js'

const set = (muscle_group, kind = 'strength') => ({ exercise_name: 'x', muscle_group, kind })

describe('lastWorkoutOf', () => {
  it('es el día más reciente con series, con sus grupos de más a menos series', () => {
    const days = [
      // Hoy, abierto y aún vacío: no cuenta como «último».
      { date: '2026-09-27', workouts: [{ id: 9, sets: [] }] },
      {
        date: '2026-09-25',
        workouts: [{ id: 8, sets: [set('Glúteo'), set('Cuádriceps'), set('Cuádriceps')] }],
      },
      { date: '2026-09-22', workouts: [{ id: 7, sets: [set('Pecho')] }] },
    ]
    expect(lastWorkoutOf(days)).toEqual({ date: '2026-09-25', groups: ['Cuádriceps', 'Glúteo'] })
  })

  it('nombra dos grupos como mucho: la línea del widget es una', () => {
    const days = [
      {
        date: '2026-09-25',
        workouts: [{ id: 8, sets: [set('Pecho'), set('Pecho'), set('Hombro'), set('Tríceps')] }],
      },
    ]
    expect(lastWorkoutOf(days).groups).toEqual(['Pecho', 'Hombro'])
  })

  it('el cardio se llama Cardio y lo que no tiene grupo no se nombra', () => {
    const days = [
      { date: '2026-09-25', workouts: [{ id: 8, sets: [set(null, 'cardio'), set(null)] }] },
    ]
    expect(lastWorkoutOf(days)).toEqual({ date: '2026-09-25', groups: ['Cardio'] })
  })

  it('sin ningún entreno con series no hay último', () => {
    expect(lastWorkoutOf([])).toBeNull()
    expect(lastWorkoutOf([{ date: '2026-09-27', workouts: [{ id: 9, sets: [] }] }])).toBeNull()
  })
})

describe('stepsSummary', () => {
  const now = new Date(2026, 8, 27, 18, 30)

  it('los pasos de hoy y la media de los siete días anteriores', () => {
    const days = [
      { date: '2026-09-27', steps: 8432 },
      { date: '2026-09-26', steps: 7000 },
      { date: '2026-09-25', steps: 9000 },
      { date: '2026-09-21', steps: 8000 },
      // Fuera de la semana: no entra en la media.
      { date: '2026-09-19', steps: 1 },
    ]
    expect(stepsSummary(days, now)).toEqual({ date: '2026-09-27', today: 8432, weekAverage: 8000 })
  })

  it('un día sin dato no cuenta como cero en la media, y hoy sin dato es null', () => {
    const days = [{ date: '2026-09-26', steps: 7911 }]
    expect(stepsSummary(days, now)).toEqual({ date: '2026-09-27', today: null, weekAverage: 7911 })
  })

  it('sin nada que medir, todo null', () => {
    expect(stepsSummary([], now)).toEqual({ date: '2026-09-27', today: null, weekAverage: null })
  })
})

describe('lo que se publica al nativo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nativeSession.mockReturnValue(true)
  })

  it('cada pieza va sola: el nativo junta lo que ya tenía', async () => {
    const days = [{ date: '2026-09-25', workouts: [{ id: 8, sets: [set('Pecho')] }] }]
    await publishLastWorkout(days)
    await publishSteps([{ date: '2026-09-27', steps: 10 }], new Date(2026, 8, 27, 9))
    await publishStepsGoal(10000)

    expect(session.summary).toHaveBeenNthCalledWith(1, {
      lastWorkout: { date: '2026-09-25', groups: ['Pecho'] },
    })
    expect(session.summary).toHaveBeenNthCalledWith(2, {
      steps: { date: '2026-09-27', today: 10, weekAverage: null },
    })
    expect(session.summary).toHaveBeenNthCalledWith(3, { stepsGoal: 10000 })
  })

  it('un objetivo vacío se publica como null: sin objetivo no hay barra', async () => {
    await publishStepsGoal(undefined)
    expect(session.summary).toHaveBeenCalledWith({ stepsGoal: null })
  })

  it('fuera del APK no llama a nada', async () => {
    nativeSession.mockReturnValue(false)
    await publishLastWorkout([])
    await publishSteps([])
    await publishStepsGoal(10000)
    expect(session.summary).not.toHaveBeenCalled()
  })

  it('un fallo del puente no sale de aquí: el widget es un extra', async () => {
    session.summary.mockRejectedValue(new Error('bridge'))
    await expect(publishStepsGoal(10000)).resolves.toBeUndefined()
  })
})
