import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Workout from './Workout.jsx'
import * as api from './api.js'
import * as wakelock from './platform/wakelock.js'

vi.mock('./api.js')
vi.mock('./platform/wakelock.js')

// Mirrors what the API returns. `weight` is kilos; there is no unit field.
function benchSet(overrides = {}) {
  return {
    id: 10,
    exercise_id: 2,
    exercise_name: 'Bench Press',
    set_index: 0,
    reps: 8,
    weight: 60,
    ...overrides,
  }
}

// The next-step line under the last mark, read whole: it's two spans so it
// wraps at the separator rather than mid-phrase.
const findTarget = () =>
  screen.findByText((_, el) => el?.classList.contains('target-next') ?? false)

function renderWorkout(props = {}) {
  return render(<Workout workoutId={1} onExit={() => {}} {...props} />)
}

// A second exercise, so ordering and collapse have something to order and fold.
function pullSet(overrides = {}) {
  return benchSet({ exercise_id: 3, exercise_name: 'Dominadas', ...overrides })
}

const workoutWith = (...sets) => ({ id: 1, date: '2026-07-16', name: null, sets })

// The header of each exercise card is its expand/collapse control. Two buttons
// on an open card carry the exercise's name — the header and the row that opens
// the editor — so both of these drop the one that is a door to a dialog.
// La cabecera plegable de la tarjeta, que es el único botón que *es* el
// ejercicio. Los otros dos que llevan su nombre dentro hablan *sobre* él y se
// descartan: la puerta del editor (`aria-haspopup="dialog"`) y, dentro de él,
// la del segundo paso (`Grupo, nota y eliminar de …`).
const cardToggles = (name) =>
  screen
    .queryAllByRole('button', { name: new RegExp(name, 'i') })
    .filter(
      (b) =>
        b.getAttribute('aria-haspopup') !== 'dialog' &&
        !b.classList.contains('editor-more') &&
        // El pie también nombra ejercicios (volver, siguiente, los de hoy):
        // hablan de ellos, no son su tarjeta.
        !b.closest('.workout-dock'),
    )

// Los atajos del pie: volver al anterior, el siguiente de «Repetir» y la lista
// de lo de hoy que sale al enfocar el buscador.
const dock = () => within(document.querySelector('.workout-dock'))

// El orden de la sesión tal como se ve ahora: el ejercicio en pantalla y, debajo,
// los demás de hoy en la lista que abre el buscador del pie.
async function sessionOrder() {
  await userEvent.click(screen.getByLabelText('Ejercicio'))
  const onScreen = [...document.querySelectorAll('.card-toggle .card-name')].map((el) =>
    el.textContent.trim(),
  )
  const today = [...document.querySelectorAll('.dock-today .dock-name')].map((el) =>
    el.textContent.trim(),
  )
  return [...onScreen, ...today]
}

const cardToggle = (name) => {
  const [found] = cardToggles(name)
  if (!found) throw new Error(`no exercise card named ${name}`)
  return found
}

// The folded digest is split into spans (muted count/reps, ink weight, a "tope"
// tag), so its text spans several nodes. Match on the whole card-digest element.
const foldedDigest = (re) =>
  screen.findByText(
    (_, el) =>
      el?.classList?.contains('card-digest') && re.test(el.textContent.replace(/\s+/g, ' ').trim()),
  )

