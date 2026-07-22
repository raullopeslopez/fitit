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

describe('Days', () => {
  beforeEach(() => {
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

    expect(await screen.findByText('jue, 16 jul 2026')).toBeInTheDocument()
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

    await userEvent.click(screen.getByRole('button', { name: /empezar entreno de hoy/i }))

    expect(api.createWorkout).toHaveBeenCalledWith(expect.objectContaining({ name: null }))
    expect(onOpen).toHaveBeenCalledWith(3)
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

  it('deletes a day', async () => {
    api.deleteDay.mockResolvedValue(null)
    api.listDays.mockResolvedValue([
      { id: 7, date: '2026-07-15', workouts: [{ id: 4, name: 'Legs', sets: [] }] },
    ])
    render(<Days onOpenWorkout={() => {}} />)
    await screen.findByText('Legs')

    await userEvent.click(screen.getByRole('button', { name: /borrar día/i }))

    await waitFor(() => expect(api.deleteDay).toHaveBeenCalledWith(7))
    expect(screen.queryByText('Legs')).not.toBeInTheDocument()
  })

  it('shows the training streak', async () => {
    api.listDays.mockResolvedValue([
      { id: 1, date: '2026-07-15', workouts: [{ id: 4, name: 'Legs', sets: [] }] },
    ])
    render(<Days onOpenWorkout={() => {}} />)

    expect(await screen.findByText(/racha/i)).toBeInTheDocument()
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

      const todayHeading = await screen.findByText('jue, 16 jul 2026')
      const pastHeading = screen.getByText('mié, 15 jul 2026')
      expect(todayHeading.closest('.day-head')).toHaveTextContent('HOY')
      expect(pastHeading.closest('.day-head')).not.toHaveTextContent('HOY')
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows an empty state when there are no days', async () => {
    render(<Days onOpenWorkout={() => {}} />)
    expect(await screen.findByText(/aún no hay días/i)).toBeInTheDocument()
  })
})
