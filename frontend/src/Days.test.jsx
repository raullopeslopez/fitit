import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Days from './Days.jsx'
import * as api from './api.js'

vi.mock('./api.js')

function benchSet(overrides = {}) {
  return {
    id: 10,
    exercise_id: 2,
    exercise_name: 'Bench Press',
    set_index: 0,
    reps: 8,
    weight: 60,
    unit: 'kg',
    ...overrides,
  }
}

// Deleting a day is the one action left without a control of its own: press and
// hold a day to reach it. Real timers, because the press is timed on one.
async function longPressDay(container) {
  const block = container.querySelector('.day-block')
  fireEvent.pointerDown(block)
  await new Promise((resolve) => setTimeout(resolve, 700))
  fireEvent.pointerUp(block)
}

describe('Days', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetAllMocks()
    api.listDays.mockResolvedValue([])
    api.listExercises.mockResolvedValue([])
  })

  it('lists days with their workouts', async () => {
    api.listDays.mockResolvedValue([
      {
        id: 2,
        date: '2026-07-16',
        workouts: [{ id: 5, name: 'Push', sets: [benchSet(), benchSet({ id: 11 })] }],
      },
      { id: 1, date: '2026-07-15', workouts: [{ id: 4, name: 'Legs', sets: [] }] },
    ])
    const { container } = render(<Days onOpenWorkout={() => {}} />)

    // The stamp is set in the left gutter, one token per line.
    expect(await screen.findByText('JUE 16')).toBeInTheDocument()
    expect(screen.getAllByText('JUL')).toHaveLength(2)
    expect(screen.getByText('Push')).toBeInTheDocument()
    expect(screen.getByText('Legs')).toBeInTheDocument()
    // `series` spelled out on every row was the same word repeated down the
    // column; the count keeps a unit, abbreviated.
    expect(container.querySelector('.day-session-count').textContent).toBe('2 SER')
  })

  // Los pasos del teléfono van bajo las sesiones del día que los tiene. Un día
  // sin fila no tiene dato: no sale cifra, y nunca un «0 pasos».
  it('shows the day’s steps, and nothing on a day without them', async () => {
    api.listDays.mockResolvedValue([
      { id: 2, date: '2026-07-16', workouts: [{ id: 5, name: 'Push', sets: [] }] },
      { id: 1, date: '2026-07-15', workouts: [{ id: 4, name: 'Legs', sets: [] }] },
    ])
    api.getSteps.mockResolvedValue([{ date: '2026-07-16', steps: 8432 }])
    const { container } = render(<Days onOpenWorkout={() => {}} />)

    expect(await screen.findByText('8.432 pasos')).toBeInTheDocument()
    expect(api.getSteps).toHaveBeenCalledWith('2026-07-15', '2026-07-16')
    expect(container.querySelectorAll('.day-steps')).toHaveLength(1)
  })

  // "How much have I done this week" was answerable only by counting rows. A
  // mono rule per week — no new surface, one line of type — turns a scroll into
  // a report, and gives the ruled entries the section rhythm they lacked.
  it('groups the list by week, with each week’s totals', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-08T12:00:00'))
    try {
      api.listDays.mockResolvedValue([
        { id: 3, date: '2026-08-08', workouts: [{ id: 7, name: 'Pull', sets: [benchSet()] }] },
        {
          id: 2,
          date: '2026-08-06',
          workouts: [{ id: 6, name: 'Push', sets: [benchSet(), benchSet({ id: 11 })] }],
        },
        // Monday starts the week, so 2 Aug (a Sunday) belongs to the one before.
        { id: 1, date: '2026-08-02', workouts: [{ id: 5, name: 'Pierna', sets: [benchSet()] }] },
      ])
      const { container } = render(<Days onOpenWorkout={() => {}} />)

      await screen.findByText('ESTA SEMANA')
      const heads = [...container.querySelectorAll('.week-head')].map((h) => h.textContent)
      // Every week is totalled the same way, the one you are in included. It
      // used to report its position instead ("DÍA 6 DE 7") because the volume
      // block hung off that rule; the block lives on Progreso now, so the rule
      // goes back to counting what the list under it holds.
      expect(heads).toEqual(['ESTA SEMANA2 DÍAS · 3 SERIES', 'SEMANA ANTERIOR1 DÍA · 1 SERIE'])
    } finally {
      vi.useRealTimers()
    }
  })

  // Días is the log: the days you trained, in order, with `Empezar entreno`
  // pinned under them. Sets per muscle is a reading, not a thing you touch
  // mid-session, and it has a screen of its own — DESIGN.md, "Días carries only
  // what you touch mid-session". Opening the app on nine rows of analysis put
  // the day list, which is what this tab is for, below the fold.
  it('opens on the day list, with no volume block over it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-08T12:00:00'))
    try {
      api.listDays.mockResolvedValue([
        {
          id: 3,
          date: '2026-08-08',
          workouts: [
            {
              id: 7,
              name: 'Pull',
              sets: [
                benchSet({ id: 20, muscle_group: 'Espalda', secondary_groups: ['Bíceps'] }),
                benchSet({ id: 21, muscle_group: 'Espalda', secondary_groups: ['Bíceps'] }),
              ],
            },
          ],
        },
      ])
      const { container } = render(<Days onOpenWorkout={() => {}} />)

      await screen.findByText('ESTA SEMANA')
      expect(container.querySelector('.sum-rows')).toBeNull()
      expect(container.querySelector('.sum-ref-week')).toBeNull()
      // Nothing of the block's copy is left behind either.
      expect(screen.queryByText('La zona es la de cada músculo, no la misma para todos.')).toBeNull()
      // The week's rule is immediately followed by the day it heads.
      const head = container.querySelector('.week-head')
      const firstDay = container.querySelector('.day-block')
      expect(head.compareDocumentPosition(firstDay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  // A week with nothing logged in it used to explain itself here — "La semana
  // aún no tiene series", plus what last week closed with. That sentence belongs
  // to the volume block, and the block is on Progreso now: an empty week on
  // Días is a rule with no days under it, which is what an empty week is.
  it('says nothing about volume on a week with nothing logged', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-10T09:00:00')) // a Monday
    try {
      api.listDays.mockResolvedValue([
        {
          id: 2,
          date: '2026-08-06',
          workouts: [
            {
              id: 6,
              name: 'Pierna',
              sets: [benchSet({ id: 30, muscle_group: 'Cuádriceps', secondary_groups: [] })],
            },
          ],
        },
      ])
      const { container } = render(<Days onOpenWorkout={() => {}} />)

      await screen.findByText('SEMANA ANTERIOR')
      expect(screen.queryByText('La semana aún no tiene series.')).toBeNull()
      expect(container.querySelector('.sum-rows')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  // The bug the redesign inherited: `weeksOf` built its rules out of the days
  // that exist, so a week with nothing logged in it had no rule at all and the
  // list opened on SEMANA ANTERIOR. A week is a calendar week, not a log entry
  // — and the Monday with nothing in it is the one that most needs answering.
  it('keeps ESTA SEMANA when nothing has been logged in it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-10T09:00:00')) // a Monday
    try {
      api.listDays.mockResolvedValue([
        {
          id: 2,
          date: '2026-08-06',
          workouts: [
            {
              id: 6,
              name: 'Pierna',
              sets: [benchSet({ id: 30, muscle_group: 'Cuádriceps', secondary_groups: [] })],
            },
          ],
        },
      ])
      const { container } = render(<Days onOpenWorkout={() => {}} />)

      await screen.findByText('SEMANA ANTERIOR')
      expect([...container.querySelectorAll('.week-label')].map((l) => l.textContent)).toEqual([
        'ESTA SEMANA',
        'SEMANA ANTERIOR',
      ])
      // With nothing in it there is nothing to total, so the rule carries the
      // week's name and stops there.
      expect(container.querySelector('.week-totals').textContent).toBe('')
    } finally {
      vi.useRealTimers()
    }
  })

  it('dates a week older than last one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-08T12:00:00'))
    try {
      api.listDays.mockResolvedValue([
        { id: 1, date: '2026-07-22', workouts: [{ id: 5, name: 'Push', sets: [benchSet()] }] },
      ])
      render(<Days onOpenWorkout={() => {}} />)

      expect(await screen.findByText('SEMANA DEL 20 JUL')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  // Only trained days exist in the list, so a four-day gap and a single rest day
  // drew the same thing: two adjacent rules. The cadence of a week is the point
  // of grouping it, and it can't be read if the silence isn't drawn.
  it('names the days you did not train, inside the current week', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-08T12:00:00'))
    try {
      api.listDays.mockResolvedValue([
        { id: 3, date: '2026-08-08', workouts: [{ id: 7, name: 'Pull', sets: [benchSet()] }] },
        { id: 2, date: '2026-08-06', workouts: [{ id: 6, name: 'Push', sets: [benchSet()] }] },
        { id: 1, date: '2026-08-03', workouts: [{ id: 5, name: 'Pierna', sets: [benchSet()] }] },
      ])
      const { container } = render(<Days onOpenWorkout={() => {}} />)

      await screen.findByText('Pull')
      await waitFor(() => {
        expect([...container.querySelectorAll('.day-rest')].map((r) => r.textContent)).toEqual([
          // One day off is named; a run of them is counted.
          'VIE · DESCANSO',
          '2 DÍAS SIN ENTRENAR',
        ])
      })
    } finally {
      vi.useRealTimers()
    }
  })

  // History doesn't need it: a rest day matters while the week is still yours
  // to fill, and past weeks would be mostly hairline.
  it('leaves older weeks without rest markers', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-08T12:00:00'))
    try {
      api.listDays.mockResolvedValue([
        { id: 2, date: '2026-07-24', workouts: [{ id: 6, name: 'Push', sets: [benchSet()] }] },
        { id: 1, date: '2026-07-21', workouts: [{ id: 5, name: 'Pierna', sets: [benchSet()] }] },
      ])
      const { container } = render(<Days onOpenWorkout={() => {}} />)

      await screen.findByText('Push')
      expect(container.querySelectorAll('.day-rest').length).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  // Today carried three cues for one fact — accent hairline, ink date and a HOY
  // chip — and the chip added a third line to the gutter, so today's row stood
  // taller than every other. The hairline and the ink stay; the attention goes
  // to the one state the list could not express: the session still running.
  it('stamps the running session EN CURSO instead of badging today', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-08T12:00:00'))
    try {
      api.listDays.mockResolvedValue([
        {
          id: 2,
          date: '2026-08-08',
          workouts: [{ id: 6, name: 'Pull', duration_seconds: null, sets: [benchSet()] }],
        },
      ])
      const { container } = render(<Days onOpenWorkout={() => {}} />)

      await screen.findByText('Pull')
      expect(container.querySelector('.day-live').textContent).toContain('EN CURSO')
      expect(container.querySelector('.today-badge')).toBeNull()
      expect(screen.queryByText('HOY')).not.toBeInTheDocument()
      // The stamp and the duration share a slot; only one of them is ever true.
      expect(container.querySelector('.day-session-len')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  // The row already says how many series; how long they took is the other half
  // of "what was that session", and it costs no extra request — the day feed
  // carries it. Spec: backend tests/features/session_length.feature.
  //
  // They are two elements rather than one string because they are not equally
  // interesting: the count is the figure you scan a week of days for, the
  // duration is context. One mono blob gave them the same weight.
  it('says how long each session took, beside the series count', async () => {
    const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString()
    api.listDays.mockResolvedValue([
      {
        id: 2,
        date: '2026-07-16',
        workouts: [
          {
            id: 5,
            name: 'Push',
            duration_seconds: 3900,
            sets: [
              benchSet({ created_at: hoursAgo(4) }),
              benchSet({ id: 11, created_at: hoursAgo(3) }),
            ],
          },
        ],
      },
    ])
    const { container } = render(<Days onOpenWorkout={() => {}} />)

    await screen.findByText('Push')
    // Total minutes with a prime, so a column of them keeps one width and stays
    // a number. `1h 05` lives on the session header, not here.
    expect(container.querySelector('.day-session-len').textContent).toBe('65′')
  })

  // A session with one set, or one typed in days later, has no length the
  // backend is willing to claim. The row then says what it always said.
  it('says only the series count when there is no length to report', async () => {
    api.listDays.mockResolvedValue([
      {
        id: 2,
        date: '2026-07-16',
        workouts: [{ id: 5, name: 'Push', duration_seconds: null, sets: [benchSet()] }],
      },
    ])
    const { container } = render(<Days onOpenWorkout={() => {}} />)

    await screen.findByText('Push')
    expect(container.querySelector('.day-session-count').textContent).toBe('1 SER')
    expect(container.querySelector('.day-session-len')).toBeNull()
  })

  // Días already has the whole workout, sets included — hand it over so Entreno
  // can draw immediately instead of fetching what is already in memory.
  it('opens a workout when tapped, handing over the sets it already holds', async () => {
    const onOpen = vi.fn()
    const workout = { id: 4, name: 'Legs', sets: [benchSet()] }
    api.listDays.mockResolvedValue([{ id: 1, date: '2026-07-15', workouts: [workout] }])
    render(<Days onOpenWorkout={onOpen} />)

    await userEvent.click(await screen.findByRole('button', { name: /^Legs/ }))
    // Sets and all, plus the day's date, so Entreno can draw its header too.
    expect(onOpen).toHaveBeenCalledWith(4, { ...workout, date: '2026-07-15' })
  })

  it('starts today’s workout with one tap', async () => {
    const onOpen = vi.fn()
    api.createWorkout.mockResolvedValue({ id: 3, date: '2026-07-19', name: null, sets: [] })
    render(<Days onOpenWorkout={onOpen} />)

    // El botón no dice cuál de las dos cosas es hasta que el log contesta:
    // `Empezar` y `Continuar` dependen de si hoy ya tiene sesión.
    await userEvent.click(await screen.findByRole('button', { name: /empezar entreno/i }))

    expect(api.createWorkout).toHaveBeenCalledWith(expect.objectContaining({ name: null }))
    // The third argument tells Entreno to open straight into naming it — no
    // name was asked for up front, so it's asked for the moment it opens.
    expect(onOpen).toHaveBeenCalledWith(3, expect.objectContaining({ id: 3 }), true)
  })

  // Starting a second workout on a day you already trained is how you end up
  // with your session split across two entries — so once today exists, the
  // button walks back into it instead of creating another one.
  it('continues today’s workout instead of starting a second one', async () => {
    const onOpen = vi.fn()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-16T12:00:00'))
    try {
      api.listDays.mockResolvedValue([
        { id: 2, date: '2026-07-16', workouts: [{ id: 5, name: 'Push', sets: [] }] },
      ])
      render(<Days onOpenWorkout={onOpen} />)

      // No session name on the button: the row already says it, and with it the
      // label had to ellipsise on a long one.
      const cta = await screen.findByRole('button', { name: /^continuar entreno$/i })
      await userEvent.click(cta)

      expect(onOpen).toHaveBeenCalledWith(5, expect.objectContaining({ id: 5 }))
      expect(api.createWorkout).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  // El día de entreno corta a las 04:00 locales, como el de comida: una sesión
  // a la 01:30 es la del día que llevas despierto. Antes «hoy» salía en UTC, y
  // entre las 00:00 y las 02:00 en Madrid ni se encontraba la sesión de hoy ni
  // se fechaba bien la nueva — con la hora local a secas, la de las 23:50 y la
  // de las 00:10 serían dos días.
  it('a las 03:00, «hoy» sigue siendo el día anterior: continúa esa sesión', async () => {
    const onOpen = vi.fn()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 6, 17, 3, 0))
    try {
      api.listDays.mockResolvedValue([
        { id: 2, date: '2026-07-16', workouts: [{ id: 5, name: 'Push', sets: [] }] },
      ])
      render(<Days onOpenWorkout={onOpen} />)

      await userEvent.click(await screen.findByRole('button', { name: /^continuar entreno$/i }))

      expect(onOpen).toHaveBeenCalledWith(5, expect.objectContaining({ id: 5 }))
      expect(api.createWorkout).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a las 04:00 empieza el día nuevo, en la fecha local', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 6, 17, 4, 0))
    try {
      api.listDays.mockResolvedValue([])
      api.createWorkout.mockResolvedValue({ id: 3, date: '2026-07-17', name: null, sets: [] })
      render(<Days onOpenWorkout={vi.fn()} />)

      await userEvent.click(await screen.findByRole('button', { name: /empezar entreno/i }))

      expect(api.createWorkout).toHaveBeenCalledWith({ date: '2026-07-17', name: null })
    } finally {
      vi.useRealTimers()
    }
  })

  it('backfills a workout for a chosen date and opens it', async () => {
    const onOpen = vi.fn()
    api.createWorkout.mockResolvedValue({ id: 9, date: '2026-07-10', name: 'Morning', sets: [] })
    render(<Days onOpenWorkout={onOpen} />)

    // The backfill form is a sheet now, opened from a quiet link under the CTA:
    // a framed button beside the primary action read as half as important as
    // starting a session, and its form expanded upward over the list.
    await userEvent.click(screen.getByRole('button', { name: /anotar otra fecha/i }))
    await userEvent.clear(screen.getByLabelText('Fecha'))
    await userEvent.type(screen.getByLabelText('Fecha'), '2026-07-10')
    await userEvent.type(screen.getByLabelText(/^nombre/i), 'Morning')
    await userEvent.click(screen.getByRole('button', { name: /crear entreno/i }))

    expect(api.createWorkout).toHaveBeenCalledWith({ date: '2026-07-10', name: 'Morning' })
    expect(onOpen).toHaveBeenCalledWith(9, expect.objectContaining({ id: 9 }))
  })

  // The `⋯` charged every day 44px to hold one useful action and one
  // destructive one. The useful one moved onto the row; the destructive one is
  // irreversible and rare, so it goes behind a press and hold, still armed twice.
  it('deletes a day from a long press, after confirming', async () => {
    api.deleteDay.mockResolvedValue(null)
    api.listDays.mockResolvedValue([
      { id: 7, date: '2026-07-15', workouts: [{ id: 4, name: 'Legs', sets: [] }] },
    ])
    const { container } = render(<Days onOpenWorkout={() => {}} />)
    await screen.findByText('Legs')

    await longPressDay(container)
    await userEvent.click(await screen.findByRole('button', { name: /^borrar día$/i }))
    expect(api.deleteDay).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /sí, borrar día/i }))

    await waitFor(() => expect(api.deleteDay).toHaveBeenCalledWith(7))
    expect(screen.queryByText('Legs')).not.toBeInTheDocument()
  })

  // Sus entrenos se van con él, y con ellos lo que el móvil guardaba de cada
  // uno: la copia que lo enseñaría como vivo al abrirlo desde un widget.
  it('forgets the workouts of a deleted day', async () => {
    localStorage.setItem('fitit_workout_cache', JSON.stringify({ id: 4, sets: [] }))
    api.deleteDay.mockResolvedValue(null)
    api.listDays.mockResolvedValue([
      { id: 7, date: '2026-07-15', workouts: [{ id: 4, name: 'Legs', sets: [] }] },
    ])
    const { container } = render(<Days onOpenWorkout={() => {}} />)
    await screen.findByText('Legs')

    await longPressDay(container)
    await userEvent.click(await screen.findByRole('button', { name: /^borrar día$/i }))
    await userEvent.click(screen.getByRole('button', { name: /sí, borrar día/i }))

    await waitFor(() => expect(screen.queryByText('Legs')).not.toBeInTheDocument())
    expect(localStorage.getItem('fitit_workout_cache')).toBeNull()
  })

  it('takes a day that is already gone as deleted', async () => {
    api.deleteDay.mockRejectedValue(Object.assign(new Error('gone'), { status: 404 }))
    api.listDays.mockResolvedValue([
      { id: 7, date: '2026-07-15', workouts: [{ id: 4, name: 'Legs', sets: [] }] },
    ])
    const { container } = render(<Days onOpenWorkout={() => {}} />)
    await screen.findByText('Legs')

    await longPressDay(container)
    await userEvent.click(await screen.findByRole('button', { name: /^borrar día$/i }))
    await userEvent.click(screen.getByRole('button', { name: /sí, borrar día/i }))

    await waitFor(() => expect(screen.queryByText('Legs')).not.toBeInTheDocument())
    expect(screen.queryByText(/no se pudo borrar ese día/i)).not.toBeInTheDocument()
  })

  // A tap is not a press: opening a session is the thing this row does forty
  // times a week, and it must survive the gesture that reaches the sheet.
  it('opens the session on a tap, not the delete sheet', async () => {
    const onOpen = vi.fn()
    api.listDays.mockResolvedValue([
      { id: 7, date: '2026-07-15', workouts: [{ id: 4, name: 'Legs', sets: [] }] },
    ])
    render(<Days onOpenWorkout={onOpen} />)

    await userEvent.click(await screen.findByRole('button', { name: /^Legs/ }))
    expect(onOpen).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /^borrar día$/i })).not.toBeInTheDocument()
  })

  // Repeating today's session into today is starting a second workout on a day
  // you already trained — the exact thing the CTA exists to prevent.
  it('keeps the repeat glyph off the session already running', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-16T12:00:00'))
    try {
      api.listDays.mockResolvedValue([
        { id: 2, date: '2026-07-16', workouts: [{ id: 5, name: 'Push', sets: [benchSet()] }] },
        { id: 1, date: '2026-07-15', workouts: [{ id: 4, name: 'Legs', sets: [benchSet()] }] },
      ])
      const { container } = render(<Days onOpenWorkout={() => {}} />)

      await screen.findByText('Push')
      expect(screen.queryByRole('button', { name: /repetir Push/i })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /repetir Legs/i })).toBeInTheDocument()
      // Its column is still reserved, so the set counts stay one column.
      expect(container.querySelector('.day-repeat-empty')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  // The chevron was a `<span>` outside the row's own button, so the one glyph
  // that said "go in here" was the only dead pixel on the row — and it sat
  // flush, 0px, against a 44px button that creates today's session. Aiming at
  // it did nothing on a tap and opened the delete sheet on a hold. The row is
  // the way in; the right edge now means exactly one thing.
  it('leaves the row’s right edge to the repeat glyph alone', async () => {
    api.listDays.mockResolvedValue([
      { id: 7, date: '2026-07-15', workouts: [{ id: 4, name: 'Legs', sets: [benchSet()] }] },
    ])
    const { container } = render(<Days onOpenWorkout={() => {}} />)

    await screen.findByText('Legs')
    expect(container.querySelector('.day-chevron')).toBeNull()
    // The tappable row and the repeat button, and nothing else on the line.
    expect(container.querySelectorAll('.day-session-row > *').length).toBe(2)
  })

  // The fastest session to log is one already written down — so it stops being
  // the thing hidden behind a menu and becomes a 44px glyph on the row itself.
  it('repeats a past session into today, exercises and all', async () => {
    const onOpen = vi.fn()
    api.listDays.mockResolvedValue([
      {
        id: 7,
        date: '2026-07-15',
        workouts: [
          {
            id: 4,
            name: 'Pull',
            sets: [
              benchSet({ id: 1, exercise_name: 'Dominadas' }),
              benchSet({ id: 2, exercise_name: 'Remo' }),
              benchSet({ id: 3, exercise_name: 'Dominadas' }),
            ],
          },
        ],
      },
    ])
    api.createWorkout.mockResolvedValue({ id: 12, date: '2026-07-24', name: 'Pull', sets: [] })
    render(<Days onOpenWorkout={onOpen} />)
    await screen.findByText('Pull')

    await userEvent.click(screen.getByRole('button', { name: /repetir Pull/i }))

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(12, expect.objectContaining({ id: 12 })))
    expect(api.createWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Pull' }),
    )
    // Each exercise once, in the order it was worked, handed to Entreno.
    expect(JSON.parse(localStorage.getItem('fitit_repeat_template'))).toEqual({
      workoutId: 12,
      names: ['Dominadas', 'Remo'],
    })
  })

  // The group rides on every set, so the list draws its breakdown from the one
  // response it already has — no second request, no name map to keep in step.
  //
  // «Espalda +2» decía cuál era el grupo principal y escondía los otros dos tras
  // una cifra que nadie sabía leer. Diez celdas fijas, una por músculo y siempre
  // en el mismo sitio: se encienden las que trabajaste, más cuantas más series,
  // y bajando la lista se ve qué semana tocó qué sin leer un nombre.
  it('shows the session’s muscles as ten fixed cells', async () => {
    api.listDays.mockResolvedValue([
      {
        id: 2,
        date: '2026-07-16',
        workouts: [
          {
            id: 5,
            name: 'Pull',
            sets: [
              ...Array.from({ length: 10 }, (_, i) =>
                benchSet({ id: 100 + i, muscle_group: 'Espalda' }),
              ),
              ...Array.from({ length: 6 }, (_, i) =>
                benchSet({ id: 200 + i, muscle_group: 'Bíceps' }),
              ),
              ...Array.from({ length: 4 }, (_, i) =>
                benchSet({ id: 300 + i, muscle_group: 'Core' }),
              ),
            ],
          },
        ],
      },
    ])
    const { container } = render(<Days onOpenWorkout={() => {}} />)

    await screen.findByText('Pull')
    const cells = await waitFor(() => {
      const found = container.querySelectorAll('.day-cells .day-cell')
      expect(found).toHaveLength(10)
      return found
    })
    // Canonical order, every row the same: the position is the muscle.
    expect([...cells].map((c) => c.dataset.sets)).toEqual([
      '0', '10', '0', '0', '0', '0', '0', '6', '0', '4',
    ])
    // A screen reader gets the names the colours stand for, biggest first.
    expect(container.querySelector('.day-cells').getAttribute('aria-label')).toBe(
      'Espalda 10, Bíceps 6, Core 4',
    )
    expect(container.querySelector('.day-parts')).toBeNull()
    expect(container.querySelector('.day-seam')).toBeNull()
    expect(api.listExercises).not.toHaveBeenCalled()
  })

  // Las celdas son de músculos. El cardio y lo que no lleva grupo siguen en la
  // cuenta de series, pero no encienden ninguna celda.
  it('keeps cardio and untagged sets in the count, out of the cells', async () => {
    api.listDays.mockResolvedValue([
      {
        id: 2,
        date: '2026-07-16',
        workouts: [
          {
            id: 5,
            name: 'Varios',
            sets: [
              benchSet({ muscle_group: 'Pecho' }),
              benchSet({ id: 11, muscle_group: null }),
              benchSet({ id: 12, kind: 'cardio', muscle_group: null, reps: null, weight: null }),
            ],
          },
        ],
      },
    ])
    const { container } = render(<Days onOpenWorkout={() => {}} />)

    await screen.findByText('Varios')
    await waitFor(() => expect(container.querySelector('.day-cells')).not.toBeNull())
    const lit = [...container.querySelectorAll('.day-cell')].filter((c) => c.dataset.sets !== '0')
    expect(lit.map((c) => c.dataset.group)).toEqual(['Pecho'])
    expect(container.querySelector('.day-session-count').textContent).toBe('3 SER')
  })

  it('leaves an empty session with no breakdown at all', async () => {
    api.listDays.mockResolvedValue([
      {
        id: 2,
        date: '2026-07-16',
        workouts: [{ id: 5, name: 'Vacío', sets: [] }],
      },
    ])
    const { container } = render(<Days onOpenWorkout={() => {}} />)

    await screen.findByText('Vacío')
    expect(container.querySelector('.day-cells')).toBeNull()
  })

  // Una semana cerrada se resume una vez, bajo su regla: las diez celdas con su
  // nombre y sus series. Es lo que enseña qué sitio es cada músculo para leer
  // las filas de debajo. La semana en curso no lo lleva: se está llenando, y
  // mientras entrenas no es una lectura que vayas a usar.
  it('totals a finished week per muscle, and not the one in progress', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-08T12:00:00'))
    try {
      api.listDays.mockResolvedValue([
        { id: 3, date: '2026-08-08', workouts: [{ id: 7, name: 'Pull', sets: [benchSet({ muscle_group: 'Espalda' })] }] },
        {
          id: 2,
          date: '2026-08-02',
          workouts: [
            {
              id: 6,
              name: 'Push',
              sets: [benchSet({ muscle_group: 'Pecho' }), benchSet({ id: 11, muscle_group: 'Pecho' })],
            },
          ],
        },
      ])
      const { container } = render(<Days onOpenWorkout={() => {}} />)

      await screen.findByText('Push')
      const panels = container.querySelectorAll('.week-muscles')
      expect(panels).toHaveLength(1)
      expect(panels[0].closest('.week').querySelector('.week-label').textContent).toBe(
        'SEMANA ANTERIOR',
      )
      const names = [...panels[0].querySelectorAll('.wm-name')].map((n) => n.textContent)
      expect(names).toEqual(['PEC', 'ESP', 'CUÁ', 'GLÚ', 'FEM', 'GEM', 'HOM', 'BÍC', 'TRÍ', 'COR'])
      // Un músculo sin series no tiene cifra: la celda vacía ya lo dice.
      expect([...panels[0].querySelectorAll('.wm-count')].map((n) => n.textContent)).toEqual([
        '2', '', '', '', '', '', '', '', '', '',
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  // Con un año dentro, la lista entera eran cientos de filas del mismo peso. Lo
  // anterior a la semana pasada se pliega en una fila por semana, bajo el nombre
  // de su mes, y se abre en su sitio.
  it('folds older weeks into one row each, opened in place', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-12T12:00:00'))
    try {
      api.listDays.mockResolvedValue([
        { id: 3, date: '2026-10-06', workouts: [{ id: 7, name: 'Push', sets: [benchSet()] }] },
        {
          id: 1,
          date: '2026-09-16',
          workouts: [{ id: 5, name: 'Remo', sets: [benchSet({ muscle_group: 'Espalda' })] }],
        },
      ])
      const { container } = render(<Days onOpenWorkout={() => {}} />)

      await screen.findByText('Push')
      expect(screen.getByRole('heading', { name: /Septiembre/ })).toBeInTheDocument()
      // Una semana sin nada es una fila que lo dice, no un hueco.
      expect(screen.getByText('21–27 SEP').closest('.hist-week')).toHaveTextContent(
        'Sin entrenos',
      )
      expect(screen.queryByText('Remo')).not.toBeInTheDocument()

      const row = screen.getByRole('button', { name: /14–20 SEP/ })
      expect(row).toHaveAttribute('aria-expanded', 'false')
      // Siete casillas, de lunes a domingo; el miércoles fue de espalda.
      const ticks = [...row.querySelectorAll('.hist-tick')].map((t) => t.dataset.group ?? '')
      expect(ticks).toEqual(['', '', 'Espalda', '', '', '', ''])

      await userEvent.click(row)
      expect(row).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByText('Remo')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  // Más atrás, un mes es una fila: cuántos entrenos y cuántas series. Abrirlo
  // enseña sus semanas, y una semana sus días.
  it('folds older months into one row each', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-12T12:00:00'))
    try {
      api.listDays.mockResolvedValue([
        { id: 3, date: '2026-10-06', workouts: [{ id: 7, name: 'Push', sets: [benchSet()] }] },
        { id: 1, date: '2026-07-15', workouts: [{ id: 5, name: 'Legs', sets: [benchSet()] }] },
      ])
      render(<Days onOpenWorkout={() => {}} />)

      await screen.findByText('Push')
      const julio = screen.getByRole('button', { name: /Julio/ })
      expect(julio).toHaveTextContent('1 entreno · 1 ser')
      expect(screen.queryByRole('button', { name: /13–19 JUL/ })).not.toBeInTheDocument()

      await userEvent.click(julio)
      await userEvent.click(screen.getByRole('button', { name: /13–19 JUL/ }))
      expect(screen.getByText('Legs')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  // Today keeps two cues and no chip: its date in ink, and a heavier accent
  // hairline over the block. Both ride things the row already had.
  it('marks today’s block without adding a line to it', async () => {
    // Only fake Date — testing-library's async queries poll via real timers.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-16T12:00:00'))
    try {
      api.listDays.mockResolvedValue([
        { id: 2, date: '2026-07-16', workouts: [{ id: 5, name: 'Push', sets: [] }] },
        { id: 1, date: '2026-07-15', workouts: [{ id: 4, name: 'Legs', sets: [] }] },
      ])
      render(<Days onOpenWorkout={() => {}} />)

      const todayHeading = await screen.findByText('JUE 16')
      const pastHeading = screen.getByText('MIÉ 15')
      expect(todayHeading.closest('.day-block')).toHaveClass('is-today')
      expect(pastHeading.closest('.day-block')).not.toHaveClass('is-today')
    } finally {
      vi.useRealTimers()
    }
  })

  // Racha and Exportar CSV are weekly glances that were charging rent on the
  // screen you touch forty times a session. They live in Progreso now.
  it('keeps the streak and the export off the logging path', async () => {
    api.listDays.mockResolvedValue([
      { id: 1, date: '2026-07-15', workouts: [{ id: 4, name: 'Legs', sets: [] }] },
    ])
    render(<Days onOpenWorkout={() => {}} />)
    await screen.findByText('Legs')

    expect(screen.queryByText(/racha/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /exportar/i })).not.toBeInTheDocument()
  })

  it('shows an empty state when there are no days', async () => {
    render(<Days onOpenWorkout={() => {}} />)
    expect(await screen.findByText(/aún no hay días/i)).toBeInTheDocument()
  })
})
