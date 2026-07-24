import { render, screen, waitFor } from '@testing-library/react'
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

// The day overflow holds the rare actions; open it before reaching for them.
async function openDayMenu() {
  await userEvent.click(screen.getByRole('button', { name: /acciones del/i }))
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
    render(<Days onOpenWorkout={() => {}} />)

    expect(await screen.findByText(/16 JUL/)).toBeInTheDocument()
    expect(screen.getByText('Push')).toBeInTheDocument()
    expect(screen.getByText('Legs')).toBeInTheDocument()
    expect(screen.getByText(/2 series/i)).toBeInTheDocument()
  })

  it('opens a workout when tapped', async () => {
    const onOpen = vi.fn()
    api.listDays.mockResolvedValue([
      { id: 1, date: '2026-07-15', workouts: [{ id: 4, name: 'Legs', sets: [] }] },
    ])
    render(<Days onOpenWorkout={onOpen} />)

    await userEvent.click(await screen.findByRole('button', { name: /Legs/i }))
    expect(onOpen).toHaveBeenCalledWith(4)
  })

  it('starts today’s workout with one tap', async () => {
    const onOpen = vi.fn()
    api.createWorkout.mockResolvedValue({ id: 3, date: '2026-07-19', name: null, sets: [] })
    render(<Days onOpenWorkout={onOpen} />)

    await userEvent.click(screen.getByRole('button', { name: /empezar entreno/i }))

    expect(api.createWorkout).toHaveBeenCalledWith(expect.objectContaining({ name: null }))
    expect(onOpen).toHaveBeenCalledWith(3)
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

      const cta = await screen.findByRole('button', { name: /continuar entreno · Push/i })
      await userEvent.click(cta)

      expect(onOpen).toHaveBeenCalledWith(5)
      expect(api.createWorkout).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('backfills a workout for a chosen date and opens it', async () => {
    const onOpen = vi.fn()
    api.createWorkout.mockResolvedValue({ id: 9, date: '2026-07-10', name: 'Morning', sets: [] })
    render(<Days onOpenWorkout={onOpen} />)

    // The date+name form only appears when you choose another date.
    await userEvent.click(screen.getByRole('button', { name: /otra fecha/i }))
    await userEvent.clear(screen.getByLabelText(/fecha/i))
    await userEvent.type(screen.getByLabelText(/fecha/i), '2026-07-10')
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Morning')
    await userEvent.click(screen.getByRole('button', { name: /crear entreno/i }))

    expect(api.createWorkout).toHaveBeenCalledWith({ date: '2026-07-10', name: 'Morning' })
    expect(onOpen).toHaveBeenCalledWith(9)
  })

  // Borrar día sat next to the row your thumb aims at, at full button weight.
  // It's irreversible and rare: it belongs behind the overflow, armed twice.
  it('deletes a day from the overflow, after confirming', async () => {
    api.deleteDay.mockResolvedValue(null)
    api.listDays.mockResolvedValue([
      { id: 7, date: '2026-07-15', workouts: [{ id: 4, name: 'Legs', sets: [] }] },
    ])
    render(<Days onOpenWorkout={() => {}} />)
    await screen.findByText('Legs')

    await openDayMenu()
    await userEvent.click(screen.getByRole('button', { name: /^borrar día$/i }))
    expect(api.deleteDay).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /sí, borrar día/i }))

    await waitFor(() => expect(api.deleteDay).toHaveBeenCalledWith(7))
    expect(screen.queryByText('Legs')).not.toBeInTheDocument()
  })

  // The fastest session to log is one already written down.
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

    await openDayMenu()
    await userEvent.click(screen.getByRole('button', { name: /repetir/i }))

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(12))
    expect(api.createWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Pull' }),
    )
    // Each exercise once, in the order it was worked, handed to Entreno.
    expect(JSON.parse(localStorage.getItem('fitit_repeat_template'))).toEqual({
      workoutId: 12,
      names: ['Dominadas', 'Remo'],
    })
  })

  it('shows muscle dots for the groups a workout trained', async () => {
    api.listDays.mockResolvedValue([
      {
        id: 2,
        date: '2026-07-16',
        workouts: [
          {
            id: 5,
            name: 'Push',
            sets: [benchSet({ exercise_name: 'Press banca' }), benchSet({ id: 11, exercise_name: 'Press militar' })],
          },
        ],
      },
    ])
    api.listExercises.mockResolvedValue([
      { id: 1, name: 'Press banca', muscle_group: 'Pecho' },
      { id: 2, name: 'Press militar', muscle_group: 'Hombro' },
    ])
    const { container } = render(<Days onOpenWorkout={() => {}} />)

    await screen.findByText('Push')
    await waitFor(() => {
      expect(container.querySelectorAll('.muscle-dots .dot').length).toBe(2)
    })
  })

  it('badges today’s day so it reads apart from recent history', async () => {
    // Only fake Date — testing-library's async queries poll via real timers.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-16T12:00:00'))
    try {
      api.listDays.mockResolvedValue([
        { id: 2, date: '2026-07-16', workouts: [{ id: 5, name: 'Push', sets: [] }] },
        { id: 1, date: '2026-07-15', workouts: [{ id: 4, name: 'Legs', sets: [] }] },
      ])
      render(<Days onOpenWorkout={() => {}} />)

      const todayHeading = await screen.findByText(/16 JUL/)
      const pastHeading = screen.getByText(/15 JUL/)
      expect(todayHeading.closest('.day-head')).toHaveTextContent('HOY')
      expect(pastHeading.closest('.day-head')).not.toHaveTextContent('HOY')
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
