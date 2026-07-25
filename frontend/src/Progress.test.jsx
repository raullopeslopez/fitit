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
    // A lift with sets is a lift the exercises endpoint knows about.
    api.listExercises.mockResolvedValue([
      { id: 1, name: 'Bench Press', muscle_group: 'Pecho' },
      { id: 2, name: 'Squat', muscle_group: 'Pierna' },
    ])
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
    // The charted lift is named once, by the card it titles.
    expect(await screen.findByRole('button', { name: /renombrar Bench Press/i })).toBeInTheDocument()
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

  // Muscle chips filter a closed set of seven you already know by heart, so a
  // swipeable line costs nothing. A row of exercise names is the opposite: it is
  // what you are hunting for, and a scroll that hides it is the one thing it
  // must not do. With a search box that reaches everything, the row goes.
  it('picks an exercise from the muscle chips and the search box, with no lift row', async () => {
    api.listExercises.mockResolvedValue([
      { id: 1, name: 'Press banca', muscle_group: 'Pecho' },
      { id: 2, name: 'Sentadilla', muscle_group: 'Pierna' },
    ])
    api.getExerciseHistory.mockResolvedValue([{ date: '2026-07-16', one_rm: 120 }])
    const { container } = render(<Progress />)

    await screen.findByRole('button', { name: /pecho/i })
    expect(container.querySelector('.lift-chips')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Sentadilla$/ })).not.toBeInTheDocument()

    // Everything is still one tap or one search away.
    await userEvent.click(screen.getByRole('button', { name: /pierna/i }))
    await waitFor(() => expect(api.getExerciseHistory).toHaveBeenCalledWith('Sentadilla'))
  })

  // The box only ever fired on an exact, full-name match, so typing "gemelo"
  // did nothing at all — no results, no filtering, no message. A search box
  // that does not search.
  describe('the search box', () => {
    const exercises = [
      { id: 1, name: 'Gemelo Máq.', muscle_group: 'Pierna' },
      { id: 2, name: 'Press banca', muscle_group: 'Pecho' },
    ]

    it('finds an exercise from part of its name', async () => {
      api.listExercises.mockResolvedValue(exercises)
      api.getExerciseHistory.mockResolvedValue([{ date: '2026-07-16', one_rm: 60 }])
      render(<Progress />)

      await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'gemelo')

      const result = await screen.findByRole('button', { name: /Gemelo Máq\./i })
      expect(screen.queryByRole('button', { name: /Press banca/i })).not.toBeInTheDocument()
      await userEvent.click(result)

      await waitFor(() => expect(api.getExerciseHistory).toHaveBeenCalledWith('Gemelo Máq.'))
    })

    // "Máq." is not something anyone types with the accent on a phone keyboard.
    it('ignores accents and case', async () => {
      api.listExercises.mockResolvedValue(exercises)
      render(<Progress />)

      await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'MAQ')
      expect(await screen.findByRole('button', { name: /Gemelo Máq\./i })).toBeInTheDocument()
    })

    // "No data to chart" for a name that does not exist reads as "this exercise
    // has none", when the truth is there is no such exercise.
    it('says a name matches nothing, rather than blaming the data', async () => {
      api.listExercises.mockResolvedValue(exercises)
      api.getExerciseHistory.mockResolvedValue([])
      render(<Progress />)

      await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Sentadilla{enter}')

      expect(await screen.findByText(/ningún ejercicio con ese nombre/i)).toBeInTheDocument()
      expect(screen.queryByText(/no hay datos para graficar/i)).not.toBeInTheDocument()
    })
  })

  // Mejores marcas already lists your lifts with their best set. It was sitting
  // right there, inert, while the only way in was a box that did not search.
  it('charts a lift by tapping its row in Mejores marcas', async () => {
    api.listExercises.mockResolvedValue([{ id: 1, name: 'Sentadilla', muscle_group: 'Pierna' }])
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
    ])
    api.getExerciseHistory.mockResolvedValue([{ date: '2026-07-16', one_rm: 132 }])
    render(<Progress />)

    await userEvent.click(await screen.findByRole('button', { name: /ver progreso de Sentadilla/i }))

    await waitFor(() => expect(api.getExerciseHistory).toHaveBeenCalledWith('Sentadilla'))
  })

  // The field used to hold the charted lift as well as what you were typing, so
  // the same name showed up three times on one screen: card title, search box,
  // active chip. The box searches; the title and the chip say where you are.
  it('empties the search box once it has charted what you picked', async () => {
    api.listExercises.mockResolvedValue([{ id: 7, name: 'Press banca', muscle_group: 'Pecho' }])
    api.getExerciseHistory.mockResolvedValue([{ date: '2026-07-16', one_rm: 93.3 }])
    render(<Progress />)

    const box = await screen.findByLabelText(/ejercicio/i)
    await userEvent.type(box, 'Press banca')

    await waitFor(() => expect(box).toHaveValue(''))
    // The name is stated once, as the thing the card is about.
    expect(screen.getByRole('button', { name: /renombrar Press banca/i })).toBeInTheDocument()
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

    // The name titles the chart card and is the rename control itself, so only
    // the group select is left to fold away.
    expect(screen.getByRole('button', { name: /renombrar Press banca/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/grupo/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^corregir$/i }))
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

    await userEvent.click(await screen.findByRole('button', { name: /renombrar Press banca/i }))
    const input = screen.getByLabelText(/nombre del ejercicio/i)
    await userEvent.clear(input)
    await userEvent.type(input, 'Press de banca')
    await userEvent.click(screen.getByRole('button', { name: /guardar nombre/i }))

    await waitFor(() => expect(api.renameExercise).toHaveBeenCalledWith(7, 'Press de banca'))
    // The editor closes and the new name titles the card.
    expect(
      await screen.findByRole('button', { name: /renombrar Press de banca/i }),
    ).toBeInTheDocument()
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
    // The card is titled and renameable even with nothing to chart.
    expect(screen.getByRole('button', { name: /renombrar Correr/i })).toBeInTheDocument()
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

  // A lift that exists but has no 1RM curve — cardio, or one only ever logged
  // as duration. Distinct from a name that matches nothing at all.
  it('shows an empty state when a known lift has no history', async () => {
    api.listExercises.mockResolvedValue([{ id: 1, name: 'Squat', muscle_group: 'Pierna' }])
    api.getExerciseHistory.mockResolvedValue([])
    render(<Progress />)

    await userEvent.type(screen.getByLabelText(/ejercicio/i), 'Squat{enter}')

    expect(await screen.findByText(/aún no hay datos/i)).toBeInTheDocument()
  })
})