describe('Workout', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear() // rest seconds and the repeat template are sticky prefs
    api.getWorkout.mockResolvedValue({ id: 1, date: '2026-07-16', name: null, sets: [] })
    api.listExercises.mockResolvedValue([])
    api.recentlyTrained.mockResolvedValue([])
    wakelock.holdScreenAwake.mockReturnValue(() => {})
  })

  // Spec: backend/tests/features/recently_trained.feature. A muscle worked
  // yesterday is still recovering, and the moment to know that is before you
  // pick what to add — not after.
  describe('what is still recent', () => {
    const iso = (daysBack) => {
      const d = new Date()
      d.setDate(d.getDate() - daysBack)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`
    }

    it('names what I trained yesterday, above the exercises', async () => {
      api.recentlyTrained.mockResolvedValue([
        { group: 'Femoral', last_date: iso(1) },
        { group: 'Cuádriceps', last_date: iso(1) },
      ])
      renderWorkout()

      expect(await screen.findByText(/Entrenado ayer: Femoral, Cuádriceps/)).toBeInTheDocument()
    })

    it('separates today from yesterday on the one line', async () => {
      api.recentlyTrained.mockResolvedValue([
        { group: 'Pecho', last_date: iso(0) },
        { group: 'Femoral', last_date: iso(1) },
      ])
      renderWorkout()

      expect(await screen.findByText(/Entrenado hoy: Pecho · ayer: Femoral/)).toBeInTheDocument()
    })

    // Most sessions have nothing to report, and a line saying "todo recuperado"
    // on those would be noise where the exercises should be.
    it('says nothing at all when nothing is recent', async () => {
      api.recentlyTrained.mockResolvedValue([])
      renderWorkout()

      await screen.findByLabelText('Ejercicio')
      expect(screen.queryByText(/entrenado (hoy|ayer)/i)).not.toBeInTheDocument()
    })

    // It asks about everything except the session it is in, or it would report
    // the sets I just logged as a reason not to log them.
    it('leaves the session I am in out of the question', async () => {
      renderWorkout()

      await waitFor(() => expect(api.recentlyTrained).toHaveBeenCalledWith(1))
    })
  })

  // Spec: the newest work comes first, and only what you're on stays open.
  // Mirrors backend/tests/features/newest_first.feature for the card list.
  describe('newest first', () => {
    it('given sets for two exercises, when I open the workout, the newest is first', async () => {
      api.getWorkout.mockResolvedValue(
        workoutWith(benchSet({ id: 1, set_index: 0 }), pullSet({ id: 2, set_index: 1 })),
      )
      renderWorkout()

      await screen.findByRole('heading', { level: 2, name: /Dominadas/i })
      expect(await sessionOrder()).toEqual(['Dominadas', 'Bench Press'])
    })

    it('given an open workout, when I add an exercise, it appears first', async () => {
      api.getWorkout.mockResolvedValue(workoutWith(benchSet({ id: 1 })))
      api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Sentadilla', found: false })
      renderWorkout()

      await screen.findByRole('heading', { level: 2, name: /Bench Press/i })
      await userEvent.type(screen.getByLabelText('Ejercicio'), 'Sentadilla')
      await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

      await screen.findByRole('heading', { level: 2, name: /Sentadilla/i })
      expect(await sessionOrder()).toEqual(['Sentadilla', 'Bench Press'])
    })

    it('when I log a set, the cards do not reorder under my thumb', async () => {
      // The order is settled on load and frozen. A card that moves while your
      // hand is on the phone is how you tap the wrong thing mid-session.
      api.getWorkout.mockResolvedValue(
        workoutWith(benchSet({ id: 1, set_index: 0 }), pullSet({ id: 2, set_index: 1 })),
      )
      api.logSet.mockResolvedValue(
        workoutWith(
          benchSet({ id: 1, set_index: 0 }),
          pullSet({ id: 2, set_index: 1 }),
          benchSet({ id: 3, set_index: 2 }),
        ),
      )
      renderWorkout()

      // Bench is second; go to it from the dock and log to it.
      await screen.findByRole('heading', { level: 2, name: /Dominadas/i })
      await userEvent.click(screen.getByLabelText('Ejercicio'))
      await userEvent.click(dock().getByRole('button', { name: /Bench Press/ }))
      const bench = within(cardToggle('Bench Press').closest('.card'))
      await userEvent.type(bench.getByLabelText(/reps/i), '8')
      await userEvent.type(bench.getByLabelText(/peso/i), '60')
      await userEvent.click(bench.getByRole('button', { name: /registrar/i }))

      await waitFor(() => expect(api.logSet).toHaveBeenCalled())
      // Still on Bench, and the rest of the session keeps its place.
      expect(await sessionOrder()).toEqual(['Bench Press', 'Dominadas'])
    })
  })

  describe('collapsing', () => {
    it('a folded card still reports what I did', async () => {
      api.getWorkout.mockResolvedValue(
        workoutWith(
          benchSet({ id: 1, set_index: 0, reps: 8, weight: 60 }),
          benchSet({ id: 2, set_index: 1, reps: 8, weight: 60 }),
          benchSet({ id: 3, set_index: 2, reps: 8, weight: 80 }),
        ),
      )
      renderWorkout()

      // Sets varied (60/60/80), so the digest names the top set by est. 1RM
      // (80 × 8) with the "tope" label, not a decoupled range.
      await userEvent.click(await screen.findByRole('button', { name: /Bench Press/, expanded: true }))
      expect(await foldedDigest(/^3 series · tope 80 kg × 8$/)).toBeInTheDocument()
    })

    it('names the working set without a "tope" label when every set matched', async () => {
      api.getWorkout.mockResolvedValue(
        workoutWith(
          benchSet({ id: 1, set_index: 0, reps: 8, weight: 60 }),
          benchSet({ id: 2, set_index: 1, reps: 8, weight: 60 }),
        ),
      )
      renderWorkout()

      // Identical sets: one pair speaks for all, so no "tope" — there's no peak
      // to single out.
      await userEvent.click(await screen.findByRole('button', { name: /Bench Press/, expanded: true }))
      expect(await foldedDigest(/^2 series · 60 kg × 8$/)).toBeInTheDocument()
      expect(screen.queryByText(/tope/)).not.toBeInTheDocument()
    })

    it('names the top set by est. 1RM when the sets varied', async () => {
      api.getWorkout.mockResolvedValue(
        workoutWith(
          benchSet({ id: 1, set_index: 0, reps: 8, weight: 60 }),
          benchSet({ id: 2, set_index: 1, reps: 5, weight: 70 }),
        ),
      )
      renderWorkout()

      // A flat "2 × 8" would lie about the second set. 70 × 5 (e1RM 81.7) beats
      // 60 × 8 (76.0), so it's the tope — one real, paired working set.
      await userEvent.click(await screen.findByRole('button', { name: /Bench Press/, expanded: true }))
      expect(await foldedDigest(/^2 series · tope 70 kg × 5$/)).toBeInTheDocument()
    })

    it('opens the card straight into the editor for the chip I tapped', async () => {
      // The chips on a folded card are the sets. Tapping a thing edits that
      // thing (DESIGN.md): the chip is the same surface as the row it stands
      // for, so it opens the card with that set already in the editor —
      // instead of unfold, find the row, tap it.
      api.getWorkout.mockResolvedValue(
        workoutWith(
          benchSet({ id: 1, set_index: 0, reps: 8, weight: 60 }),
          benchSet({ id: 2, set_index: 1, reps: 5, weight: 70 }),
        ),
      )
      renderWorkout()

      // Fold Bench, so its two sets are on screen only as chips.
      await userEvent.click(await screen.findByRole('button', { name: /Bench Press/, expanded: true }))
      await waitFor(() => expect(cardToggle('Bench Press')).toHaveAttribute('aria-expanded', 'false'))
      await userEvent.click(screen.getByRole('button', { name: 'Editar serie 2' }))

      expect(cardToggle('Bench Press')).toHaveAttribute('aria-expanded', 'true')
      const bench = within(cardToggle('Bench Press').closest('.card'))
      expect(bench.getByLabelText('Editar reps')).toHaveValue('5')
      expect(bench.getByLabelText('Editar peso')).toHaveValue('70')
      expect(bench.getByRole('button', { name: 'Guardar' })).toBeInTheDocument()
    })

    it('leaves a chip for an unsaved set untappable', async () => {
      // Editing routes through the set's server id and a pending set hasn't got
      // one — same rule the open card's rows already follow.
      api.getWorkout.mockResolvedValue(
        workoutWith(benchSet({ id: 1, set_index: 0 }), pullSet({ id: 2, set_index: 1 })),
      )
      // The log never lands, so the set stays pending on screen.
      api.logSet.mockRejectedValue(new Error('offline'))
      renderWorkout()

      await screen.findByRole('heading', { level: 2, name: /Dominadas/i })
      const pull = within(cardToggle('Dominadas').closest('.card'))
      await userEvent.type(pull.getByLabelText(/reps/i), '8')
      await userEvent.click(pull.getByRole('button', { name: /registrar/i }))
      await screen.findByLabelText('Sin guardar')
      await userEvent.click(cardToggle('Dominadas'))

      expect(screen.queryByRole('button', { name: 'Editar serie 2' })).not.toBeInTheDocument()
    })

    // The server used to stamp the set when the request landed. In a basement
    // that is minutes or hours after the lift, and it is the number a session's
    // length gets measured from — so the moment travels with the set, from the
    // tap, through the outbox, to whenever the network turns up.
    it('sends the moment the set was done, not the moment the request goes out', async () => {
      api.getWorkout.mockResolvedValue(workoutWith(benchSet({ id: 1, set_index: 0 })))
      api.logSet.mockRejectedValue(new Error('offline'))
      renderWorkout()

      const tappedAt = Date.now()
      await screen.findByRole('heading', { level: 2, name: /Bench Press/i })
      const bench = within(cardToggle('Bench Press').closest('.card'))
      await userEvent.type(bench.getByLabelText(/reps/i), '8')
      await userEvent.type(bench.getByLabelText(/peso/i), '60')
      await userEvent.click(bench.getByRole('button', { name: /registrar/i }))
      await waitFor(() => expect(api.logSet).toHaveBeenCalled())

      const sent = api.logSet.mock.calls[0][1]
      expect(Date.parse(sent.performed_at)).toBeGreaterThanOrEqual(tappedAt)
      expect(Date.parse(sent.performed_at)).toBeLessThanOrEqual(Date.now())
      // And on disk with it: the request failed, so this copy is the one that
      // will reach the server, whenever that is.
      const queued = JSON.parse(localStorage.getItem('fitit_outbox'))
      expect(queued[0].payload.performed_at).toBe(sent.performed_at)
    })

  })

  it('says plainly that there is no mark yet, rather than inventing one', async () => {
    api.getWorkout.mockResolvedValue(workoutWith(benchSet({ id: 1, reps: 15, weight: 27.5 })))
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false, sets: [] })
    renderWorkout()

    expect(await screen.findByText(/sin marcas anteriores/i)).toBeInTheDocument()
    expect(screen.queryByText(/última vez/i)).not.toBeInTheDocument()
  })

  // The mark to beat used to be an estimated 1RM — a number you never lift.
  // You walk to the rack thinking "82.5 for 5", so that is what the card says.
  it('reads the mark to beat as the last thing I actually put on the bar', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      // A top set and a back-off: the target is the top one, not the last one.
      sets: [
        benchSet({ id: 90, reps: 5, weight: 82.5, created_at: '2026-07-13T18:04:00Z' }),
        benchSet({ id: 91, reps: 8, weight: 70, created_at: '2026-07-13T18:12:00Z' }),
      ],
      best_one_rm: 96.3,
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    const readout = (await screen.findByText(/última vez/i)).closest('.target')
    expect(readout).toHaveTextContent('82.5')
    expect(readout).toHaveTextContent(/kg × 5/)
    // No formula anywhere near the headline.
    expect(readout).not.toHaveTextContent(/1RM/i)
    expect(readout).not.toHaveTextContent(/96\.3/)
  })

  it('keeps the old estimate off the card entirely', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet()],
      best_one_rm: 76,
      best_by_reps: [{ reps: 8, weight: 60 }],
    })
    api.logSet.mockResolvedValue(
      workoutWith(benchSet({ id: 20, reps: 5, weight: 70 })), // 70x5 -> 81.7
    )
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.clear(screen.getByLabelText(/reps/i))
    await userEvent.type(screen.getByLabelText(/reps/i), '5')
    await userEvent.clear(screen.getByLabelText(/peso/i))
    await userEvent.type(screen.getByLabelText(/peso/i), '70')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    // The session's estimated 1RM was 81.7 and the prior best 76. Neither is
    // anywhere on the card any more.
    const readout = (await screen.findByText(/última vez/i)).closest('.target')
    expect(readout).not.toHaveTextContent(/81\.7/)
    expect(readout).not.toHaveTextContent(/1RM/i)
  })

  it('shows previous marks when you add an exercise', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet({ id: 5 })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    const readout = (await screen.findByText(/última vez/i)).closest('.target')
    expect(readout).toHaveTextContent(/60/)
    expect(readout).toHaveTextContent(/kg × 8/)
    expect(api.getPreviousMarks).toHaveBeenCalledWith('Bench Press', 1)
  })

  // Los mínimos toques: peso y reps vienen ya con el objetivo, así que hacer
  // lo previsto se registra con un toque.
  it('rellena peso y reps con el objetivo, y registrarlo es un toque', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet({ reps: 8, weight: 60, unit: 'kg' })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await screen.findByText(/última vez/i)

    await waitFor(() => expect(screen.getByLabelText(/reps/i)).toHaveValue('9'))
    expect(screen.getByLabelText(/peso/i)).toHaveValue('60')
    // The button states exactly what pressing it will log.
    expect(screen.getByRole('button', { name: /registrar 60 × 9/i })).toBeInTheDocument()
  })

  // Las marcas llegan después de montar la tarjeta. Antes la siembra miraba
  // sólo el primer render, así que al reabrir un entreno los campos salían
  // vacíos y registrar lo previsto costaba teclearlo.
  it('rellena con el objetivo aunque las marcas lleguen tarde', async () => {
    let answer
    api.getWorkout.mockResolvedValue(workoutWith(benchSet({ id: 1, reps: 8, weight: 60 })))
    api.getPreviousMarks.mockReturnValue(new Promise((res) => (answer = res)))
    renderWorkout()

    await screen.findByRole('heading', { level: 2, name: /Bench Press/i })
    // Con una serie hoy ya hecha, lo que se repite es esa serie: el objetivo
    // no pisa lo que acabas de hacer.
    // Dos la última vez: con una hoy, aún no está terminado.
    answer({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet({ reps: 7, weight: 55 }), benchSet({ reps: 7, weight: 55 })],
    })
    await screen.findByText(/última vez/i)
    expect(screen.getByLabelText(/reps/i)).toHaveValue('8')
    expect(screen.getByLabelText(/peso/i)).toHaveValue('60')
  })

  it('la serie dice cuál es y qué hay que batir, en los términos de la regla', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet({ reps: 8, weight: 60 })],
    })
    const { container } = renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    expect(await findTarget()).toHaveTextContent(/^A batir · 60 kg × 9$/)
    expect(container.querySelector('.serie-n')).toHaveTextContent('1.ª serie')
    expect(container.querySelector('.target-why')).toHaveTextContent('una rep más')
  })

  it('keeps the just-logged weight and reps so straight sets repeat in one tap', async () => {
    // A first-ever exercise: nothing seeds the steppers, so you type the first
    // set by hand. Every set after it should be a single tap on the button —
    // blanking the fields after each log turns 3×25×15 into three re-entries.
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Apertura', found: false, sets: [] })
    api.logSet.mockResolvedValue(
      workoutWith(benchSet({ id: 30, exercise_name: 'Apertura', reps: 15, weight: 25 })),
    )
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Apertura')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.type(screen.getByLabelText(/reps/i), '15')
    await userEvent.type(screen.getByLabelText(/peso/i), '25')
    await userEvent.click(screen.getByRole('button', { name: /registrar 25 × 15/i }))

    // The set landed, and the fields still hold it — the next set is one tap.
    await screen.findByText(/25 kg x 15/i)
    expect(screen.getByLabelText(/reps/i)).toHaveValue('15')
    expect(screen.getByLabelText(/peso/i)).toHaveValue('25')
    expect(screen.getByRole('button', { name: /registrar 25 × 15/i })).toBeInTheDocument()
  })

  // A set that came in as 135 lb was migrated to its kilos, so it reads and
  // seeds the stepper as 61.2 like any other kilo set — there is no conversion
  // left at the edge, only rounding.
  it('reads a migrated pounds set as the kilos it always was', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet({ reps: 8, weight: 61.235 })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await screen.findByText(/última vez/i)

    expect(screen.getByText('61.2')).toBeInTheDocument()
    expect(screen.getByLabelText(/peso/i)).toHaveValue('61.2')
  })

  it('bumps the weight stepper by 2.5 kg', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet({ reps: 5, weight: 80, unit: 'kg' })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await screen.findByText(/última vez/i)

    await userEvent.click(screen.getByRole('button', { name: /sumar kg/i }))
    expect(screen.getByLabelText(/peso/i)).toHaveValue('82.5')
  })

  it('labels the previous marks as "Última vez" so they read as history, not today', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet({ id: 5 })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    expect(await screen.findByText(/última vez/i)).toBeInTheDocument()
  })

  // La marca dice dónde estabas; el objetivo, el paso siguiente. Sin RIR
  // registrado, progresión doble: mismo peso, una rep más.
  it('names the next step under the last mark', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet({ id: 5, reps: 8, weight: 60 })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    expect(await findTarget()).toHaveTextContent(/^A batir · 60 kg × 9$/)
  })

  // El objetivo es de la sesión. Una vez batido hoy, seguir diciendo «a
  // batir» pide algo que ya hiciste; ahora dice en qué serie cayó.
  it('says the target was beaten, and in which set, once a set of today meets it', async () => {
    api.getWorkout.mockResolvedValue(
      workoutWith(
        benchSet({ id: 1, set_index: 0, reps: 8, weight: 60 }),
        benchSet({ id: 2, set_index: 1, reps: 9, weight: 60 }),
      ),
    )
    api.listExercises.mockResolvedValue([{ id: 2, name: 'Bench Press', muscle_group: 'Pecho' }])
    // Tres la última vez: con las de hoy aún no está terminado, y la serie
    // que toca sigue en pantalla.
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [3, 4, 5].map((id) => benchSet({ id, reps: 8, weight: 60 })),
    })
    renderWorkout()

    expect(await findTarget()).toHaveTextContent(/^✓ Batido en la S2 · 60 kg × 9$/)
  })

  it('keeps asking for the target while no set of today reaches it', async () => {
    api.getWorkout.mockResolvedValue(
      workoutWith(benchSet({ id: 1, set_index: 0, reps: 8, weight: 60 })),
    )
    api.listExercises.mockResolvedValue([{ id: 2, name: 'Bench Press', muscle_group: 'Pecho' }])
    // Tres la última vez: con las de hoy aún no está terminado, y la serie
    // que toca sigue en pantalla.
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [3, 4, 5].map((id) => benchSet({ id, reps: 8, weight: 60 })),
    })
    renderWorkout()

    expect(await findTarget()).toHaveTextContent(/^A batir · 60 kg × 9$/)
  })

  it('moves the weight up when the last session ended with 3 or more in reserve', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [
        benchSet({ id: 5, set_index: 0, reps: 8, weight: 60 }),
        benchSet({ id: 6, set_index: 1, reps: 8, weight: 60, rpe: 7 }),
      ],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    expect(await findTarget()).toHaveTextContent(/^A batir · 62.5 kg × 8$/)
  })

  it('asks how many were left after a set and stores the answer as RPE', async () => {
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false, sets: [] })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet({ id: 6 })],
    })
    api.editSet.mockResolvedValue(benchSet({ id: 6, rpe: 8 }))
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    // Nothing to answer before there is a set.
    expect(screen.queryByText('¿Cuántas te quedaban?')).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/peso/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /^registrar/i }))
    await screen.findByText('60 kg x 8')

    const group = screen.getByRole('group', { name: '¿Cuántas te quedaban?' })
    await userEvent.click(within(group).getByRole('button', { name: '2' }))

    await waitFor(() =>
      expect(api.editSet).toHaveBeenCalledWith(6, {
        exercise_name: 'Bench Press',
        reps: 8,
        weight: 60,
        rpe: 8,
        note: null,
      }),
    )
    expect(within(group).getByRole('button', { name: '2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  // "Última vez · hace 3 días" was read off the set's `created_at`, which is
  // when the row was written, not when I trained. Log Monday's session on
  // Thursday — "Otra fecha", or a set added the next morning — and the card
  // dated three days of history as today. The backend already picks the last
  // workout by training day; the label now reads the same field.
  it('dates the marks by the day I trained, not the day the row was written', async () => {
    const iso = (daysBack) => {
      const d = new Date()
      d.setDate(d.getDate() - daysBack)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`
    }
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      // Typed just now, trained three days ago.
      sets: [benchSet({ id: 5, created_at: new Date().toISOString() })],
      last_date: iso(3),
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    expect(await screen.findByText(/última vez · hace 3 días/i)).toBeInTheDocument()
  })

  it('puts no header above today’s logged sets', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet({ id: 5 })],
    })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet({ id: 6 })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    // The list itself is the separator: numbered rows under the log button,
    // "Última vez" marks above it. A label saying "Hoy" over sets you just
    // logged names what you are looking at while you look at it.
    expect(await screen.findByText('60 kg x 8')).toBeInTheDocument()
    expect(screen.queryByText(/^Hoy/)).not.toBeInTheDocument()
  })

  it('says there are no previous marks for a new exercise', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Face Pull',
      found: false,
      sets: [],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Face Pull')
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

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
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
        rpe: null,
        note: null,
        performed_at: expect.any(String),
        client_id: expect.any(String),
      }),
    )
  })

  // The kg/lb toggle is gone, so a set can only be logged in kilos. What used to
  // be two tests of the toggle is now one test that there is nothing to flip.
  it('logs in kilos, with no unit to choose', async () => {
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false, sets: [] })
    api.logSet.mockResolvedValue(workoutWith(benchSet({ weight: 60 })))
    renderWorkout()
    await screen.findByLabelText('Ejercicio')

    await userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))
    expect(screen.queryByRole('button', { name: 'lb' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /^unidad$/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))

    await userEvent.type(screen.getByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/peso/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    await waitFor(() =>
      expect(api.logSet).toHaveBeenCalledWith(1, {
        exercise_name: 'Bench Press',
        reps: 8,
        weight: 60,
        rpe: null,
        note: null,
        performed_at: expect.any(String),
        client_id: expect.any(String),
      }),
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
      distance: 5.2, // kilometres
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
    await screen.findByLabelText('Ejercicio')

    // Name it first: the kind toggle only appears once what you've typed is a
    // name nothing knows yet, which is the only time the choice matters.
    await userEvent.type(screen.getByLabelText('Ejercicio'), 'Correr')
    await userEvent.click(screen.getByRole('button', { name: /cardio/i }))
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    await userEvent.type(await screen.findByLabelText(/duración/i), '24:30')
    await userEvent.type(screen.getByLabelText(/distancia/i), '5.2')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    await waitFor(() =>
      expect(api.logSet).toHaveBeenCalledWith(1, {
        exercise_name: 'Correr',
        kind: 'cardio',
        duration_seconds: 1470,
        distance: 5.2, // kilometres; there is no other unit to send
        note: null,
        performed_at: expect.any(String),
        client_id: expect.any(String),
      }),
    )
    expect(await screen.findByRole('listitem')).toHaveTextContent(
      /24:30 · 5\.2 km · 4:43\/km/i,
    )
    // No "Hoy" over the log here either. The Total line stays: time and
    // distance are real quantities, unlike the tonnage the strength card
    // dropped, and unlike a label that only names the obvious.
    expect(screen.queryByText(/^Hoy/)).not.toBeInTheDocument()
    expect(screen.getByText(/^Total /)).toBeInTheDocument()
  })

  it('renders the cardio card for a known cardio exercise', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Correr',
      found: true,
      sets: [cardioSet()],
      kind: 'cardio',
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Correr')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    // Cardio card: a duration field, and no weight steppers.
    expect(await screen.findByLabelText(/duración/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/peso/i)).not.toBeInTheDocument()
    // No muscle group to colour by, so the header dot is an amber ring instead.
    expect(document.querySelector('.dot-cardio')).toBeInTheDocument()
  })

  // ── Terminado ─────────────────────────────────────────────────────────
  // Con tantas series como la última vez, lo principal ya no es registrar
  // otra: es lo siguiente. Otra serie sigue a un toque, en gris.
  describe('terminado', () => {
    const lastTime = () =>
      api.getPreviousMarks.mockResolvedValue({
        exercise_name: 'Bench Press',
        found: true,
        sets: [benchSet({ id: 90 }), benchSet({ id: 91, set_index: 1 })],
      })

    it('con tantas series como la última vez, enseña el resumen y «Otra serie»', async () => {
      lastTime()
      api.getWorkout.mockResolvedValue(
        workoutWith(benchSet({ id: 10 }), benchSet({ id: 11, set_index: 1, reps: 9 })),
      )
      api.logSet.mockResolvedValue(
        workoutWith(
          benchSet({ id: 10 }),
          benchSet({ id: 11, set_index: 1, reps: 9 }),
          benchSet({ id: 12, set_index: 2, reps: 9 }),
        ),
      )
      renderWorkout()

      const block = (await screen.findByText('2 series, como la última vez')).closest('.done-block')
      expect(block).toHaveTextContent('✓ Objetivo batido en la S2')
      expect(block).toHaveTextContent(/60\s*kg × 9/)
      expect(screen.queryByRole('button', { name: /^Registrar/ })).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/peso/i)).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Otra serie · 60 kg × 9' }))
      await waitFor(() =>
        expect(api.logSet).toHaveBeenCalledWith(
          1,
          expect.objectContaining({ exercise_name: 'Bench Press', reps: 9, weight: 60 }),
        ),
      )
      expect(await screen.findByText('3 series, una más que la última vez')).toBeInTheDocument()
    })

    it('con menos series que la última vez, sigue la serie que toca', async () => {
      lastTime()
      api.getWorkout.mockResolvedValue(workoutWith(benchSet({ id: 10 })))
      renderWorkout()

      expect(await screen.findByText('2.ª serie')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Registrar/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Otra serie/ })).not.toBeInTheDocument()
    })

    it('terminado, el atajo del pie pasa a ser lo principal', async () => {
      api.getPreviousMarks.mockImplementation((name) =>
        Promise.resolve(
          name === 'Bench Press'
            ? { exercise_name: name, found: true, sets: [benchSet({ id: 90 })] }
            : { exercise_name: name, found: false, sets: [] },
        ),
      )
      api.getWorkout.mockResolvedValue(workoutWith(benchSet({ id: 10 })))
      renderWorkout()

      await screen.findByText('1 serie, como la última vez')
      await userEvent.type(screen.getByLabelText('Ejercicio'), 'Sentadilla')
      await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
      const back = await dock().findByRole('button', { name: 'Volver a Bench Press' })
      // En Sentadilla, sin series: el atajo sigue en gris.
      expect(back).not.toHaveClass('primary')
      await userEvent.click(back)

      await screen.findByText('1 serie, como la última vez')
      expect(dock().getByRole('button', { name: 'Volver a Sentadilla' })).toHaveClass('primary')
    })
  })

  // Los mínimos toques también en cardio: lo de la última vez va ya puesto en
  // las fichas, y repetirlo es un toque.
  it('cardio: la serie que toca, con las fichas rellenas con la última vez', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Correr',
      found: true,
      sets: [cardioSet()],
      kind: 'cardio',
    })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [cardioSet({ id: 31 })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Correr')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    expect(await screen.findByText('1.ª serie')).toBeInTheDocument()
    expect(screen.getByText(/Última vez/).closest('.serie-block')).toHaveTextContent(
      /Última vez: 24:30 · 5\.2 km/,
    )
    expect(screen.getByLabelText(/duración/i)).toHaveValue('24:30')
    expect(screen.getByLabelText(/distancia/i)).toHaveValue('5.2')

    await userEvent.click(screen.getByRole('button', { name: 'Registrar 5.2 km · 24:30' }))
    await waitFor(() =>
      expect(api.logSet).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ duration_seconds: 1470, distance: 5.2 }),
      ),
    )
    // La siguiente sigue puesta: otra igual es otro toque.
    expect(await screen.findByText('2.ª serie')).toBeInTheDocument()
    expect(screen.getByLabelText(/duración/i)).toHaveValue('24:30')
    expect(screen.getByLabelText(/distancia/i)).toHaveValue('5.2')
  })

  it('cardio: los − y + mueven un minuto y medio kilómetro', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Correr',
      found: true,
      sets: [cardioSet()],
      kind: 'cardio',
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Correr')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    await userEvent.click(await screen.findByRole('button', { name: 'Sumar minuto' }))
    expect(screen.getByLabelText(/duración/i)).toHaveValue('25:30')
    await userEvent.click(screen.getByRole('button', { name: 'Restar minuto' }))
    await userEvent.click(screen.getByRole('button', { name: 'Restar minuto' }))
    expect(screen.getByLabelText(/duración/i)).toHaveValue('23:30')
    await userEvent.click(screen.getByRole('button', { name: 'Sumar km' }))
    expect(screen.getByLabelText(/distancia/i)).toHaveValue('5.7')
    await userEvent.click(screen.getByRole('button', { name: 'Restar km' }))
    await userEvent.click(screen.getByRole('button', { name: 'Restar km' }))
    expect(screen.getByLabelText(/distancia/i)).toHaveValue('4.7')
  })

  // The record is marked where the record is: on the row, not in a banner that
  // covers the log for a moment and then leaves nothing behind.
  it('marks a real weight record on the set that took it', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet()],
      best_one_rm: 76,
      best_by_reps: [{ reps: 8, weight: 60 }],
    })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet({ id: 20, reps: 3, weight: 80 })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    // Steppers are seeded from the previous mark — clear before entering the PR set.
    await userEvent.clear(screen.getByLabelText(/reps/i))
    await userEvent.type(screen.getByLabelText(/reps/i), '3')
    await userEvent.clear(screen.getByLabelText(/peso/i))
    await userEvent.type(screen.getByLabelText(/peso/i), '80')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    // 80 kg at 3 reps, against 60 kg at 8: more than you had ever moved at
    // three reps or more. No banner — the label rides the row and survives a
    // reload, which the banner never did.
    expect(await screen.findByText(/PR peso/i)).toBeInTheDocument()
    expect(screen.queryByText(/nuevo récord/i)).not.toBeInTheDocument()
  })

  // The bar used to be the last session alone, so any week following a lighter
  // one turned into a run of records — and a badge that fires every session is
  // a badge that says nothing. The record is against everything you have done.
  it('does not award a record for beating only the last session', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      // Last time out was a light day: 50 x 8. The all-time bar is the 80 x 8
      // from a month ago, and 70 does not clear it.
      sets: [benchSet({ weight: 50 })],
      best_one_rm: 101.3,
      best_by_reps: [{ reps: 8, weight: 80 }],
    })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet({ id: 21, reps: 8, weight: 70 })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.clear(screen.getByLabelText(/reps/i))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.clear(screen.getByLabelText(/peso/i))
    await userEvent.type(screen.getByLabelText(/peso/i), '70')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    expect(await screen.findByRole('button', { name: /editar serie 1/i })).toBeInTheDocument()
    expect(screen.queryByText(/PR peso/i)).not.toBeInTheDocument()
  })

  // The other half of the same rule: clearing the all-time bar still counts,
  // even on a lift whose last session was heavier than this one's opening sets.
  it('awards a record for beating the all-time bar', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet({ weight: 50 })],
      best_one_rm: 101.3,
      best_by_reps: [{ reps: 8, weight: 80 }],
    })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet({ id: 22, reps: 8, weight: 85 })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.clear(screen.getByLabelText(/reps/i))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.clear(screen.getByLabelText(/peso/i))
    await userEvent.type(screen.getByLabelText(/peso/i), '85')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    expect(await screen.findByText(/PR peso/i)).toBeInTheDocument()
  })

  // The add form and the exercise cards were the same surface, so a session
  // read as one undifferentiated stack and the input was whichever card you
  // happened to remember was the input.
  it('sets the add-exercise form apart from the cards holding the log', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet()],
      best_one_rm: 76,
      best_by_reps: [{ reps: 8, weight: 60 }],
    })
    const { container } = renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await screen.findByRole('button', { name: /registrar/i })

    // Exactly one on the screen, and it is the one holding the name field.
    const composed = container.querySelectorAll('.card-compose')
    expect(composed).toHaveLength(1)
    expect(composed[0].querySelector('#exercise')).not.toBeNull()
    // And the exercise card that just appeared is not wearing it.
    const hero = container.querySelector('.card-hero')
    expect(hero).not.toBeNull()
    expect(hero.classList.contains('card-compose')).toBe(false)
  })

  async function logOneSet() {
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false, sets: [] })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet()],
    })
    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/peso/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))
  }

  it('starts a rest countdown when a set is logged', async () => {
    const { container } = renderWorkout()
    expect(container.querySelector('.rest-bar')).toBeNull()

    await logOneSet()

    // Default rest is 90s. The clock is already running by the time this
    // asserts, so pin the shape — zero-padded, somewhere in the 01:xx minute —
    // rather than an exact second. formatClock's own tests cover the format.
    await screen.findByRole('button', { name: /saltar/i })
    expect(container.querySelector('.rest-num').textContent).toMatch(/^01:[0-3]\d$/)
  })

  // El descanso es lo que haces entre serie y serie, así que va en el centro de
  // la tarjeta en la que acabas de registrar, no en una barra arriba del todo.
  it('shows the rest as a ring inside the card of the set just logged', async () => {
    const { container } = renderWorkout()
    await logOneSet()

    const timer = await screen.findByRole('timer')
    expect(timer.closest('.card-hero')).not.toBeNull()
    expect(timer).toHaveClass('rest-ring')
    expect(container.querySelector('.rest-bar')).toBeNull()
  })

  it('moves the end of the rest fifteen seconds either way', async () => {
    const { container } = renderWorkout()
    await logOneSet()
    await screen.findByRole('timer')

    // 90 s por defecto: +15 lo deja en 1:4x, y −15 dos veces en 1:1x.
    await userEvent.click(screen.getByRole('button', { name: 'Añadir 15 segundos' }))
    expect(container.querySelector('.rest-num').textContent).toMatch(/^01:4\d$/)
    expect(container.querySelector('.rest-total').textContent).toBe('de 01:45')

    await userEvent.click(screen.getByRole('button', { name: 'Quitar 15 segundos' }))
    await userEvent.click(screen.getByRole('button', { name: 'Quitar 15 segundos' }))
    expect(container.querySelector('.rest-num').textContent).toMatch(/^01:1\d$/)
  })

  it('keeps the bar on top when the card that is resting is folded', async () => {
    const { container } = renderWorkout()
    await logOneSet()
    await screen.findByRole('timer')

    await userEvent.click(cardToggles('Bench Press')[0])

    expect(container.querySelector('.rest-ring')).toBeNull()
    expect(container.querySelector('.rest-bar')).not.toBeNull()
  })

  it('dismisses the rest countdown with Saltar', async () => {
    const { container } = renderWorkout()
    await logOneSet()

    await userEvent.click(await screen.findByRole('button', { name: /saltar/i }))

    expect(container.querySelector('.rest-bar')).toBeNull()
  })

  it('does not start a countdown when rest is switched off', async () => {
    // Rest is chosen in Perfil; Entreno only honours it.
    localStorage.setItem('fitit_rest_seconds', '0')
    renderWorkout()
    await screen.findByLabelText('Ejercicio')

    await logOneSet()

    await waitFor(() => expect(api.logSet).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /saltar/i })).not.toBeInTheDocument()
  })

  it('offers no «Terminar entreno» on the web, where there is no notification to end', async () => {
    // The APK side is in Workout.native.test.jsx.
    renderWorkout()
    await screen.findByLabelText('Ejercicio')
    await userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))

    expect(screen.getByRole('button', { name: /borrar entreno/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /terminar entreno/i })).not.toBeInTheDocument()
  })

  it('resumes a countdown that was still running when the view remounted', async () => {
    // Absolute deadline, not a decrementing counter — leaving Entreno for Días
    // and coming back mid-rest must not restart or lose the clock.
    localStorage.setItem('fitit_rest_until', String(Date.now() + 45_000))
    renderWorkout()

    expect(await screen.findByRole('button', { name: /saltar/i })).toBeInTheDocument()
  })

  it('ignores a deadline that already expired while the app was closed', async () => {
    localStorage.setItem('fitit_rest_until', String(Date.now() - 5_000))
    renderWorkout()

    await screen.findByLabelText('Ejercicio')
    expect(screen.queryByRole('button', { name: /saltar/i })).not.toBeInTheDocument()
  })

  it('flags the record set itself in the log, not just the banner', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet()],
      best_one_rm: 76,
      best_by_reps: [{ reps: 8, weight: 60 }],
    })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      // 60x8 -> 76.0 (ties the prior best, no flag); 80x3 -> 88.0 beats it.
      sets: [benchSet({ id: 20 }), benchSet({ id: 21, reps: 3, weight: 80 })],
    })
    const { container } = renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.clear(screen.getByLabelText(/reps/i))
    await userEvent.type(screen.getByLabelText(/reps/i), '3')
    await userEvent.clear(screen.getByLabelText(/peso/i))
    await userEvent.type(screen.getByLabelText(/peso/i), '80')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    await waitFor(() => expect(container.querySelectorAll('.pr-flag')).toHaveLength(1))
    const flagged = container.querySelector('li:has(.pr-flag)')
    expect(flagged).toHaveTextContent(/80/)
  })

  // The relabel tool is gone with the toggle. It existed to undo a mistake the
  // toggle made possible, and it could not even do that — it hid itself whenever
  // a block mixed units, which is the exact shape of a mid-session flip.
  it('offers no unit relabel, because there is no unit to get wrong', async () => {
    api.getWorkout.mockResolvedValue(workoutWith(benchSet({ weight: 135 })))
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false })
    renderWorkout()

    await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
    expect(screen.queryByRole('button', { name: /registradas en/i })).not.toBeInTheDocument()
  })

  it('does not flag any set when none beats the previous best', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet()],
      best_one_rm: 200,
    })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet()],
    })
    const { container } = renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    await waitFor(() => expect(api.logSet).toHaveBeenCalled())
    expect(container.querySelectorAll('.pr-flag')).toHaveLength(0)
  })

  // A set row is the values, an index and a way to fix them. The clock stamp
  // answered a question nothing asks — rest is what the countdown is for. The
  // index earns its place back now the rows are zebra-striped instead of ruled:
  // without a border to end each line, "S2" is what keeps your place at set six.
  it('keeps a set row down to its index and its numbers', async () => {
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false, sets: [] })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet({ created_at: new Date(2026, 6, 16, 18, 4).toISOString() })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/peso/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    const row = (await screen.findByText(/60 kg x 8/)).closest('li')
    expect(row).not.toHaveTextContent(/18:04/)
    expect(row).toHaveTextContent(/S1/)
  })

  // The count lives on the folded header and nowhere else: open, the numbered
  // list says it already.
  it('counts the series on the folded card', async () => {
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false, sets: [] })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet(), benchSet({ id: 11 }), benchSet({ id: 12 })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/peso/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    await userEvent.click(cardToggle('Bench Press'))
    expect(await foldedDigest(/3 series/i)).toBeInTheDocument()
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

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.clear(screen.getByLabelText(/reps/i))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.clear(screen.getByLabelText(/peso/i))
    await userEvent.type(screen.getByLabelText(/peso/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    await waitFor(() => expect(api.logSet).toHaveBeenCalled())
    expect(screen.queryByText(/nuevo récord/i)).not.toBeInTheDocument()
  })

  // Tonnage was the one figure on the card no decision depended on: you don't
  // change the next set because the sum reads 830. What you do read between
  // sets is the numbered list itself — S1, S2 — not a total of anything.
  it('numbers the sets and reports no tonnage', async () => {
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false, sets: [] })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet({ reps: 8, weight: 60 }), benchSet({ id: 11, reps: 5, weight: 70 })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/peso/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    // volume would have been 60*8 + 70*5 = 830; best 1RM = max(76.0, 81.7).
    expect(await screen.findByText('S2')).toBeInTheDocument()
    expect(screen.queryByText(/volumen/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/830/)).not.toBeInTheDocument()
    // Nor any estimate standing in for what you lifted.
    expect(screen.queryByText(/81\.7/)).not.toBeInTheDocument()
  })

  // Re-tagging the muscle and relabelling the unit are both once-in-a-lifetime
  // corrections, and both were permanent controls on a card you open to log.
  describe('corrections', () => {
    const mislabelled = [
      benchSet({ id: 1, weight: 135, unit: 'kg' }),
      benchSet({ id: 2, weight: 135, unit: 'kg' }),
    ]

    it('no reetiqueta desde Entreno, ni en la tarjeta ni en la hoja', async () => {
      api.getWorkout.mockResolvedValue(workoutWith(...mislabelled))
      api.listExercises.mockResolvedValue([{ id: 2, name: 'Bench Press', muscle_group: 'Pecho' }])
      api.getPreviousMarks.mockResolvedValue({
        exercise_name: 'Bench Press',
        found: false,
        sets: [],
      })
      renderWorkout()

      await screen.findByRole('heading', { name: /Bench Press/ })
      expect(screen.queryByLabelText(/grupo muscular de/i)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /registradas en/i })).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: /editar ejercicio/i }))
      // Tampoco en la hoja: el grupo es del ejercicio entero, y eso se cambia
      // en Progreso. Desde Entreno sólo se toca lo de esta sesión.
      expect(screen.queryByLabelText(/grupo muscular de/i)).not.toBeInTheDocument()
    })
  })

  it('adds the exercise even when its marks cannot be fetched', async () => {
    // This used to raise an alert and refuse. A dead network is the normal
    // condition in a basement gym, and it has no business stopping you from
    // putting a lift on the screen — the card stands up without history and
    // picks it up when the marks land.
    api.getPreviousMarks.mockRejectedValue(new Error('network'))
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    expect(await screen.findByLabelText(/reps/i)).toBeInTheDocument()
    expect(screen.getByText(/sin marcas anteriores/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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
    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/peso/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))
    expect(await screen.findByText(/60 kg x 8/i)).toBeInTheDocument()
  }

  it('deletes a logged set and removes it from the list', async () => {
    api.deleteSet.mockResolvedValue(null)
    await logBenchSet()

    // Borrar lives in the edit form now: the row itself opens it.
    await userEvent.click(screen.getByRole('button', { name: /editar serie 1/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Borrar' }))

    await waitFor(() => expect(api.deleteSet).toHaveBeenCalledWith(10))
    expect(screen.queryByText(/60 kg x 8/i)).not.toBeInTheDocument()
  })

  it('edits a logged set inline and shows the updated values', async () => {
    api.editSet.mockResolvedValue(benchSet({ id: 10, reps: 10, weight: 65 }))
    await logBenchSet()

    await userEvent.click(screen.getByRole('button', { name: /editar serie 1/i }))
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
        rpe: null,
        note: null,
      }),
    )
    expect(await screen.findByText(/65 kg x 10/i)).toBeInTheDocument()
  })

  it('adds a copy of the last set with +1', async () => {
    await logBenchSet()

    await userEvent.click(screen.getByRole('button', { name: /repetir serie/i }))

    await waitFor(() =>
      expect(api.logSet).toHaveBeenLastCalledWith(1, {
        exercise_name: 'Bench Press',
        reps: 8,
        weight: 60,
        rpe: null,
        note: null,
        performed_at: expect.any(String),
        client_id: expect.any(String),
      }),
    )
  })

  // The one-off note survives here and nowhere else: something true of *this*
  // set ("me falló el hombro") still has a place, but you reach it by tapping
  // the set it is about, not by carrying a spare field through every log.
  it('edits the note on a set inline', async () => {
    api.editSet.mockResolvedValue(benchSet({ id: 10, reps: 8, weight: 60, note: 'tough' }))
    await logBenchSet()

    await userEvent.click(screen.getByRole('button', { name: /editar serie 1/i }))
    expect(screen.queryByLabelText(/editar rpe/i)).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/editar nota/i), 'tough')
    await userEvent.click(screen.getByRole('button', { name: /^guardar$/i }))

    await waitFor(() =>
      expect(api.editSet).toHaveBeenCalledWith(10, {
        exercise_name: 'Bench Press',
        reps: 8,
        weight: 60,
        rpe: null,
        note: 'tough',
      }),
    )
    expect(await screen.findByText(/tough/i)).toBeInTheDocument()
  })

  it('keeps the set and shows an error when delete fails', async () => {
    api.deleteSet.mockRejectedValue(new Error('network'))
    await logBenchSet()

    // Borrar lives in the edit form now: the row itself opens it.
    await userEvent.click(screen.getByRole('button', { name: /editar serie 1/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Borrar' }))

    // The editor stays open on failure, so you can retry or back out; the set
    // is still there once you do.
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(screen.getByText(/60 kg x 8/i)).toBeInTheDocument()
  })

  it('does not log a set with empty reps and warns', async () => {
    api.getPreviousMarks.mockResolvedValue({ found: false, sets: [] })
    renderWorkout()
    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    await userEvent.type(screen.getByLabelText(/peso/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/reps/i)
    expect(api.logSet).not.toHaveBeenCalled()
  })

  it('does not log a set with a negative weight and warns', async () => {
    api.getPreviousMarks.mockResolvedValue({ found: false, sets: [] })
    renderWorkout()
    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/peso/i), '-5')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/peso/i)
    expect(api.logSet).not.toHaveBeenCalled()
  })

  it('keeps every exercise of the session within reach', async () => {
    api.getPreviousMarks.mockResolvedValue({ found: false, sets: [] })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await screen.findByRole('heading', { name: /Bench Press/i })

    await userEvent.type(screen.getByLabelText('Ejercicio'), 'Squat')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await screen.findByRole('heading', { name: /Squat/i })

    // Squat is on screen and Bench Press is a tap away, not gone.
    expect(screen.queryByRole('heading', { name: /Bench Press/i })).not.toBeInTheDocument()
    expect(dock().getByRole('button', { name: 'Volver a Bench Press' })).toBeInTheDocument()
  })

  it('shows the muscle group tag on an exercise', async () => {
    api.listExercises.mockResolvedValue([
      { id: 2, name: 'Bench Press', muscle_group: 'Pecho' },
    ])
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false, sets: [] })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    const heading = await screen.findByRole('heading', { name: /Bench Press/ })
    expect(heading).toHaveTextContent('Pecho')
  })

  it('does not repeat the muscle dot in the open card editor', async () => {
    // The header tag already carries the coloured dot for identity; the editor
    // row below it is the control, not a second chip. Two dots and "Pecho"
    // twice within a thumb's width reads as noise, not information. One dot.
    api.listExercises.mockResolvedValue([
      { id: 2, name: 'Bench Press', muscle_group: 'Pecho' },
    ])
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false, sets: [] })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    const card = (await screen.findByRole('heading', { name: /Bench Press/ })).closest('.card')
    await userEvent.click(within(card).getByRole('button', { name: /editar ejercicio/i }))
    expect(card.querySelectorAll('.dot')).toHaveLength(1)
  })

  // Spec: DESIGN.md "A search box must search" — the native <datalist> that
  // used to live here is surfaced by the browser when it feels like it, and on
  // a phone that is never.
  describe('finding an exercise you already have', () => {
    const someKnown = () =>
      api.listExercises.mockResolvedValue([
        { id: 1, name: 'Gemelo Máq.', muscle_group: 'Gemelo' },
        { id: 2, name: 'Press Banca', muscle_group: 'Pecho' },
      ])

    it('lists the matches as tappable rows, case- and accent-folded', async () => {
      someKnown()
      renderWorkout()

      await userEvent.type(await screen.findByLabelText('Ejercicio'), 'gemelo')

      expect(await screen.findByRole('button', { name: 'Gemelo Máq.' })).toBeInTheDocument()
      // Only what matches: the other lift is not offered.
      expect(screen.queryByRole('button', { name: 'Press Banca' })).not.toBeInTheDocument()
    })

    it('offers nothing until you type', async () => {
      someKnown()
      renderWorkout()

      await waitFor(() => expect(api.listExercises).toHaveBeenCalled())
      expect(screen.queryByRole('button', { name: 'Gemelo Máq.' })).not.toBeInTheDocument()
    })

    it('adds the exercise on the tap, without a second one on Añadir', async () => {
      someKnown()
      api.getPreviousMarks.mockResolvedValue({
        exercise_name: 'Gemelo Máq.',
        found: true,
        sets: [benchSet()],
        kind: 'strength',
      })
      renderWorkout()

      await userEvent.type(await screen.findByLabelText('Ejercicio'), 'gemelo')
      await userEvent.click(await screen.findByRole('button', { name: 'Gemelo Máq.' }))

      expect(
        await screen.findByRole('heading', { level: 2, name: /Gemelo Máq\./i }),
      ).toBeInTheDocument()
      // The box holds what you are typing, not what you already found.
      expect(screen.getByLabelText('Ejercicio')).toHaveValue('')
    })

    it('does not offer an exercise already standing in this session', async () => {
      someKnown()
      api.getWorkout.mockResolvedValue(
        workoutWith(benchSet({ exercise_name: 'Gemelo Máq.' })),
      )
      renderWorkout()

      await userEvent.type(await screen.findByLabelText('Ejercicio'), 'gemelo')

      await waitFor(() => expect(api.listExercises).toHaveBeenCalled())
      // The heading is the card that is already up; no suggestion row beside it.
      expect(screen.queryByRole('button', { name: 'Gemelo Máq.' })).not.toBeInTheDocument()
    })
  })

  // A name contained in one you already have had no way in at all: the go key
  // takes the first suggestion, so `Peso Muerto` always stood up `Peso Muerto
  // Rumano` and the lift you meant could not be created. The list itself now
  // carries the way out.
  describe('creating a name that looks like one you have', () => {
    const rumano = () =>
      api.listExercises.mockResolvedValue([
        { id: 1, name: 'Peso Muerto Rumano', muscle_group: 'Femoral' },
      ])

    it('offers to create what you typed, under the lookalike', async () => {
      rumano()
      renderWorkout()

      await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Peso Muerto')

      expect(await screen.findByRole('button', { name: 'Crear «Peso Muerto»' })).toBeInTheDocument()
      // The suggestion it is offered beside, not instead of.
      expect(screen.getByRole('button', { name: 'Peso Muerto Rumano' })).toBeInTheDocument()
    })

    it('stands the card up under the name you typed', async () => {
      rumano()
      api.getPreviousMarks.mockResolvedValue({
        exercise_name: 'Peso Muerto',
        found: false,
        sets: [],
      })
      renderWorkout()

      await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Peso Muerto')
      await userEvent.click(await screen.findByRole('button', { name: 'Crear «Peso Muerto»' }))

      expect(await screen.findByRole('heading', { level: 2, name: /^Peso Muerto$/ })).toBeInTheDocument()
      expect(api.getPreviousMarks).toHaveBeenCalledWith('Peso Muerto', 1)
    })

    it('says nothing when the name is one you already have', async () => {
      rumano()
      renderWorkout()

      await userEvent.type(await screen.findByLabelText('Ejercicio'), 'peso muerto rumano')

      await waitFor(() => expect(api.listExercises).toHaveBeenCalled())
      expect(screen.queryByRole('button', { name: /^Crear/ })).not.toBeInTheDocument()
    })

    it('stays out of the way when nothing looks like it', async () => {
      rumano()
      renderWorkout()

      await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Face Pull')

      // Nothing matched, so Añadir ejercicio already creates what you typed —
      // a second control for the same job would be one path too many.
      await waitFor(() => expect(api.listExercises).toHaveBeenCalled())
      expect(screen.queryByRole('button', { name: /^Crear/ })).not.toBeInTheDocument()
    })
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

  // Tapping a thing edits that thing. A menu is for actions that aren't
  // "edit this" — so the per-row overflow, which only ever held Editar and
  // Borrar, is gone: the row opens the editor and Borrar rides inside it.
  it('opens the editor by tapping the set row, with no overflow to aim at', async () => {
    api.editSet.mockResolvedValue(benchSet({ id: 10, reps: 10, weight: 60 }))
    await logBenchSet()

    expect(screen.queryByRole('button', { name: /más acciones/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /editar serie 1/i }))
    expect(screen.getByLabelText(/editar reps/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Borrar' })).toBeInTheDocument()
  })

  // Nobody starts or stops a clock: the session's own sets say when it ran, so
  // its length rides beside the date in the header, where you look to see which
  // session this is. Spec: backend tests/features/session_length.feature.
  it('says how long the session took, beside its date', async () => {
    const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString()
    api.getWorkout.mockResolvedValue({
      ...workoutWith(
        benchSet({ id: 1, created_at: hoursAgo(4) }),
        benchSet({ id: 2, created_at: hoursAgo(3) }),
      ),
      duration_seconds: 3900,
    })
    renderWorkout()

    expect(await screen.findByText(/jue, 16 jul 2026 · 1h 05/i)).toBeInTheDocument()
  })

  // Mid-session there is no total to give: it would grow every time you looked
  // at it, which is a clock, and this screen deliberately hasn't got one.
  it('holds the length back while the session is still running', async () => {
    api.getWorkout.mockResolvedValue({
      ...workoutWith(
        benchSet({ id: 1, created_at: new Date(Date.now() - 3900_000).toISOString() }),
        benchSet({ id: 2, created_at: new Date().toISOString() }),
      ),
      duration_seconds: 3900,
    })
    renderWorkout()

    expect(await screen.findByText(/jue, 16 jul 2026/i)).toBeInTheDocument()
    expect(screen.queryByText(/1h 05/)).not.toBeInTheDocument()
  })

  it('renames the current workout', async () => {
    api.renameWorkout.mockResolvedValue({ id: 1, date: '2026-07-16', name: 'Leg Day', sets: [] })
    renderWorkout()

    // The title is the control: tapping it opens the rename in place, so the
    // overflow no longer carries a Renombrar item.
    await userEvent.click(await screen.findByRole('button', { name: /renombrar el entreno/i }))
    await userEvent.type(screen.getByLabelText(/nombre del entreno/i), 'Leg Day')
    await userEvent.click(screen.getByRole('button', { name: /guardar nombre/i }))

    await waitFor(() => expect(api.renameWorkout).toHaveBeenCalledWith(1, 'Leg Day'))
    expect(await screen.findByText('Leg Day')).toBeInTheDocument()
  })

  // A workout Días just created carries no name yet — asking for it right as
  // Entreno opens saves the trip back to tap the title.
  it('opens straight into naming a freshly created workout', async () => {
    renderWorkout({ autoRename: true, initialWorkout: workoutWith() })

    expect(await screen.findByLabelText(/nombre del entreno/i)).toBeInTheDocument()
  })

  // Días already holds every set of every workout — /days returns the same shape
  // /workouts/{id} does — so making the card wait on a second round trip for
  // data already in memory bought a blank screen and nothing else.
  describe('opening a session Días already had', () => {
    const seed = workoutWith(benchSet({ id: 1 }), pullSet({ id: 2 }))

    it('renders the cards before the fetch resolves', async () => {
      // A fetch that never lands: whatever shows up came from the seed.
      api.getWorkout.mockReturnValue(new Promise(() => {}))
      api.getPreviousMarks.mockReturnValue(new Promise(() => {}))
      renderWorkout({ initialWorkout: seed })

      expect(await screen.findByRole('heading', { level: 2, name: /Dominadas/i })).toBeInTheDocument()
      expect(screen.getByText(/60 kg x 8/)).toBeInTheDocument()
      expect(await sessionOrder()).toEqual(['Dominadas', 'Bench Press'])
    })

    it('still refetches, so a stale seed is corrected', async () => {
      api.getWorkout.mockResolvedValue(
        workoutWith(benchSet({ id: 1 }), pullSet({ id: 2 }), benchSet({ id: 3, weight: 80 })),
      )
      api.getPreviousMarks.mockResolvedValue({ found: false, sets: [] })
      renderWorkout({ initialWorkout: seed })

      expect(await screen.findByText(/80 kg x 8/)).toBeInTheDocument()
      expect(api.getWorkout).toHaveBeenCalledWith(1)
    })
  })

  // The flag compares each set against what you walked in with. Until the marks
  // arrive there is nothing to compare to, and the comparison falls back to the
  // session's own history — so set 2 wore a PR for beating set 1. It was always
  // a flicker on open; rendering instantly from a seed would widen the window.
  it('shows no PR badge until it knows what the record actually is', async () => {
    api.getWorkout.mockResolvedValue(
      workoutWith(benchSet({ id: 1, weight: 50 }), benchSet({ id: 2, weight: 60 })),
    )
    let resolveMarks
    api.getPreviousMarks.mockReturnValue(new Promise((r) => { resolveMarks = r }))
    const { container } = renderWorkout()

    await screen.findByText(/60 kg x 8/)
    expect(container.querySelectorAll('.pr-flag')).toHaveLength(0)

    // A last session at 200 kg means neither of today's sets is a record.
    resolveMarks({
      exercise_name: 'Bench Press',
      found: true,
      best_one_rm: 200,
      sets: [benchSet({ id: 90, weight: 200, reps: 8 })],
      best_by_reps: [{ reps: 8, weight: 200 }],
    })
    await waitFor(() => expect(screen.getByText(/última vez/i)).toBeInTheDocument())
    expect(container.querySelectorAll('.pr-flag')).toHaveLength(0)
  })

  // Cards rebuilt from a workout that already has sets used to carry no
  // previous marks at all — only the add-exercise path fetched them. Reopening
  // the app mid-session is the normal path now, so that gap is permanent.
  describe('a workout reopened mid-session', () => {
    it('reads the mark to beat for exercises it rebuilt from the log', async () => {
      api.getWorkout.mockResolvedValue(workoutWith(benchSet({ weight: 50 })))
      api.getPreviousMarks.mockResolvedValue({
        exercise_name: 'Bench Press',
        found: true,
        best_one_rm: 100,
        sets: [benchSet({ id: 5 })],
      })
      renderWorkout()

      expect(await screen.findByText(/última vez/i)).toBeInTheDocument()
      expect(screen.getByText(/última vez/i)).toBeInTheDocument()
      expect(api.getPreviousMarks).toHaveBeenCalledWith('Bench Press', 1)
    })

    // Without a prior best, the badge falls back to the session's own running
    // peak — so set 2 beating set 1 wore a PR while sitting far under the
    // actual record. A wrong record is worse than no record.
    it('does not award a PR to a set that only beats today’s earlier one', async () => {
      api.getWorkout.mockResolvedValue(
        workoutWith(benchSet({ id: 1, weight: 50 }), benchSet({ id: 2, weight: 60 })),
      )
      api.getPreviousMarks.mockResolvedValue({
        exercise_name: 'Bench Press',
        found: true,
        best_one_rm: 200,
        sets: [benchSet({ id: 5 })],
      })
      renderWorkout()

      await screen.findByText(/última vez/i)
      expect(screen.queryByTitle(/récord al registrarla/i)).not.toBeInTheDocument()
    })
  })

  // Settings outranked logging: kg/lb is a once-ever choice and rest is once a
  // session, and both sat pinned above every exercise card.
  describe('settings', () => {
    const openSettings = () =>
      userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))

    it('keeps the weight unit and rest out of the logging path', async () => {
      renderWorkout()
      await screen.findByLabelText('Ejercicio')

      expect(screen.queryByRole('group', { name: /^unidad$/i })).not.toBeInTheDocument()
      expect(
        screen.queryByRole('group', { name: /descanso entre series/i }),
      ).not.toBeInTheDocument()
    })

    // Rest and the screen staying lit are chosen once, in Perfil, with the rest
    // of what gets set rarely. The overflow keeps only what acts on this session.
    it('leaves rest and the screen to Perfil', async () => {
      renderWorkout()
      await screen.findByLabelText('Ejercicio')

      await openSettings()
      expect(
        screen.queryByRole('group', { name: /descanso entre series/i }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('group', { name: /pantalla encendida/i }),
      ).not.toBeInTheDocument()
      expect(screen.queryByRole('group', { name: /^unidad$/i })).not.toBeInTheDocument()
    })
  })

  // Kind only applies to a name the backend has never seen: an autocompleted
  // exercise keeps its stored kind and the toggle decides nothing.
  describe('the Fuerza/Cardio toggle', () => {
    it('stays hidden for an exercise that already exists', async () => {
      api.listExercises.mockResolvedValue([
        { id: 1, name: 'Press banca', muscle_group: 'Pecho' },
      ])
      renderWorkout()

      await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Press banca')
      expect(screen.queryByRole('group', { name: /fuerza o cardio/i })).not.toBeInTheDocument()
    })

    it('appears for a name nothing knows yet', async () => {
      renderWorkout()

      await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Face Pull')
      expect(screen.getByRole('group', { name: /fuerza o cardio/i })).toBeInTheDocument()
    })
  })

  // +1 serie is the quickest control on the screen and it used to sink one row
  // per set logged, so by the fifth it was off the bottom of the phone.
  it('keeps +1 serie above the log, where it does not move', async () => {
    api.getWorkout.mockResolvedValue(
      workoutWith(benchSet({ id: 1 }), benchSet({ id: 2 }), benchSet({ id: 3 })),
    )
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false, sets: [] })
    const { container } = renderWorkout()

    const repeat = await screen.findByRole('button', { name: /repetir serie/i })
    const log = container.querySelector('ol.sets')
    // Node.compareDocumentPosition: FOLLOWING means the log comes after it.
    expect(repeat.compareDocumentPosition(log) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // The log form asks for reps and weight and nothing else. RPE was filled on 1
  // set in 277 and read by nothing in the app; the per-set note on 6, and what
  // it carried was almost always true of the lift rather than of that set — so
  // the note moved to the exercise, where it is worth reading before every rep.
  describe('nota del ejercicio', () => {
    const standing = (note = null) => {
      api.getWorkout.mockResolvedValue(workoutWith(benchSet()))
      api.listExercises.mockResolvedValue([
        { id: 2, name: 'Bench Press', muscle_group: 'Pecho', set_count: 0, note },
      ])
    }

    it('leaves the log form with nothing but reps and weight', async () => {
      api.getPreviousMarks.mockResolvedValue({
        exercise_name: 'Bench Press',
        found: false,
        sets: [],
      })
      renderWorkout()

      await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
      await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

      await screen.findByRole('button', { name: /registrar/i })
      expect(screen.queryByRole('button', { name: /rpe/i })).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/^RPE$/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/^Nota$/i)).not.toBeInTheDocument()
    })

    it('shows the standing note on the open card, under the name', async () => {
      standing('agarre ancho, banco en 3')
      renderWorkout()

      expect(await screen.findByText('agarre ancho, banco en 3')).toBeInTheDocument()
    })

    // ── Eliminar, en Entreno, es quitarlo de este entreno ────────────────
    // El ejercicio entero, con su historial, se borra en Progreso. Aquí,
    // a un pulgar de las series, «Eliminar» sólo alcanza a la sesión.
    describe('quitar el ejercicio del entreno', () => {
      const remove = async () => {
        await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio bench/i }))
        await userEvent.click(screen.getByRole('button', { name: /^quitar$/i }))
      }

      it('no ofrece borrar el ejercicio entero desde aquí', async () => {
        standing()
        renderWorkout()

        await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
        expect(screen.queryByRole('button', { name: /eliminar ejercicio/i })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^quitar$/i })).toBeInTheDocument()
      })

      it('dice cuántas series de hoy se van, y que el historial se queda', async () => {
        standing()
        api.getWorkout.mockResolvedValue(
          workoutWith(benchSet(), benchSet({ id: 11, weight: 65, reps: 6 })),
        )
        renderWorkout()

        await remove()

        const dialog = await screen.findByRole('dialog', {
          name: /^Quitar Bench Press de este entreno$/,
        })
        expect(dialog).toHaveTextContent(
          'Se borran sus 2 series de hoy. El historial de otros días no se toca.',
        )
        expect(api.removeExerciseFromWorkout).not.toHaveBeenCalled()
        expect(api.deleteExercise).not.toHaveBeenCalled()
      })

      it('al confirmar, quita la tarjeta y sus series, y el ejercicio se queda', async () => {
        standing()
        api.removeExerciseFromWorkout.mockResolvedValue(null)
        renderWorkout()

        await remove()
        const dialog = await screen.findByRole('dialog', { name: /^Quitar Bench Press/ })
        await userEvent.click(within(dialog).getByRole('button', { name: 'Quitar' }))

        await waitFor(() => expect(api.removeExerciseFromWorkout).toHaveBeenCalledWith(1, 2))
        await waitFor(() => expect(cardToggles('Bench Press')).toHaveLength(0))
        expect(api.deleteExercise).not.toHaveBeenCalled()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })

      // Si venía de «Repetir», la plantilla lo levantaba otra vez al reabrir.
      it('lo saca también de la cola de «Repetir»', async () => {
        standing()
        localStorage.setItem(
          'fitit_repeat_template',
          JSON.stringify({ workoutId: 1, names: ['Bench Press', 'Remo'] }),
        )
        api.removeExerciseFromWorkout.mockResolvedValue(null)
        renderWorkout()

        await remove()
        const dialog = await screen.findByRole('dialog', { name: /^Quitar Bench Press/ })
        await userEvent.click(within(dialog).getByRole('button', { name: 'Quitar' }))

        await waitFor(() => expect(api.removeExerciseFromWorkout).toHaveBeenCalled())
        expect(JSON.parse(localStorage.getItem('fitit_repeat_template')).names).toEqual(['Remo'])
      })

      it('si el servidor no contesta, la tarjeta se queda y lo dice', async () => {
        standing()
        api.removeExerciseFromWorkout.mockRejectedValue(new Error('offline'))
        renderWorkout()

        await remove()
        const dialog = await screen.findByRole('dialog', { name: /^Quitar Bench Press/ })
        await userEvent.click(within(dialog).getByRole('button', { name: 'Quitar' }))

        expect(
          await screen.findByText('No se pudo quitar el ejercicio del entreno.'),
        ).toBeInTheDocument()
        expect(cardToggles('Bench Press')).toHaveLength(1)
      })
    })

    // No queda ningún botón que decir. Es la prueba de que la fila es de verdad
    // una fila de la rejilla —el rótulo, el valor y nada más— y no un
    // formulario disfrazado.
    it('leaves the note row with nothing to press', async () => {
      standing()
      renderWorkout()

      await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))

      expect(screen.queryByRole('button', { name: /guardar/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /borrar nota/i })).not.toBeInTheDocument()
    })
  })

  // Apuntaste las series en el ejercicio equivocado. Renombrarlo no sirve —se
  // lleva el nombre de toda su historia— y fusionarlo es irreversible: lo que
  // quieres es que **estas** series sean de otro ejercicio que ya tienes. El
  // campo del nombre busca como el de Progreso y elegir un resultado muda sólo
  // lo de esta sesión.
  describe('cambiar a otro ejercicio que ya tienes', () => {
    const standing = (...sets) => {
      api.getWorkout.mockResolvedValue(workoutWith(...(sets.length ? sets : [benchSet()])))
      api.listExercises.mockResolvedValue([
        { id: 2, name: 'Bench Press', muscle_group: 'Pecho', set_count: 3, note: null },
        { id: 3, name: 'Dominadas', muscle_group: 'Espalda', set_count: 9, note: null },
        { id: 4, name: 'Remo en máquina', muscle_group: 'Espalda', set_count: 2, note: null },
        { id: 5, name: 'Carrera', muscle_group: null, set_count: 1, note: null, kind: 'cardio' },
      ])
      api.editSet.mockImplementation(async (id, set) =>
        benchSet({ id, exercise_id: 3, ...set }),
      )
    }

    const search = async (typed) => {
      await screen.findAllByRole('button', { name: /editar ejercicio/i })
      // Con dos ejercicios, Bench Press puede no ser el que está en pantalla.
      if (!screen.queryByRole('button', { name: /editar ejercicio Bench Press/i })) {
        await userEvent.click(screen.getByLabelText('Ejercicio'))
        await userEvent.click(dock().getByRole('button', { name: /Bench Press/ }))
      }
      await userEvent.click(screen.getByRole('button', { name: /editar ejercicio Bench Press/i }))
      // Sin tocar el campo: la hoja se abre escribiendo.
      await userEvent.keyboard(typed)
    }

    const results = () => within(screen.getByRole('list', { name: 'Ejercicios que ya tienes' }))

    it('busca entre tus ejercicios mientras escribes, sin el propio ni los de cardio', async () => {
      standing()
      renderWorkout()

      await search('r')

      const rows = results().getAllByRole('button')
      expect(rows).toHaveLength(1)
      // Con sus series de siempre al lado, para distinguir dos parecidos.
      expect(results().getByRole('button', { name: 'Remo en máquina' })).toHaveTextContent(
        /Remo en máquina\s*2/,
      )
    })

    // Variante B de la hoja: se abre escribiendo, con el teclado arriba. El
    // campo ya no lleva el nombre puesto, que había que borrar antes de buscar.
    it('se abre con el buscador vacío y enfocado, y dice qué series se mueven', async () => {
      standing(benchSet(), benchSet({ id: 11, set_index: 1 }))
      renderWorkout()

      await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))

      const sheet = screen.getByRole('dialog', { name: 'Bench Press: cambiar o quitar' })
      expect(within(sheet).getByText('Las 2 series de hoy son de…')).toBeInTheDocument()
      const field = within(sheet).getByRole('searchbox', { name: 'Buscar ejercicio' })
      expect(field).toHaveValue('')
      expect(field).toHaveAttribute('placeholder', 'Buscar otro ejercicio…')
      expect(field).toHaveFocus()
      expect(screen.queryByRole('list', { name: 'Ejercicios que ya tienes' })).not.toBeInTheDocument()
    })

    it('con una serie, el título va en singular', async () => {
      standing()
      renderWorkout()

      await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))

      expect(screen.getByText('La serie de hoy es de…')).toBeInTheDocument()
    })

    it('elegir uno muda las series de esta sesión, sin renombrar ni fusionar', async () => {
      standing()
      renderWorkout()

      await search('domi')
      await userEvent.click(results().getByRole('button', { name: 'Dominadas' }))

      await waitFor(() =>
        expect(api.editSet).toHaveBeenCalledWith(
          10,
          expect.objectContaining({ exercise_name: 'Dominadas', reps: 8, weight: 60 }),
        ),
      )
      expect(api.renameExercise).not.toHaveBeenCalled()
      expect(api.mergeExercise).not.toHaveBeenCalled()
      await waitFor(() => expect(cardToggles('Dominadas')).toHaveLength(1))
      expect(cardToggles('Bench Press')).toHaveLength(0)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // Renombrar, el grupo y la nota son del ejercicio entero: eso es de
    // Progreso. Desde Entreno sólo se toca lo de esta sesión.
    it('Intro elige el primer resultado y no renombra nada', async () => {
      standing()
      renderWorkout()

      await search('domi{Enter}')

      await waitFor(() =>
        expect(api.editSet).toHaveBeenCalledWith(
          10,
          expect.objectContaining({ exercise_name: 'Dominadas' }),
        ),
      )
      expect(api.renameExercise).not.toHaveBeenCalled()
    })

    it('un nombre que no es de nadie no se manda, ni con Intro ni al cerrar', async () => {
      standing()
      renderWorkout()

      await search('Press banca{Enter}')
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

      expect(api.renameExercise).not.toHaveBeenCalled()
      expect(api.editSet).not.toHaveBeenCalled()
    })

    it('la hoja no trae ni grupo ni nota', async () => {
      standing()
      renderWorkout()

      await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))

      const sheet = screen.getByRole('dialog')
      expect(within(sheet).queryByRole('radiogroup')).not.toBeInTheDocument()
      expect(within(sheet).queryByLabelText(/nota de/i)).not.toBeInTheDocument()
      expect(within(sheet).getByRole('button', { name: 'Quitar' })).toBeInTheDocument()
    })

    it('tras el cambio, en pantalla queda el ejercicio elegido', async () => {
      // Dominadas es la más reciente, así que Bench Press no es el primero de
      // la lista: si la pantalla volviera al primero, enseñaría Dominadas.
      standing(benchSet(), pullSet({ id: 11 }))
      renderWorkout()

      await search('remo')
      await userEvent.click(results().getByRole('button', { name: 'Remo en máquina' }))

      await waitFor(() => expect(cardToggles('Remo en máquina')).toHaveLength(1))
      expect(cardToggles('Dominadas')).toHaveLength(0)
    })

    it('si el elegido ya tiene tarjeta en la sesión, las dos quedan en una', async () => {
      standing(benchSet(), pullSet({ id: 11 }))
      renderWorkout()

      await search('domi')
      await userEvent.click(results().getByRole('button', { name: 'Dominadas' }))

      await waitFor(() => expect(cardToggles('Bench Press')).toHaveLength(0))
      expect(cardToggles('Dominadas')).toHaveLength(1)
    })
  })

  // Repetir (from Días) hands the session over as a list of names. The cards
  // are already standing when you arrive, each with its previous marks loaded,
  // so a repeat session is taps on steppers rather than five lookups.
  // ── Un ejercicio a la vez ────────────────────────────────────────────────
  // Lo que estás haciendo ocupa la pantalla; lo demás se alcanza desde el pie.
  // Volver al anterior (supersets) y pasar al siguiente de «Repetir» cuestan un
  // toque; ir a cualquier otro de hoy, dos (enfocar el buscador y elegirlo).
  describe('un ejercicio a la vez', () => {
    const twoLogged = () => {
      api.getWorkout.mockResolvedValue(
        workoutWith(benchSet({ id: 1, set_index: 0 }), pullSet({ id: 2, set_index: 1 })),
      )
      api.getPreviousMarks.mockImplementation((name) =>
        Promise.resolve({ exercise_name: name, found: false, sets: [] }),
      )
    }

    it('enseña sólo el ejercicio en el que estás, el último trabajado', async () => {
      twoLogged()
      renderWorkout()

      await waitFor(() => expect(cardToggles('Dominadas')).toHaveLength(1))
      expect(cardToggles('Bench Press')).toHaveLength(0)
    })

    it('añadir un ejercicio lo pone en pantalla, y el anterior queda a un toque', async () => {
      twoLogged()
      renderWorkout()
      await waitFor(() => expect(cardToggles('Dominadas')).toHaveLength(1))

      await userEvent.type(screen.getByLabelText('Ejercicio'), 'Press militar')
      await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

      await waitFor(() => expect(cardToggles('Press militar')).toHaveLength(1))
      expect(cardToggles('Dominadas')).toHaveLength(0)

      await userEvent.click(dock().getByRole('button', { name: 'Volver a Dominadas' }))
      expect(cardToggles('Dominadas')).toHaveLength(1)
      expect(cardToggles('Press militar')).toHaveLength(0)
      // Y de vuelta, igual de corto: un superset es ir y volver.
      expect(dock().getByRole('button', { name: 'Volver a Press militar' })).toBeInTheDocument()
    })

    it('al enfocar el buscador ofrece los demás de hoy, y elegir uno lleva a él', async () => {
      twoLogged()
      renderWorkout()
      await waitFor(() => expect(cardToggles('Dominadas')).toHaveLength(1))

      await userEvent.click(screen.getByLabelText('Ejercicio'))
      await userEvent.click(dock().getByRole('button', { name: /Bench Press/ }))

      expect(cardToggles('Bench Press')).toHaveLength(1)
      expect(cardToggles('Dominadas')).toHaveLength(0)
    })

    it('al llegar a un ejercicio suelta el buscador, y volver a tocarlo enseña los de hoy', async () => {
      twoLogged()
      renderWorkout()
      await waitFor(() => expect(cardToggles('Dominadas')).toHaveLength(1))

      await userEvent.type(screen.getByLabelText('Ejercicio'), 'Press militar{Enter}')
      await waitFor(() => expect(cardToggles('Press militar')).toHaveLength(1))
      // El teclado se va: lo que toca ahora es el ejercicio, no el buscador.
      expect(screen.getByLabelText('Ejercicio')).not.toHaveFocus()

      await userEvent.click(screen.getByLabelText('Ejercicio'))
      const today = within(document.querySelector('.dock-today'))
      expect(today.getByRole('button', { name: /Dominadas/ })).toBeInTheDocument()
    })

    it('escribir el nombre de uno de hoy lleva a él en vez de añadirlo otra vez', async () => {
      twoLogged()
      renderWorkout()
      await waitFor(() => expect(cardToggles('Dominadas')).toHaveLength(1))

      await userEvent.type(screen.getByLabelText('Ejercicio'), 'bench{Enter}')

      await waitFor(() => expect(cardToggles('Bench Press')).toHaveLength(1))
      expect(cardToggles('Dominadas')).toHaveLength(0)
    })

    it('«Repetir» abre el primero y deja el siguiente a un toque', async () => {
      localStorage.setItem(
        'fitit_repeat_template',
        JSON.stringify({ workoutId: 1, names: ['Dominadas', 'Remo', 'Curl'] }),
      )
      api.getPreviousMarks.mockImplementation((name) =>
        Promise.resolve({ exercise_name: name, found: false, sets: [] }),
      )
      renderWorkout()

      await waitFor(() => expect(cardToggles('Dominadas')).toHaveLength(1))
      expect(cardToggles('Remo')).toHaveLength(0)

      await userEvent.click(dock().getByRole('button', { name: 'Siguiente: Remo' }))
      expect(cardToggles('Remo')).toHaveLength(1)
      // El de antes queda para volver; el siguiente es el que viene después.
      expect(dock().getByRole('button', { name: 'Volver a Dominadas' })).toBeInTheDocument()
      expect(dock().getByRole('button', { name: 'Siguiente: Curl' })).toBeInTheDocument()
    })
  })

  describe('repeated session', () => {
    it('stands the cards up from the template, in the order they were worked', async () => {
      localStorage.setItem(
        'fitit_repeat_template',
        JSON.stringify({ workoutId: 1, names: ['Dominadas', 'Remo'] }),
      )
      api.getPreviousMarks.mockImplementation((name) =>
        Promise.resolve({ exercise_name: name, found: false, sets: [] }),
      )
      renderWorkout()

      await waitFor(() => expect(cardToggles('Dominadas')).toHaveLength(1))
      expect(dock().getByRole('button', { name: 'Siguiente: Remo' })).toBeInTheDocument()
      expect(api.getPreviousMarks).toHaveBeenCalledWith('Dominadas', 1)
      expect(api.getPreviousMarks).toHaveBeenCalledWith('Remo', 1)
    })

    // Saltarse uno de la cola era borrarlo de la app: el ejercicio existe, así
    // que «Eliminar» llevaba su id al servidor y con él meses de registro. Una
    // tarjeta sin series en este entreno no tiene nada de esta sesión que
    // borrar — sale de la sesión y de la cola, y el ejercicio se queda.
    it('una tarjeta en cola sin series sale del entreno sin borrar el ejercicio', async () => {
      localStorage.setItem(
        'fitit_repeat_template',
        JSON.stringify({ workoutId: 1, names: ['Dominadas', 'Remo'] }),
      )
      api.listExercises.mockResolvedValue([
        { id: 7, name: 'Dominadas', muscle_group: 'Espalda', set_count: 40 },
        { id: 8, name: 'Remo', muscle_group: 'Espalda', set_count: 30 },
      ])
      api.getPreviousMarks.mockImplementation((name) =>
        Promise.resolve({ exercise_name: name, found: false, sets: [] }),
      )
      const first = renderWorkout()

      await waitFor(() => expect(cardToggles('Dominadas')).toHaveLength(1))
      await userEvent.click(screen.getByRole('button', { name: /editar ejercicio dominadas/i }))
      await userEvent.click(screen.getByRole('button', { name: /^quitar$/i }))

      await waitFor(() => expect(cardToggles('Dominadas')).toHaveLength(0))
      expect(cardToggle('Remo')).toBeInTheDocument()
      // Ni diálogo que tase un historial que no se toca, ni llamada que lo tire.
      expect(screen.queryByRole('dialog', { name: /^Eliminar/ })).not.toBeInTheDocument()
      expect(api.deleteExercise).not.toHaveBeenCalled()
      first.unmount()

      // Y no vuelve al reabrir: sale de la cola, no sólo de la pantalla.
      renderWorkout()
      await waitFor(() => expect(cardToggles('Remo')).toHaveLength(1))
      expect(cardToggles('Dominadas')).toHaveLength(0)
    })

    it('ignores a template left over from another workout', async () => {
      localStorage.setItem(
        'fitit_repeat_template',
        JSON.stringify({ workoutId: 99, names: ['Dominadas'] }),
      )
      renderWorkout()

      await screen.findByLabelText('Ejercicio')
      expect(cardToggles('Dominadas')).toHaveLength(0)
    })

    // Log two of the five and reopen the app: the three you haven't touched
    // are still queued, under the ones you have.
    it('keeps the untouched exercises queued below what you have logged', async () => {
      localStorage.setItem(
        'fitit_repeat_template',
        JSON.stringify({ workoutId: 1, names: ['Dominadas', 'Remo', 'Curl'] }),
      )
      api.getPreviousMarks.mockImplementation((name) =>
        Promise.resolve({ exercise_name: name, found: false, sets: [] }),
      )
      api.getWorkout.mockResolvedValue(
        workoutWith(benchSet({ exercise_name: 'Remo', exercise_id: 4 })),
      )
      renderWorkout()

      await screen.findByRole('heading', { level: 2, name: /Remo/i })
      await screen.findByRole('button', { name: 'Siguiente: Dominadas' })
      expect(await sessionOrder()).toEqual(['Remo', 'Dominadas', 'Curl'])
    })
  })

  // Añadir un ejercicio y salir de la app sin registrarle nada lo perdía: la
  // lista de tarjetas se rehace al entrar desde las series y la plantilla de
  // «Repetir», y un ejercicio sin series no estaba en ninguna de las dos.
  describe('un ejercicio añadido sin series', () => {
    async function addSentadilla() {
      await screen.findByRole('heading', { level: 2, name: /Bench Press/i })
      await userEvent.type(screen.getByLabelText('Ejercicio'), 'Sentadilla')
      await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
      await waitFor(() => expect(cardToggle('Sentadilla')).toBeInTheDocument())
    }

    it('sigue ahí al salir y volver a entrar, arriba', async () => {
      api.getWorkout.mockResolvedValue(workoutWith(benchSet({ id: 1 })))
      api.getPreviousMarks.mockImplementation((name) =>
        Promise.resolve({ exercise_name: name, found: false, sets: [] }),
      )
      const first = renderWorkout()
      await addSentadilla()
      first.unmount()

      renderWorkout()

      await waitFor(() => expect(cardToggles('Sentadilla')).toHaveLength(1))
      expect(await sessionOrder()).toEqual(['Sentadilla', 'Bench Press'])
      expect(api.getPreviousMarks).toHaveBeenCalledWith('Sentadilla', 1)
    })

    it('no aparece en otro entreno', async () => {
      api.getWorkout.mockResolvedValue(workoutWith(benchSet({ id: 1 })))
      api.getPreviousMarks.mockImplementation((name) =>
        Promise.resolve({ exercise_name: name, found: false, sets: [] }),
      )
      const first = renderWorkout()
      await addSentadilla()
      first.unmount()

      api.getWorkout.mockResolvedValue({ ...workoutWith(benchSet({ id: 1 })), id: 2 })
      renderWorkout({ workoutId: 2 })

      await screen.findByRole('heading', { level: 2, name: /Bench Press/i })
      expect(cardToggles('Sentadilla')).toHaveLength(0)
    })

    // Nunca llegó al servidor, así que no hay nada que borrar allí: «Sí,
    // eliminar» no hacía nada, y ahora que la tarjeta sobrevive a salir de la
    // app se habría quedado en el entreno sin forma de quitarla.
    it('uno que nunca se guardó se quita con «Quitar», sin llamar al servidor', async () => {
      api.listDays.mockResolvedValue([])
      api.getWorkout.mockResolvedValue(workoutWith(benchSet({ id: 1 })))
      api.getPreviousMarks.mockImplementation((name) =>
        Promise.resolve({ exercise_name: name, found: false, sets: [] }),
      )
      const first = renderWorkout()
      await addSentadilla()

      await userEvent.click(
        screen.getByRole('button', { name: /editar ejercicio sentadilla/i }),
      )
      await userEvent.click(screen.getByRole('button', { name: /^quitar$/i }))

      // Sin series no hay nada que tasar: sale sin diálogo.
      await waitFor(() => expect(cardToggles('Sentadilla')).toHaveLength(0))
      expect(api.deleteExercise).not.toHaveBeenCalled()
      first.unmount()

      renderWorkout()
      await screen.findByRole('heading', { level: 2, name: /Bench Press/i })
      expect(cardToggles('Sentadilla')).toHaveLength(0)
    })

    it('cuando ya tiene series, no sale dos veces', async () => {
      api.getPreviousMarks.mockImplementation((name) =>
        Promise.resolve({ exercise_name: name, found: false, sets: [] }),
      )
      api.getWorkout.mockResolvedValue(workoutWith(benchSet({ id: 1 })))
      const first = renderWorkout()
      await addSentadilla()
      first.unmount()

      api.getWorkout.mockResolvedValue(
        workoutWith(
          benchSet({ id: 1 }),
          benchSet({ id: 2, exercise_name: 'Sentadilla', exercise_id: 9 }),
        ),
      )
      renderWorkout()

      await screen.findByRole('heading', { level: 2, name: /Sentadilla/i })
      expect(cardToggles('Sentadilla')).toHaveLength(1)
    })
  })

  // The gym is a basement and Render sleeps. If the network sits between
  // finishing a set and seeing it logged, the app is slow exactly when it is
  // being used. The set lands locally first; the request catches up after.
  describe('optimistic logging', () => {
    // A logSet mock you resolve by hand, so the assertions can stand in the
    // window where the request is still in flight.
    function deferredLogSet() {
      let resolve
      let reject
      api.logSet.mockImplementation(
        () =>
          new Promise((res, rej) => {
            resolve = res
            reject = rej
          }),
      )
      return {
        resolve: (workout) => resolve(workout),
        reject: () => reject(new Error('offline')),
      }
    }

    async function typeAndLog({ reps = '8', weight = '60' } = {}) {
      await userEvent.type(await screen.findByLabelText(/^ejercicio$/i), 'Bench Press')
      await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
      await userEvent.type(await screen.findByLabelText(/reps/i), reps)
      await userEvent.type(screen.getByLabelText(/peso/i), weight)
      await userEvent.click(screen.getByRole('button', { name: /^registrar/i }))
    }

    beforeEach(() => {
      api.getPreviousMarks.mockResolvedValue({
        exercise_name: 'Bench Press',
        found: false,
        sets: [],
      })
    })

    it('puts the set on screen before the server has answered', async () => {
      deferredLogSet()
      renderWorkout()
      await typeAndLog()

      // No waitFor: the row is expected to be there already, with the request
      // still open. This is the whole point of the change.
      expect(screen.getByText(/60 kg x 8/)).toBeInTheDocument()
      expect(screen.getByText('S1')).toBeInTheDocument()
    })

    it('marks the set as not yet saved, and clears the mark when it lands', async () => {
      const flight = deferredLogSet()
      const { container } = renderWorkout()
      await typeAndLog()

      // Honest about the state it is in: on screen, not yet on the server.
      expect(container.querySelector('.set-pending')).toBeInTheDocument()

      flight.resolve(workoutWith(benchSet({ id: 77, reps: 8, weight: 60 })))
      await waitFor(() => expect(container.querySelector('.set-pending')).toBeNull())
      expect(screen.getByText(/60 kg x 8/)).toBeInTheDocument()
    })

    // The server answers with the whole workout, and a set still in flight is
    // not in it. Overwriting blind would delete the second set off the screen
    // the moment the first one's response arrived.
    it('does not let a landing set erase one still in flight', async () => {
      const pending = []
      api.logSet.mockImplementation(() => new Promise((res) => pending.push(res)))
      renderWorkout()
      await typeAndLog({ reps: '8', weight: '60' })
      await waitFor(() => expect(pending).toHaveLength(1))

      // Second set, logged before the first has come back.
      await userEvent.click(screen.getByRole('button', { name: /repetir serie/i }))
      expect(screen.getByText('S2')).toBeInTheDocument()

      // The first response knows about one set only.
      pending[0](workoutWith(benchSet({ id: 77, reps: 8, weight: 60 })))

      await waitFor(() => expect(screen.getByText('S2')).toBeInTheDocument())
    })

    it('starts the rest clock on the tap, not on the round trip', async () => {
      deferredLogSet()
      renderWorkout()
      await typeAndLog()

      // Resting is what you do while the request is still open, so the clock
      // cannot wait for it.
      expect(screen.getByRole('timer')).toBeInTheDocument()
    })

    it('does not offer to edit a set that has not been saved yet', async () => {
      deferredLogSet()
      renderWorkout()
      await typeAndLog()

      // Editing routes through the set's server id, and a pending set has none.
      // It becomes editable when it lands.
      expect(screen.queryByRole('button', { name: /editar serie 1/i })).not.toBeInTheDocument()
    })
  })

  // The half that makes the optimistic row honest. A set that can't be sent is
  // not lost and not an error — it waits in the outbox for signal.
  describe('logging with no signal', () => {
    const offline = () => Object.assign(new Error('Failed to fetch'))
    const refused = () => Object.assign(new Error('nope'), { status: 422 })

    async function addBench() {
      await userEvent.type(await screen.findByLabelText(/^ejercicio$/i), 'Bench Press')
      await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
      await screen.findByLabelText(/reps/i)
    }

    async function logBench({ reps = '8', weight = '60' } = {}) {
      // Los campos vienen rellenos (la última serie de hoy, o el objetivo):
      // escribir otra cifra es vaciarlos primero.
      await userEvent.clear(screen.getByLabelText(/reps/i))
      await userEvent.type(screen.getByLabelText(/reps/i), reps)
      await userEvent.clear(screen.getByLabelText(/peso/i))
      await userEvent.type(screen.getByLabelText(/peso/i), weight)
      await userEvent.click(screen.getByRole('button', { name: /^registrar/i }))
    }

    beforeEach(() => {
      api.getPreviousMarks.mockResolvedValue({
        exercise_name: 'Bench Press',
        found: false,
        sets: [],
      })
    })

    it('keeps the set on screen and in the queue when the request fails', async () => {
      api.logSet.mockRejectedValue(offline())
      renderWorkout()
      await addBench()
      await logBench()

      // No rollback and no alarm: you did the set, the phone just can't say so
      // yet. This is the behaviour PR #47 explicitly left undone.
      expect(await screen.findByText(/60 kg x 8/)).toBeInTheDocument()
      await waitFor(() => expect(JSON.parse(localStorage.getItem('fitit_outbox'))).toHaveLength(1))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('rebuilds the unsent sets when the app is reopened', async () => {
      localStorage.setItem(
        'fitit_outbox',
        JSON.stringify([
          {
            tmpId: 'tmp-1',
            workoutId: 1,
            payload: { exercise_name: 'Bench Press', reps: 8, weight: 60 },
          },
        ]),
      )
      api.logSet.mockRejectedValue(offline())
      renderWorkout()

      // The card stands itself up from the queue alone — the server has never
      // heard of this exercise, so without the queue it would not exist.
      expect(await screen.findByText(/60 kg x 8/)).toBeInTheDocument()
      expect(cardToggle('Bench Press')).toBeInTheDocument()
    })

    it('does not lose a set logged after reopening with one still unsent', async () => {
      // A set left over from the last time the app was open is `tmp-1`. The
      // counter starts again on every mount, so the next set logged would be
      // `tmp-1` too — and sending the first drops every entry with that id,
      // the second included, before it ever reaches the server.
      localStorage.setItem(
        'fitit_outbox',
        JSON.stringify([
          {
            tmpId: 'tmp-1',
            workoutId: 1,
            payload: { exercise_name: 'Bench Press', reps: 8, weight: 60 },
          },
        ]),
      )
      api.logSet.mockRejectedValue(offline())
      renderWorkout()
      expect(await screen.findByText(/60 kg x 8/)).toBeInTheDocument()

      await logBench({ weight: '65' })
      expect(await screen.findByText(/65 kg x 8/)).toBeInTheDocument()

      // Signal again: both go, in order.
      api.logSet.mockReset()
      api.logSet.mockResolvedValue(workoutWith(benchSet()))
      window.dispatchEvent(new Event('online'))

      await waitFor(() => expect(api.logSet).toHaveBeenCalledTimes(2))
      expect(api.logSet.mock.calls.map(([, set]) => set.weight)).toEqual([60, 65])
    })

    it('reopens into the session with no signal at all', async () => {
      // The one that makes the rest of this real. Without the workout cache
      // `getWorkout` fails, the screen renders its error state, and the queue
      // is holding sets for a session you can no longer see or add to.
      localStorage.setItem(
        'fitit_workout_cache',
        JSON.stringify(workoutWith(benchSet({ id: 5, reps: 8, weight: 60 }))),
      )
      api.getWorkout.mockRejectedValue(offline())
      api.getPreviousMarks.mockRejectedValue(offline())
      api.logSet.mockRejectedValue(offline())
      renderWorkout()

      // Not an error screen: the session, with its history, still loggable.
      expect(await screen.findByText(/60 kg x 8/)).toBeInTheDocument()
      expect(screen.queryByText(/no se pudo cargar el entreno/i)).not.toBeInTheDocument()

      await userEvent.type(screen.getByLabelText(/reps/i), '8')
      await userEvent.type(screen.getByLabelText(/peso/i), '65')
      await userEvent.click(screen.getByRole('button', { name: /^registrar/i }))

      expect(await screen.findByText(/65 kg x 8/)).toBeInTheDocument()
      await waitFor(() => expect(JSON.parse(localStorage.getItem('fitit_outbox'))).toHaveLength(1))
    })

    it('still dead-ends when there is no signal and nothing cached', async () => {
      // A cold cache is the one case with genuinely nothing to show, and it
      // keeps its way out.
      api.getWorkout.mockRejectedValue(offline())
      renderWorkout()

      expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo cargar el entreno/i)
      expect(screen.getByRole('button', { name: /días/i })).toBeInTheDocument()
    })

    // Visto en prod el 2026-09-28: sin cobertura, la respuesta fallaba al
    // instante con «No se pudo guardar cuántas te quedaban.» y se perdía. La
    // serie de al lado aguantaba en la cola; la respuesta no tenía cola.
    it('keeps the answer to «¿Cuántas te quedaban?» and sends it when the network comes back', async () => {
      api.logSet.mockResolvedValue(workoutWith(benchSet({ id: 6 })))
      api.editSet.mockRejectedValue(offline())
      renderWorkout()
      await addBench()
      await logBench()
      await screen.findByText('60 kg x 8')

      const group = screen.getByRole('group', { name: '¿Cuántas te quedaban?' })
      await userEvent.click(within(group).getByRole('button', { name: '2' }))

      await waitFor(() =>
        expect(JSON.parse(localStorage.getItem('fitit_rir_outbox'))).toEqual([
          { workoutId: 1, setId: 6, rpe: 8 },
        ]),
      )
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(within(group).getByRole('button', { name: '2' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )

      api.editSet.mockReset()
      api.editSet.mockResolvedValue(benchSet({ id: 6, rpe: 8 }))
      window.dispatchEvent(new Event('online'))

      await waitFor(() =>
        expect(api.editSet).toHaveBeenCalledWith(6, {
          exercise_name: 'Bench Press',
          reps: 8,
          weight: 60,
          rpe: 8,
          note: null,
        }),
      )
      await waitFor(() => expect(localStorage.getItem('fitit_rir_outbox')).toBeNull())
    })

    // La serie todavía en la cola sólo tiene `tmp-N` y su `client_id`. La
    // respuesta se ata a ese id, y encuentra la serie cuando el servidor la
    // devuelve con él: cerrar la app entremedias ya no la pierde.
    it('keeps an answer given to a set that has not reached the server yet', async () => {
      api.logSet.mockRejectedValue(offline())
      renderWorkout()
      await addBench()
      await logBench()
      await screen.findByText('60 kg x 8')
      const [queued] = JSON.parse(localStorage.getItem('fitit_outbox'))
      const clientId = queued.payload.client_id
      expect(clientId).toBeTruthy()

      const group = screen.getByRole('group', { name: '¿Cuántas te quedaban?' })
      await userEvent.click(within(group).getByRole('button', { name: '2' }))

      await waitFor(() =>
        expect(JSON.parse(localStorage.getItem('fitit_rir_outbox'))).toEqual([
          { workoutId: 1, clientId, rpe: 8 },
        ]),
      )
      expect(api.editSet).not.toHaveBeenCalled()

      api.logSet.mockReset()
      api.logSet.mockResolvedValue(workoutWith(benchSet({ id: 6, client_id: clientId })))
      api.editSet.mockResolvedValue(benchSet({ id: 6, rpe: 8, client_id: clientId }))
      window.dispatchEvent(new Event('online'))

      await waitFor(() =>
        expect(api.editSet).toHaveBeenCalledWith(6, {
          exercise_name: 'Bench Press',
          reps: 8,
          weight: 60,
          rpe: 8,
          note: null,
        }),
      )
      await waitFor(() => expect(localStorage.getItem('fitit_rir_outbox')).toBeNull())
    })

    it('sends an answer left unsent last time the app was open', async () => {
      localStorage.setItem(
        'fitit_rir_outbox',
        JSON.stringify([{ workoutId: 1, setId: 5, rpe: 9 }]),
      )
      api.getWorkout.mockResolvedValue(workoutWith(benchSet({ id: 5, reps: 10, weight: 70 })))
      api.editSet.mockResolvedValue(benchSet({ id: 5, reps: 10, weight: 70, rpe: 9 }))
      renderWorkout()

      // Con lo que la serie dice *ahora*: la respuesta sólo es el RPE, y un
      // PATCH reemplaza la fila entera.
      await waitFor(() =>
        expect(api.editSet).toHaveBeenCalledWith(5, {
          exercise_name: 'Bench Press',
          reps: 10,
          weight: 70,
          rpe: 9,
          note: null,
        }),
      )
      await waitFor(() => expect(localStorage.getItem('fitit_rir_outbox')).toBeNull())
    })

    it('drops an answer the server refuses, out loud', async () => {
      localStorage.setItem(
        'fitit_rir_outbox',
        JSON.stringify([{ workoutId: 1, setId: 5, rpe: 9 }]),
      )
      api.getWorkout.mockResolvedValue(workoutWith(benchSet({ id: 5 })))
      api.editSet.mockRejectedValue(refused())
      renderWorkout()

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'El servidor rechazó cuántas te quedaban.',
      )
      expect(localStorage.getItem('fitit_rir_outbox')).toBeNull()
    })

    it('sends the backlog when the network comes back', async () => {
      api.logSet.mockRejectedValue(offline())
      renderWorkout()
      await addBench()
      await logBench()
      await waitFor(() => expect(JSON.parse(localStorage.getItem('fitit_outbox'))).toHaveLength(1))

      api.logSet.mockResolvedValue(workoutWith(benchSet({ id: 77, reps: 8, weight: 60 })))
      window.dispatchEvent(new Event('online'))

      // Queue empty, dot gone, set still there — it just belongs to the server
      // now instead of to the phone.
      await waitFor(() => expect(localStorage.getItem('fitit_outbox')).toBeNull())
      await waitFor(() => expect(document.querySelector('.set-pending')).toBeNull())
      expect(screen.getByText(/60 kg x 8/)).toBeInTheDocument()
    })

    it('drains the backlog oldest first, and stops at the one that fails', async () => {
      localStorage.setItem(
        'fitit_outbox',
        JSON.stringify([
          { tmpId: 'tmp-1', workoutId: 1, payload: { exercise_name: 'Bench Press', reps: 8, weight: 60 } },
          { tmpId: 'tmp-2', workoutId: 1, payload: { exercise_name: 'Bench Press', reps: 8, weight: 65 } },
        ]),
      )
      // The first goes through, the second doesn't.
      api.logSet
        .mockResolvedValueOnce(workoutWith(benchSet({ id: 77, reps: 8, weight: 60 })))
        .mockRejectedValue(offline())
      renderWorkout()

      // set_index is assigned server-side on arrival, so the queue may not
      // reorder itself around a failure — the second set keeps its place.
      await waitFor(() => {
        const left = JSON.parse(localStorage.getItem('fitit_outbox'))
        expect(left.map((e) => e.tmpId)).toEqual(['tmp-2'])
      })
      expect(api.logSet).toHaveBeenNthCalledWith(1, 1, {
        exercise_name: 'Bench Press',
        reps: 8,
        weight: 60,
      })
    })

    it('gives up on a set the server refuses, and says so', async () => {
      api.logSet.mockRejectedValue(refused())
      renderWorkout()
      await addBench()
      await logBench()

      // A 422 will be a 422 forever. Retrying it would block every set behind
      // it, so this is the one case where the row really does come back off.
      expect(await screen.findByRole('alert')).toHaveTextContent(/rechazó una serie/i)
      await waitFor(() => expect(localStorage.getItem('fitit_outbox')).toBeNull())
      expect(screen.queryByText(/60 kg x 8/)).not.toBeInTheDocument()
    })

    it('shows the marks it saw last time when it cannot ask for them', async () => {
      api.getPreviousMarks.mockResolvedValueOnce({
        exercise_name: 'Bench Press',
        found: true,
        sets: [{ reps: 8, weight: 60 }],
        best_one_rm: 76,
      })
      const first = renderWorkout()
      await addBench()
      await screen.findByText(/última vez/i)
      first.unmount()

      // Same lift, no signal. The card still knows what you did last time.
      api.getPreviousMarks.mockRejectedValue(offline())
      renderWorkout()
      await addBench()

      expect(await screen.findByText(/última vez/i)).toBeInTheDocument()
      expect(screen.getByText(/marcas guardadas · sin conexión/i)).toBeInTheDocument()
    })

    it('will not award a record against marks that came from the cache', async () => {
      api.getPreviousMarks.mockResolvedValueOnce({
        exercise_name: 'Bench Press',
        found: true,
        sets: [{ reps: 8, weight: 60 }],
        best_one_rm: 76,
      })
      const first = renderWorkout()
      await addBench()
      await screen.findByText(/última vez/i)
      first.unmount()

      api.getPreviousMarks.mockRejectedValue(offline())
      api.logSet.mockRejectedValue(offline())
      renderWorkout()
      await addBench()
      await logBench({ reps: '8', weight: '100' }) // e1RM 126.7, way past 76

      // Cached marks were fetched excluding a different session, so they can
      // understate the real history. A record claimed against a number like
      // that is a record that never happened — worse than no record at all.
      expect(await screen.findByText(/100 kg x 8/)).toBeInTheDocument()
      expect(screen.queryByText(/nuevo récord/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/^PR$/)).not.toBeInTheDocument()
    })
  })

  describe('the screen staying awake', () => {
    it('holds the screen while the session is open, and lets go on the way out', async () => {
      const release = vi.fn()
      wakelock.holdScreenAwake.mockReturnValue(release)
      const view = renderWorkout()
      await screen.findByLabelText('Ejercicio')

      expect(wakelock.holdScreenAwake).toHaveBeenCalled()
      view.unmount()
      expect(release).toHaveBeenCalled()
    })

    it('does not take the screen when the session was told not to', async () => {
      localStorage.setItem('fitit_screen_awake', 'off')
      renderWorkout()
      await screen.findByLabelText('Ejercicio')

      expect(wakelock.holdScreenAwake).not.toHaveBeenCalled()
    })
  })

  it('deletes the current workout and exits, after confirming', async () => {
    const onExit = vi.fn()
    api.deleteWorkout.mockResolvedValue(null)
    renderWorkout({ onExit })
    await screen.findByLabelText('Ejercicio')

    // Destructive + irreversible: tucked in the overflow menu and gated on a
    // second, explicit tap so a stray thumb can't wipe the workout.
    await userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Borrar entreno' }))
    expect(api.deleteWorkout).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /sí, borrar/i }))

    await waitFor(() => expect(api.deleteWorkout).toHaveBeenCalledWith(1))
    expect(onExit).toHaveBeenCalled()
  })

  // Borrado, un entreno no deja nada detrás: ni series por enviar a un entreno
  // que ya no existe, ni la copia que lo volvería a enseñar al abrirlo.
  // (Las series sin enviar las cubre forgetWorkout en offline.test.js.)
  it('leaves no cached copy behind', async () => {
    const onExit = vi.fn()
    api.deleteWorkout.mockResolvedValue(null)
    renderWorkout({ onExit })
    await screen.findByLabelText('Ejercicio')

    await userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Borrar entreno' }))
    await userEvent.click(screen.getByRole('button', { name: /sí, borrar/i }))

    await waitFor(() => expect(onExit).toHaveBeenCalled())
    expect(localStorage.getItem('fitit_workout_cache')).toBeNull()
  })

  // Lo que se quería era que no estuviera, y no está: borrado en otro sitio, o
  // abierto desde un widget que aún lo creía vivo. No es un error que enseñar.
  it('takes a workout that is already gone as deleted', async () => {
    const onExit = vi.fn()
    api.deleteWorkout.mockRejectedValue(Object.assign(new Error('gone'), { status: 404 }))
    renderWorkout({ onExit })
    await screen.findByLabelText('Ejercicio')

    await userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Borrar entreno' }))
    await userEvent.click(screen.getByRole('button', { name: /sí, borrar/i }))

    await waitFor(() => expect(onExit).toHaveBeenCalled())
    expect(screen.queryByText(/no se pudo borrar el entreno/i)).not.toBeInTheDocument()
  })

  // La copia es para cuando no hay red, no para contradecir al servidor: si dice
  // que el entreno no existe, no existe, y no se enseña uno fantasma.
  it('does not stand a deleted workout back up from the cache', async () => {
    const onExit = vi.fn()
    localStorage.setItem(
      'fitit_workout_cache',
      JSON.stringify(workoutWith(benchSet({ id: 5, reps: 8, weight: 60 }))),
    )
    api.getWorkout.mockRejectedValue(Object.assign(new Error('gone'), { status: 404 }))
    renderWorkout({ onExit })

    await waitFor(() => expect(onExit).toHaveBeenCalled())
    expect(screen.queryByText(/60 kg x 8/)).not.toBeInTheDocument()
    expect(localStorage.getItem('fitit_workout_cache')).toBeNull()
  })

  // Dominadas, fondos, abdominales: the weight field is empty because there is
  // no weight, not because it is zero. Spec:
  // backend/tests/features/bodyweight_set.feature
  describe('series sin peso', () => {
    const dip = (overrides = {}) => ({
      id: 30,
      exercise_id: 9,
      exercise_name: 'Fondos',
      set_index: 0,
      reps: 12,
      weight: null,
      ...overrides,
    })

    async function addFondos() {
      api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Fondos', found: false })
      renderWorkout()
      await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Fondos')
      await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
      await screen.findByLabelText(/^reps/i)
    }

    it('logs a set with no weight when the weight field is left empty', async () => {
      api.logSet.mockResolvedValue(workoutWith(dip()))
      await addFondos()

      await userEvent.type(screen.getByLabelText(/^reps/i), '12')
      await userEvent.click(screen.getByRole('button', { name: /^Registrar/i }))

      await waitFor(() =>
        expect(api.logSet).toHaveBeenCalledWith(
          1,
          expect.objectContaining({ exercise_name: 'Fondos', reps: 12, weight: null }),
        ),
      )
      // And the row says so, rather than claiming you lifted zero kilos.
      expect(await screen.findByText(/Corporal x 12/i)).toBeInTheDocument()
    })

    it('names what it will log before you log it', async () => {
      await addFondos()
      await userEvent.type(screen.getByLabelText(/^reps/i), '12')

      expect(screen.getByRole('button', { name: /Registrar corporal × 12/i })).toBeInTheDocument()
    })

    it('still refuses a set with no reps', async () => {
      await addFondos()
      await userEvent.click(screen.getByRole('button', { name: /^Registrar/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent(/reps/i)
      expect(api.logSet).not.toHaveBeenCalled()
    })

    it('opens the editor of a weightless set with an empty weight field', async () => {
      api.getWorkout.mockResolvedValue(workoutWith(dip()))
      api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Fondos', found: false })
      renderWorkout()

      await userEvent.click(await screen.findByRole('button', { name: /editar serie 1/i }))
      expect(screen.getByLabelText(/editar peso/i)).toHaveValue('')
      expect(screen.getByLabelText(/editar reps/i)).toHaveValue('12')
    })
  })
})
