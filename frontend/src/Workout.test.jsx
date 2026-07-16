import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Workout from './Workout.jsx'
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

describe('Workout', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.createWorkout.mockResolvedValue({ id: 1, date: '2026-07-16', name: null, sets: [] })
  })

  it('shows previous marks when you add an exercise', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet({ id: 5 })],
    })
    render(<Workout />)

    await userEvent.type(screen.getByLabelText(/exercise/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))

    expect(await screen.findByText(/60 kg x 8/i)).toBeInTheDocument()
    expect(api.getPreviousMarks).toHaveBeenCalledWith('Bench Press')
  })

  it('says there are no previous marks for a new exercise', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Face Pull',
      found: false,
      sets: [],
    })
    render(<Workout />)

    await userEvent.type(screen.getByLabelText(/exercise/i), 'Face Pull')
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))

    expect(await screen.findByText(/no previous marks/i)).toBeInTheDocument()
  })

  it('logs a set and shows it in the list', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: false,
      sets: [],
    })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet()],
    })
    render(<Workout />)

    await userEvent.type(screen.getByLabelText(/exercise/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))

    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/weight/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /log set/i }))

    expect(await screen.findByRole('listitem')).toHaveTextContent(/60 kg x 8/i)
    await waitFor(() =>
      expect(api.logSet).toHaveBeenCalledWith(1, {
        exercise_name: 'Bench Press',
        reps: 8,
        weight: 60,
        unit: 'kg',
      }),
    )
  })

  it('shows an error when a request fails', async () => {
    api.getPreviousMarks.mockRejectedValue(new Error('network'))
    render(<Workout />)

    await userEvent.type(screen.getByLabelText(/exercise/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
