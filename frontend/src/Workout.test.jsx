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

function renderWorkout(props = {}) {
  return render(<Workout workoutId={1} onExit={() => {}} {...props} />)
}

describe('Workout', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.getWorkout.mockResolvedValue({ id: 1, date: '2026-07-16', name: null, sets: [] })
    api.listExercises.mockResolvedValue([])
  })

  it('shows previous marks when you add an exercise', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet({ id: 5 })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/exercise/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))

    expect(await screen.findByText(/60 kg x 8/i)).toBeInTheDocument()
    expect(api.getPreviousMarks).toHaveBeenCalledWith('Bench Press')
  })

  it('prefills the log form from the previous set with Repeat', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet({ reps: 8, weight: 60, unit: 'lb' })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/exercise/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))
    await screen.findByText(/last time/i)

    await userEvent.click(screen.getByRole('button', { name: /repeat/i }))

    expect(screen.getByLabelText(/reps/i)).toHaveValue('8')
    expect(screen.getByLabelText(/weight/i)).toHaveValue('60')
    expect(screen.getByLabelText(/unit/i)).toHaveValue('lb')
  })

  it('says there are no previous marks for a new exercise', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Face Pull',
      found: false,
      sets: [],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/exercise/i), 'Face Pull')
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
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/exercise/i), 'Bench Press')
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
        rpe: null,
        note: null,
      }),
    )
  })

  it('logs a set in lb and shows the unit', async () => {
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false, sets: [] })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet({ unit: 'lb', weight: 135 })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/exercise/i), 'Bench Press')
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
        rpe: null,
        note: null,
      }),
    )
    expect(await screen.findByText(/135 lb x 8/i)).toBeInTheDocument()
  })

  it('logs a set with RPE and a note', async () => {
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false, sets: [] })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet({ rpe: 8, note: 'felt strong' })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/exercise/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/weight/i), '60')
    await userEvent.type(screen.getByLabelText(/rpe/i), '8')
    await userEvent.type(screen.getByLabelText(/note/i), 'felt strong')
    await userEvent.click(screen.getByRole('button', { name: /log set/i }))

    await waitFor(() =>
      expect(api.logSet).toHaveBeenCalledWith(1, {
        exercise_name: 'Bench Press',
        reps: 8,
        weight: 60,
        unit: 'kg',
        rpe: 8,
        note: 'felt strong',
      }),
    )
    expect(await screen.findByText(/RPE 8/i)).toBeInTheDocument()
    expect(screen.getByText(/felt strong/i)).toBeInTheDocument()
  })

  it('celebrates a new personal record', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet()],
      best_one_rm: 76,
    })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet({ id: 20, reps: 3, weight: 80 })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/exercise/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))
    await userEvent.type(screen.getByLabelText(/reps/i), '3')
    await userEvent.type(screen.getByLabelText(/weight/i), '80')
    await userEvent.click(screen.getByRole('button', { name: /log set/i }))

    // 80 * (1 + 3/30) = 88 > 76 -> personal record
    expect(await screen.findByText(/new pr/i)).toBeInTheDocument()
  })

  it('does not celebrate a non-record set', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet()],
      best_one_rm: 100,
    })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet()],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/exercise/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/weight/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /log set/i }))

    await waitFor(() => expect(api.logSet).toHaveBeenCalled())
    expect(screen.queryByText(/new pr/i)).not.toBeInTheDocument()
  })

  it('shows an error when a request fails', async () => {
    api.getPreviousMarks.mockRejectedValue(new Error('network'))
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/exercise/i), 'Bench Press')
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
    renderWorkout()
    await userEvent.type(await screen.findByLabelText(/exercise/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/weight/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /log set/i }))
    expect(await screen.findByText(/60 kg x 8/i)).toBeInTheDocument()
  }

  it('deletes a logged set and removes it from the list', async () => {
    api.deleteSet.mockResolvedValue(null)
    await logBenchSet()

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

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
        rpe: null,
        note: null,
      }),
    )
    expect(await screen.findByText(/65 kg x 10/i)).toBeInTheDocument()
  })

  it('edits RPE and note on a set inline', async () => {
    api.editSet.mockResolvedValue(benchSet({ id: 10, reps: 8, weight: 60, rpe: 9, note: 'tough' }))
    await logBenchSet()

    await userEvent.click(screen.getByRole('button', { name: /edit/i }))
    await userEvent.type(screen.getByLabelText(/edit rpe/i), '9')
    await userEvent.type(screen.getByLabelText(/edit note/i), 'tough')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(api.editSet).toHaveBeenCalledWith(10, {
        exercise_name: 'Bench Press',
        reps: 8,
        weight: 60,
        unit: 'kg',
        rpe: 9,
        note: 'tough',
      }),
    )
    expect(await screen.findByText(/RPE 9/i)).toBeInTheDocument()
    expect(screen.getByText(/tough/i)).toBeInTheDocument()
  })

  it('keeps the set and shows an error when delete fails', async () => {
    api.deleteSet.mockRejectedValue(new Error('network'))
    await logBenchSet()

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/60 kg x 8/i)).toBeInTheDocument()
  })

  it('does not log a set with empty reps and warns', async () => {
    api.getPreviousMarks.mockResolvedValue({ found: false, sets: [] })
    renderWorkout()
    await userEvent.type(await screen.findByLabelText(/exercise/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))

    await userEvent.type(screen.getByLabelText(/weight/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /log set/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/reps/i)
    expect(api.logSet).not.toHaveBeenCalled()
  })

  it('does not log a set with a negative weight and warns', async () => {
    api.getPreviousMarks.mockResolvedValue({ found: false, sets: [] })
    renderWorkout()
    await userEvent.type(await screen.findByLabelText(/exercise/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))

    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/weight/i), '-5')
    await userEvent.click(screen.getByRole('button', { name: /log set/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/weight/i)
    expect(api.logSet).not.toHaveBeenCalled()
  })

  it('keeps every exercise of the session visible', async () => {
    api.getPreviousMarks.mockResolvedValue({ found: false, sets: [] })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/exercise/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))
    await screen.findByRole('heading', { name: 'Bench Press' })

    await userEvent.type(screen.getByLabelText(/exercise/i), 'Squat')
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))
    await screen.findByRole('heading', { name: 'Squat' })

    expect(screen.getByRole('heading', { name: 'Bench Press' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Squat' })).toBeInTheDocument()
  })

  it('suggests known exercises for autocomplete', async () => {
    api.listExercises.mockResolvedValue([
      { id: 1, name: 'Deadlift', muscle_group: null },
      { id: 2, name: 'Overhead Press', muscle_group: null },
    ])
    const { container } = renderWorkout()

    await waitFor(() => {
      expect(container.querySelector('datalist option[value="Deadlift"]')).not.toBeNull()
    })
    expect(container.querySelector('datalist option[value="Overhead Press"]')).not.toBeNull()
  })

  it('loads the exercises already logged in the workout', async () => {
    api.getWorkout.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: 'Push',
      sets: [benchSet()],
    })
    renderWorkout()

    expect(await screen.findByRole('heading', { name: 'Bench Press' })).toBeInTheDocument()
    expect(screen.getByText(/60 kg x 8/i)).toBeInTheDocument()
  })

  it('goes back to the days view', async () => {
    const onExit = vi.fn()
    renderWorkout({ onExit })

    await userEvent.click(await screen.findByRole('button', { name: /days/i }))
    expect(onExit).toHaveBeenCalled()
  })

  it('renames the current workout', async () => {
    api.renameWorkout.mockResolvedValue({ id: 1, date: '2026-07-16', name: 'Leg Day', sets: [] })
    renderWorkout()

    await userEvent.click(await screen.findByRole('button', { name: /rename/i }))
    await userEvent.type(screen.getByLabelText(/workout name/i), 'Leg Day')
    await userEvent.click(screen.getByRole('button', { name: /save name/i }))

    await waitFor(() => expect(api.renameWorkout).toHaveBeenCalledWith(1, 'Leg Day'))
    expect(await screen.findByText('Leg Day')).toBeInTheDocument()
  })

  it('deletes the current workout and exits', async () => {
    const onExit = vi.fn()
    api.deleteWorkout.mockResolvedValue(null)
    renderWorkout({ onExit })
    await screen.findByLabelText(/exercise/i)

    await userEvent.click(screen.getByRole('button', { name: /delete workout/i }))

    await waitFor(() => expect(api.deleteWorkout).toHaveBeenCalledWith(1))
    expect(onExit).toHaveBeenCalled()
  })
})
