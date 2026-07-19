import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Progress from './Progress.jsx'
import * as api from './api.js'

vi.mock('./api.js')

describe('Progress', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.listExercises.mockResolvedValue([])
    api.listDays.mockResolvedValue([])
  })

  it('charts an exercise 1RM history', async () => {
    api.getExerciseHistory.mockResolvedValue([
      { date: '2026-07-10', one_rm: 76 },
      { date: '2026-07-12', one_rm: 88 },
    ])
    const { container } = render(<Progress />)

    await userEvent.type(screen.getByLabelText(/ejercicio/i), 'Bench')
    await userEvent.click(screen.getByRole('button', { name: /ver progreso/i }))

    // The PR reference line labels the record.
    expect(await screen.findByText(/PR 88/)).toBeInTheDocument()
    expect(container.querySelector('svg')).not.toBeNull()
    expect(api.getExerciseHistory).toHaveBeenCalledWith('Bench')
  })

  it('opens with the most-trained lift already charted', async () => {
    api.listDays.mockResolvedValue([
      {
        id: 1,
        date: '2026-07-16',
        workouts: [
          {
            id: 5,
            name: 'Push',
            sets: [
              { id: 1, exercise_name: 'Bench Press', reps: 5, weight: 80, unit: 'kg' },
              { id: 2, exercise_name: 'Bench Press', reps: 5, weight: 80, unit: 'kg' },
              { id: 3, exercise_name: 'Squat', reps: 5, weight: 100, unit: 'kg' },
            ],
          },
        ],
      },
    ])
    api.getExerciseHistory.mockResolvedValue([{ date: '2026-07-16', one_rm: 93.3 }])
    render(<Progress />)

    // Bench Press is logged more often, so it charts without any typing.
    await waitFor(() => expect(api.getExerciseHistory).toHaveBeenCalledWith('Bench Press'))
    expect(await screen.findByRole('button', { name: 'Bench Press' })).toBeInTheDocument()
  })

  it('groups lifts by muscle and charts one on selecting a muscle', async () => {
    api.listExercises.mockResolvedValue([
      { id: 1, name: 'Press banca', muscle_group: 'Pecho' },
      { id: 2, name: 'Sentadilla', muscle_group: 'Pierna' },
    ])
    api.listDays.mockResolvedValue([
      {
        id: 1,
        date: '2026-07-16',
        workouts: [
          {
            id: 5,
            name: 'Full',
            sets: [{ id: 1, exercise_name: 'Sentadilla', reps: 5, weight: 100, unit: 'kg' }],
          },
        ],
      },
    ])
    api.getExerciseHistory.mockResolvedValue([{ date: '2026-07-16', one_rm: 120 }])
    render(<Progress />)

    // A chip per muscle that has exercises.
    const pecho = await screen.findByRole('button', { name: /pecho/i })
    expect(screen.getByRole('button', { name: /pierna/i })).toBeInTheDocument()

    // Selecting Pecho charts that muscle's top lift.
    await userEvent.click(pecho)
    await waitFor(() => expect(api.getExerciseHistory).toHaveBeenCalledWith('Press banca'))
  })

  it('shows an empty state when there is no history', async () => {
    api.getExerciseHistory.mockResolvedValue([])
    render(<Progress />)

    await userEvent.type(screen.getByLabelText(/ejercicio/i), 'Squat')
    await userEvent.click(screen.getByRole('button', { name: /ver progreso/i }))

    expect(await screen.findByText(/aún no hay datos/i)).toBeInTheDocument()
  })
})
