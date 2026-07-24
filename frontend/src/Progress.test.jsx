import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Progress from './Progress.jsx'
import * as api from './api.js'
import { downloadCsv } from './csv.js'

vi.mock('./api.js')
vi.mock('./csv.js')

describe('Progress', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.listExercises.mockResolvedValue([])
    api.listDays.mockResolvedValue([])
    api.getBestMarks.mockResolvedValue([])
    // Progress opens on your most-trained lift, so any fixture with sets in it
    // pulls history on mount. Unmocked, that resolves undefined and takes the
    // whole render down with it.
    api.getExerciseHistory.mockResolvedValue([])
  })

  it('lists my best marks with the gap to the record each one beat', async () => {
    api.getBestMarks.mockResolvedValue([
      {
        exercise_id: 1,
        exercise_name: 'Sentadilla',
        muscle_group: 'Pierna',
        reps: 3,
        weight_kg: 120,
        one_rm: 132,
        delta_one_rm: 5,
      },
      {
        exercise_id: 2,
        exercise_name: 'Peso muerto',
        muscle_group: 'Espalda',
        reps: 2,
        weight_kg: 150,
        one_rm: 160,
        delta_one_rm: null,
      },
    ])
    render(<Progress />)

    expect(await screen.findByText(/mejores marcas/i)).toBeInTheDocument()
    expect(screen.getByText('Sentadilla')).toBeInTheDocument()
    expect(screen.getByText(/120 kg × 3/)).toBeInTheDocument()
    expect(screen.getByText('+5 kg')).toBeInTheDocument()
    // A record nothing has beaten yet gets a dash, not a fake +0.
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('says nothing about best marks when there are none', async () => {
    render(<Progress />)

    await waitFor(() => expect(api.getBestMarks).toHaveBeenCalled())
    expect(screen.queryByText(/mejores marcas/i)).not.toBeInTheDocument()
  })

  it('charts an exercise 1RM history', async () => {
    api.getExerciseHistory.mockResolvedValue([
      { date: '2026-07-10', one_rm: 76 },
      { date: '2026-07-12', one_rm: 88 },
    ])
    const { container } = render(<Progress />)

    // A name nothing knows yet is submitted with the keyboard's go key.
    await userEvent.type(screen.getByLabelText(/ejercicio/i), 'Bench{enter}')

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

  // The chart is what you opened Progreso for; the picker is the mechanism that
  // drives it. Three stacked selectors plus a submit button sat on top of it, so
  // on a phone you scrolled the whole apparatus to reach the content.
  it('puts the chart above the picker that drives it', async () => {
    api.listExercises.mockResolvedValue([{ id: 7, name: 'Press banca', muscle_group: 'Pecho' }])
    api.listDays.mockResolvedValue([
      {
        id: 1,
        date: '2026-07-16',
        workouts: [
          {
            id: 5,
            name: 'Push',
            sets: [{ id: 1, exercise_name: 'Press banca', reps: 5, weight: 80, unit: 'kg' }],
          },
        ],
      },
    ])
    api.getExerciseHistory.mockResolvedValue([{ date: '2026-07-16', one_rm: 93.3 }])
    const { container } = render(<Progress />)

    const chart = await waitFor(() => {
      const svg = container.querySelector('svg.chart')
      expect(svg).not.toBeNull()
      return svg
    })
    const picker = screen.getByLabelText(/ejercicio/i)
    expect(chart.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // Picking a known lift already loads it from the chips; making the text field
  // alone demand a second tap on a button was two paths for one job.
  it('charts a known lift the moment you pick it, with no second tap', async () => {
    api.listExercises.mockResolvedValue([{ id: 7, name: 'Press banca', muscle_group: 'Pecho' }])
    api.getExerciseHistory.mockResolvedValue([{ date: '2026-07-16', one_rm: 93.3 }])
    render(<Progress />)

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Press banca')

    await waitFor(() => expect(api.getExerciseHistory).toHaveBeenCalledWith('Press banca'))
    expect(screen.queryByRole('button', { name: /ver progreso/i })).not.toBeInTheDocument()
  })

  // Renaming a lift and re-tagging its group are corrections, the same shape as
  // the ones on the exercise card: rare, and they were sitting in the content.
  it('folds the corrections away until you reach for them', async () => {
    api.listExercises.mockResolvedValue([{ id: 7, name: 'Press banca', muscle_group: 'Pecho' }])
    api.getExerciseHistory.mockResolvedValue([{ date: '2026-07-16', one_rm: 93.3 }])
    render(<Progress />)

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Press banca')
    await waitFor(() => expect(api.getExerciseHistory).toHaveBeenCalled())

    expect(screen.queryByRole('button', { name: /editar nombre/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^corregir$/i }))
    expect(screen.getByRole('button', { name: /editar nombre/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/grupo/i)).toBeInTheDocument()
  })

  it('lets you correct a mis-guessed muscle group', async () => {
    api.listExercises.mockResolvedValue([
      { id: 7, name: 'Press banca', muscle_group: 'Pecho' },
    ])
    api.listDays.mockResolvedValue([
      {
        id: 1,
        date: '2026-07-16',
        workouts: [
          {
            id: 5,
            name: 'Push',
            sets: [{ id: 1, exercise_name: 'Press banca', reps: 5, weight: 80, unit: 'kg' }],
          },
        ],
      },
    ])
    api.getExerciseHistory.mockResolvedValue([{ date: '2026-07-16', one_rm: 93.3 }])
    api.setExerciseMuscle.mockResolvedValue({ id: 7, name: 'Press banca', muscle_group: 'Hombro' })
    render(<Progress />)

    await userEvent.click(await screen.findByRole('button', { name: /^corregir$/i }))
    const select = screen.getByLabelText(/grupo/i)
    expect(select).toHaveValue('Pecho')

    await userEvent.selectOptions(select, 'Hombro')

    await waitFor(() => expect(api.setExerciseMuscle).toHaveBeenCalledWith(7, 'Hombro'))
    expect(await screen.findByLabelText(/grupo/i)).toHaveValue('Hombro')
  })

  it('lets you rename the current exercise', async () => {
    api.listExercises.mockResolvedValue([
      { id: 7, name: 'Press banca', muscle_group: 'Pecho' },
    ])
    api.listDays.mockResolvedValue([
      {
        id: 1,
        date: '2026-07-16',
        workouts: [
          {
            id: 5,
            name: 'Push',
            sets: [{ id: 1, exercise_name: 'Press banca', reps: 5, weight: 80, unit: 'kg' }],
          },
        ],
      },
    ])
    api.getExerciseHistory.mockResolvedValue([{ date: '2026-07-16', one_rm: 93.3 }])
    api.renameExercise.mockResolvedValue({ id: 7, name: 'Press de banca', muscle_group: 'Pecho' })
    render(<Progress />)

    await userEvent.click(await screen.findByRole('button', { name: /^corregir$/i }))
    await userEvent.click(screen.getByRole('button', { name: /editar nombre/i }))
    const input = screen.getByLabelText(/nombre del ejercicio/i)
    await userEvent.clear(input)
    await userEvent.type(input, 'Press de banca')
    await userEvent.click(screen.getByRole('button', { name: /guardar nombre/i }))

    await waitFor(() => expect(api.renameExercise).toHaveBeenCalledWith(7, 'Press de banca'))
    // The editor closes and the new name is shown.
    expect(await screen.findByRole('button', { name: /editar nombre/i })).toBeInTheDocument()
    expect(screen.getByText('Press de banca')).toBeInTheDocument()
    expect(screen.queryByLabelText(/nombre del ejercicio/i)).not.toBeInTheDocument()
  })

  it('lets you rename an exercise that has no chart data yet', async () => {
    api.listExercises.mockResolvedValue([
      { id: 9, name: 'Correr', muscle_group: null },
    ])
    api.listDays.mockResolvedValue([
      {
        id: 1,
        date: '2026-07-16',
        workouts: [
          {
            id: 5,
            name: 'Cardio',
            sets: [{ id: 1, exercise_name: 'Correr', reps: 0, weight: 0, unit: 'kg' }],
          },
        ],
      },
    ])
    // No 1RM history to chart (cardio), but the exercise must still be editable.
    api.getExerciseHistory.mockResolvedValue([])
    render(<Progress />)

    expect(await screen.findByText(/no hay datos para graficar/i)).toBeInTheDocument()
    // The rename control is still reachable despite the empty chart.
    await userEvent.click(screen.getByRole('button', { name: /^corregir$/i }))
    expect(screen.getByRole('button', { name: /editar nombre/i })).toBeInTheDocument()
  })

  it('shows the consistency heatmap with a streak when there are training days', async () => {
    api.getExerciseHistory.mockResolvedValue([])
    api.listDays.mockResolvedValue([
      {
        id: 1,
        date: '2026-07-16',
        workouts: [
          {
            id: 5,
            name: 'Push',
            sets: [{ id: 1, exercise_name: 'Bench', reps: 5, weight: 80, unit: 'kg' }],
          },
        ],
      },
    ])
    render(<Progress />)

    expect(await screen.findByText(/racha/i)).toBeInTheDocument()
  })

  // Exporting is a once-a-month act of bookkeeping. It sits with the numbers
  // it exports, not on the screen you tap between sets.
  it('exports the whole log to CSV', async () => {
    const days = [
      {
        id: 1,
        date: '2026-07-15',
        workouts: [
          {
            id: 4,
            name: 'Push',
            sets: [{ id: 1, exercise_name: 'Bench', reps: 5, weight: 80, unit: 'kg' }],
          },
        ],
      },
    ]
    api.listDays.mockResolvedValue(days)
    render(<Progress />)

    await userEvent.click(await screen.findByRole('button', { name: /exportar csv/i }))
    expect(downloadCsv).toHaveBeenCalledWith(days)
  })

  it('shows an empty state when there is no history', async () => {
    api.getExerciseHistory.mockResolvedValue([])
    render(<Progress />)

    await userEvent.type(screen.getByLabelText(/ejercicio/i), 'Squat{enter}')

    expect(await screen.findByText(/aún no hay datos/i)).toBeInTheDocument()
  })
})
