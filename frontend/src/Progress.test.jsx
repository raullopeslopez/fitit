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

  // Three cards that answer three questions — how much, how often, how it is
  // going — stacked in one scroll. Now one at a time, behind a tab each, so the
  // one you came for fills the screen instead of sharing it.
  describe('las secciones', () => {
    // Marcador: Ejercicio · Músculos · Cuerpo, ahora seguidas en un scroll. Las
    // píldoras son el índice: marcan dónde estás y saltan a cada una.
    it('reparte Progreso en Ejercicio, Músculos y Cuerpo, con Ejercicio arriba', async () => {
      render(<Progress />)
      const nav = screen.getByRole('navigation', { name: 'Progreso' })
      const pildoras = within(nav).getAllByRole('button')
      expect(pildoras.map((t) => t.textContent)).toEqual(['Ejercicio', 'Músculos', 'Cuerpo'])
      expect(within(nav).getByRole('button', { name: 'Ejercicio' })).toHaveAttribute('aria-current', 'true')
    })

    it('enseña las tres a la vez, en ese orden', async () => {
      api.listDays.mockResolvedValue(BENCH_DAYS)
      const { container } = render(<Progress />)
      await waitFor(() => expect(container.querySelector('.sum-card')).not.toBeNull())
      const ejercicio = screen.getByLabelText('Ejercicio')
      const series = container.querySelector('.sum-card')
      const peso = container.querySelector('.weight-card')
      expect(container.querySelector('.rhythm-card')).not.toBeNull()
      expect(ejercicio.compareDocumentPosition(series) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(series.compareDocumentPosition(peso) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  // "Mejores marcas" was a leaderboard of your own lifts, and it answered a
  // question nobody was asking twice. Evolución shows the climb instead.
  it('has no best-marks leaderboard', async () => {
    render(<Progress initialTab="evolucion" />)

    await waitFor(() => expect(api.listDays).toHaveBeenCalled())
    expect(screen.queryByText(/mejores marcas/i)).not.toBeInTheDocument()
  })

  it('draws the climb of a lift from its real records', async () => {
    api.listExercises.mockResolvedValue([{ id: 1, name: 'Press banca', muscle_group: 'Pecho' }])
    api.listDays.mockResolvedValue(BENCH_DAYS)
    const { container } = render(<Progress initialTab="evolucion" />)

    expect(await screen.findByRole('heading', { name: 'Evolución' })).toBeInTheDocument()
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
    const { container } = render(<Progress initialTab="evolucion" />)

    // Opens on Curl Predicador (only lift with more than one set).
    await charted('Curl Predicador Máq.')
    expect(screen.getByText('15 × 15')).toBeInTheDocument()
    expect(screen.getByText('20 × 15')).toBeInTheDocument()

    // Ritmo por músculo names every muscle above this card, so the click has to
    // stay scoped to Evolución's own chips.
    const evoCard = screen.getByRole('heading', { name: 'Evolución' }).closest('.card')
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
    render(<Progress initialTab="evolucion" />)

    const card = (await screen.findByRole('heading', { name: 'Evolución' })).closest('.card')
    expect(card.querySelector('.muscle-chips')).not.toBeNull()
    await userEvent.click(
      [...card.querySelectorAll('.chip')].find((c) => /cuádriceps/i.test(c.textContent)),
    )
    await charted('Sentadilla')
  })

  // La gráfica es una línea por todas las sesiones, por su serie más pesada, y
  // los récords son anillos sobre ella. Una bajada es un día que levantaste
  // menos de verdad: nada se interpola.
  it('draws every session by its heaviest set and rings only the records', async () => {
    api.listExercises.mockResolvedValue([{ id: 1, name: 'Press banca', muscle_group: 'Pecho' }])
    api.listDays.mockResolvedValue([
      { id: 4, date: '2026-07-25', workouts: [{ id: 4, sets: [bench(7, 82.5, 6)] }] },
      ...BENCH_DAYS,
    ])
    const { container } = render(<Progress initialTab="evolucion" />)

    await charted('Press banca')
    const line = container.querySelector('svg.chart polyline')
    expect(line.getAttribute('points').trim().split(/\s+/)).toHaveLength(4)
    expect(container.querySelectorAll('svg.chart circle')).toHaveLength(3)
  })

  it('leads with the heaviest set, not an estimated 1RM', async () => {
    api.listExercises.mockResolvedValue([{ id: 1, name: 'Press banca', muscle_group: 'Pecho' }])
    api.listDays.mockResolvedValue(BENCH_DAYS)
    const { container } = render(<Progress initialTab="evolucion" />)

    await charted('Press banca')
    expect(screen.getByText('Serie más pesada')).toBeInTheDocument()
    expect(container.querySelector('.evo-big-n').textContent).toBe('85')
    expect(container.querySelector('.evo-big-unit').textContent).toBe('kg × 5')
    expect(screen.queryByText(/1RM/)).not.toBeInTheDocument()
  })

  it('counts records, sessions and the days since the last one', async () => {
    api.listExercises.mockResolvedValue([{ id: 1, name: 'Press banca', muscle_group: 'Pecho' }])
    api.listDays.mockResolvedValue([
      { id: 4, date: '2026-07-25', workouts: [{ id: 4, sets: [bench(7, 82.5, 6)] }] },
      ...BENCH_DAYS,
    ])
    const { container } = render(<Progress initialTab="evolucion" />)

    await charted('Press banca')
    const stats = [...container.querySelectorAll('.evo-stat')].map((s) => s.textContent)
    expect(stats[0]).toBe('3Récords')
    expect(stats[1]).toBe('4Sesiones')
    expect(stats[2]).toMatch(/Desde la última$/)
  })

  it('lists the records newest first, each with what it added', async () => {
    api.listExercises.mockResolvedValue([{ id: 1, name: 'Press banca', muscle_group: 'Pecho' }])
    api.listDays.mockResolvedValue(BENCH_DAYS)
    const { container } = render(<Progress initialTab="evolucion" />)

    await charted('Press banca')
    expect(screen.getByRole('heading', { name: 'Marcas' })).toBeInTheDocument()
    const rows = [...container.querySelectorAll('.evo-mark')].map((r) => r.textContent)
    // El primero no lleva etiqueta: es el punto de partida, y la lista ya lo
    // dice estando al final.
    expect(rows).toEqual(['20 jul85 × 5+2.5 kg', '10 jul82.5 × 5+2.5 kg', '1 jul80 × 5'])
  })

  // Sin guías ni línea de base: la línea flota sola.
  it('draws the line with no grid behind it', async () => {
    api.listExercises.mockResolvedValue([{ id: 1, name: 'Press banca', muscle_group: 'Pecho' }])
    api.listDays.mockResolvedValue(BENCH_DAYS)
    const { container } = render(<Progress initialTab="evolucion" />)

    await charted('Press banca')
    expect(container.querySelectorAll('svg.chart line')).toHaveLength(0)
  })

  // Fondos a peso corporal son 0 kg siempre: por peso la gráfica es una raya.
  // Lo que sube ahí son las repeticiones, y eso es lo que se dibuja y se cuenta.
  describe('un ejercicio a peso corporal', () => {
    const dips = (id, date, reps) => ({
      id,
      date,
      workouts: [
        {
          id,
          sets: [
            { id: id * 10, exercise_name: 'Fondos', muscle_group: 'Pecho', set_index: 0, weight: 0, reps },
          ],
        },
      ],
    })
    const DIPS = [dips(3, '2026-08-20', 14), dips(2, '2026-08-10', 15), dips(1, '2026-07-25', 12)]

    beforeEach(() => {
      api.listExercises.mockResolvedValue([{ id: 1, name: 'Fondos', muscle_group: 'Pecho' }])
      api.listDays.mockResolvedValue(DIPS)
    })

    it('leads with the most reps, not 0 kg', async () => {
      const { container } = render(<Progress initialTab="evolucion" />)

      await charted('Fondos')
      expect(screen.getByText('Más repeticiones')).toBeInTheDocument()
      expect(container.querySelector('.evo-big-n').textContent).toBe('15')
      expect(container.querySelector('.evo-big-unit').textContent).toBe('reps')
      expect(container.querySelector('.evo-gain > span').textContent).toBe('+3 reps')
      expect(container.querySelector('.evo-big').textContent).not.toMatch(/kg/)
    })

    it('draws the reps, so the line moves', async () => {
      const { container } = render(<Progress initialTab="evolucion" />)

      await charted('Fondos')
      const ys = container
        .querySelector('svg.chart polyline')
        .getAttribute('points')
        .trim()
        .split(/\s+/)
        .map((p) => Number(p.split(',')[1]))
      expect(new Set(ys).size).toBe(3)
    })

    it('writes the marks in reps', async () => {
      const { container } = render(<Progress initialTab="evolucion" />)

      await charted('Fondos')
      const rows = [...container.querySelectorAll('.evo-mark')].map((r) => r.textContent)
      expect(rows).toEqual(['10 ago15 reps+3 reps', '25 jul12 reps'])
    })
  })

  it('says how much the climb was worth, and since when', async () => {
    api.listExercises.mockResolvedValue([{ id: 1, name: 'Press banca', muscle_group: 'Pecho' }])
    api.listDays.mockResolvedValue(BENCH_DAYS)
    render(<Progress initialTab="evolucion" />)

    expect(await screen.findByText('+5 kg')).toBeInTheDocument()
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
    render(<Progress initialTab="evolucion" />)

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
    render(<Progress initialTab="evolucion" />)

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
    const { container } = render(<Progress initialTab="evolucion" />)

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
    const { container } = render(<Progress initialTab="evolucion" />)

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
      render(<Progress initialTab="evolucion" />)

      await userEvent.type(await screen.findByLabelText('Ejercicio'), 'gemelo')

      const result = await screen.findByRole('button', { name: /Gemelo Máq\./i })
      expect(screen.queryByRole('button', { name: /Press banca/i })).not.toBeInTheDocument()
      await userEvent.click(result)

      await charted('Gemelo Máq.')
    })

    // "Máq." is not something anyone types with the accent on a phone keyboard.
    it('ignores accents and case', async () => {
      api.listExercises.mockResolvedValue(exercises)
      render(<Progress initialTab="evolucion" />)

      await userEvent.type(await screen.findByLabelText('Ejercicio'), 'MAQ')
      expect(await screen.findByRole('button', { name: /Gemelo Máq\./i })).toBeInTheDocument()
    })

    // "No data to chart" for a name that does not exist reads as "this exercise
    // has none", when the truth is there is no such exercise.
    it('says a name matches nothing, rather than blaming the data', async () => {
      api.listExercises.mockResolvedValue(exercises)
      render(<Progress initialTab="evolucion" />)

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
    render(<Progress initialTab="evolucion" />)

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
    render(<Progress initialTab="evolucion" />)

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Press banca')

    await charted('Press banca')
  })

  // Marcador: el periodo de la gráfica en píldoras. Todo por defecto; uno
  // corto sin sesiones lo dice en vez de dibujar una línea vacía.
  it('el periodo recorta la gráfica, y sin sesiones en él lo dice', async () => {
    api.listExercises.mockResolvedValue([{ id: 7, name: 'Press banca', muscle_group: 'Pecho' }])
    api.listDays.mockResolvedValue(BENCH_DAYS)
    render(<Progress initialTab="evolucion" />)
    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Press banca')
    await charted('Press banca')

    const grupo = screen.getByRole('group', { name: 'Periodo' })
    expect(within(grupo).getAllByRole('button').map((b) => b.textContent)).toEqual(['4S', '3M', '1A', 'Todo'])
    expect(within(grupo).getByRole('button', { name: 'Todo' })).toHaveAttribute('aria-pressed', 'true')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2027-07-01T12:00:00'))
    try {
      await userEvent.click(within(grupo).getByRole('button', { name: '4S' }))
      expect(screen.getByText('Sin sesiones en este periodo.')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  // Marcador: dos ejercicios que parecen el mismo se ofrecen para fusionar
  // sin tener que provocar un choque al renombrar.
  it('ofrece fusionar el que parece el mismo, y fusiona en él', async () => {
    api.listExercises.mockResolvedValue([
      { id: 7, name: 'Press banca', muscle_group: 'Pecho' },
      { id: 8, name: 'Press de banca', muscle_group: 'Pecho' },
    ])
    api.listDays.mockResolvedValue(BENCH_DAYS)
    api.mergeExercise.mockResolvedValue({ id: 8, name: 'Press de banca' })
    render(<Progress initialTab="evolucion" />)
    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Press banca')
    await charted('Press banca')

    const oferta = screen.getByRole('group', { name: 'Fusionar con otro' })
    expect(oferta).toHaveTextContent('«Press de banca» · 0 series, parece el mismo')
    await userEvent.click(within(oferta).getByRole('button', { name: 'Fusionar' }))
    await waitFor(() => expect(api.mergeExercise).toHaveBeenCalledWith(7, 8))
  })

  // Renaming a lift and re-tagging its group are corrections, the same shape as
  // the ones on the exercise card: rare, and they were sitting in the content.
  it('folds the corrections away until you reach for them', async () => {
    api.listExercises.mockResolvedValue([{ id: 7, name: 'Press banca', muscle_group: 'Pecho' }])
    render(<Progress initialTab="evolucion" />)

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Press banca')
    await charted('Press banca')

    // Nada de esto está en la tarjeta hasta que abres el editor: ni el nombre,
    // ni el grupo. La tarjeta es la gráfica; corregir es otra cosa.
    expect(screen.queryByLabelText(/grupo muscular/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/nombre de /i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /editar ejercicio/i }))
    // Y en la hoja, todo a la vista y en un solo paso: el nombre, el grupo y
    // eliminar. La hoja tapa con el fondo, no con su altura.
    const sheet = screen.getByRole('dialog', { name: /^Editar Press banca$/ })
    expect(within(sheet).getByLabelText(/nombre de /i)).toBeInTheDocument()
    expect(within(sheet).getByLabelText(/grupo muscular/i)).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Eliminar ejercicio' })).toBeInTheDocument()
  })

  // Abrir la hoja no levanta el teclado: la hoja es también la del grupo y la
  // nota, y un teclado arriba taparía justo lo que venías a tocar. El foco entra
  // en la hoja —quien navega con teclado o lector está dentro—, no en el campo.
  it('abrir la hoja no levanta el teclado', async () => {
    api.listExercises.mockResolvedValue([{ id: 7, name: 'Press banca', muscle_group: 'Pecho' }])
    render(<Progress initialTab="evolucion" />)

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Press banca')
    await charted('Press banca')

    await userEvent.click(screen.getByRole('button', { name: /editar ejercicio/i }))
    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: /^Editar/ }))
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
    render(<Progress initialTab="evolucion" />)

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
    render(<Progress initialTab="evolucion" />)

    await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
    const select = screen.getByLabelText(/grupo muscular/i)
    expect(within(select).getByRole('radio', { name: 'Pecho' })).toBeChecked()

    await userEvent.click(within(select).getByRole('radio', { name: 'Hombro' }))

    await waitFor(() => expect(api.setExerciseMuscle).toHaveBeenCalledWith(7, 'Hombro'))
    expect(within(await screen.findByLabelText(/grupo muscular/i)).getByRole('radio', { name: 'Hombro' })).toBeChecked()
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
      render(<Progress initialTab="evolucion" />)
      await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
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

      await userEvent.click(within(select).getByRole('radio', { name: 'Hombro' }))

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
      expect(within(await screen.findByLabelText(/grupo muscular/i)).getByRole('radio', { name: 'Pecho' })).toBeChecked()
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
      render(<Progress initialTab="evolucion" />)

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
      render(<Progress initialTab="evolucion" />)

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
    render(<Progress initialTab="evolucion" />)

    await charted('Press banca')
    await userEvent.click(screen.getByRole('button', { name: /editar ejercicio/i }))
    const input = screen.getByLabelText(/nombre de /i)
    await userEvent.clear(input)
    // Sin botón de guardar: Intro dentro del campo, que es la tecla que el
    // teclado del móvil ya está ofreciendo. Cerrar el panel y entrar en el
    // cajón mandan lo mismo.
    await userEvent.type(input, 'Press de banca{Enter}')

    await waitFor(() => expect(api.renameExercise).toHaveBeenCalledWith(7, 'Press de banca'))
    // Intro es «Hecho» en el teclado de Android: guarda y cierra la hoja. Lo
    // que conteste el servidor —la tarjeta con el nombre nuevo, o el choque con
    // uno que ya existe— sale en la tarjeta, y con la hoja arriba lo taparía
    // el fondo.
    await charted('Press de banca')
    expect(screen.queryByRole('dialog', { name: /^Editar/ })).not.toBeInTheDocument()
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
    render(<Progress initialTab="evolucion" />)

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
    render(<Progress initialTab="series" />)

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
    it('vive en Músculos', async () => {
      api.listDays.mockResolvedValue(SUMMER)
      const { container } = render(<Progress />)

      await screen.findByText('Esta semana')
      expect(container.querySelector('#prog-musculos .sum-head')).not.toBeNull()
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

    const leg = (id, group) => ({
      id,
      exercise_name: group === 'Gemelo' ? 'Gemelo en máquina' : 'Sentadilla',
      muscle_group: group,
      set_index: 0,
      weight: 60,
      reps: 10,
    })
    const many = (n, group, from) => Array.from({ length: n }, (_, i) => leg(from + i, group))
    const pressOf = (id) => ({ ...setOf(id, 'Pecho'), secondary_groups: ['Hombro', 'Tríceps'] })
    const pressWeek = (presses, triceps) => {
      const sets = []
      let id = 200
      for (let i = 0; i < presses; i++) sets.push(pressOf((id += 1)))
      for (let i = 0; i < triceps; i++) sets.push(setOf((id += 1), 'Tríceps'))
      return [{ id: 9, date: '2026-07-22', workouts: [{ id: 9, sets }] }]
    }

    // The card answers first and draws second: how many muscles sit inside
    // their band, then only the ones that ask for something, and the ten rows
    // folded under one control. Before, the answer was the nine-row chart
    // itself, and a reader had to scan every row to find the three that mattered.
    const openDetail = async () =>
      userEvent.click(await screen.findByRole('button', { name: /^Ver (los \d+ músculos|el músculo)$/ }))
    const blockOf = (container, lab) =>
      [...container.querySelectorAll('.sum-block')].find(
        (b) => b.querySelector('.sum-block-lab').textContent === lab,
      ) ?? null
    const itemsOf = (container, lab) => {
      const block = blockOf(container, lab)
      return block
        ? [...block.querySelectorAll('.sum-item')].map((i) => [
            i.querySelector('.sum-item-name').textContent,
            i.querySelector('.sum-item-n').textContent,
          ])
        : null
    }
    const statesByName = (container) => {
      const names = [...container.querySelectorAll('.sum-name')].map((n) => n.textContent)
      const states = [...container.querySelectorAll('.sum-state')].map((s) => s.textContent)
      return Object.fromEntries(names.map((n, i) => [n, states[i]]))
    }
    const rowOf = (container, group) =>
      [...container.querySelectorAll('.sum-row')].find(
        (r) => r.querySelector('.sum-name').textContent === group,
      )
    const pctOf = (el, prop) => parseFloat(el.style[prop])

    describe('the answer at the top', () => {
      it('counts the muscles inside their band, out of the ones on the card', async () => {
        // Sunday: 20–26 jul is closed. Core 22 and Pecho 12 are in; Espalda 6
        // and Hombro 2 are under.
        api.listDays.mockResolvedValue(bands({ Core: 22, Pecho: 12, Espalda: 6, Hombro: 2 }))
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(container.querySelector('.sum-tally-n').textContent).toBe('2')
        expect(container.querySelector('.sum-tally-of').textContent).toBe('/4')
        expect(container.querySelector('.sum-tally-lab').textContent).toBe('en zona')
        const cells = [...container.querySelectorAll('.sum-cell')]
        expect(cells).toHaveLength(4)
        expect(cells.filter((c) => c.classList.contains('is-in'))).toHaveLength(2)
        expect(container.querySelector('.sum-meter').getAttribute('aria-label')).toBe(
          '2 de 4 músculos en zona',
        )
      })

      it('lists what a closed week left short, biggest gap first, and nothing that was in', async () => {
        api.listDays.mockResolvedValue(bands({ Core: 22, Pecho: 12, Espalda: 6, Hombro: 2 }))
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(itemsOf(container, 'Cerró bajo zona')).toEqual([
          ['Hombro', '6'],
          ['Espalda', '4'],
        ])
        const block = blockOf(container, 'Cerró bajo zona')
        expect(block.querySelector('.sum-block-col').textContent).toBe('faltaron')
        // What each figure is short of, in the words you would use.
        expect(block.querySelector('.sum-item-sub').textContent).toBe('2 de 8 mín.')
        // The week is over, so the gap is a verdict and wears ink.
        expect(block.querySelectorAll('.sum-item-n.is-short')).toHaveLength(2)
      })

      // DESIGN.md 2026-08-05: a running week is never told it is behind. The
      // gap is still the number the next session can close, so it is listed —
      // as what is pending, in muted figures.
      it('calls a running week pending, and does not judge it', async () => {
        vi.setSystemTime(new Date(2026, 6, 22, 12)) // Wednesday
        api.listDays.mockResolvedValue(bands({ Pecho: 2 }))
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(itemsOf(container, 'Pendiente')).toEqual([['Pecho', '4']])
        expect(blockOf(container, 'Pendiente').querySelector('.sum-block-col').textContent).toBe(
          'faltan',
        )
        expect(container.querySelector('.sum-item-n.is-short')).toBeNull()
      })

      // Monday owes everything. Seven rows of "faltan" is the whole card again,
      // so the list keeps the three that owe most and the rest wait in the
      // detail.
      it('cuts the list at three and opens the rest from there', async () => {
        vi.setSystemTime(new Date(2026, 6, 22, 12))
        api.listDays.mockResolvedValue(
          bands({ Espalda: 1, Hombro: 2, Bíceps: 3, Gemelo: 4, Cuádriceps: 5 }),
        )
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(itemsOf(container, 'Pendiente')).toEqual([
          ['Espalda', '9'],
          ['Hombro', '6'],
          ['Bíceps', '5'],
        ])
        await userEvent.click(screen.getByRole('button', { name: 'y 2 más' }))
        expect(container.querySelector('.sum-detail').hidden).toBe(false)
      })

      it('names the muscles past their ceiling apart, by how far past', async () => {
        api.listDays.mockResolvedValue(bands({ Hombro: 30, Pecho: 12 }))
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(itemsOf(container, 'Por encima del máximo')).toEqual([['Hombro', '+5']])
        expect(
          blockOf(container, 'Por encima del máximo').querySelector('.sum-item-sub').textContent,
        ).toBe('30 de 25 máx.')
      })

      // RP put the floor for abs and glutes at zero sets. A week without them
      // is inside the band, and listing it as pending would be the card asking
      // for work the reference does not.
      it('does not ask for a muscle whose floor is zero', async () => {
        api.listDays.mockResolvedValue([
          { id: 1, date: '2026-07-22', workouts: [{ id: 1, sets: many(3, 'Pecho', 1) }] },
          { id: 2, date: '2026-07-15', workouts: [{ id: 2, sets: many(4, 'Core', 40) }] },
        ])
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(itemsOf(container, 'Cerró bajo zona')).toEqual([['Pecho', '3']])
        expect(container.querySelector('.sum-tally-n').textContent).toBe('1')
        expect(statesByName(container).Core).toBe('opcional')
      })

      it('says so when nothing is owed', async () => {
        api.listDays.mockResolvedValue(bands({ Pecho: 12 }))
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(container.querySelector('.sum-allgood').textContent).toBe('Todo cerró en zona.')
        expect(container.querySelector('.sum-block')).toBeNull()
      })

      // A logged set counts half a set toward every muscle it trains on the
      // way past, and RP's bands are written for direct sets only. Twenty
      // presses and ten pushdowns print 20 on Tríceps against a ceiling of 16,
      // and all ten it is over by came from the chest.
      it('does not call a muscle over its ceiling on volume the chest did', async () => {
        api.listDays.mockResolvedValue(pressWeek(20, 10))
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(itemsOf(container, 'Por encima del máximo')).toBeNull()
        expect(statesByName(container)['Tríceps']).toBe('')
        expect(
          rowOf(container, 'Tríceps').querySelector('.sum-track').getAttribute('aria-label'),
        ).toBe('Tríceps: 20 — en zona')
      })

      // The mirror of it: pressing posts half a set to Hombro too, so twenty
      // presses print 10 against a floor of 8 — without one direct set.
      it('still asks for a muscle that only ever appeared as somebody else', async () => {
        api.listDays.mockResolvedValue(pressWeek(20, 10))
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(itemsOf(container, 'Cerró bajo zona')).toContainEqual(['Hombro', '8'])
        expect(statesByName(container).Hombro).toBe('faltan 8')
        expect(
          rowOf(container, 'Hombro').querySelector('.sum-track').getAttribute('aria-label'),
        ).toBe('Hombro: 10 — por debajo de la zona')
      })
    })

    // The ten rows, folded. Opened, each one is a bullet graph on one axis in
    // real sets: its own band where its sets are, a rule at its minimum, and a
    // bar from zero. The old track pinned every band to the same stretch, so
    // the band said nothing about its own row and ten copies of it were noise.
    describe('the ten rows', () => {
      it('stay folded until asked for', async () => {
        api.listDays.mockResolvedValue(SUMMER)
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(container.querySelector('.sum-detail').hidden).toBe(true)
        await openDetail()
        expect(container.querySelector('.sum-detail').hidden).toBe(false)
        expect(screen.getByRole('button', { name: 'Ocultar el músculo' })).toHaveAttribute(
          'aria-expanded',
          'true',
        )
      })

      it('draw every band where its sets are, on one shared axis', async () => {
        api.listDays.mockResolvedValue(bands({ Femoral: 5, Hombro: 5 }))
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        // Femoral 4–12 and Hombro 8–25 on a 25-set axis.
        const zone = (g) => rowOf(container, g).querySelector('.sum-zone')
        expect([pctOf(zone('Femoral'), 'left'), pctOf(zone('Femoral'), 'width')]).toEqual([16, 32])
        expect([pctOf(zone('Hombro'), 'left'), pctOf(zone('Hombro'), 'width')]).toEqual([32, 68])
        // Same five sets, same bar: the axis is shared, so lengths compare.
        const bar = (g) => pctOf(rowOf(container, g).querySelector('.sum-bar'), 'width')
        expect(bar('Femoral')).toBe(20)
        expect(bar('Hombro')).toBe(20)
      })

      // The minimum is the one thing on the row to aim at; the ceiling is a
      // limit, not a target. A rule marks the first; the band's far edge is
      // enough for the second. A floor of zero gets no rule at all.
      it('mark the minimum, and only where there is one', async () => {
        api.listDays.mockResolvedValue(bands({ Femoral: 5, Core: 3 }))
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(pctOf(rowOf(container, 'Femoral').querySelector('.sum-min'), 'left')).toBe(16)
        expect(rowOf(container, 'Core').querySelector('.sum-min')).toBeNull()
      })

      // The bar prints the total, indirect half-sets included, so the band
      // moves out by the same indirect share — or a row judged "en zona" would
      // draw a bar past its own band.
      it('shift the band by the share other lifts put on the row', async () => {
        api.listDays.mockResolvedValue(pressWeek(20, 10))
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        const row = rowOf(container, 'Tríceps')
        // 6–16 direct, plus the ten half-sets the presses posted.
        expect(pctOf(row.querySelector('.sum-zone'), 'left')).toBe(64)
        expect(pctOf(row.querySelector('.sum-bar'), 'width')).toBe(80)
        expect(row.querySelector('.sum-bar').className).toBe('sum-bar')
      })

      it('widen the axis when a count runs past it', async () => {
        api.listDays.mockResolvedValue(bands({ Cuádriceps: 32 }))
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(pctOf(rowOf(container, 'Cuádriceps').querySelector('.sum-bar'), 'width')).toBeCloseTo(
          91.4,
          1,
        )
        expect([...container.querySelectorAll('.sum-grid-lab')].map((l) => l.textContent)).toEqual([
          '10',
          '20',
          '30',
        ])
      })

      // Grey by default, ink for what falls outside: the rows that ask for
      // something are the ones the eye should land on.
      it('ink only the bars outside their band, once the week can be judged', async () => {
        api.listDays.mockResolvedValue(bands({ Pecho: 12, Espalda: 6, Hombro: 30 }))
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        const cls = (g) => rowOf(container, g).querySelector('.sum-bar').className
        expect(cls('Pecho')).toBe('sum-bar')
        expect(cls('Espalda')).toBe('sum-bar is-out')
        expect(cls('Hombro')).toBe('sum-bar is-out')
      })

      // Past the ceiling is work already done — true on a Tuesday too. Short
      // of the floor is not, until the week ends.
      it('hold a running shortfall back, never an excess', async () => {
        vi.setSystemTime(new Date(2026, 6, 22, 12)) // Wednesday
        api.listDays.mockResolvedValue(bands({ Espalda: 6, Hombro: 30 }))
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        const cls = (g) => rowOf(container, g).querySelector('.sum-bar').className
        expect(cls('Espalda')).toBe('sum-bar')
        expect(cls('Hombro')).toBe('sum-bar is-out')
        expect(container.querySelector('.sum-state.is-short')).toBeNull()
      })

      it('label each row with what it owes or what it is over by', async () => {
        api.listDays.mockResolvedValue(bands({ Core: 22, Pecho: 12, Espalda: 6, Hombro: 30 }))
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(statesByName(container)).toEqual({
          Hombro: '+5',
          Core: '',
          Pecho: '',
          Espalda: 'faltan 4',
        })
        expect(container.querySelector('.sum-state.is-short').textContent).toBe('faltan 4')
      })

      // Zero on a row whose floor is zero is not a reading, so there is no bar
      // to draw; one muted word says the row asks for nothing.
      it('draw no bar for nothing, and one as soon as there is a set', async () => {
        api.listDays.mockResolvedValue([
          { id: 1, date: '2026-07-22', workouts: [{ id: 1, sets: many(3, 'Pecho', 1) }] },
          { id: 2, date: '2026-07-15', workouts: [{ id: 2, sets: many(4, 'Core', 40) }] },
        ])
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(rowOf(container, 'Core').querySelector('.sum-bar')).toBeNull()
        expect(rowOf(container, 'Core').querySelector('.sum-track').getAttribute('aria-label')).toBe(
          'Core: 0 — opcional',
        )
      })

      it('draw the bar again with a single set', async () => {
        api.listDays.mockResolvedValue([
          { id: 1, date: '2026-07-22', workouts: [{ id: 1, sets: many(1, 'Core', 1) }] },
        ])
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(rowOf(container, 'Core').querySelector('.sum-bar')).not.toBeNull()
        expect(statesByName(container).Core).toBe('')
      })

      it('spell out what the band and the rule are', async () => {
        api.listDays.mockResolvedValue(SUMMER)
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(container.querySelector('.sum-ref').textContent).toBe(
          'La raya es el mínimo que hace crecer ese músculo; el gris llega hasta lo ' +
            'máximo de lo que te recuperas. Sin raya, no pide un mínimo. La barra son ' +
            'tus series; un músculo secundario cuenta media serie.',
        )
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
      expect(itemsOf(container, 'Bajo zona')).toEqual([['Pecho', '4.1']])
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

      await screen.findByText('Esta semana')
      expect(screen.getByRole('button', { name: /periodo siguiente/i })).toBeDisabled()

      await userEvent.click(screen.getByRole('button', { name: /periodo anterior/i }))
      expect(await screen.findByRole('heading', { name: '13–19 jul' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /periodo anterior/i })).toBeDisabled()
    })

    it('names the column its figures are in, in the unit they are in', async () => {
      api.listDays.mockResolvedValue(SUMMER)
      const { container } = render(<Progress />)

      await screen.findByText('Esta semana')
      expect([...container.querySelectorAll('.sum-collab')].map((c) => c.textContent)).toEqual([
        'series',
      ])
      await openMonth()
      await screen.findByText('Julio')
      expect(container.querySelector('.sum-collab').textContent).toBe('media/sem')
    })

    it('says nothing at all when there is nothing logged', async () => {
      render(<Progress />)

      await waitFor(() => expect(api.listDays).toHaveBeenCalled())
      expect(screen.queryByRole('button', { name: /^mes$/i })).not.toBeInTheDocument()
    })

    // A deload is the one week where training less is the plan. It is switched
    // on in Perfil → Entreno; the card reads the mark and says so.
    describe('a week marked as a deload', () => {
      beforeEach(() => localStorage.clear())
      const markDeload = (monday = '2026-07-20') =>
        localStorage.setItem('fitit_deload_weeks', JSON.stringify([monday]))
      const quads = (n, date, from) => ({
        id: from,
        date,
        workouts: [{ id: from, sets: many(n, 'Cuádriceps', from) }],
      })

      it('has no switch on the card any more', async () => {
        api.listDays.mockResolvedValue(SUMMER)
        render(<Progress />)

        await screen.findByText('Esta semana')
        expect(screen.queryByRole('button', { name: /descarga/i })).toBeNull()
      })

      it('retargets every row at a third of your own recent week', async () => {
        // One trained week of 3 quad sets behind it, so the deload asks for 1.
        api.listDays.mockResolvedValue([quads(3, '2026-06-10', 1), quads(3, '2026-07-22', 40)])
        markDeload()
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        const row = rowOf(container, 'Cuádriceps')
        expect(row.querySelector('.sum-zone')).toBeNull()
        expect(row.querySelector('.sum-min')).toBeNull()
        expect(pctOf(row.querySelector('.sum-goal'), 'left')).toBe(4)
        expect(statesByName(container)['Cuádriceps']).toBe('objetivo 1')
        expect(container.querySelector('.sum-tally-lab').textContent).toBe('en objetivo de descarga')
        expect(itemsOf(container, 'Por encima del objetivo')).toEqual([['Cuádriceps', '+2']])
      })

      // Being under the usual number is the point of the week.
      it('calls nothing short', async () => {
        api.listDays.mockResolvedValue([quads(3, '2026-06-10', 1), quads(1, '2026-07-22', 40)])
        markDeload()
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(container.querySelector('.sum-state.is-short')).toBeNull()
        expect(container.querySelector('.sum-tally-n').textContent).toBe('1')
        expect(container.querySelector('.sum-block')).toBeNull()
      })

      it('says what the week is for, and where it is switched', async () => {
        api.listDays.mockResolvedValue(SUMMER)
        markDeload()
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        expect(container.querySelector('.sum-ref').textContent).toBe(
          'Semana de descarga: el objetivo es 1/3 de tu semana típica de las ' +
            'últimas 8. Mismo peso, menos series. Se cambia en Perfil.',
        )
      })

      it('only applies to the week it was put on', async () => {
        api.listDays.mockResolvedValue(SUMMER)
        markDeload()
        const { container } = render(<Progress />)

        await screen.findByText('Esta semana')
        await userEvent.click(screen.getByRole('button', { name: 'Periodo anterior' }))
        expect(container.querySelector('.sum-ref').textContent).toContain('La raya es el mínimo')
      })

      // A month holds four or five weeks and only one of them is light.
      it('does not reach the month', async () => {
        api.listDays.mockResolvedValue(SUMMER)
        markDeload()
        const { container } = render(<Progress />)

        await openMonth()
        await screen.findByText('Julio')
        expect(container.querySelector('.sum-goal')).toBeNull()
      })
    })

    // A week that closed well under your normal one is a fact, not nine
    // failures. It gets one line, and nothing is listed as owed: the week is
    // over, so the gap is not something you can act on.
    describe('a week that came in short', () => {
      const week = (id, date, n) => ({
        id,
        date,
        workouts: [{ id, sets: many(n, 'Pecho', id * 100) }],
      })
      // Viewed week 13–19 jul: 9 sets against a normal week of 20.
      const SHORT = [week(3, '2026-07-15', 9), week(2, '2026-07-08', 20), week(1, '2026-07-01', 20)]
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
        expect(container.querySelectorAll('.sum-shortweek')).toHaveLength(1)
      })

      it('lists nothing as owed', async () => {
        api.listDays.mockResolvedValue(SHORT)
        const { container } = render(<Progress />)
        await screen.findByText('Esta semana')

        await back()
        expect(container.querySelector('.sum-state').textContent).toBe('')
        expect(blockOf(container, 'Cerró bajo zona')).toBeNull()
      })

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

      it('stays out of the way of a deload', async () => {
        localStorage.setItem('fitit_deload_weeks', JSON.stringify(['2026-07-13']))
        api.listDays.mockResolvedValue(SHORT)
        render(<Progress />)
        await screen.findByText('Esta semana')

        await back()
        expect(screen.queryByText(/Semana corta/)).toBeNull()
        localStorage.clear()
      })
    })

    it('needs no caveat about the week being unfinished', async () => {
      vi.setSystemTime(new Date(2026, 6, 22, 12)) // Wednesday
      api.listDays.mockResolvedValue(SUMMER)
      render(<Progress />)

      await screen.findByText('Esta semana')
      expect(screen.queryByText(/en curso — la referencia/)).not.toBeInTheDocument()
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
        expect(screen.getByRole('navigation', { name: 'Progreso' })).toBeInTheDocument() // the screen still draws
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
    render(<Progress initialTab="evolucion" />)

    await userEvent.click(await screen.findByRole('button', { name: /exportar csv/i }))
    expect(downloadCsv).toHaveBeenCalledWith(days)
  })

  // A lift that exists but has no 1RM curve — cardio, or one only ever logged
  // as duration. Distinct from a name that matches nothing at all.
  it('shows an empty state when a known lift has no history', async () => {
    api.listExercises.mockResolvedValue([{ id: 1, name: 'Squat', muscle_group: 'Cuádriceps' }])
    api.getExerciseHistory.mockResolvedValue([])
    render(<Progress initialTab="evolucion" />)

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
      render(<Progress initialTab="evolucion" />)
      await charted('Fondo')
      await userEvent.click(screen.getByRole('button', { name: /editar ejercicio/i }))
    }

    // Borrar es una acción rara y destructiva: vive en el segundo paso del
    // editor, no en el panel que abres para arreglar una errata.
    async function openMore() {
      await openFixes()
    }

    beforeEach(() => {
      api.listExercises.mockResolvedValue([
        { id: 32, name: 'Fondo', muscle_group: 'Pecho', set_count: 4 },
        { id: 20, name: 'Fondos', muscle_group: 'Pecho', set_count: 48 },
      ])
      api.listDays.mockResolvedValue(FONDO_DAYS)
    })

    // ── Y el acto que a esta pantalla le faltaba ────────────────────────
    // El cajón de Entreno llevaba `Grupo` y `Nota`; éste llevaba `Grupo` y
    // `Eliminar ejercicio`. Un mismo editor con dos juegos de actos son dos
    // editores con el mismo cromo, y el encargo pedía los cinco en las dos
    // pantallas.
    it('escribe la nota permanente desde el mismo cajón que el grupo', async () => {
      api.setExerciseNote.mockResolvedValue({ id: 32, name: 'Fondo', note: 'agarre ancho' })
      await openMore()

      await userEvent.type(screen.getByLabelText('Nota de Fondo'), 'agarre ancho')
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

      await waitFor(() => expect(api.setExerciseNote).toHaveBeenCalledWith(32, 'agarre ancho'))
    })

    // Vaciar el campo *es* borrar la nota, y era el acto destructivo sin
    // ceremonia. Se deja pasar y se ofrece devolverlo, en la misma fila y con
    // el mismo texto que en Entreno.
    it('ofrece devolver la nota que se acaba de vaciar', async () => {
      api.listExercises.mockResolvedValue([
        { id: 32, name: 'Fondo', muscle_group: 'Pecho', set_count: 4, note: 'agarre ancho' },
        { id: 20, name: 'Fondos', muscle_group: 'Pecho', set_count: 48 },
      ])
      api.setExerciseNote.mockResolvedValue({ id: 32, name: 'Fondo', note: null })
      await openMore()

      await userEvent.clear(screen.getByLabelText('Nota de Fondo'))
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

      await waitFor(() => expect(api.setExerciseNote).toHaveBeenCalledWith(32, null))
      expect(await screen.findByText('Se borró la nota: «agarre ancho».')).toBeInTheDocument()

      api.setExerciseNote.mockResolvedValue({ id: 32, name: 'Fondo', note: 'agarre ancho' })
      await userEvent.click(
        screen.getByRole('button', { name: 'Deshacer el borrado de la nota' }),
      )
      await waitFor(() => expect(api.setExerciseNote).toHaveBeenCalledWith(32, 'agarre ancho'))
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
      // Y el foco vuelve a la fila que abrió el diálogo, no a `<body>`. El
      // panel lo hacía con su disparador desde la pieza 1; el diálogo que ese
      // panel abre no, que es la misma asimetría una talla más pequeña.
      expect(screen.getByRole('button', { name: 'Eliminar ejercicio' })).toHaveFocus()
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
      // Y el foco, que se fue con el botón que lo tenía. Caía en `<body>`, y
      // sólo en esta pantalla: en Entreno aterrizaba en el disparador del
      // superviviente. Un mismo acto no puede contestar distinto según desde
      // qué pantalla lo hagas.
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Editar ejercicio Fondos' })).toHaveFocus(),
      )
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
