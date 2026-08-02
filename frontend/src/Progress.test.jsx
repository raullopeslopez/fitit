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
      { id: 2, name: 'Sentadilla', muscle_group: 'Cuádriceps' },
    ])
    api.listDays.mockResolvedValue(BENCH_DAYS)
    render(<Progress />)

    const card = (await screen.findByText(/evolución/i)).closest('.card')
    expect(card.querySelector('.muscle-chips')).not.toBeNull()
    await userEvent.click(
      [...card.querySelectorAll('.chip')].find((c) => /cuádriceps/i.test(c.textContent)),
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
      { id: 2, name: 'Squat', muscle_group: 'Cuádriceps' },
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
      { id: 2, name: 'Sentadilla', muscle_group: 'Cuádriceps' },
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
    expect(screen.getAllByRole('button', { name: /cuádriceps/i }).length).toBeGreaterThan(0)

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
      { id: 2, name: 'Sentadilla', muscle_group: 'Cuádriceps' },
    ])
    const { container } = render(<Progress />)

    await screen.findByRole('button', { name: /pecho/i })
    expect(container.querySelector('.lift-chips')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Sentadilla$/ })).not.toBeInTheDocument()

    // Everything is still one tap or one search away.
    await userEvent.click(screen.getByRole('button', { name: /cuádriceps/i }))
    expect(await screen.findByRole('button', { name: /renombrar Sentadilla/i })).toBeInTheDocument()
  })

  // The box only ever fired on an exact, full-name match, so typing "gemelo"
  // did nothing at all — no results, no filtering, no message. A search box
  // that does not search.
  describe('the search box', () => {
    const exercises = [
      { id: 1, name: 'Gemelo Máq.', muscle_group: 'Gemelo' },
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

  // Same guard as the exercise card in Entreno: the group rides on the
  // exercise, so re-tagging moves every set ever logged against it — including,
  // on this very screen, the bars of the period summary and the colours of the
  // heatmap. The cost is not next to the control, so the control has to state it.
  describe('re-tagging what already has history', () => {
    const PRESS_DAYS = [
      {
        id: 1,
        date: '2026-07-16',
        workouts: [
          {
            id: 5,
            name: 'Push',
            sets: [
              { id: 1, exercise_name: 'Press banca', muscle_group: 'Pecho', reps: 5, weight: 80 },
              { id: 2, exercise_name: 'Press banca', muscle_group: 'Pecho', reps: 5, weight: 82.5 },
            ],
          },
        ],
      },
    ]

    async function openCorrector(setCount = 6) {
      api.listExercises.mockResolvedValue([
        { id: 7, name: 'Press banca', muscle_group: 'Pecho', set_count: setCount },
      ])
      api.listDays.mockResolvedValue(PRESS_DAYS)
      api.getExerciseHistory.mockResolvedValue([{ date: '2026-07-16', one_rm: 93.3 }])
      render(<Progress />)
      await userEvent.click(await screen.findByRole('button', { name: /^corregir$/i }))
      return screen.getByLabelText(/grupo/i)
    }

    it('asks first, naming how many logged sets would move', async () => {
      const select = await openCorrector(6)

      await userEvent.selectOptions(select, 'Hombro')

      const dialog = await screen.findByRole('dialog')
      expect(dialog).toHaveTextContent(/6 series/i)
      expect(api.setExerciseMuscle).not.toHaveBeenCalled()
    })

    it('applies it on confirm and then offers to put it back', async () => {
      api.setExerciseMuscle.mockResolvedValue({
        id: 7,
        name: 'Press banca',
        muscle_group: 'Hombro',
        set_count: 6,
      })
      const select = await openCorrector(6)

      await userEvent.selectOptions(select, 'Hombro')
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: /sí, mover/i }),
      )
      await waitFor(() => expect(api.setExerciseMuscle).toHaveBeenCalledWith(7, 'Hombro'))

      // Undoing is a correction of a correction: it must not ask again.
      api.setExerciseMuscle.mockResolvedValue({
        id: 7,
        name: 'Press banca',
        muscle_group: 'Pecho',
        set_count: 6,
      })
      await userEvent.click(await screen.findByRole('button', { name: /deshacer/i }))

      await waitFor(() => expect(api.setExerciseMuscle).toHaveBeenLastCalledWith(7, 'Pecho'))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(await screen.findByLabelText(/grupo/i)).toHaveValue('Pecho')
    })

    it('cancelling changes nothing', async () => {
      const select = await openCorrector(6)

      await userEvent.selectOptions(select, 'Hombro')
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: /cancelar/i }),
      )

      expect(api.setExerciseMuscle).not.toHaveBeenCalled()
      expect(select).toHaveValue('Pecho')
    })
  })

  // An exercise the classifier didn't recognise is stored with no group and
  // shows up in no per-muscle view — so the one thing that would prompt you to
  // fix it is the one thing the screen never says. The chip is how it gets said.
  describe('exercises with no group', () => {
    const UNGROUPED = [
      { id: 7, name: 'Press banca', muscle_group: 'Pecho', set_count: 2 },
      { id: 8, name: 'Rodillo', muscle_group: null, set_count: 3 },
    ]

    it('offers a Sin grupo chip that charts an untagged lift', async () => {
      api.listExercises.mockResolvedValue(UNGROUPED)
      // Press banca is the most-trained lift, so the screen opens on it: the
      // chip has to be what moves the chart onto the untagged one.
      api.listDays.mockResolvedValue([
        {
          id: 1,
          date: '2026-07-16',
          workouts: [
            {
              id: 5,
              sets: [
                { id: 1, exercise_name: 'Press banca', muscle_group: 'Pecho', reps: 5, weight: 80 },
                { id: 2, exercise_name: 'Press banca', muscle_group: 'Pecho', reps: 5, weight: 85 },
                { id: 3, exercise_name: 'Rodillo', muscle_group: null, reps: 10, weight: 5 },
              ],
            },
          ],
        },
      ])
      render(<Progress />)

      expect(await screen.findByRole('button', { name: /renombrar Press banca/i })).toBeInTheDocument()
      const chip = screen.getByRole('button', { name: /sin grupo/i })
      await userEvent.click(chip)

      // It behaves like a muscle chip: it selects, and it charts its lift.
      expect(chip).toHaveAttribute('aria-pressed', 'true')
      expect(await screen.findByRole('button', { name: /renombrar Rodillo/i })).toBeInTheDocument()
    })

    it('stays away when every exercise carries a group', async () => {
      api.listExercises.mockResolvedValue([
        { id: 7, name: 'Press banca', muscle_group: 'Pecho', set_count: 2 },
      ])
      render(<Progress />)

      await waitFor(() => expect(api.listExercises).toHaveBeenCalled())
      expect(screen.queryByRole('button', { name: /sin grupo/i })).not.toBeInTheDocument()
    })
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

    // Series por músculo is the KPI this screen exists for, and it was the last
    // thing on it — under the calendar, the chart and the picker.
    it('leads the screen, above the calendar', async () => {
      api.listDays.mockResolvedValue(SUMMER)
      const { container } = render(<Progress />)

      await screen.findByText('Julio')
      const summary = container.querySelector('.sum-head')
      const heatmap = container.querySelector('.heatmap')
      expect(summary).not.toBeNull()
      expect(heatmap).not.toBeNull()
      expect(summary.compareDocumentPosition(heatmap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    // Sets in one week, spread so every band of the reference is represented.
    const setOf = (id, group) => ({
      id,
      exercise_name: group,
      muscle_group: group,
      set_index: 0,
      weight: 40,
      reps: 10,
    })
    const bands = (spec) => {
      let id = 100
      const sets = []
      for (const [group, n] of Object.entries(spec)) {
        for (let i = 0; i < n; i++) sets.push(setOf((id += 1), group))
      }
      return [{ id: 9, date: '2026-07-22', workouts: [{ id: 9, sets }] }]
    }

    // The bar already draws the bands — a tick at 10, full at 20 — but reading
    // it means decoding two tick positions. The row says which band it is in,
    // and when it is under one, how many sets away it is: the number you can
    // act on in the next session, rather than the one you already did.
    it('names the band each muscle is in, and what is missing to clear the next one', async () => {
      api.listDays.mockResolvedValue(bands({ Core: 22, Pecho: 12, Espalda: 6, Hombro: 2 }))
      const { container } = render(<Progress />)

      await userEvent.click(await screen.findByRole('button', { name: /^semana$/i }))

      await waitFor(() => {
        expect([...container.querySelectorAll('.sum-state')].map((s) => s.textContent)).toEqual([
          'sobre la zona', // 22 — past the point where each set still buys a lot
          'en zona', // 12 — inside 10–20
          '+4 a la zona', // 6 — over the minimum, under the efficient band
          '+2 al mínimo', // 2 — not yet the dose that grows anything
        ])
      })
    })

    // A group that has gone quiet keeps its row at zero, and that row is the one
    // with something to say: the whole minimum is still owed.
    it('tells a silent muscle the whole minimum is still owed', async () => {
      api.listDays.mockResolvedValue([
        { id: 9, date: '2026-07-22', workouts: [{ id: 9, sets: [setOf(1, 'Pecho')] }] },
        { id: 8, date: '2026-07-15', workouts: [{ id: 8, sets: [setOf(2, 'Espalda')] }] },
      ])
      const { container } = render(<Progress />)

      await userEvent.click(await screen.findByRole('button', { name: /^semana$/i }))

      await waitFor(() => {
        const rows = [...container.querySelectorAll('.sum-name')].map((n) => n.textContent)
        const states = [...container.querySelectorAll('.sum-state')].map((s) => s.textContent)
        expect(states[rows.indexOf('Espalda')]).toBe('+4 al mínimo')
      })
    })

    // In month mode the row prints a weekly average, so the gap has to be one
    // too — the reference is per week and always was.
    it('states the gap in the same unit the row prints', async () => {
      api.listDays.mockResolvedValue(SUMMER)
      const { container } = render(<Progress />)

      await screen.findByText('Julio')
      // 1.9 sets of Pecho a week, so 2.1 short of the weekly minimum of 4.
      expect(container.querySelector('.sum-val').textContent).toBe('1.9/sem')
      expect(container.querySelector('.sum-state').textContent).toBe('+2.1 al mínimo')
    })

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

    // Same rule, the case the equivalent-window comparison introduced: August
    // has a July behind it, but the 1st of July was a rest day, so the stretch
    // this one is measured against is empty and every delta is a fake gain.
    it('leaves it empty when the matching stretch is empty, earlier period or not', async () => {
      vi.setSystemTime(new Date(2026, 7, 1, 12))
      api.listDays.mockResolvedValue([
        { id: 4, date: '2026-08-01', workouts: [{ id: 4, sets: [bench(9, 60, 8)] }] },
        ...SUMMER,
      ])
      const { container } = render(<Progress />)

      expect(await screen.findByText('Agosto')).toBeInTheDocument()
      expect(container.querySelector('.sum-delta')).toBeNull()
      expect(screen.queryByText(/vs\./)).not.toBeInTheDocument()
    })

    it('says nothing at all when there is nothing logged', async () => {
      render(<Progress />)

      await waitFor(() => expect(api.listDays).toHaveBeenCalled())
      expect(screen.queryByRole('button', { name: /^semana$/i })).not.toBeInTheDocument()
    })

    // The weekly-set reference (docs/investigacion-series-semana.md). A bar
    // scaled to your own biggest muscle answers "which do I train most" and
    // quietly implies you are done: five sets of chest filled the bar edge to
    // edge because nothing beat it. Against a fixed 20 a full bar means the
    // same thing in every row, every week.
    describe('the weekly-set reference', () => {
      const leg = (id, group) => ({
        id,
        exercise_name: group === 'Gemelo' ? 'Gemelo en máquina' : 'Sentadilla',
        muscle_group: group,
        set_index: 0,
        weight: 60,
        reps: 10,
      })
      const many = (n, group, from) =>
        Array.from({ length: n }, (_, i) => leg(from + i, group))

      const widthOf = (container, index) =>
        container.querySelectorAll('.sum-fill')[index].style.width

      it('scales the bar against 20 sets, not against your biggest muscle', async () => {
        api.listDays.mockResolvedValue([
          {
            id: 1,
            date: '2026-07-22',
            workouts: [
              { id: 1, sets: [...many(5, 'Cuádriceps', 1), ...many(2, 'Gemelo', 20)] },
            ],
          },
        ])
        const { container } = render(<Progress />)

        await userEvent.click(await screen.findByRole('button', { name: /^semana$/i }))

        // 5/20 and 2/20 — neither is anywhere near a full bar.
        expect(widthOf(container, 0)).toBe('25%')
        expect(widthOf(container, 1)).toBe('10%')
      })

      it('caps the bar at the reference instead of overflowing it', async () => {
        api.listDays.mockResolvedValue([
          {
            id: 1,
            date: '2026-07-22',
            workouts: [{ id: 1, sets: many(26, 'Cuádriceps', 1) }],
          },
        ])
        const { container } = render(<Progress />)

        await userEvent.click(await screen.findByRole('button', { name: /^semana$/i }))

        expect(widthOf(container, 0)).toBe('100%')
        // The count itself still tells the truth.
        expect(container.querySelector('.sum-val').textContent).toBe('26 series')
      })

      it('spells out what the reference is', async () => {
        api.listDays.mockResolvedValue(SUMMER)
        const { container } = render(<Progress />)

        await userEvent.click(await screen.findByRole('button', { name: /^semana$/i }))

        expect(container.querySelector('.sum-ref').textContent).toBe(
          'Referencia: 4 series/semana es el mínimo que produce crecimiento. ' +
            '10–20 es la zona eficiente. Barra llena = 20.',
        )
      })

      // Monday reads as a near-empty week for everyone, which is the calendar
      // talking, not the training. A verdict passed on a week that hasn't
      // happened yet is an accusation, so while one is running the row reports
      // and does not judge: the count it has, and the count it is aiming at.
      it('reports instead of judging while the week is still running', async () => {
        vi.setSystemTime(new Date(2026, 6, 22, 12)) // Wednesday
        api.listDays.mockResolvedValue(bands({ Pecho: 6 }))
        const { container } = render(<Progress />)

        await userEvent.click(await screen.findByRole('button', { name: /^semana$/i }))

        await waitFor(() => {
          expect(container.querySelector('.sum-state').textContent).toBe('6 de 10')
        })
      })

      // The red of a shortfall is a verdict too, and the same argument applies:
      // there is nothing to be short of until the week is done.
      it('does not mark a running week as short', async () => {
        vi.setSystemTime(new Date(2026, 6, 22, 12)) // Wednesday
        api.listDays.mockResolvedValue(bands({ Pecho: 2 }))
        const { container } = render(<Progress />)

        await userEvent.click(await screen.findByRole('button', { name: /^semana$/i }))

        await waitFor(() => {
          expect(container.querySelector('.sum-state').textContent).toBe('2 de 10')
        })
        expect(container.querySelector('.sum-state.is-short')).toBeNull()
      })

      it('passes the verdict once the week is closed', async () => {
        // Sunday: 20–26 jul is done, so 6 sets really is 4 short of the zone.
        api.listDays.mockResolvedValue(bands({ Pecho: 6 }))
        const { container } = render(<Progress />)

        await userEvent.click(await screen.findByRole('button', { name: /^semana$/i }))

        await waitFor(() => {
          expect(container.querySelector('.sum-state').textContent).toBe('+4 a la zona')
        })
      })

      // The caveat was an apology for a number that accused you; the row no
      // longer accuses, so there is nothing left to apologise for.
      it('needs no caveat about the week being unfinished', async () => {
        vi.setSystemTime(new Date(2026, 6, 22, 12)) // Wednesday
        api.listDays.mockResolvedValue(SUMMER)
        render(<Progress />)

        await userEvent.click(await screen.findByRole('button', { name: /^semana$/i }))

        await screen.findByText('Esta semana')
        expect(screen.queryByText(/en curso — la referencia/)).not.toBeInTheDocument()
      })
    })

    // The average is only readable next to the span it was taken over: 1.9/sem
    // means one thing after four weeks and quite another after two days.
    it('states how far into the period you are, while it is still running', async () => {
      api.listDays.mockResolvedValue(SUMMER)
      render(<Progress />)

      // 1–26 jul is 26 days: 3.7 weeks in, not a finished month.
      expect(await screen.findByText(/3\.7 semanas/)).toBeInTheDocument()

      // 20–26 jul with today the 26th: the week is closed, and a closed period
      // needs no caveat about how much of it happened.
      await userEvent.click(screen.getByRole('button', { name: /^semana$/i }))
      expect(await screen.findByText('Esta semana')).toBeInTheDocument()
      expect(screen.queryByText(/días$/)).not.toBeInTheDocument()
    })

    it('counts the days elapsed of a week still running', async () => {
      vi.setSystemTime(new Date(2026, 6, 22, 12)) // Wednesday
      api.listDays.mockResolvedValue(SUMMER)
      render(<Progress />)

      await userEvent.click(await screen.findByRole('button', { name: /^semana$/i }))
      // Mon 20 to Wed 22. The denominator is the point: "3 días" alone reads as
      // a total, "3 de 7 días" says how much of the week is still to come.
      expect(await screen.findByText(/3 de 7 días/)).toBeInTheDocument()
    })

    // A month in progress against a finished one only ever counts down. The
    // comparison is against the same stretch of it, and the footer has to say so
    // or the number reads as the whole month.
    it('names the matching stretch it compared against', async () => {
      api.listDays.mockResolvedValue([
        ...SUMMER,
        { id: 0, date: '2026-06-10', workouts: [{ id: 0, sets: [bench(8, 50, 8)] }] },
      ])
      render(<Progress />)

      expect(await screen.findByText(/vs\. mismo tramo de junio/i)).toBeInTheDocument()
    })

    // Cardio and unrecognised lifts are volume that colours no row, so the bars
    // stop adding up to the set count in the subtitle. Unexplained, it reads as
    // a bug.
    it('accounts for the sets that no muscle group claims', async () => {
      api.listDays.mockResolvedValue([
        {
          id: 9,
          date: '2026-07-22',
          workouts: [
            {
              id: 9,
              sets: [
                bench(1, 60, 8),
                { id: 2, exercise_name: 'Cinta', muscle_group: null, duration_seconds: 600 },
              ],
            },
          ],
        },
      ])
      render(<Progress />)

      expect(await screen.findByText(/1 serie sin músculo asignado/i)).toBeInTheDocument()
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
    api.listExercises.mockResolvedValue([{ id: 1, name: 'Squat', muscle_group: 'Cuádriceps' }])
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
