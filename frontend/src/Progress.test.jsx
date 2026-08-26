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

// Qué ejercicio está graficado. El título de la tarjeta volvió a ser un
// título — tocarlo ya no renombra, porque renombrar vive dentro del editor —
// así que lo que responde a "¿de qué va esta gráfica?" es su texto y nada más.
// Comparación exacta y acotada a la tarjeta: la hoja del editor repite el
// nombre en su cabecera, y "Fondo" es prefijo de "Fondos".
const chartedName = () => document.querySelector('.chart-title h2')?.textContent ?? null
const charted = (name) => waitFor(() => expect(chartedName()).toBe(name))

// El editor es una hoja, y una hoja es un diálogo — así que "el diálogo" tiene
// que decir cuál. Estos dos son los que se abren *encima* de ella.
const retagDialog = () =>
  screen.queryByRole('dialog', { name: /^(Mover|Quitar el grupo de) / })
const findRetagDialog = () =>
  screen.findByRole('dialog', { name: /^(Mover|Quitar el grupo de) / })

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
    await charted('Curl Predicador Máq.')
    expect(screen.getByText('15 × 15')).toBeInTheDocument()
    expect(screen.getByText('20 × 15')).toBeInTheDocument()

    // Ritmo por músculo names every muscle above this card, so the click has to
    // stay scoped to Evolución's own chips.
    const evoCard = screen.getByText(/evolución/i).closest('.card')
    await userEvent.click(
      [...evoCard.querySelectorAll('.chip')].find((c) => /^Pecho$/i.test(c.textContent)),
    )
    await charted('Press banca')

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
    await charted('Sentadilla')
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
    await charted('Bench Press')
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
    await charted('Press banca')
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
    const picker = screen.getByLabelText('Ejercicio')
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
    await charted('Sentadilla')
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

      await userEvent.type(await screen.findByLabelText('Ejercicio'), 'gemelo')

      const result = await screen.findByRole('button', { name: /Gemelo Máq\./i })
      expect(screen.queryByRole('button', { name: /Press banca/i })).not.toBeInTheDocument()
      await userEvent.click(result)

      await charted('Gemelo Máq.')
    })

    // "Máq." is not something anyone types with the accent on a phone keyboard.
    it('ignores accents and case', async () => {
      api.listExercises.mockResolvedValue(exercises)
      render(<Progress />)

      await userEvent.type(await screen.findByLabelText('Ejercicio'), 'MAQ')
      expect(await screen.findByRole('button', { name: /Gemelo Máq\./i })).toBeInTheDocument()
    })

    // "No data to chart" for a name that does not exist reads as "this exercise
    // has none", when the truth is there is no such exercise.
    it('says a name matches nothing, rather than blaming the data', async () => {
      api.listExercises.mockResolvedValue(exercises)
      render(<Progress />)

      await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Sentadilla{enter}')

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

    const box = await screen.findByLabelText('Ejercicio')
    await userEvent.type(box, 'Press banca')

    await waitFor(() => expect(box).toHaveValue(''))
    // The name is stated once, as the thing the card is about.
    await charted('Press banca')
  })

  // Picking a known lift already loads it from the chips; making the text field
  // alone demand a second tap on a button was two paths for one job.
  it('charts a known lift the moment you pick it, with no second tap', async () => {
    api.listExercises.mockResolvedValue([{ id: 7, name: 'Press banca', muscle_group: 'Pecho' }])
    render(<Progress />)

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Press banca')

    await charted('Press banca')
  })

  // Renaming a lift and re-tagging its group are corrections, the same shape as
  // the ones on the exercise card: rare, and they were sitting in the content.
  it('folds the corrections away until you reach for them', async () => {
    api.listExercises.mockResolvedValue([{ id: 7, name: 'Press banca', muscle_group: 'Pecho' }])
    render(<Progress />)

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Press banca')
    await charted('Press banca')

    // Nada de esto está en la tarjeta hasta que abres el editor: ni el nombre,
    // ni el grupo. La tarjeta es la gráfica; corregir es otra cosa.
    expect(screen.queryByLabelText(/grupo muscular/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/nombre de /i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /editar ejercicio/i }))
    // El editor abierto es el nombre y nada más: el panel entero cabe en los
    // 137 px que la tarjeta puede dar sin tapar la gráfica.
    expect(screen.getByLabelText(/nombre de /i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/grupo muscular/i)).not.toBeInTheDocument()
    // El grupo sigue estando, con su nombre escrito en la puerta.
    await userEvent.click(screen.getByRole('button', { name: /^Grupo y eliminar/ }))
    expect(screen.getByLabelText(/grupo muscular/i)).toBeInTheDocument()
  })

  // Lo mismo que en Entreno, desde el otro lado de la app: abrir el editor deja
  // el cursor dentro del nombre, con la errata a mano y sin un segundo toque.
  it('el toque en Editar ejercicio deja el cursor en el nombre', async () => {
    api.listExercises.mockResolvedValue([{ id: 7, name: 'Press banca', muscle_group: 'Pecho' }])
    render(<Progress />)

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Press banca')
    await charted('Press banca')

    await userEvent.click(screen.getByRole('button', { name: /editar ejercicio/i }))
    const input = screen.getByLabelText(/nombre de /i)
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe('Press banca'.length)
  })

  // Exportar es «lo más raro de esta pantalla» (DESIGN.md) y venía vestido de
  // botón: caja, tinta plena, 1rem, centrado — más fuerte que la única puerta
  // para renombrar un ejercicio. DESIGN.md dice que las acciones raras no se
  // llevan controles con peso de contenido, así que baja al mismo registro
  // callado que el editor.
  it('Exportar CSV no se viste de botón con caja', async () => {
    api.listDays.mockResolvedValue([
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
    ])
    render(<Progress />)

    const csv = await screen.findByRole('button', { name: /exportar csv/i })
    expect(csv).not.toHaveClass('secondary')
    expect(csv).toHaveClass('unit-fix')
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

    await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
    await userEvent.click(screen.getByRole('button', { name: /^Grupo y eliminar/ }))
    const select = screen.getByLabelText(/grupo muscular/i)
    expect(select).toHaveValue('Pecho')

    await userEvent.selectOptions(select, 'Hombro')

    await waitFor(() => expect(api.setExerciseMuscle).toHaveBeenCalledWith(7, 'Hombro'))
    expect(await screen.findByLabelText(/grupo muscular/i)).toHaveValue('Hombro')
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
      await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
      await userEvent.click(screen.getByRole('button', { name: /^Grupo y eliminar/ }))
      return screen.getByLabelText(/grupo muscular/i)
    }

    // Sin diálogo: reetiquetar es el único acto reversible del editor, y era
    // el único que llevaba confirmación *y* deshacer, mientras fusionar
    // —irreversible— iba de un toque y sin nada. La cifra que decía el diálogo
    // se conserva entera; lo que cambia es cuándo se dice y al lado de qué.
    it('lands on the tap, and the row that takes it back counts the sets', async () => {
      api.setExerciseMuscle.mockResolvedValue({
        id: 7,
        name: 'Press banca',
        muscle_group: 'Hombro',
        set_count: 6,
      })
      const select = await openCorrector(6)

      await userEvent.selectOptions(select, 'Hombro')

      await waitFor(() => expect(api.setExerciseMuscle).toHaveBeenCalledWith(7, 'Hombro'))
      expect(retagDialog()).not.toBeInTheDocument()
      // Contadas del registro que esta pantalla ya tiene cargado, no de la
      // lista de ejercicios: PRESS_DAYS lleva las series de verdad.
      expect(await screen.findByText(/ya cuentan como Hombro/)).toHaveTextContent(
        /Sus \d+ series ya cuentan como Hombro\./,
      )

      // Undoing is a correction of a correction: it must not ask again.
      api.setExerciseMuscle.mockResolvedValue({
        id: 7,
        name: 'Press banca',
        muscle_group: 'Pecho',
        set_count: 6,
      })
      await userEvent.click(await screen.findByRole('button', { name: /deshacer/i }))

      await waitFor(() => expect(api.setExerciseMuscle).toHaveBeenLastCalledWith(7, 'Pecho'))
      expect(retagDialog()).not.toBeInTheDocument()
      expect(await screen.findByLabelText(/grupo muscular/i)).toHaveValue('Pecho')
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

      await charted('Press banca')
      const chip = screen.getByRole('button', { name: /sin grupo/i })
      await userEvent.click(chip)

      // It behaves like a muscle chip: it selects, and it charts its lift.
      expect(chip).toHaveAttribute('aria-pressed', 'true')
      await charted('Rodillo')
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

    await charted('Press banca')
    await userEvent.click(screen.getByRole('button', { name: /editar ejercicio/i }))
    const input = screen.getByLabelText(/nombre de /i)
    await userEvent.clear(input)
    // Sin botón de guardar: Intro dentro del campo, que es la tecla que el
    // teclado del móvil ya está ofreciendo. Cerrar el panel y entrar en el
    // cajón mandan lo mismo.
    await userEvent.type(input, 'Press de banca{Enter}')

    await waitFor(() => expect(api.renameExercise).toHaveBeenCalledWith(7, 'Press de banca'))
    // La tarjeta de detrás pasa a llamarse como acabas de llamarla, y la hoja
    // sigue abierta con su cabecera diciendo lo mismo: ese es el acuse de
    // recibo. Cerrarla sería echarte de donde estabas por haber acertado.
    await charted('Press de banca')
    expect(screen.getByRole('dialog', { name: /^Editar Press de banca$/ })).toBeInTheDocument()
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
    await charted('Correr')
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
      expect(screen.getByText(/0\.8 entrenos\/sem/)).toBeInTheDocument()
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

      // Core is the one row RP's landmarks put a floor of zero under, so a week
      // with no abs in it is not short of anything and must never be told it
      // is. But drawing it as "inside" was the other error: a needle sitting on
      // the band's near edge with a silent state line is the *same picture*
      // eight sets of squats earn, so "never touched" and "trained enough" came
      // out identical. The needle goes — its position here is a coincidence of
      // geometry, not a measurement — and one muted word says which of the two
      // this is.
      const trackOf = (container, index) => container.querySelectorAll('.sum-track')[index]
      const coreRow = (container) => {
        const names = [...container.querySelectorAll('.sum-name')].map((n) => n.textContent)
        return names.indexOf('Core')
      }

      it('reads a muscle at zero as untouched, not as satisfied', async () => {
        api.listDays.mockResolvedValue([
          { id: 1, date: '2026-07-22', workouts: [{ id: 1, sets: many(3, 'Pecho', 1) }] },
          // Core trained last week and not this one, so it holds a row at zero.
          { id: 2, date: '2026-07-15', workouts: [{ id: 2, sets: many(4, 'Core', 40) }] },
        ])
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        const core = coreRow(container)
        expect(container.querySelectorAll('.sum-state')[core].textContent).toBe('sin tocar')
        expect(tailOf(container, core)).toBeNull()
        expect(trackOf(container, core).querySelector('.sum-mark')).toBeNull()
        // Nothing is owed, so nothing is lifted to ink: the word is a fact
        // about the week, not a demand on it. Pecho, three sets short of six on
        // a week that has closed, is what ink on this line looks like.
        expect(container.querySelectorAll('.sum-state')[core].className).toBe('sum-state')
        expect(container.querySelector('.sum-state.is-short').textContent).toBe('faltan 3')
        expect(trackOf(container, core).getAttribute('aria-label')).toBe('Core: 0 — sin tocar')
      })

      // Zero is zero whenever you read it: the word is a description, not a
      // verdict, so it does not wait for the week to close the way `faltan N`
      // waits for its ink.
      it('says the same on a week that has closed', async () => {
        // Sunday, so 20–26 jul is done.
        api.listDays.mockResolvedValue([
          { id: 1, date: '2026-07-22', workouts: [{ id: 1, sets: many(3, 'Pecho', 1) }] },
          { id: 2, date: '2026-07-15', workouts: [{ id: 2, sets: many(4, 'Core', 40) }] },
        ])
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        const core = coreRow(container)
        expect(container.querySelectorAll('.sum-state')[core].textContent).toBe('sin tocar')
        expect(trackOf(container, core).querySelector('.sum-mark')).toBeNull()
      })

      // The needle only goes when the row is at literally zero. One set of abs
      // is a real measurement and draws like one — otherwise the rule would be
      // "Core has no needle" instead of "there is nothing to place".
      it('draws the needle again as soon as there is a single set on the row', async () => {
        api.listDays.mockResolvedValue([
          { id: 1, date: '2026-07-22', workouts: [{ id: 1, sets: many(1, 'Core', 1) }] },
        ])
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        const core = coreRow(container)
        expect(container.querySelectorAll('.sum-state')[core].textContent).toBe('')
        expect(trackOf(container, core).querySelector('.sum-mark')).not.toBeNull()
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

        // A deload week in progress owes its goal exactly the way an ordinary
        // week owes its band: on Wednesday you have not missed it, you have not
        // got there yet. So the tail that measures the distance to the goal
        // waits with every other running week's, and comes in when the week
        // does.
        it('holds the tail back while the deload week is still running', async () => {
          vi.setSystemTime(new Date(2026, 6, 22, 12)) // Wednesday
          api.listDays.mockResolvedValue([
            // Nine sets in a recent week, so the deload asks for three.
            { id: 1, date: '2026-06-10', workouts: [{ id: 1, sets: many(9, 'Cuádriceps', 1) }] },
            { id: 2, date: '2026-07-21', workouts: [{ id: 2, sets: many(1, 'Cuádriceps', 40) }] },
          ])
          const { container } = render(<Progress />)
          await screen.findByText('Esta semana')

          await mark()
          expect(container.querySelector('.sum-state').textContent).toBe('objetivo 3')
          expect(container.querySelector('.sum-tail').className).toBe('sum-tail is-provisional')
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

      // The words have waited for the week to close since the ink was first
      // held off them. The tail was invented afterwards and never came under
      // the rule, so a Tuesday with fifteen sets logged drew five muted words
      // under five full-strength leader lines saying the same thing louder —
      // the letter of the rule kept, its reason lost. Same switch, both
      // channels.
      it('holds the shortfall tail back while the week is still running', async () => {
        vi.setSystemTime(new Date(2026, 6, 22, 12)) // Wednesday
        api.listDays.mockResolvedValue(bands({ Pecho: 2 }))
        const { container } = render(<Progress />)


        await waitFor(() => {
          expect(container.querySelector('.sum-tail')).not.toBeNull()
        })
        expect(container.querySelector('.sum-tail').className).toBe('sum-tail is-provisional')
      })

      it('brings the tail up to full strength once the week is closed', async () => {
        // Sunday: 20–26 jul is done and 2 sets really is 4 short.
        api.listDays.mockResolvedValue(bands({ Pecho: 2 }))
        const { container } = render(<Progress />)


        await waitFor(() => {
          expect(container.querySelector('.sum-tail')).not.toBeNull()
        })
        expect(container.querySelector('.sum-tail').className).toBe('sum-tail')
      })

      // Only the shortfall is provisional. A tail past the far edge measures
      // work already done, which is as true on a Tuesday as on a Sunday and can
      // only grow — dimming it would be the card hedging about a fact.
      it('never dims a tail past the band', async () => {
        vi.setSystemTime(new Date(2026, 6, 22, 12)) // Wednesday
        api.listDays.mockResolvedValue(bands({ Pecho: 30 }))
        const { container } = render(<Progress />)


        await waitFor(() => {
          expect(container.querySelector('.sum-tail')).not.toBeNull()
        })
        expect(container.querySelector('.sum-tail').className).toBe('sum-tail')
      })

      // A month reporting a weekly average is already judged: the average
      // divides by the weeks that have run, so a rate short of the band is
      // short of it now, not at the end of the month.
      it('does not hold back a month that reports a weekly average', async () => {
        vi.setSystemTime(new Date(2026, 6, 22, 12)) // Wednesday, 22 days into July
        api.listDays.mockResolvedValue(bands({ Pecho: 2 }))
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        await openMonth()
        await waitFor(() => {
          expect(container.querySelector('.sum-tail')).not.toBeNull()
        })
        expect(container.querySelector('.sum-collab').textContent).toBe('media/sem')
        expect(container.querySelector('.sum-tail').className).toBe('sum-tail')
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

    // The line under the nav welded three facts at one weight — sessions, sets,
    // and how far into the period you were — and the third is the one that
    // decides how to read the other two. It leads now, and it is the only thing
    // in that line wearing ink.
    describe('the line that says what the numbers below mean', () => {
      const stage = (c) => c.querySelector('.sum-stage')?.textContent ?? null
      const sub = (c) => c.querySelector('.sum-sub').textContent

      it('leads with the day of the week you are on, not the days you trained', async () => {
        vi.setSystemTime(new Date(2026, 6, 22, 12)) // Wednesday
        api.listDays.mockResolvedValue(SUMMER)
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        // "3 de 7 días" sat last and muted beside "2 entrenos", where it reads
        // as three days trained. It is the denominator of every figure on the
        // card — the only reason nine rows of counts aren't a finished week —
        // so it goes first, in ink, and names what it counts.
        expect(stage(container)).toBe('Día 3 de 7')
        expect(sub(container)).toBe('Día 3 de 7 · 2 entrenos · 5 series')
      })

      it('says nothing once the week is closed', async () => {
        api.listDays.mockResolvedValue(SUMMER) // Sunday 26 jul: 20–26 is over
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        // A finished week's counts mean exactly what they say, and the nav
        // title flipping `Esta semana` → `20–26 jul` plus the rows' verdicts
        // going muted → ink already say it is over. A third cue is the mistake
        // the `HOY` chip made on Días.
        expect(stage(container)).toBeNull()
        expect(sub(container)).toBe('2 entrenos · 5 series')
      })

      // The marker used to weld its span to the counts with the same `·` that
      // welds the counts to each other, so `Media de 3.7 semanas · 3 entrenos`
      // read as three sessions *a week* — an ordinary weekly rate, and wrong by
      // a factor of four. The fix is not a different separator: every figure on
      // the line is now printed in the unit the rows are printed in, so the
      // marker can scope forward all it likes.
      it('prints the month counts at the rate the rows are printed', async () => {
        api.listDays.mockResolvedValue(SUMMER)
        const { container } = render(<Progress />)

        await openMonth()
        await screen.findByText('Julio')
        // The span is the one thing neither the `/sem` on each figure nor the
        // `media/sem` heading over the rows can say: 1.9/sem after 3.7 weeks
        // and 1.9/sem after two days are different claims.
        expect(stage(container)).toBe('3.7 semanas')
        expect(sub(container)).toBe('3.7 semanas · 0.8 entrenos/sem · 1.9 series/sem')
      })

      // Three sentences saying "these are weekly averages" — the marker, the
      // `media/sem` heading and a footer after the rows — is the `HOY`-chip
      // mistake one view over. The unit rides each figure now, which is the
      // strongest of the three, so the prose goes.
      it('never says "media" in words when the figures carry the unit', async () => {
        api.listDays.mockResolvedValue(SUMMER)
        render(<Progress />)

        await openMonth()
        await screen.findByText('Julio')
        expect(screen.queryByText(/Mes en curso/)).toBeNull()
        expect(screen.queryByText(/^Media/)).toBeNull()
      })

      it('counts the day of the month while a month is too young to average', async () => {
        vi.setSystemTime(new Date(2026, 7, 3, 12)) // 3 aug, three days in
        api.listDays.mockResolvedValue([
          { id: 1, date: '2026-08-01', workouts: [{ id: 1, sets: [bench(1, 60, 8)] }] },
        ])
        const { container } = render(<Progress />)

        await openMonth()
        await screen.findByText('Agosto')
        // Under a week there is no rate to report, so the rows print plain
        // counts and the marker counts days — of 31, not of 7. The header
        // counts follow the rows: no `/sem` on a card that is not averaging.
        expect(stage(container)).toBe('Día 3 de 31')
        expect(sub(container)).toBe('Día 3 de 31 · 1 entreno · 1 serie')
      })

      // A closed month keeps its span and loses its prose. `Media semanal` sat
      // where the span goes and said what `/sem` and `media/sem` now both say,
      // while the one thing a reader cannot recover — how many weeks the
      // averages divide by — went unprinted.
      it('gives a closed month its span, not the word "media"', async () => {
        vi.setSystemTime(new Date(2026, 7, 10, 12)) // 10 aug, so July is closed
        api.listDays.mockResolvedValue(SUMMER)
        const { container } = render(<Progress />)

        await openMonth()
        await screen.findByText('Agosto')
        await userEvent.click(screen.getByRole('button', { name: 'Periodo anterior' }))
        await screen.findByText('Julio')
        expect(sub(container)).toBe('4.4 semanas · 0.7 entrenos/sem · 1.6 series/sem')
      })
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

    // Monday morning, nothing logged since the week turned over — the live
    // state of a real account roughly one day in seven. Nine rows at zero, each
    // demanding its whole band, is a verdict on a week that has not happened
    // yet (DESIGN.md 2026-08-05: "nunca mientras la semana corre"). The rows go
    // and the week says what it is, once, in the numbers that *are* final.
    describe('una semana sin nada dentro', () => {
      const setsOf = (spec, from) => {
        let id = from
        const out = []
        for (const [group, n] of Object.entries(spec)) {
          for (let i = 0; i < n; i += 1) {
            out.push({
              id: (id += 1),
              exercise_name: group,
              muscle_group: group,
              set_index: 0,
              weight: 40,
              reps: 10,
            })
          }
        }
        return out
      }

      // 20–26 jul closed with two sessions and 17 sets: Pecho landed in its
      // band, Espalda and Bíceps under theirs. 27 jul is the Monday after.
      const LAST_WEEK = [
        { id: 2, date: '2026-07-22', workouts: [{ id: 2, sets: setsOf({ Pecho: 8, Espalda: 4 }, 500) }] },
        { id: 1, date: '2026-07-20', workouts: [{ id: 1, sets: setsOf({ Pecho: 2, Bíceps: 3 }, 700) }] },
      ]

      beforeEach(() => {
        vi.setSystemTime(new Date(2026, 6, 27, 8)) // Monday
      })

      it('no dibuja nueve carriles pidiendo series', async () => {
        api.listDays.mockResolvedValue(LAST_WEEK)
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(container.querySelectorAll('.sum-row')).toHaveLength(0)
        expect(screen.queryByText(/faltan/)).toBeNull()
      })

      it('dice una vez que la semana todavía está en blanco', async () => {
        api.listDays.mockResolvedValue(LAST_WEEK)
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(container.querySelector('.sum-empty').textContent).toBe(
          'La semana aún no tiene series.',
        )
        // No verdict either: a week nobody has lived cannot have come in short.
        expect(container.querySelector('.sum-shortweek')).toBeNull()
      })

      // The only numbers on a Monday that are real are last week's, and they
      // are final. Handing them over is what turns a blank card into the answer
      // to "what should today be".
      it('entrega el cierre de la semana anterior', async () => {
        api.listDays.mockResolvedValue(LAST_WEEK)
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(container.querySelector('.sum-handover').textContent).toBe(
          'La pasada cerró con 17 series en 2 entrenos.',
        )
        expect(container.querySelector('.sum-owed-lab').textContent).toBe(
          'Cerraron bajo su zona',
        )
        expect(
          [...container.querySelectorAll('.sum-owed-name')].map((n) => n.textContent),
        ).toEqual(['Espalda', 'Bíceps'])
      })

      it('lo dice también cuando no se quedó nada corto', async () => {
        api.listDays.mockResolvedValue([
          { id: 1, date: '2026-07-22', workouts: [{ id: 1, sets: setsOf({ Pecho: 12 }, 500) }] },
        ])
        render(<Progress />)

        await screen.findByText('Esta semana')
        expect(screen.getByText('Todo cerró en zona.')).toBeInTheDocument()
      })

      // A week you skipped, looked at afterwards. "Semana corta · 0 series,
      // menos de un cuarto de tu semana típica" measures a week that never
      // started against one that did.
      it('una semana cerrada sin entrenar no es una semana corta', async () => {
        api.listDays.mockResolvedValue([
          { id: 2, date: '2026-07-22', workouts: [{ id: 2, sets: setsOf({ Pecho: 12 }, 500) }] },
          { id: 1, date: '2026-07-08', workouts: [{ id: 1, sets: setsOf({ Pecho: 12 }, 700) }] },
        ])
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        // ‹ twice: 20–26 jul has work, 13–19 jul has none.
        const back = screen.getByRole('button', { name: 'Periodo anterior' })
        await userEvent.click(back)
        await userEvent.click(back)
        expect(container.querySelector('.sum-empty').textContent).toBe('Semana sin entrenar.')
        expect(container.querySelector('.sum-shortweek')).toBeNull()
      })

      // Nine empty runways is the worst possible first screen, and "le debes 6
      // series al pecho" is a strange first sentence to say to someone who has
      // never logged a set.
      it('una cuenta nueva ve una frase, no una semana', async () => {
        api.listDays.mockResolvedValue([])
        const { container } = render(<Progress />)

        expect(await screen.findByText('Todavía no hay series registradas.')).toBeInTheDocument()
        expect(container.querySelectorAll('.sum-row')).toHaveLength(0)
        // Nothing to walk back through, and no month to switch to either.
        expect(container.querySelector('.sum-head')).toBeNull()
        expect(screen.queryByText(/entrenos/)).toBeNull()
        // Nor a denominator: there is no week to be one-seventh of the way
        // through when there has never been a set.
        expect(container.querySelector('.sum-sub')).toBeNull()
      })

      // A request that failed and a log that is empty are not the same fact,
      // and this card is the one place in the app where confusing them is
      // loudest: it tells somebody with months of training that they have never
      // trained. The backend sleeps on the free tier, so a cold start is the
      // most likely first frame this card ever draws.
      //
      // Silence is the right answer, because it is what the screen said before
      // the empty state existed. Saying "no se pudo cargar" here would be a
      // second claim on a screen that already cannot support the first one.
      it('un /days que falla no es una cuenta nueva', async () => {
        api.listDays.mockRejectedValue(new Error('offline'))
        const { container } = render(<Progress />)

        await waitFor(() => expect(api.listDays).toHaveBeenCalled())
        expect(screen.queryByText('Todavía no hay series registradas.')).toBeNull()
        expect(screen.queryByText('La semana aún no tiene series.')).toBeNull()
        expect(container.querySelector('.sum-empty')).toBeNull()
        expect(container.querySelectorAll('.sum-row')).toHaveLength(0)
      })

      // The log arrives over the network, and `days` is `[]` until it does —
      // the same shape a new account has forever. Reporting the empty state
      // before the answer is in is the one thing worse than reporting nothing.
      it('no llama vacía una cuenta que todavía está cargando', async () => {
        api.listDays.mockReturnValue(new Promise(() => {}))
        const { container } = render(<Progress />)

        expect(container.querySelector('.sum-empty')).toBeNull()
        expect(container.querySelector('.card')).not.toBeNull() // Evolución still draws
      })

      // A muscle at zero holds its row — but it only held it for one week, so
      // a group you stopped training vanished on the second week of silence,
      // which is the first week the absence means anything.
      it('mantiene la fila de un músculo callado más de una semana', async () => {
        api.listDays.mockResolvedValue([
          { id: 2, date: '2026-07-22', workouts: [{ id: 2, sets: setsOf({ Pecho: 8 }, 500) }] },
          { id: 1, date: '2026-07-01', workouts: [{ id: 1, sets: setsOf({ Espalda: 10 }, 700) }] },
        ])
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        // ‹ once: 20–26 jul, where Pecho trained and Espalda has been quiet for
        // three weeks.
        await userEvent.click(screen.getByRole('button', { name: 'Periodo anterior' }))
        const names = [...container.querySelectorAll('.sum-name')].map((n) => n.textContent)
        expect(names).toContain('Espalda')
        const states = [...container.querySelectorAll('.sum-state')].map((s) => s.textContent)
        expect(states[names.indexOf('Espalda')]).toBe('faltan 10')
      })
    })

    // A week you ran in and did not lift in. Every group is seeded at zero from
    // the eight weeks behind it, so `rows` is nine long and `sets` is above
    // zero: the card drew nine deficit runways over a week in which something
    // did happen. "Nothing was classified" and "nothing happened" are different
    // sentences, and only the second one has no rows.
    describe('una semana de solo cardio', () => {
      const setsOf = (spec, from) => {
        let id = from
        const out = []
        for (const [group, n] of Object.entries(spec)) {
          for (let i = 0; i < n; i += 1) {
            out.push({
              id: (id += 1),
              exercise_name: group,
              muscle_group: group,
              set_index: 0,
              weight: 40,
              reps: 10,
            })
          }
        }
        return out
      }

      const run = (id) => ({
        id,
        exercise_name: 'Cinta',
        muscle_group: null,
        set_index: 0,
        duration_seconds: 1500,
        distance: 4.2,
      })

      // Nine groups last week, so every one of them holds a seeded row this
      // week — the exact input that produced nine reproaches.
      const LAST_WEEK = {
        Pecho: 8,
        Espalda: 8,
        Hombro: 8,
        Bíceps: 6,
        Tríceps: 6,
        Cuádriceps: 4,
        Femoral: 4,
        Gemelo: 4,
        Core: 4,
      }

      const CARDIO = [
        { id: 3, date: '2026-07-29', workouts: [{ id: 3, sets: [run(1), run(2), run(3)] }] },
        { id: 2, date: '2026-07-22', workouts: [{ id: 2, sets: setsOf(LAST_WEEK, 500) }] },
      ]

      beforeEach(() => {
        vi.setSystemTime(new Date(2026, 6, 29, 12)) // Wednesday, week of 27 jul
      })

      it('no dibuja nueve carriles a cero sobre una semana en la que entrenaste', async () => {
        api.listDays.mockResolvedValue(CARDIO)
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(container.querySelectorAll('.sum-row')).toHaveLength(0)
        expect(screen.queryByText(/faltan/)).toBeNull()
      })

      it('dice qué pasó de verdad, y lo dice una sola vez', async () => {
        api.listDays.mockResolvedValue(CARDIO)
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(container.querySelector('.sum-empty').textContent).toBe(
          'Ninguna serie con músculo asignado.',
        )
        // The footnote under the rows says the same thing, and there are no
        // rows for it to sit under.
        expect(container.querySelector('.sum-rest')).toBeNull()
      })

      it('conserva las cuentas: algo se registró', async () => {
        api.listDays.mockResolvedValue(CARDIO)
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(container.querySelector('.sum-sub').textContent).toBe(
          'Día 3 de 7 · 1 entreno · 3 series',
        )
      })

      it('entrega el cierre de la semana anterior, como cualquier semana sin filas', async () => {
        api.listDays.mockResolvedValue(CARDIO)
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(container.querySelector('.sum-handover').textContent).toBe(
          'La pasada cerró con 52 series en 1 entreno.',
        )
      })
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

    await userEvent.type(screen.getByLabelText('Ejercicio'), 'Squat{enter}')

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
      await charted('Fondo')
      await userEvent.click(screen.getByRole('button', { name: /editar ejercicio/i }))
    }

    // Borrar es una acción rara y destructiva: vive en el segundo paso del
    // editor, no en el panel que abres para arreglar una errata.
    async function openMore() {
      await openFixes()
      await userEvent.click(screen.getByRole('button', { name: /^Grupo y eliminar/ }))
    }

    beforeEach(() => {
      api.listExercises.mockResolvedValue([
        { id: 32, name: 'Fondo', muscle_group: 'Pecho', set_count: 4 },
        { id: 20, name: 'Fondos', muscle_group: 'Pecho', set_count: 48 },
      ])
      api.listDays.mockResolvedValue(FONDO_DAYS)
    })

    it('deletes an exercise once you confirm, saying what goes with it', async () => {
      api.deleteExercise.mockResolvedValue(null)
      await openMore()

      await userEvent.click(screen.getByRole('button', { name: /eliminar ejercicio/i }))
      // Irreversible y se lleva historia, así que la confirmación tiene que
      // nombrar el destrozo en unidades sobre las que se pueda actuar: en
      // cuántos días, desde cuándo, y cuál es el récord que se va. «Su
      // historial y sus récords» nombraba categorías que no se pueden ir a
      // mirar antes de decidir.
      const dialog = await screen.findByRole('dialog', { name: /^Eliminar Fondo$/ })
      expect(dialog).toHaveTextContent(
        'Se borrarán sus 4 series de un solo día de julio, y con ellas su récord de 30 kg × 8. ' +
          'No se puede deshacer.',
      )
      expect(api.deleteExercise).not.toHaveBeenCalled()

      await userEvent.click(within(dialog).getByRole('button', { name: /sí, eliminar/i }))
      await waitFor(() => expect(api.deleteExercise).toHaveBeenCalledWith(32))
      // Se va el ejercicio y con él la hoja que hablaba de él: ni un diálogo.
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    // Confirmar no es lo mismo que no poder pulsarlo sin querer. El foco se
    // quedaba en la fila roja que abrió el diálogo —detrás del velo— y un Intro
    // de más lo reabría; ahora arranca en la salida segura.
    it('starts the focus on the way out, not on the button that destroys', async () => {
      await openMore()

      await userEvent.click(screen.getByRole('button', { name: /eliminar ejercicio/i }))

      const dialog = await screen.findByRole('dialog', { name: /^Eliminar Fondo$/ })
      expect(within(dialog).getByRole('button', { name: /cancelar/i })).toHaveFocus()
    })

    // Escape cierra el editor entero, así que el único sitio donde no hacía
    // nada era justo el que hay delante cuando vas a tirar meses de registro.
    it('backs out on Escape, without closing anything else', async () => {
      await openMore()

      await userEvent.click(screen.getByRole('button', { name: /eliminar ejercicio/i }))
      await screen.findByRole('dialog', { name: /^Eliminar Fondo$/ })
      await userEvent.keyboard('{Escape}')

      expect(api.deleteExercise).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog', { name: /^Eliminar Fondo$/ })).not.toBeInTheDocument()
      // Y el editor sigue abierto: una tecla, un acto.
      expect(screen.getByRole('dialog', { name: /^Editar Fondo$/ })).toBeInTheDocument()
    })

    // La tarjeta deja de existir, y con ella el botón que abrió el editor. Sin
    // esto el foco caía en `body` y la pantalla contestaba al borrado con la
    // ausencia del ejercicio y nada más.
    it('says what it deleted, and lands the focus somewhere that exists', async () => {
      api.deleteExercise.mockResolvedValue(null)
      await openMore()

      await userEvent.click(screen.getByRole('button', { name: /eliminar ejercicio/i }))
      await userEvent.click(
        within(await screen.findByRole('dialog', { name: /^Eliminar Fondo$/ })).getByRole(
          'button',
          { name: /sí, eliminar/i },
        ),
      )

      expect(await screen.findByText('Se eliminó «Fondo», con sus 4 series.')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByLabelText('Ejercicio')).toHaveFocus())
      // Y no se ofrece una vuelta que no existe.
      expect(screen.queryByRole('button', { name: /deshacer/i })).not.toBeInTheDocument()
    })

    it('backs out of the deletion when you cancel', async () => {
      await openMore()

      await userEvent.click(screen.getByRole('button', { name: /eliminar ejercicio/i }))
      await userEvent.click(
        within(
          await screen.findByRole('dialog', { name: /^Eliminar Fondo$/ }),
        ).getByRole('button', { name: /cancelar/i }),
      )

      expect(api.deleteExercise).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog', { name: /^Eliminar Fondo$/ })).not.toBeInTheDocument()
    })

    // ── El choque de nombre duplicado ───────────────────────────────────────
    // El 409 trae el ejercicio con el que chocaste, así que la colisión deja de
    // ser un callejón: se nombra con la ortografía guardada, se dice lo que
    // cuesta fusionar con la cifra del servidor, y las dos salidas están en el
    // propio aviso.
    const taken = (exercise) =>
      Object.assign(new Error('request failed: 409'), {
        status: 409,
        detail: {
          code: 'name_taken',
          message: 'an exercise with that name already exists',
          exercise,
        },
      })

    const typeName = async (typed) => {
      const input = screen.getByLabelText(/nombre de /i)
      await userEvent.clear(input)
      await userEvent.type(input, typed)
    }

    it('turns the collision into a priced offer', async () => {
      api.renameExercise.mockRejectedValue(
        taken({ id: 20, name: 'Fondos', kind: 'strength', set_count: 48 }),
      )
      api.mergeExercise.mockResolvedValue({ id: 20, name: 'Fondos', muscle_group: 'Pecho' })
      await openFixes()
      await typeName('Fondos{Enter}')

      const alert = await screen.findByRole('alert')
      // Las dos cifras: 48 es lo que te quedas —lo que *no* arriesgas— y 4 es
      // lo que se va. Y lo que se va se nombra: series, récords y el ejercicio.
      expect(alert).toHaveTextContent(
        'Ya tienes «Fondos», con 48 series. ' +
          'Fusionar mueve ahí las 4 series de «Fondo», con sus récords, y lo borra. ' +
          'No se puede deshacer.',
      )

      await userEvent.click(within(alert).getByRole('button', { name: 'Sí, fusionar' }))
      await waitFor(() => expect(api.mergeExercise).toHaveBeenCalledWith(32, 20))
      await charted('Fondos')
      // La fusión se llevó el ejercicio del que iba la hoja, así que la hoja se
      // va con él — y el aviso, que ya no tiene nada que ofrecer.
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    })

    // La ortografía es la guardada, no la que escribiste: puedes haber tecleado
    // `fondos` y el ejercicio llamarse `Fondos`. Y el ejercicio con el que
    // chocas puede no estar en la lista que esta pantalla cargó.
    it('names the collision from the response, not from the loaded list', async () => {
      api.listExercises.mockResolvedValue([{ id: 32, name: 'Fondo', muscle_group: 'Pecho' }])
      api.renameExercise.mockRejectedValue(
        taken({ id: 77, name: 'Fondos en anillas', kind: 'strength', set_count: 1 }),
      )
      await openFixes()
      await typeName('fondos en anillas{Enter}')

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Ya tienes «Fondos en anillas», con 1 serie.',
      )
    })

    it('does not print a count of zero', async () => {
      api.renameExercise.mockRejectedValue(
        taken({ id: 20, name: 'Fondos', kind: 'strength', set_count: 0 }),
      )
      await openFixes()
      await typeName('Fondos{Enter}')

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Ya tienes «Fondos», todavía sin series.')
      expect(alert).not.toHaveTextContent(/0 series/)
    })

    // El servidor rechaza fusionar cardio con fuerza, así que el botón no se
    // ofrece: sería prometer algo que va a fallar.
    it('does not offer a merge the server would refuse', async () => {
      api.renameExercise.mockRejectedValue(
        taken({ id: 9, name: 'Cinta', kind: 'cardio', set_count: 12 }),
      )
      await openFixes()
      await typeName('Cinta{Enter}')

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(
        'Ya tienes «Cinta», pero es de cardio y «Fondo» es de fuerza. ' +
          'No se pueden fusionar: ponle otro nombre.',
      )
      expect(within(alert).queryByRole('button', { name: 'Sí, fusionar' })).not.toBeInTheDocument()
    })

    // ── La superficie que no se desmonta ────────────────────────────────────
    // El renombrado se manda también al cerrar, y por las cuatro puertas la
    // petición sale mientras el panel desaparece. Un aviso dentro del panel no
    // llega a decir nada. Medido: por el aspa, un 409 no decía nada de nada.
    it('says the collision even when the panel closed on the way out', async () => {
      api.renameExercise.mockRejectedValue(
        taken({ id: 20, name: 'Fondos', kind: 'strength', set_count: 48 }),
      )
      await openFixes()
      await typeName('Fondos')
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Ya tienes «Fondos»')
      expect(screen.queryByLabelText(/nombre de /i)).not.toBeInTheDocument()
    })

    it('says a network failure even when the panel closed on the way out', async () => {
      api.renameExercise.mockRejectedValue(new Error('Failed to fetch'))
      await openFixes()
      await typeName('Fondos')
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('No se pudo cambiar el nombre.')

      // Y un fallo de red no es una respuesta: la misma pregunta se vuelve a
      // hacer desde el propio aviso, sin reabrir nada.
      api.renameExercise.mockResolvedValue({ id: 32, name: 'Fondos', muscle_group: 'Pecho' })
      await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }))
      await waitFor(() => expect(api.renameExercise).toHaveBeenCalledTimes(2))
      await charted('Fondos')
    })

    // La otra salida de la colisión: el panel vuelve con lo que escribiste
    // todavía dentro, para corregirlo en vez de teclearlo otra vez.
    it('reopens the editor on the draft you typed', async () => {
      api.renameExercise.mockRejectedValue(
        taken({ id: 20, name: 'Fondos', kind: 'strength', set_count: 48 }),
      )
      await openFixes()
      await typeName('Fondos')
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

      const alert = await screen.findByRole('alert')
      await userEvent.click(within(alert).getByRole('button', { name: 'Escribir otro nombre' }))

      expect(await screen.findByLabelText(/nombre de /i)).toHaveValue('Fondos')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
