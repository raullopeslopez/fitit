import { bootCards, buildBootSummary, progressPct, retryDelay } from './coldstart.js'

// 2026-08-16 is a Sunday, so the running week starts Mon 2026-08-10, the last
// complete week is 08-03…08-09 and the one before it 07-27…08-02.
const TODAY = '2026-08-16'

const set = (exercise_name, weight, reps, muscle_group = 'Pecho') => ({
  exercise_name,
  weight,
  reps,
  muscle_group,
})

const day = (date, name, sets) => ({
  id: date,
  date,
  workouts: [{ id: date, date, name, sets }],
})

// Newest first, the order the API hands them over in.
const DAYS = [
  day(TODAY, 'Empuje', [set('Press banca', 80, 5), set('Fondos', null, 8), set('Press militar', 40, 8, 'Hombro')]),
  day('2026-08-12', 'Tirón', [set('Dominadas', null, 6, 'Espalda'), set('Remo', 70, 8, 'Espalda')]),
  day('2026-08-07', 'Pierna', [set('Sentadilla', 100, 3, 'Cuádriceps'), set('Prensa', 150, 8, 'Cuádriceps')]),
  day('2026-08-05', 'Empuje', [set('Press banca', 82.5, 4), set('Fondos', null, 10)]),
  day('2026-07-31', 'Tirón', [set('Remo', 65, 8, 'Espalda')]),
  day('2026-07-29', 'Empuje', [set('Press banca', 80, 4)]),
  day('2026-07-22', 'Pierna', [set('Sentadilla', 95, 5, 'Cuádriceps')]),
]

describe('retryDelay', () => {
  it('doubles from a second and never asks for more than a minute', () => {
    expect(retryDelay(0)).toBe(1000)
    expect(retryDelay(1)).toBe(2000)
    expect(retryDelay(2)).toBe(4000)
    expect(retryDelay(3)).toBe(8000)
    expect(retryDelay(10)).toBe(60000)
  })
})

describe('progressPct', () => {
  it('starts at zero and keeps moving', () => {
    expect(progressPct(0)).toBe(0)
    expect(progressPct(5000)).toBeGreaterThan(progressPct(1000))
    expect(progressPct(30000)).toBeGreaterThan(progressPct(5000))
  })

  // The bar is a promise about the wait, and we don't know how long it is. A
  // bar that fills to the end and then sits there says the thing is done when
  // it isn't — the one lie the screen can't afford.
  it('never reaches the end, however long it takes', () => {
    expect(progressPct(60000)).toBeLessThan(95)
    expect(progressPct(600000)).toBeLessThan(95)
  })
})

describe('buildBootSummary', () => {
  it('keeps the last session, the best mark, the week streak and the volume', () => {
    const summary = buildBootSummary(DAYS, { today: TODAY })

    expect(summary.session).toEqual({ date: TODAY, name: 'Empuje', sets: 3, muscle: 'Pecho' })
    expect(summary.best).toEqual({ name: 'Prensa', weight: 150, reps: 8, date: '2026-08-07' })
    // Weeks of 08-10, 08-03, 07-27 and 07-20, all trained.
    expect(summary.weekStreak).toBe(4)
    // 08-03…08-09 took 4 sets, 07-27…08-02 took 2.
    expect(summary.volume).toEqual({ sets: 4, deltaPct: 100 })
  })

  it('survives an empty log', () => {
    const summary = buildBootSummary([], { today: TODAY })
    expect(summary.session).toBeNull()
    expect(summary.best).toBeNull()
    expect(summary.weekStreak).toBe(0)
    expect(summary.volume).toBeNull()
  })

  // A week off breaks the streak; the weeks before it don't count any more.
  it('stops the streak at the first week with nothing in it', () => {
    const summary = buildBootSummary(
      [day(TODAY, 'Empuje', [set('Press banca', 80, 5)]), day('2026-07-22', 'Pierna', [set('Sentadilla', 95, 5)])],
      { today: TODAY },
    )
    expect(summary.weekStreak).toBe(1)
  })
})

describe('bootCards', () => {
  const cards = () => bootCards(buildBootSummary(DAYS, { today: TODAY }), { restSeconds: 120, today: TODAY })

  it('says the session, the mark to beat, the streak, the volume and the rest', () => {
    expect(cards().map((c) => c.kicker)).toEqual([
      'Hoy',
      'Tu marca a batir',
      'Constancia',
      'Volumen',
      'Descanso',
    ])
  })

  it('carries the real numbers, not placeholders', () => {
    const [session, best, streak, volume, rest] = cards()
    expect(session.title).toBe('Empuje')
    expect(session.stat).toBe('3')
    expect(session.muscle).toBe('Pecho')
    expect(best.title).toBe('Prensa')
    expect(best.stat).toBe('150')
    expect(best.statLabel).toBe('kg × 8')
    expect(streak.title).toBe('4 semanas seguidas')
    expect(volume.stat).toBe('+100')
    expect(rest.stat).toBe('2:00')
  })

  // The screen never says why you're waiting. It shows the session you came
  // for, which is the only thing that makes the wait worth anything.
  it('never mentions the server, the wait or the seconds', () => {
    const text = cards()
      .map((c) => [c.kicker, c.title, c.body, c.statLabel].join(' '))
      .join(' ')
    expect(text).not.toMatch(/servidor|arranc|despert|espera|segundo|cargando|conexión|lento/i)
  })

  it('drops the cards it has no data for', () => {
    const thin = bootCards(buildBootSummary([], { today: TODAY }), { restSeconds: 0, today: TODAY })
    expect(thin).toHaveLength(1)
    expect(thin[0].title).toBe('Tu primera sesión')
  })

  // Rest set to "sin descanso" is a preference, not a number to show off.
  it('leaves the rest card out when the timer is off', () => {
    const withoutRest = bootCards(buildBootSummary(DAYS, { today: TODAY }), { restSeconds: 0, today: TODAY })
    expect(withoutRest.map((c) => c.kicker)).not.toContain('Descanso')
  })

  it('names how long ago the last session was when it was not today', () => {
    const older = buildBootSummary([day('2026-08-14', 'Tirón', [set('Remo', 70, 8)])], { today: TODAY })
    const [first] = bootCards(older, { restSeconds: 0, today: TODAY })
    expect(first.kicker).toBe('Tu última sesión')
    expect(first.body).toMatch(/hace 2 días/)
  })
})
