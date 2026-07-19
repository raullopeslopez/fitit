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
    localStorage.clear() // the weight unit is a sticky pref — don't let it leak between tests
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

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    expect(await screen.findByText(/60 kg x 8/i)).toBeInTheDocument()
    expect(api.getPreviousMarks).toHaveBeenCalledWith('Bench Press')
  })

  it('seeds the steppers from the previous set so a repeat is one tap', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet({ reps: 8, weight: 60, unit: 'lb' })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await screen.findByText(/a batir/i)

    expect(screen.getByLabelText(/reps/i)).toHaveValue('8')
    expect(screen.getByLabelText(/peso/i)).toHaveValue('60')
    // The button states exactly what pressing it will log.
    expect(screen.getByRole('button', { name: /registrar 60 × 8/i })).toBeInTheDocument()
  })

  it('bumps the weight stepper by 2.5 kg', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet({ reps: 5, weight: 80, unit: 'kg' })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await screen.findByText(/a batir/i)

    await userEvent.click(screen.getByRole('button', { name: /sumar kg/i }))
    expect(screen.getByLabelText(/peso/i)).toHaveValue('82.5')
  })

  it('says there are no previous marks for a new exercise', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Face Pull',
      found: false,
      sets: [],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Face Pull')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    expect(await screen.findByText(/sin marcas anteriores/i)).toBeInTheDocument()
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

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/peso/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

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

  it('logs a set in lb using the sticky weight-unit toggle', async () => {
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false, sets: [] })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet({ unit: 'lb', weight: 135 })],
    })
    renderWorkout()
    await screen.findByLabelText(/ejercicio/i)

    // The unit is a workout-wide preference, not a per-set field.
    await userEvent.click(screen.getByRole('button', { name: 'lb' }))
    await userEvent.type(screen.getByLabelText(/ejercicio/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/peso/i), '135')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

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

  it('remembers the weight unit across sessions', async () => {
    localStorage.setItem('fitit_weight_unit', 'lb')
    renderWorkout()

    // The lb toggle reflects the stored preference on load.
    expect(await screen.findByRole('button', { name: 'lb' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  function cardioSet(overrides = {}) {
    return {
      id: 30,
      exercise_id: 3,
      exercise_name: 'Correr',
      kind: 'cardio',
      set_index: 0,
      reps: null,
      weight: null,
      unit: 'kg',
      rpe: null,
      note: null,
      duration_seconds: 1470,
      distance: 5.2,
      distance_unit: 'km',
      ...overrides,
    }
  }

  it('logs a cardio run via the cardio card', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Correr',
      found: false,
      sets: [],
      kind: null,
    })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [cardioSet()],
    })
    renderWorkout()
    await screen.findByLabelText(/ejercicio/i)

    // Pick Cardio before adding the exercise.
    await userEvent.click(screen.getByRole('button', { name: /cardio/i }))
    await userEvent.type(screen.getByLabelText(/ejercicio/i), 'Correr')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    await userEvent.type(await screen.findByLabelText(/duración/i), '24:30')
    await userEvent.type(screen.getByLabelText(/distancia/i), '5.2')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    await waitFor(() =>
      expect(api.logSet).toHaveBeenCalledWith(1, {
        exercise_name: 'Correr',
        kind: 'cardio',
        duration_seconds: 1470,
        distance: 5.2,
        distance_unit: 'km',
        note: null,
      }),
    )
    expect(await screen.findByRole('listitem')).toHaveTextContent(
      /24:30 · 5\.2 km · 4:43\/km/i,
    )
  })

  it('renders the cardio card for a known cardio exercise', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Correr',
      found: true,
      sets: [cardioSet()],
      kind: 'cardio',
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Correr')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    // Cardio card: a duration field, and no weight steppers.
    expect(await screen.findByLabelText(/duración/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/peso/i)).not.toBeInTheDocument()
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

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/peso/i), '60')
    await userEvent.type(screen.getByLabelText(/rpe/i), '8')
    await userEvent.type(screen.getByLabelText(/nota/i), 'felt strong')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

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

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    // Steppers are seeded from the previous mark — clear before entering the PR set.
    await userEvent.clear(screen.getByLabelText(/reps/i))
    await userEvent.type(screen.getByLabelText(/reps/i), '3')
    await userEvent.clear(screen.getByLabelText(/peso/i))
    await userEvent.type(screen.getByLabelText(/peso/i), '80')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    // 80 * (1 + 3/30) = 88 > 76 -> personal record
    expect(await screen.findByText(/nuevo récord/i)).toBeInTheDocument()
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

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.clear(screen.getByLabelText(/reps/i))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.clear(screen.getByLabelText(/peso/i))
    await userEvent.type(screen.getByLabelText(/peso/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    await waitFor(() => expect(api.logSet).toHaveBeenCalled())
    expect(screen.queryByText(/nuevo récord/i)).not.toBeInTheDocument()
  })

  it('shows session volume and best estimated 1RM for the exercise', async () => {
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false, sets: [] })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet({ reps: 8, weight: 60 }), benchSet({ id: 11, reps: 5, weight: 70 })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/peso/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    // volume = 60*8 + 70*5 = 830 ; best 1RM = max(76.0, 81.7) = 81.7
    const summary = await screen.findByText(/volumen/i)
    expect(summary).toHaveTextContent(/830/)
    expect(summary).toHaveTextContent(/81\.7/)
  })

  it('shows an error when a request fails', async () => {
    api.getPreviousMarks.mockRejectedValue(new Error('network'))
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

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
    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/peso/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))
    expect(await screen.findByText(/60 kg x 8/i)).toBeInTheDocument()
  }

  it('deletes a logged set and removes it from the list', async () => {
    api.deleteSet.mockResolvedValue(null)
    await logBenchSet()

    await userEvent.click(screen.getByRole('button', { name: /más acciones/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Borrar' }))

    await waitFor(() => expect(api.deleteSet).toHaveBeenCalledWith(10))
    expect(screen.queryByText(/60 kg x 8/i)).not.toBeInTheDocument()
  })

  it('edits a logged set inline and shows the updated values', async () => {
    api.editSet.mockResolvedValue(benchSet({ id: 10, reps: 10, weight: 65 }))
    await logBenchSet()

    await userEvent.click(screen.getByRole('button', { name: /más acciones/i }))
    await userEvent.click(screen.getByRole('button', { name: /editar/i }))
    const reps = screen.getByLabelText(/editar reps/i)
    const weight = screen.getByLabelText(/editar peso/i)
    await userEvent.clear(reps)
    await userEvent.type(reps, '10')
    await userEvent.clear(weight)
    await userEvent.type(weight, '65')
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))

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

  it('adds a copy of the last set with +1', async () => {
    await logBenchSet()

    await userEvent.click(screen.getByRole('button', { name: /\+1/ }))

    await waitFor(() =>
      expect(api.logSet).toHaveBeenLastCalledWith(1, {
        exercise_name: 'Bench Press',
        reps: 8,
        weight: 60,
        unit: 'kg',
        rpe: null,
        note: null,
      }),
    )
  })

  it('edits RPE and note on a set inline', async () => {
    api.editSet.mockResolvedValue(benchSet({ id: 10, reps: 8, weight: 60, rpe: 9, note: 'tough' }))
    await logBenchSet()

    await userEvent.click(screen.getByRole('button', { name: /más acciones/i }))
    await userEvent.click(screen.getByRole('button', { name: /editar/i }))
    await userEvent.type(screen.getByLabelText(/editar rpe/i), '9')
    await userEvent.type(screen.getByLabelText(/editar nota/i), 'tough')
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))

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

    await userEvent.click(screen.getByRole('button', { name: /más acciones/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Borrar' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/60 kg x 8/i)).toBeInTheDocument()
  })

  it('does not log a set with empty reps and warns', async () => {
    api.getPreviousMarks.mockResolvedValue({ found: false, sets: [] })
    renderWorkout()
    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    await userEvent.type(screen.getByLabelText(/peso/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/reps/i)
    expect(api.logSet).not.toHaveBeenCalled()
  })

  it('does not log a set with a negative weight and warns', async () => {
    api.getPreviousMarks.mockResolvedValue({ found: false, sets: [] })
    renderWorkout()
    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/peso/i), '-5')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/peso/i)
    expect(api.logSet).not.toHaveBeenCalled()
  })

  it('keeps every exercise of the session visible', async () => {
    api.getPreviousMarks.mockResolvedValue({ found: false, sets: [] })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await screen.findByRole('heading', { name: 'Bench Press' })

    await userEvent.type(screen.getByLabelText(/ejercicio/i), 'Squat')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await screen.findByRole('heading', { name: 'Squat' })

    expect(screen.getByRole('heading', { name: 'Bench Press' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Squat' })).toBeInTheDocument()
  })

  it('shows the muscle group tag on an exercise', async () => {
    api.listExercises.mockResolvedValue([
      { id: 2, name: 'Bench Press', muscle_group: 'Pecho' },
    ])
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false, sets: [] })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    const heading = await screen.findByRole('heading', { name: /Bench Press/ })
    expect(heading).toHaveTextContent('Pecho')
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

    await userEvent.click(await screen.findByRole('button', { name: /días/i }))
    expect(onExit).toHaveBeenCalled()
  })

  it('renames the current workout', async () => {
    api.renameWorkout.mockResolvedValue({ id: 1, date: '2026-07-16', name: 'Leg Day', sets: [] })
    renderWorkout()

    await userEvent.click(await screen.findByRole('button', { name: /renombrar/i }))
    await userEvent.type(screen.getByLabelText(/nombre del entreno/i), 'Leg Day')
    await userEvent.click(screen.getByRole('button', { name: /guardar nombre/i }))

    await waitFor(() => expect(api.renameWorkout).toHaveBeenCalledWith(1, 'Leg Day'))
    expect(await screen.findByText('Leg Day')).toBeInTheDocument()
  })

  it('deletes the current workout and exits', async () => {
    const onExit = vi.fn()
    api.deleteWorkout.mockResolvedValue(null)
    renderWorkout({ onExit })
    await screen.findByLabelText(/ejercicio/i)

    await userEvent.click(screen.getByRole('button', { name: /borrar entreno/i }))

    await waitFor(() => expect(api.deleteWorkout).toHaveBeenCalledWith(1))
    expect(onExit).toHaveBeenCalled()
  })
})
