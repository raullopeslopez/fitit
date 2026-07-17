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
    api.listExercises.mockResolvedValue([])
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

  it('logs a set in lb and shows the unit', async () => {
    api.getPreviousMarks.mockResolvedValue({ found: false, sets: [] })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet({ unit: 'lb', weight: 135 })],
    })
    render(<Workout />)

    await userEvent.type(screen.getByLabelText(/exercise/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))
    await userEvent.selectOptions(screen.getByLabelText(/unit/i), 'lb')
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/weight/i), '135')
    await userEvent.click(screen.getByRole('button', { name: /log set/i }))

    await waitFor(() =>
      expect(api.logSet).toHaveBeenCalledWith(1, {
        exercise_name: 'Bench Press',
        reps: 8,
        weight: 135,
        unit: 'lb',
      }),
    )
    expect(await screen.findByText(/135 lb x 8/i)).toBeInTheDocument()
  })

  it('shows an error when a request fails', async () => {
    api.getPreviousMarks.mockRejectedValue(new Error('network'))
    render(<Workout />)

    await userEvent.type(screen.getByLabelText(/exercise/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  async function logBenchSet() {
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
    expect(await screen.findByText(/60 kg x 8/i)).toBeInTheDocument()
  }

  it('deletes a logged set and removes it from the list', async () => {
    api.deleteSet.mockResolvedValue(null)
    await logBenchSet()

    await userEvent.click(screen.getByRole('button', { name: /delete/i }))

    await waitFor(() => expect(api.deleteSet).toHaveBeenCalledWith(10))
    expect(screen.queryByText(/60 kg x 8/i)).not.toBeInTheDocument()
  })

  it('edits a logged set inline and shows the updated values', async () => {
    api.editSet.mockResolvedValue(benchSet({ id: 10, reps: 10, weight: 65 }))
    await logBenchSet()

    await userEvent.click(screen.getByRole('button', { name: /edit/i }))
    const reps = screen.getByLabelText(/edit reps/i)
    const weight = screen.getByLabelText(/edit weight/i)
    await userEvent.clear(reps)
    await userEvent.type(reps, '10')
    await userEvent.clear(weight)
    await userEvent.type(weight, '65')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(api.editSet).toHaveBeenCalledWith(10, {
        exercise_name: 'Bench Press',
        reps: 10,
        weight: 65,
        unit: 'kg',
      }),
    )
    expect(await screen.findByText(/65 kg x 10/i)).toBeInTheDocument()
  })

  it('keeps the set and shows an error when delete fails', async () => {
    api.deleteSet.mockRejectedValue(new Error('network'))
    await logBenchSet()

    await userEvent.click(screen.getByRole('button', { name: /delete/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/60 kg x 8/i)).toBeInTheDocument()
  })

  it('keeps every exercise of the session visible', async () => {
    api.getPreviousMarks.mockResolvedValue({ found: false, sets: [] })
    render(<Workout />)

    await userEvent.type(screen.getByLabelText(/exercise/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))
    await screen.findByRole('heading', { name: 'Bench Press' })

    await userEvent.type(screen.getByLabelText(/exercise/i), 'Squat')
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))
    await screen.findByRole('heading', { name: 'Squat' })

    expect(screen.getByRole('heading', { name: 'Bench Press' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Squat' })).toBeInTheDocument()
  })

  it('summarizes the workout when finished', async () => {
    api.getPreviousMarks.mockResolvedValue({ found: false, sets: [] })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet(), benchSet({ id: 11 })],
    })
    render(<Workout />)

    await userEvent.type(screen.getByLabelText(/exercise/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/weight/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /log set/i }))
    await screen.findAllByText(/60 kg x 8/i)

    await userEvent.click(screen.getByRole('button', { name: /finish workout/i }))

    const summary = await screen.findByRole('status')
    expect(summary).toHaveTextContent(/1 exercise/i)
    expect(summary).toHaveTextContent(/2 sets/i)
  })

  it('starts a fresh workout after finishing', async () => {
    api.getPreviousMarks.mockResolvedValue({ found: false, sets: [] })
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
    await screen.findByText(/60 kg x 8/i)
    await userEvent.click(screen.getByRole('button', { name: /finish workout/i }))
    await screen.findByRole('status')

    api.createWorkout.mockResolvedValue({ id: 2, date: '2026-07-16', name: null, sets: [] })
    await userEvent.click(screen.getByRole('button', { name: /start new workout/i }))

    expect(await screen.findByLabelText(/exercise/i)).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Bench Press' })).not.toBeInTheDocument()
  })

  async function addBench() {
    api.getPreviousMarks.mockResolvedValue({ found: false, sets: [] })
    render(<Workout />)
    await userEvent.type(screen.getByLabelText(/exercise/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))
    await screen.findByRole('heading', { name: 'Bench Press' })
  }

  it('does not log a set with empty reps and warns', async () => {
    await addBench()
    await userEvent.type(screen.getByLabelText(/weight/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /log set/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/reps/i)
    expect(api.logSet).not.toHaveBeenCalled()
  })

  it('does not log a set with a negative weight and warns', async () => {
    await addBench()
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/weight/i), '-5')
    await userEvent.click(screen.getByRole('button', { name: /log set/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/weight/i)
    expect(api.logSet).not.toHaveBeenCalled()
  })

  it('suggests known exercises for autocomplete', async () => {
    api.listExercises.mockResolvedValue([
      { id: 1, name: 'Deadlift', muscle_group: null },
      { id: 2, name: 'Overhead Press', muscle_group: null },
    ])
    const { container } = render(<Workout />)

    await waitFor(() => {
      expect(container.querySelector('datalist option[value="Deadlift"]')).not.toBeNull()
    })
    expect(container.querySelector('datalist option[value="Overhead Press"]')).not.toBeNull()

    const input = screen.getByLabelText(/exercise/i)
    const list = input.getAttribute('list')
    expect(list).toBeTruthy()
    expect(container.querySelector(`datalist#${list}`)).not.toBeNull()
  })
})
