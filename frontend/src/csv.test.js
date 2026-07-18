import { toCsv } from './csv.js'

describe('toCsv', () => {
  it('builds a header and one row per set, escaping commas in notes', () => {
    const days = [
      {
        id: 1,
        date: '2026-07-10',
        workouts: [
          {
            id: 1,
            name: 'Push',
            sets: [
              {
                id: 1,
                exercise_name: 'Bench',
                reps: 8,
                weight: 60,
                unit: 'kg',
                rpe: 8,
                note: 'felt, good',
              },
            ],
          },
        ],
      },
    ]

    const lines = toCsv(days).split('\n')

    expect(lines[0]).toBe('fecha,entreno,ejercicio,reps,peso,unidad,rpe,nota')
    expect(lines[1]).toBe('2026-07-10,Push,Bench,8,60,kg,8,"felt, good"')
  })

  it('leaves optional fields blank and handles unnamed workouts', () => {
    const days = [
      {
        id: 1,
        date: '2026-07-11',
        workouts: [
          {
            id: 2,
            name: null,
            sets: [
              { id: 2, exercise_name: 'Squat', reps: 5, weight: 100, unit: 'kg', rpe: null, note: null },
            ],
          },
        ],
      },
    ]

    expect(toCsv(days).split('\n')[1]).toBe('2026-07-11,,Squat,5,100,kg,,')
  })
})
