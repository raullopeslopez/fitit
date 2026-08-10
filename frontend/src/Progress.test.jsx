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

    // Ritmo por músculo names every muscle above this card, so the click has to
    // stay scoped to Evolución's own chips.
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

    // A chip per muscle that has exercises — the picker's, inside the form.
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

    expect(await screen.findByText(/ritmo por músculo/i)).toBeInTheDocument()
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

    // The card opens on the week — the unit the reference is written in — so
    // the month is the only thing left to ask for.
    const openMonth = async () =>
      userEvent.click(await screen.findByRole('button', { name: /^mes$/i }))

    // Series por músculo is the KPI this screen exists for, and it was the last
    // thing on it — under the calendar, the chart and the picker.
    it('leads the screen, above the calendar', async () => {
      api.listDays.mockResolvedValue(SUMMER)
      const { container } = render(<Progress />)

      await screen.findByText('Esta semana')
      const summary = container.querySelector('.sum-head')
      const rhythm = container.querySelector('.rhythm')
      expect(summary).not.toBeNull()
      expect(rhythm).not.toBeNull()
      expect(summary.compareDocumentPosition(rhythm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

    // One number per row. The row already prints what you did ("6 series") and
    // the track already draws where that sits, so the state line only carries
    // what neither of them can: how many sets short of the band you are. Inside
    // it, and past it, it says nothing — the mark's position is the message, and
    // nothing above the band is called an excess.
    it('says only what is missing, and nothing at all once you are in the zone', async () => {
      api.listDays.mockResolvedValue(bands({ Core: 22, Pecho: 12, Espalda: 6, Hombro: 2 }))
      const { container } = render(<Progress />)


      await waitFor(() => {
        expect([...container.querySelectorAll('.sum-state')].map((s) => s.textContent)).toEqual([
          '', // 22 — inside Core's 0–25, which has no floor at all
          '', // 12 — inside Pecho's 6–20
          'faltan 4', // 6 — four short of Espalda's 10
          'faltan 6', // 2 — six short of Hombro's 8
        ])
      })
    })

    // A group that has gone quiet keeps its row at zero, and that row is the one
    // with something to say: the whole zone is still owed.
    it('tells a silent muscle the whole zone is still owed', async () => {
      api.listDays.mockResolvedValue([
        { id: 9, date: '2026-07-22', workouts: [{ id: 9, sets: [setOf(1, 'Pecho')] }] },
        { id: 8, date: '2026-07-15', workouts: [{ id: 8, sets: [setOf(2, 'Espalda')] }] },
      ])
      const { container } = render(<Progress />)


      await waitFor(() => {
        const rows = [...container.querySelectorAll('.sum-name')].map((n) => n.textContent)
        const states = [...container.querySelectorAll('.sum-state')].map((s) => s.textContent)
        expect(states[rows.indexOf('Espalda')]).toBe('faltan 10')
      })
    })

    // In month mode the row prints a weekly average, so the gap has to be one
    // too — the reference is per week and always was.
    it('states the gap in the same unit the row prints', async () => {
      api.listDays.mockResolvedValue(SUMMER)
      const { container } = render(<Progress />)

      await openMonth()
      await screen.findByText('Julio')
      // 1.9 sets of Pecho a week, so 4.1 short of Pecho's own floor of 6.
      expect(container.querySelector('.sum-val').textContent).toBe('1.9')
      expect(container.querySelector('.sum-state').textContent).toBe('faltan 4.1')
    })

    it('breaks a month down into sets per muscle', async () => {
      api.listDays.mockResolvedValue(SUMMER)
      const { container } = render(<Progress />)

      await openMonth()
      expect(await screen.findByText('Julio')).toBeInTheDocument()
      expect(screen.getByText(/3 entrenos/)).toBeInTheDocument()
      expect(container.querySelector('.sum-name').textContent).toBe('Pecho')
    })

    it('switches to the week, which counts sets rather than averaging them', async () => {
      api.listDays.mockResolvedValue(SUMMER)
      const { container } = render(<Progress />)


      expect(await screen.findByText('Esta semana')).toBeInTheDocument()
      expect(screen.getByText(/2 entrenos · 5 series/)).toBeInTheDocument()
      expect(container.querySelector('.sum-val').textContent).toBe('5')
    })

    it('walks back through the periods, and stops at both ends', async () => {
      api.listDays.mockResolvedValue(SUMMER)
      render(<Progress />)

      // Nothing newer than the week you're in.
      await screen.findByText('Esta semana')
      expect(screen.getByRole('button', { name: /periodo siguiente/i })).toBeDisabled()

      await userEvent.click(screen.getByRole('button', { name: /periodo anterior/i }))
      expect(await screen.findByRole('heading', { name: '13–19 jul' })).toBeInTheDocument()
      // And nothing older than the first week you ever logged.
      expect(screen.getByRole('button', { name: /periodo anterior/i })).toBeDisabled()
    })

    // "6.2 series/sem" wrapped onto two lines inside its column and broke the
    // rhythm of every row. The column heading says the unit, so the row doesn't
    // have to spell it.
    it('states a monthly average short enough to fit its column', async () => {
      api.listDays.mockResolvedValue(SUMMER)
      const { container } = render(<Progress />)

      await openMonth()
      await screen.findByText('Julio')
      expect(container.querySelector('.sum-val').textContent).toBe('1.9')
      expect(container.querySelector('.sum-collab').textContent).toBe('media/sem')
    })

    const sixOf = (group, from) => Array.from({ length: 6 }, (_, i) => setOf(from + i, group))

    // The card answers one question — where this muscle sits against its own
    // band — and the week-over-week delta answers a different one, from the
    // widest column on the row. It cost a fifth of the width, most of it spent
    // on a heading explaining which stretch it compared against, and mid-week
    // it printed in grey precisely because two unfinished stretches conclude
    // nothing. The width goes to the track, which is what tells "just inside"
    // from "just outside".
    it('prints one figure per row, not two', async () => {
      api.listDays.mockResolvedValue([
        { id: 9, date: '2026-07-22', workouts: [{ id: 9, sets: sixOf('Pecho', 40) }] },
        { id: 8, date: '2026-07-15', workouts: [{ id: 8, sets: [setOf(1, 'Pecho')] }] },
      ])
      const { container } = render(<Progress />)

      await screen.findByText('Esta semana')
      expect(container.querySelector('.sum-delta')).toBeNull()
      expect(screen.queryByText(/vs\./)).not.toBeInTheDocument()
    })

    // The heading over the one column of figures left. `display: contents` on
    // the rows means the cell count has to match the grid exactly, so the
    // identity column keeps a heading cell with nothing in it.
    it('names the column its figures are in', async () => {
      api.listDays.mockResolvedValue(SUMMER)
      const { container } = render(<Progress />)

      await screen.findByText('Esta semana')
      expect([...container.querySelectorAll('.sum-collab')].map((c) => c.textContent)).toEqual([
        'series',
      ])
      expect(container.querySelector('.sum-foot')).toBeNull()
    })

    it('says nothing at all when there is nothing logged', async () => {
      render(<Progress />)

      await waitFor(() => expect(api.listDays).toHaveBeenCalled())
      expect(screen.queryByRole('button', { name: /^mes$/i })).not.toBeInTheDocument()
    })

    // The weekly-set reference, one band per muscle (volume.js). What the row
    // has to answer is under / inside / over, and it has to answer it down a
    // column of nine without being read one row at a time — so the band is
    // pinned to the same stretch of every track and the mark is the only thing
    // that moves.
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

      const pctOf = (el, prop) => parseFloat(el.style[prop])
      const markAt = (container, index) =>
        pctOf(container.querySelectorAll('.sum-mark')[index], 'left')
      const zoneOf = (container, index) => {
        const zone = container.querySelectorAll('.sum-zone')[index]
        return [pctOf(zone, 'left'), pctOf(zone, 'left') + pctOf(zone, 'width')]
      }
      const tailOf = (container, index) => {
        const tail = container.querySelectorAll('.sum-track')[index].querySelector('.sum-tail')
        return tail && [pctOf(tail, 'left'), pctOf(tail, 'left') + pctOf(tail, 'width')]
      }

      // The mechanism the whole row rests on. Femoral's band is 4–12 and
      // Hombro's is 8–25, so on a track linear in sets they would draw two
      // differently-placed rectangles and comparing nine rows would mean
      // decoding nine scales first. Pinned instead, the bands stack into one
      // column and being outside it is the same picture on every row.
      it('puts every muscle band on the same stretch of track', async () => {
        api.listDays.mockResolvedValue(bands({ Femoral: 5, Hombro: 5 }))
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(zoneOf(container, 0)).toEqual(zoneOf(container, 1))
        // And the same count still reads differently, which is the point: five
        // sets is inside Femoral's band and well under Hombro's.
        expect(markAt(container, 0)).toBeGreaterThan(zoneOf(container, 0)[0])
        expect(markAt(container, 1)).toBeLessThan(zoneOf(container, 1)[0])
      })

      // Outside the band the mark drags a tail back to the edge it missed, so
      // the shortfall is drawn at the same scale as everything else and the row
      // can be read without reading a number.
      it('drags a tail back to the edge a mark missed, on whichever side', async () => {
        api.listDays.mockResolvedValue(bands({ Hombro: 30, Bíceps: 2 }))
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        const [low, high] = zoneOf(container, 0)
        // 30 against an MRV of 25: the tail runs from the band's far edge out
        // to the mark.
        expect(markAt(container, 0)).toBeGreaterThan(high)
        expect(tailOf(container, 0)).toEqual([high, markAt(container, 0)])
        // 2 against an MEV of 8: from the mark in to the band's near edge.
        expect(markAt(container, 1)).toBeLessThan(low)
        expect(tailOf(container, 1)).toEqual([markAt(container, 1), low])
      })

      // Position alone cannot separate 8.5 sets from an MEV of 8: on a 200px
      // track that is three pixels, and the tail it drags is shorter than the
      // needle is wide. Both are rows a real week produces — one over the top
      // edge, one sitting on the bottom one — and telling them apart by reading
      // the digit is the row failing at the one thing it is for. So the mark
      // itself says it: outside the band it grows a caret pointing back at the
      // band, which is a shape and not a distance, and reads at any gap.
      it('marks a needle outside the band with a caret, however small the gap is', async () => {
        // Cuádriceps 8.5 against an MEV of 8 — inside, barely. Gemelo 17
        // against an MRV of 16 — outside, just as barely.
        api.listDays.mockResolvedValue([
          {
            id: 1,
            date: '2026-07-22',
            workouts: [
              {
                id: 1,
                sets: [
                  ...many(8, 'Cuádriceps', 1),
                  // A hinge that pays Cuádriceps the half-set which puts it
                  // exactly half a set inside its own floor.
                  { ...leg(30, 'Femoral'), secondary_groups: ['Cuádriceps'] },
                  ...many(17, 'Gemelo', 40),
                ],
              },
            ],
          },
        ])
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        const names = [...container.querySelectorAll('.sum-name')].map((n) => n.textContent)
        const markOf = (group) => container.querySelectorAll('.sum-mark')[names.indexOf(group)]

        expect(container.querySelector('.sum-val').textContent).toBe('17')
        expect(markOf('Gemelo').className).toContain('is-over')
        expect(markOf('Cuádriceps').className).toBe('sum-mark')
        // And under the band it points the other way.
        expect(markOf('Femoral').className).toContain('is-under')
      })

      it('leaves a row inside its band with no tail at all', async () => {
        api.listDays.mockResolvedValue(bands({ Pecho: 12 }))
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        const [low, high] = zoneOf(container, 0)
        expect(markAt(container, 0)).toBeGreaterThan(low)
        expect(markAt(container, 0)).toBeLessThan(high)
        expect(tailOf(container, 0)).toBeNull()
      })

      // The bar this replaced ran to a flat 20 and capped there, so 20 sets and
      // 40 sets drew the identical full bar — "over" and "at the top of the
      // band" were the same picture, which is the one distinction the card
      // exists to make.
      it('stops drawing every count past the band as the same full bar', async () => {
        api.listDays.mockResolvedValue([
          {
            id: 1,
            date: '2026-07-22',
            workouts: [{ id: 1, sets: [...many(26, 'Cuádriceps', 1), ...many(20, 'Gemelo', 90)] }],
          },
        ])
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        // Both are over — Cuádriceps past 18, Gemelo past 16 — and they sit in
        // visibly different places.
        const [, high] = zoneOf(container, 0)
        expect(markAt(container, 0)).toBeGreaterThan(high)
        expect(markAt(container, 1)).toBeGreaterThan(high)
        expect(markAt(container, 0)).toBeGreaterThan(markAt(container, 1) + 5)
        // The count itself still tells the truth.
        expect(container.querySelector('.sum-val').textContent).toBe('26')
      })

      // Core is the one row with two of the three states: RP put ab MEV at zero,
      // so nothing is ever owed. It has to draw as "inside", not as a blank.
      it('never tells you that you owe your abs anything', async () => {
        api.listDays.mockResolvedValue([
          { id: 1, date: '2026-07-22', workouts: [{ id: 1, sets: many(3, 'Pecho', 1) }] },
          // Core trained last week and not this one, so it holds a row at zero.
          { id: 2, date: '2026-07-15', workouts: [{ id: 2, sets: many(4, 'Core', 40) }] },
        ])
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        const names = [...container.querySelectorAll('.sum-name')].map((n) => n.textContent)
        const core = names.indexOf('Core')
        expect(container.querySelectorAll('.sum-state')[core].textContent).toBe('')
        expect(tailOf(container, core)).toBeNull()
        expect(markAt(container, core)).toBe(zoneOf(container, core)[0])
      })

      // A deload is the one week where training less is the plan. The card's
      // whole job is holding you to 10–20 sets, so left alone it spends that
      // week telling you that you are short of a target you decided to miss.
      describe('a week marked as a deload', () => {
        // The mark outlives the render on purpose — it is what makes the week
        // survive closing the app — so each test has to start from unmarked or
        // it inherits the one before it.
        beforeEach(() => localStorage.clear())

        const mark = async () =>
          await userEvent.click(screen.getByRole('button', { name: 'Marcar descarga' }))

        // The band is the wrong reference for a week that is aiming at a third
        // of your own normal, so it goes and a single target rule takes its
        // place — at the same x, so neither the geometry nor the row height
        // moves when the week is marked.
        it('retargets the row at a third of your own recent average', async () => {
          api.listDays.mockResolvedValue([
            // One trained week behind it, carrying 3 sets of quads: the deload
            // asks for a third of that, so 1. Three sets is triple the target —
            // and the same 3 sets sit well under the standing band of 8–18.
            { id: 1, date: '2026-06-10', workouts: [{ id: 1, sets: many(3, 'Cuádriceps', 1) }] },
            { id: 2, date: '2026-07-22', workouts: [{ id: 2, sets: many(3, 'Cuádriceps', 40) }] },
          ])
          const { container } = render(<Progress />)
          await screen.findByText('Esta semana')

          // Against the standing band those 3 sets are short of the near edge.
          const [low] = zoneOf(container, 0)
          expect(markAt(container, 0)).toBeLessThan(low)

          await mark()
          // The band is gone, the target rule stands where its near edge was,
          // and 3 against a target of 1 runs the mark to the end of the track.
          expect(container.querySelector('.sum-zone')).toBeNull()
          expect(pctOf(container.querySelector('.sum-goal'), 'left')).toBe(low)
          expect(markAt(container, 0)).toBe(100)
        })

        it('stops asking for the zone and says what it wants instead', async () => {
          api.listDays.mockResolvedValue([
            { id: 1, date: '2026-06-10', workouts: [{ id: 1, sets: many(3, 'Cuádriceps', 1) }] },
            { id: 2, date: '2026-07-22', workouts: [{ id: 2, sets: many(1, 'Cuádriceps', 40) }] },
          ])
          const { container } = render(<Progress />)
          await screen.findByText('Esta semana')

          await mark()
          // The value column already prints what you did, so the state line
          // carries only the target this week replaced the reference with.
          expect(container.querySelector('.sum-state').textContent).toBe('objetivo 1')
          // Nothing is short during a deload — being under the usual number is
          // the point of the week.
          expect(container.querySelector('.sum-state.is-short')).toBeNull()
        })

        it('says what the week is for, in place of the standing reference', async () => {
          api.listDays.mockResolvedValue(SUMMER)
          const { container } = render(<Progress />)
          await screen.findByText('Esta semana')

          await mark()
          expect(container.querySelector('.sum-ref').textContent).toBe(
            'Semana de descarga: el objetivo es 1/3 de tu semana típica de las ' +
              'últimas 8. Mismo peso, menos series.',
          )
        })

        it('lets you take the mark back off', async () => {
          api.listDays.mockResolvedValue(SUMMER)
          const { container } = render(<Progress />)
          await screen.findByText('Esta semana')

          await mark()
          await userEvent.click(screen.getByRole('button', { name: 'Quitar descarga' }))
          expect(container.querySelector('.sum-ref').textContent).toContain('margen productivo')
        })

        // The mark belongs to one week, not to the card. Walking back to a
        // normal week has to show the normal reference.
        it('only applies to the week it was put on', async () => {
          api.listDays.mockResolvedValue(SUMMER)
          const { container } = render(<Progress />)
          await screen.findByText('Esta semana')

          await mark()
          await userEvent.click(screen.getByRole('button', { name: 'Periodo anterior' }))
          expect(container.querySelector('.sum-ref').textContent).toContain('margen productivo')
        })

        // A month is not a deload unit: it holds four or five weeks and only
        // one of them is light.
        it('is not offered on the month', async () => {
          api.listDays.mockResolvedValue(SUMMER)
          render(<Progress />)
          await screen.findByText('Esta semana')

          await userEvent.click(screen.getByRole('button', { name: 'Mes' }))
          expect(screen.queryByRole('button', { name: 'Marcar descarga' })).toBeNull()
        })
      })

      // A week that closed well under your normal one is a fact, not nine
      // failures. Left alone the card printed "+7 a la zona" on every row and a
      // red drop beside it — eighteen marks of shortfall for one light week,
      // which could as easily have been the flu as a lapse. It gets one line,
      // and the rows say nothing at all: the week is over, so the gap is not
      // something you can act on.
      describe('a week that came in short', () => {
        const week = (id, date, n) => ({
          id,
          date,
          workouts: [{ id, sets: many(n, 'Pecho', id * 100) }],
        })
        // Viewed week 13–19 jul: 9 sets against a normal week of 20.
        const SHORT = [
          week(3, '2026-07-15', 9),
          week(2, '2026-07-08', 20),
          week(1, '2026-07-01', 20),
        ]
        const back = async () =>
          await userEvent.click(screen.getByRole('button', { name: 'Periodo anterior' }))

        it('says it once, with the volume and what it is short of', async () => {
          api.listDays.mockResolvedValue(SHORT)
          const { container } = render(<Progress />)
          await screen.findByText('Esta semana')

          await back()
          const line = container.querySelector('.sum-shortweek')
          expect(line.textContent.replace(/\s+/g, ' ').trim()).toBe(
            'Semana corta · 9 series, la mitad de tu semana típica',
          )
          // One line, not one per row.
          expect(container.querySelectorAll('.sum-shortweek')).toHaveLength(1)
        })

        it('leaves the rows without a gap to demand', async () => {
          api.listDays.mockResolvedValue(SHORT)
          const { container } = render(<Progress />)
          await screen.findByText('Esta semana')

          await back()
          expect(container.querySelector('.sum-state').textContent).toBe('')
          expect(container.querySelector('.sum-state.is-short')).toBeNull()
        })

        // The fraction is nearest-of-four, not literal: below half by
        // construction, so "la mitad" only covers the top of the band and
        // anything deeper has to say so.
        it('names the fraction it actually is, not always a half', async () => {
          api.listDays.mockResolvedValue([
            week(3, '2026-07-15', 6),
            week(2, '2026-07-08', 20),
            week(1, '2026-07-01', 20),
          ])
          const { container } = render(<Progress />)
          await screen.findByText('Esta semana')

          await back()
          expect(container.querySelector('.sum-shortweek').textContent).toContain(
            'un tercio de tu semana típica',
          )
        })

        // Half is the threshold, so a week that merely dipped is still judged
        // the normal way. Otherwise the line turns up often enough to stop
        // meaning anything.
        it('leaves a week that only dipped alone', async () => {
          api.listDays.mockResolvedValue([
            week(3, '2026-07-15', 14),
            week(2, '2026-07-08', 20),
            week(1, '2026-07-01', 20),
          ])
          render(<Progress />)
          await screen.findByText('Esta semana')

          await back()
          expect(screen.queryByText(/Semana corta/)).toBeNull()
        })

        // The deload has its own line saying the same thing on purpose, and two
        // explanations of one week is one too many.
        it('stays out of the way of a deload', async () => {
          api.listDays.mockResolvedValue(SHORT)
          render(<Progress />)
          await screen.findByText('Esta semana')

          await back()
          await userEvent.click(screen.getByRole('button', { name: 'Marcar descarga' }))
          expect(screen.queryByText(/Semana corta/)).toBeNull()
        })
      })

      // Two lines, and neither of them teaches you to read the picture: needing
      // that sentence would be the indictment of the picture. What is left is
      // the two things the track cannot say — that the band is this muscle's
      // own range and not one shared number, and how a compound lift counts.
      it('spells out what the reference is', async () => {
        api.listDays.mockResolvedValue(SUMMER)
        const { container } = render(<Progress />)


        await screen.findByText('Esta semana')
        expect(container.querySelector('.sum-ref').textContent).toBe(
          'La franja es el margen productivo de ese músculo: cada uno tiene el suyo. ' +
            'Un músculo secundario cuenta media serie.',
        )
      })

      // Monday reads as a near-empty week for everyone, which is the calendar
      // talking, not the training. The gap is still the useful number while the
      // week runs — it is what the next session can close — so the words stay
      // and only the verdict waits.
      it('states the gap without judging it while the week is still running', async () => {
        vi.setSystemTime(new Date(2026, 6, 22, 12)) // Wednesday
        api.listDays.mockResolvedValue(bands({ Pecho: 4 }))
        const { container } = render(<Progress />)


        await waitFor(() => {
          expect(container.querySelector('.sum-state').textContent).toBe('faltan 2')
        })
      })

      // The red of a shortfall is a verdict too, and the same argument applies:
      // there is nothing to be short of until the week is done.
      it('does not mark a running week as short', async () => {
        vi.setSystemTime(new Date(2026, 6, 22, 12)) // Wednesday
        api.listDays.mockResolvedValue(bands({ Pecho: 2 }))
        const { container } = render(<Progress />)


        await waitFor(() => {
          expect(container.querySelector('.sum-state').textContent).toBe('faltan 4')
        })
        expect(container.querySelector('.sum-state.is-short')).toBeNull()
      })

      it('passes the verdict once the week is closed', async () => {
        // Sunday: 20–26 jul is done, so 4 sets really is 2 short of Pecho's 6.
        api.listDays.mockResolvedValue(bands({ Pecho: 4 }))
        const { container } = render(<Progress />)


        await waitFor(() => {
          expect(container.querySelector('.sum-state.is-short').textContent).toBe('faltan 2')
        })
      })

      // The caveat was an apology for a number that accused you; the row no
      // longer accuses, so there is nothing left to apologise for.
      it('needs no caveat about the week being unfinished', async () => {
        vi.setSystemTime(new Date(2026, 6, 22, 12)) // Wednesday
        api.listDays.mockResolvedValue(SUMMER)
        render(<Progress />)


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
      await openMonth()
      expect(await screen.findByText(/3\.7 semanas/)).toBeInTheDocument()

      await openMonth()

      // 20–26 jul with today the 26th: the week is closed, and a closed period
      // needs no caveat about how much of it happened.
      expect(await screen.findByText('Esta semana')).toBeInTheDocument()
      expect(screen.queryByText(/días$/)).not.toBeInTheDocument()
    })

    it('counts the days elapsed of a week still running', async () => {
      vi.setSystemTime(new Date(2026, 6, 22, 12)) // Wednesday
      api.listDays.mockResolvedValue(SUMMER)
      render(<Progress />)

      // Mon 20 to Wed 22. The denominator is the point: "3 días" alone reads as
      // a total, "3 de 7 días" says how much of the week is still to come.
      expect(await screen.findByText(/3 de 7 días/)).toBeInTheDocument()
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
