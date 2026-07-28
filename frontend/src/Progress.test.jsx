import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Progress from './Progress.jsx'
import * as api from './api.js'
import { downloadCsv } from './csv.js'

vi.mock('./api.js')
vi.mock('./csv.js')

const bench = (id, weight, reps) => ({
  id,
  exercise_name: 'Press banca',
  muscle_group: 'Pecho',
  set_index: 0,
  weight,
  reps,
})

// Three sessions climbing 80 → 82.5 → 85, with a back-off set that isn't a
// record. Newest first, the order /days uses.
const BENCH_DAYS = [
  { id: 3, date: '2026-07-20', workouts: [{ id: 3, sets: [bench(5, 85, 5), bench(6, 80, 6)] }] },
  { id: 2, date: '2026-07-10', workouts: [{ id: 2, sets: [bench(3, 82.5, 5)] }] },
  { id: 1, date: '2026-07-01', workouts: [{ id: 1, sets: [bench(1, 80, 5)] }] },
]

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

  // "Mejores marcas" was a leaderboard of your own lifts, and it answered a
  // question nobody was asking twice. Evolución shows the climb instead.
  it('has no best-marks leaderboard', async () => {
    render(<Progress />)

    await waitFor(() => expect(api.listDays).toHaveBeenCalled())
    expect(screen.queryByText(/mejores marcas/i)).not.toBeInTheDocument()
  })

  it('draws the climb of a lift from its real records', async () => {
    api.listExercises.mockResolvedValue([{ id: 1, name: 'Press banca', muscle_group: 'Pecho' }])
    api.listDays.mockResolvedValue(BENCH_DAYS)
    const { container } = render(<Progress />)

    expect(await screen.findByText(/evolución/i)).toBeInTheDocument()
    // Three sessions, three records — the 80 × 6 back-off is not one of them.
    expect(screen.getByText('80 × 5')).toBeInTheDocument()
    expect(screen.getByText('82.5 × 5')).toBeInTheDocument()
    expect(screen.getByText('85 × 5')).toBeInTheDocument()
    expect(screen.queryByText('80 × 6')).not.toBeInTheDocument()
    expect(container.querySelector('svg.chart')).not.toBeNull()
  })

  // A chart re-used the same <svg> across exercises and keyed its points by
  // date. Two lifts trained on the same days (everyone's log, most weeks) or
  // one lift with two PRs in a single session gave React duplicate/matching
  // keys, and it left the old exercise's dots and labels on screen instead of
  // replacing them.
  it('does not leave a previous exercise\'s points on the chart after switching', async () => {
    api.listExercises.mockResolvedValue([
      { id: 1, name: 'Curl Predicador Máq.', muscle_group: 'Bíceps' },
      { id: 2, name: 'Press banca', muscle_group: 'Pecho' },
    ])
    api.listDays.mockResolvedValue([
      {
        id: 1,
        date: '2026-07-26',
        workouts: [
          {
            id: 1,
            sets: [
              { id: 1, exercise_name: 'Curl Predicador Máq.', muscle_group: 'Bíceps', reps: 15, weight: 15 },
              { id: 2, exercise_name: 'Curl Predicador Máq.', muscle_group: 'Bíceps', reps: 15, weight: 20 },
              // Same date as the curl's two PRs above, so a naive `key={date}`
              // collides across exercises as well as within one.
              { id: 3, exercise_name: 'Press banca', muscle_group: 'Pecho', reps: 12, weight: 40 },
            ],
          },
        ],
      },
      {
        id: 2,
        date: '2026-07-21',
        workouts: [
          { id: 2, sets: [{ id: 4, exercise_name: 'Press banca', muscle_group: 'Pecho', reps: 12, weight: 20 }] },
        ],
      },
    ])
    const { container } = render(<Progress />)

    // Opens on Curl Predicador (only lift with more than one set).
    expect(await screen.findByRole('button', { name: /renombrar Curl Predicador Máq\./i })).toBeInTheDocument()
    expect(screen.getByText('15 × 15')).toBeInTheDocument()
    expect(screen.getByText('20 × 15')).toBeInTheDocument()

    // Heatmap draws its own muscle legend above this card with the same chip
    // labels, so the click has to stay scoped to Evolución's own chips.
    const evoCard = screen.getByText(/evolución/i).closest('.card')
    await userEvent.click(
      [...evoCard.querySelectorAll('.chip')].find((c) => /^Pecho$/i.test(c.textContent)),
    )
    await screen.findByRole('button', { name: /renombrar Press banca/i })

    // Only Press banca's own points remain; the curl's survive nowhere.
    expect(screen.queryByText('15 × 15')).not.toBeInTheDocument()
    expect(screen.queryByText('20 × 15')).not.toBeInTheDocument()
    expect(container.querySelectorAll('svg.chart circle').length).toBe(2)
  })

  // The chips belong to the chart they drive. Stranded at the bottom of the
  // screen inside the search card, you had to scroll past the chart to change
  // what it was about.
  it('puts the muscle chips in the card whose chart they change', async () => {
    api.listExercises.mockResolvedValue([
      { id: 1, name: 'Press banca', muscle_group: 'Pecho' },
      { id: 2, name: 'Sentadilla', muscle_group: 'Pierna' },
    ])
    api.listDays.mockResolvedValue(BENCH_DAYS)
    render(<Progress />)

    const card = (await screen.findByText(/evolución/i)).closest('.card')
    expect(card.querySelector('.muscle-chips')).not.toBeNull()
    await userEvent.click(
      [...card.querySelectorAll('.chip')].find((c) => /pierna/i.test(c.textContent)),
    )
    expect(await screen.findByRole('button', { name: /renombrar Sentadilla/i })).toBeInTheDocument()
  })

  // The last record sits on the right edge of the chart, so its label ran off
  // the side: "30 × 15" rendered as "3(".
  it('turns the last label inwards so it does not run off the chart', async () => {
    api.listExercises.mockResolvedValue([{ id: 1, name: 'Press banca', muscle_group: 'Pecho' }])
    api.listDays.mockResolvedValue(BENCH_DAYS)
    const { container } = render(<Progress />)

    await screen.findByText(/evolución/i)
    const last = [...container.querySelectorAll('svg text')].find(
      (t) => t.textContent === '85 × 5',
    )
    expect(last.getAttribute('text-anchor')).toBe('end')
  })

  it('says how much the climb was worth, and since when', async () => {
    api.listExercises.mockResolvedValue([{ id: 1, name: 'Press banca', muscle_group: 'Pecho' }])
    api.listDays.mockResolvedValue(BENCH_DAYS)
    render(<Progress />)

    expect(await screen.findByText(/solo récords reales/i)).toBeInTheDocument()
    expect(screen.getByText('+5 kg')).toBeInTheDocument()
    expect(screen.getByText(/desde julio/i)).toBeInTheDocument()
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
    render(<Progress />)

    // Bench Press is logged more often, so it charts without any typing, and
    // the charted lift is named once — by the card it titles.
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
    render(<Progress />)

    // A chip per muscle that has exercises. The heatmap has its own filter
    // chips, so the picker's are the ones inside the form.
    const chips = await screen.findAllByRole('button', { name: /pecho/i })
    expect(screen.getAllByRole('button', { name: /pierna/i }).length).toBeGreaterThan(0)

    // Selecting Pecho charts that muscle's top lift.
    await userEvent.click(chips.at(-1))
    expect(
      await screen.findByRole('button', { name: /renombrar Press banca/i }),
    ).toBeInTheDocument()
  })

  // The search box is the general way into the card — anything the muscle
  // chips can't reach — so it leads, with the chips as a shortcut for the
  // common case and the chart as the content both of them drive.
  it('puts the picker above the chart it drives', async () => {
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
    expect(picker.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
    const { container } = render(<Progress />)

    await screen.findByRole('button', { name: /pecho/i })
    expect(container.querySelector('.lift-chips')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Sentadilla$/ })).not.toBeInTheDocument()

    // Everything is still one tap or one search away.
    await userEvent.click(screen.getByRole('button', { name: /pierna/i }))
    expect(await screen.findByRole('button', { name: /renombrar Sentadilla/i })).toBeInTheDocument()
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
      render(<Progress />)

      await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'gemelo')

      const result = await screen.findByRole('button', { name: /Gemelo Máq\./i })
      expect(screen.queryByRole('button', { name: /Press banca/i })).not.toBeInTheDocument()
      await userEvent.click(result)

      expect(
        await screen.findByRole('button', { name: /renombrar Gemelo Máq\./i }),
      ).toBeInTheDocument()
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
      render(<Progress />)

      await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Sentadilla{enter}')

      expect(await screen.findByText(/ningún ejercicio con ese nombre/i)).toBeInTheDocument()
      expect(screen.queryByText(/no hay datos para graficar/i)).not.toBeInTheDocument()
    })
  })

  // The field used to hold the charted lift as well as what you were typing, so
  // the same name showed up three times on one screen: card title, search box,
  // active chip. The box searches; the title and the chip say where you are.
  it('empties the search box once it has charted what you picked', async () => {
    api.listExercises.mockResolvedValue([{ id: 7, name: 'Press banca', muscle_group: 'Pecho' }])
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
    render(<Progress />)

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Press banca')

    expect(
      await screen.findByRole('button', { name: /renombrar Press banca/i }),
    ).toBeInTheDocument()
  })

  // Renaming a lift and re-tagging its group are corrections, the same shape as
  // the ones on the exercise card: rare, and they were sitting in the content.
  it('folds the corrections away until you reach for them', async () => {
    api.listExercises.mockResolvedValue([{ id: 7, name: 'Press banca', muscle_group: 'Pecho' }])
    render(<Progress />)

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Press banca')
    await screen.findByRole('button', { name: /renombrar Press banca/i })

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
            // Cardio: duration and distance, no weight to climb.
            sets: [{ id: 1, exercise_name: 'Correr', duration_seconds: 1800, distance: 5 }],
          },
        ],
      },
    ])
    render(<Progress />)

    expect(await screen.findByText(/no hay datos para graficar/i)).toBeInTheDocument()
    // The card is titled and renameable even with nothing to chart.
    expect(screen.getByRole('button', { name: /renombrar Correr/i })).toBeInTheDocument()
  })

  it('shows the calendar of what you trained when there are training days', async () => {
    api.getExerciseHistory.mockResolvedValue([])
    api.listDays.mockResolvedValue([
      {
        id: 1,
        date: '2026-07-16',
        workouts: [
          {
            id: 5,
            name: 'Push',
            sets: [
              {
                id: 1,
                exercise_name: 'Bench',
                muscle_group: 'Pecho',
                reps: 5,
                weight: 80,
                unit: 'kg',
              },
            ],
          },
        ],
      },
    ])
    render(<Progress />)

    expect(await screen.findByText(/qué has entrenado/i)).toBeInTheDocument()
    // Consistency scoring is gone: it never said anything about training.
    expect(screen.queryByText(/racha/i)).not.toBeInTheDocument()
  })

  describe('the period summary', () => {
    // 26 jul 2026 is a Sunday, so "this week" is 20–26 jul.
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      vi.setSystemTime(new Date(2026, 6, 26, 12))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    const SUMMER = [
      {
        id: 3,
        date: '2026-07-22',
        workouts: [{ id: 3, sets: [bench(3, 60, 8), bench(4, 60, 8), bench(5, 60, 8)] }],
      },
      { id: 2, date: '2026-07-20', workouts: [{ id: 2, sets: [bench(1, 60, 8), bench(2, 60, 8)] }] },
      { id: 1, date: '2026-07-15', workouts: [{ id: 1, sets: [bench(6, 55, 8), bench(7, 55, 8)] }] },
    ]

    it('breaks a month down into sets per muscle', async () => {
      api.listDays.mockResolvedValue(SUMMER)
      const { container } = render(<Progress />)

      expect(await screen.findByText('Julio')).toBeInTheDocument()
      expect(screen.getByText(/3 entrenos/)).toBeInTheDocument()
      expect(container.querySelector('.sum-name').textContent).toBe('Pecho')
    })

    it('switches to the week, which counts sets rather than averaging them', async () => {
      api.listDays.mockResolvedValue(SUMMER)
      const { container } = render(<Progress />)

      await userEvent.click(await screen.findByRole('button', { name: /^semana$/i }))

      expect(await screen.findByText('Esta semana')).toBeInTheDocument()
      expect(screen.getByText(/2 entrenos · 5 series/)).toBeInTheDocument()
      // 5 this week against 2 the week before.
      expect(container.querySelector('.sum-val').textContent).toBe('5 series')
      expect(container.querySelector('.sum-delta').textContent).toBe('+3')
    })

    it('walks back through the periods, and stops at both ends', async () => {
      api.listDays.mockResolvedValue(SUMMER)
      render(<Progress />)

      await userEvent.click(await screen.findByRole('button', { name: /^semana$/i }))
      // Nothing newer than the week you're in.
      expect(screen.getByRole('button', { name: /periodo siguiente/i })).toBeDisabled()

      await userEvent.click(screen.getByRole('button', { name: /periodo anterior/i }))
      expect(await screen.findByRole('heading', { name: '13–19 jul' })).toBeInTheDocument()
      // And nothing older than the first week you ever logged.
      expect(screen.getByRole('button', { name: /periodo anterior/i })).toBeDisabled()
    })

    // "6.2 series/sem" wrapped onto two lines inside its column and broke the
    // rhythm of every row. The footer already says the unit, so the row doesn't
    // have to spell it.
    it('states a monthly average short enough to fit its column', async () => {
      api.listDays.mockResolvedValue(SUMMER)
      const { container } = render(<Progress />)

      await screen.findByText('Julio')
      expect(container.querySelector('.sum-val').textContent).toBe('1.9/sem')
      expect(screen.getByText(/media de series por semana/i)).toBeInTheDocument()
    })

    // Every row read "+6.2" — the whole of its own value — because there was no
    // earlier month to subtract. A delta against nothing is not a delta.
    it('leaves the delta column empty when there is no earlier period', async () => {
      api.listDays.mockResolvedValue(SUMMER)
      const { container } = render(<Progress />)

      await screen.findByText('Julio')
      expect(container.querySelector('.sum-delta')).toBeNull()
    })

    it('says nothing at all when there is nothing logged', async () => {
      render(<Progress />)

      await waitFor(() => expect(api.listDays).toHaveBeenCalled())
      expect(screen.queryByRole('button', { name: /^semana$/i })).not.toBeInTheDocument()
    })
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

  // A name typed wrong on the gym floor becomes a second exercise ("Fondo"
  // beside "Fondos"), and its sets land on the duplicate. Two ways out, both
  // here: fold it into the real one, or delete it outright.
  describe('limpiar el listado de ejercicios', () => {
    const fondo = (id) => ({ id, exercise_name: 'Fondo', muscle_group: 'Pecho', reps: 8, weight: 30 })
    const FONDO_DAYS = [
      {
        id: 1,
        date: '2026-07-28',
        workouts: [{ id: 1, sets: [fondo(1), fondo(2), fondo(3), fondo(4)] }],
      },
    ]

    async function openFixes() {
      render(<Progress />)
      await screen.findByRole('button', { name: /renombrar Fondo/i })
      await userEvent.click(screen.getByRole('button', { name: /^corregir$/i }))
    }

    beforeEach(() => {
      api.listExercises.mockResolvedValue([
        { id: 32, name: 'Fondo', muscle_group: 'Pecho' },
        { id: 20, name: 'Fondos', muscle_group: 'Pecho' },
      ])
      api.listDays.mockResolvedValue(FONDO_DAYS)
    })

    it('deletes an exercise once you confirm, saying what goes with it', async () => {
      api.deleteExercise.mockResolvedValue(null)
      await openFixes()

      await userEvent.click(screen.getByRole('button', { name: /eliminar ejercicio/i }))
      // Irreversible and it takes history with it, so the confirmation has to
      // name the damage — not just ask "are you sure".
      const dialog = await screen.findByRole('dialog')
      expect(dialog).toHaveTextContent(/4 series/i)
      expect(api.deleteExercise).not.toHaveBeenCalled()

      await userEvent.click(within(dialog).getByRole('button', { name: /sí, eliminar/i }))
      await waitFor(() => expect(api.deleteExercise).toHaveBeenCalledWith(32))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('backs out of the deletion when you cancel', async () => {
      await openFixes()

      await userEvent.click(screen.getByRole('button', { name: /eliminar ejercicio/i }))
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: /cancelar/i }),
      )

      expect(api.deleteExercise).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('offers to merge when the name you want is already taken', async () => {
      api.renameExercise.mockRejectedValue(
        Object.assign(new Error('request failed: 409'), { status: 409 }),
      )
      api.mergeExercise.mockResolvedValue({ id: 20, name: 'Fondos', muscle_group: 'Pecho' })
      render(<Progress />)

      await userEvent.click(await screen.findByRole('button', { name: /renombrar Fondo/i }))
      const input = screen.getByLabelText(/nombre del ejercicio/i)
      await userEvent.clear(input)
      await userEvent.type(input, 'Fondos')
      await userEvent.click(screen.getByRole('button', { name: /guardar nombre/i }))

      // The complaint belongs beside the field you typed in, not at the foot of
      // a page you'd have to scroll to see.
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(/ya existe/i)
      expect(screen.getByLabelText(/nombre del ejercicio/i).closest('form')).toContainElement(alert)

      await userEvent.click(screen.getByRole('button', { name: /fusionar con Fondos/i }))
      await waitFor(() => expect(api.mergeExercise).toHaveBeenCalledWith(32, 20))
      expect(await screen.findByRole('button', { name: /renombrar Fondos/i })).toBeInTheDocument()
    })
  })
})
