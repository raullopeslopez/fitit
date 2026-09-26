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
      (b) => b.getAttribute('aria-haspopup') !== 'dialog' && !b.classList.contains('editor-more'),
    )

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

      const titles = await screen.findAllByRole('heading', { level: 2 })
      // A folded header also carries its digest, so match the name, not the whole row.
      expect(titles.map((h) => h.textContent)).toEqual([
        expect.stringContaining('Dominadas'),
        expect.stringContaining('Bench Press'),
      ])
    })

    it('given an open workout, when I add an exercise, it appears first', async () => {
      api.getWorkout.mockResolvedValue(workoutWith(benchSet({ id: 1 })))
      api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Sentadilla', found: false })
      renderWorkout()

      await screen.findByRole('heading', { level: 2, name: /Bench Press/i })
      await userEvent.type(screen.getByLabelText('Ejercicio'), 'Sentadilla')
      await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

      await waitFor(() =>
        expect(
          screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
        ).toEqual([
          expect.stringContaining('Sentadilla'),
          expect.stringContaining('Bench Press'),
        ]),
      )
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

      // Bench is second and collapsed; open it and log to it. Dominadas stays
      // open as well, so everything below is scoped to the Bench card.
      await screen.findByRole('heading', { level: 2, name: /Dominadas/i })
      await userEvent.click(cardToggle('Bench Press'))
      const bench = within(cardToggle('Bench Press').closest('.card'))
      await userEvent.type(bench.getByLabelText(/reps/i), '8')
      await userEvent.type(bench.getByLabelText(/peso/i), '60')
      await userEvent.click(bench.getByRole('button', { name: /registrar/i }))

      await waitFor(() => expect(api.logSet).toHaveBeenCalled())
      expect(
        screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
      ).toEqual([
        expect.stringContaining('Dominadas'),
        expect.stringContaining('Bench Press'),
      ])
    })
  })

  describe('collapsing', () => {
    it('opens only the newest card and folds the rest', async () => {
      api.getWorkout.mockResolvedValue(
        workoutWith(benchSet({ id: 1, set_index: 0 }), pullSet({ id: 2, set_index: 1 })),
      )
      renderWorkout()

      await waitFor(() => expect(cardToggle('Dominadas')).toHaveAttribute('aria-expanded', 'true'))
      expect(cardToggle('Bench Press')).toHaveAttribute('aria-expanded', 'false')
      // One log form on screen, belonging to the open card.
      expect(screen.getAllByLabelText(/reps/i)).toHaveLength(1)
    })

    it('a folded card still reports what I did', async () => {
      api.getWorkout.mockResolvedValue(
        workoutWith(
          benchSet({ id: 1, set_index: 0, reps: 8, weight: 60 }),
          benchSet({ id: 2, set_index: 1, reps: 8, weight: 60 }),
          benchSet({ id: 3, set_index: 2, reps: 8, weight: 80 }),
          pullSet({ id: 4, set_index: 3 }),
        ),
      )
      renderWorkout()

      // Sets varied (60/60/80), so the digest names the top set by est. 1RM
      // (80 × 8) with the "tope" label, not a decoupled range.
      expect(await foldedDigest(/^3 series · tope 80 kg × 8$/)).toBeInTheDocument()
    })

    it('names the working set without a "tope" label when every set matched', async () => {
      api.getWorkout.mockResolvedValue(
        workoutWith(
          benchSet({ id: 1, set_index: 0, reps: 8, weight: 60 }),
          benchSet({ id: 2, set_index: 1, reps: 8, weight: 60 }),
          pullSet({ id: 3, set_index: 2 }),
        ),
      )
      renderWorkout()

      // Identical sets: one pair speaks for all, so no "tope" — there's no peak
      // to single out.
      expect(await foldedDigest(/^2 series · 60 kg × 8$/)).toBeInTheDocument()
      expect(screen.queryByText(/tope/)).not.toBeInTheDocument()
    })

    it('names the top set by est. 1RM when the sets varied', async () => {
      api.getWorkout.mockResolvedValue(
        workoutWith(
          benchSet({ id: 1, set_index: 0, reps: 8, weight: 60 }),
          benchSet({ id: 2, set_index: 1, reps: 5, weight: 70 }),
          pullSet({ id: 3, set_index: 2 }),
        ),
      )
      renderWorkout()

      // A flat "2 × 8" would lie about the second set. 70 × 5 (e1RM 81.7) beats
      // 60 × 8 (76.0), so it's the tope — one real, paired working set.
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
          pullSet({ id: 3, set_index: 2 }),
        ),
      )
      renderWorkout()

      // Bench is folded, so its two sets are on screen only as chips.
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

    it('lets me keep two cards open at once, for supersets', async () => {
      api.getWorkout.mockResolvedValue(
        workoutWith(benchSet({ id: 1, set_index: 0 }), pullSet({ id: 2, set_index: 1 })),
      )
      renderWorkout()

      await waitFor(() => expect(cardToggle('Dominadas')).toHaveAttribute('aria-expanded', 'true'))
      await userEvent.click(cardToggle('Bench Press'))

      expect(cardToggle('Bench Press')).toHaveAttribute('aria-expanded', 'true')
      expect(cardToggle('Dominadas')).toHaveAttribute('aria-expanded', 'true')
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

  it('seeds the steppers from the previous set so a repeat is one tap', async () => {
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: true,
      sets: [benchSet({ reps: 8, weight: 60, unit: 'kg' })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await screen.findByText(/última vez/i)

    expect(screen.getByLabelText(/reps/i)).toHaveValue('8')
    expect(screen.getByLabelText(/peso/i)).toHaveValue('60')
    // The button states exactly what pressing it will log.
    expect(screen.getByRole('button', { name: /registrar 60 × 8/i })).toBeInTheDocument()
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

  it('dismisses the rest countdown with Saltar', async () => {
    const { container } = renderWorkout()
    await logOneSet()

    await userEvent.click(await screen.findByRole('button', { name: /saltar/i }))

    expect(container.querySelector('.rest-bar')).toBeNull()
  })

  it('does not start a countdown when rest is switched off', async () => {
    renderWorkout()
    await screen.findByLabelText('Ejercicio')
    // Rest lives in the header overflow now, under its "Descanso" label.
    await userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))
    await userEvent.click(screen.getByRole('button', { name: /^sin$/i }))
    await userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))

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

    it('folds both away until something needs fixing', async () => {
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
      // El editor abierto es el nombre y su confirmación: el grupo y la nota
      // están un toque más allá, para que el panel quepa sin tapar el registro.
      expect(screen.queryByLabelText(/grupo muscular de/i)).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /^Grupo, nota y eliminar/ }))
      expect(screen.getByLabelText(/grupo muscular de/i)).toBeInTheDocument()
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

  it('keeps every exercise of the session visible', async () => {
    api.getPreviousMarks.mockResolvedValue({ found: false, sets: [] })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText('Ejercicio'), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await screen.findByRole('heading', { name: /Bench Press/i })

    await userEvent.type(screen.getByLabelText('Ejercicio'), 'Squat')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await screen.findByRole('heading', { name: /Squat/i })

    // Both still on screen; the older one is folded, not gone.
    expect(screen.getByRole('heading', { name: /Bench Press/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Squat/i })).toBeInTheDocument()
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

  // Un toque en «Editar ejercicio» tiene que dejarme escribiendo. Si el foco se
  // queda en el botón, renombrar cuesta dos toques y el botón miente.
  it('el toque en Editar ejercicio deja el cursor en el nombre', async () => {
    api.getWorkout.mockResolvedValue(workoutWith(benchSet()))
    api.listExercises.mockResolvedValue([
      { id: 2, name: 'Bench Press', muscle_group: 'Pecho', set_count: 0 },
    ])
    renderWorkout()

    await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
    const input = await screen.findByLabelText(/nombre de Bench Press/i)
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe('Bench Press'.length)
  })

  it('lets me re-label an exercise muscle group from the workout', async () => {
    api.getWorkout.mockResolvedValue(workoutWith(benchSet()))
    api.listExercises.mockResolvedValue([
      { id: 2, name: 'Bench Press', muscle_group: 'Pecho', set_count: 0 },
    ])
    api.setExerciseMuscle.mockResolvedValue({ id: 2, name: 'Bench Press', muscle_group: 'Hombro' })
    renderWorkout()

    // The newest card is open; the editor lives behind Corregir at its foot.
    await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
    await userEvent.click(screen.getByRole('button', { name: /^Grupo, nota y eliminar/ }))
    const select = await screen.findByLabelText(/grupo muscular de Bench Press/i)
    expect(select).toHaveValue('Pecho')

    await userEvent.selectOptions(select, 'Hombro')

    await waitFor(() => expect(api.setExerciseMuscle).toHaveBeenCalledWith(2, 'Hombro'))
    expect(select).toHaveValue('Hombro')
    // The header tag follows the new group, not the old classifier guess.
    expect(cardToggle('Bench Press').closest('h2')).toHaveTextContent('Hombro')
  })

  it('clears a muscle group back to Sin grupo', async () => {
    api.getWorkout.mockResolvedValue(workoutWith(benchSet()))
    api.listExercises.mockResolvedValue([
      { id: 2, name: 'Bench Press', muscle_group: 'Pecho', set_count: 0 },
    ])
    api.setExerciseMuscle.mockResolvedValue({ id: 2, name: 'Bench Press', muscle_group: null })
    renderWorkout()

    await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
    await userEvent.click(screen.getByRole('button', { name: /^Grupo, nota y eliminar/ }))
    const select = screen.getByLabelText(/grupo muscular de Bench Press/i)
    await userEvent.selectOptions(select, 'Sin grupo')

    await waitFor(() => expect(api.setExerciseMuscle).toHaveBeenCalledWith(2, null))
    expect(select).toHaveValue('')
  })

  // The group is stored on the exercise, not on the set, so one tap on this
  // select re-buckets every set ever logged against it — weeks of per-muscle
  // totals move at once, on a screen that shows none of them. The card can't
  // count that itself (it holds today's session), so the count rides on
  // /exercises.
  describe('re-tagging an exercise that already has history', () => {
    const tagged = (overrides = {}) => [
      { id: 2, name: 'Bench Press', muscle_group: 'Pecho', set_count: 4, ...overrides },
    ]

    async function openCorrector(exercises = tagged()) {
      api.getWorkout.mockResolvedValue(workoutWith(benchSet()))
      api.listExercises.mockResolvedValue(exercises)
      renderWorkout()
      await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
      await userEvent.click(screen.getByRole('button', { name: /^Grupo, nota y eliminar/ }))
      return screen.getByLabelText(/grupo muscular de Bench Press/i)
    }

    // El editor es un diálogo, así que «el diálogo» tiene que decir cuál. El
    // del reetiquetado nombraba el movimiento en su título; ya no existe, y
    // esta consulta se queda para poder demostrar que no está.
    const retagDialog = () => screen.queryByRole('dialog', { name: /(mover|quitar).*Bench Press|Bench Press.*a Hombro/i })

    // ── La ceremonia, ordenada por daño ───────────────────────────────────
    // Reetiquetar es **reversible** y llevaba diálogo *y* deshacer, mientras
    // fusionar y vaciar la nota —los dos irreversibles, uno de ellos sin
    // vuelta— no llevaban nada. La ceremonia de la app iba en proporción
    // inversa al destrozo. Un diálogo modal para cambiar una etiqueta que se
    // deshace en un toque es ceremonia por sí misma: lo que hace falta es que
    // se pueda volver, y de eso se ocupa la fila de abajo.
    it('lands on the tap, with no dialog in the way', async () => {
      api.setExerciseMuscle.mockResolvedValue({
        id: 2,
        name: 'Bench Press',
        muscle_group: 'Hombro',
        set_count: 4,
      })
      const select = await openCorrector()

      await userEvent.selectOptions(select, 'Hombro')

      await waitFor(() => expect(api.setExerciseMuscle).toHaveBeenCalledWith(2, 'Hombro'))
      expect(retagDialog()).not.toBeInTheDocument()
    })

    // La cifra que decía el diálogo no se pierde: se dice después, en la fila
    // que además ofrece devolverlo. Decirla antes obligaba a leer un modal;
    // decirla después la deja al lado del control que la desanda.
    it('says how many logged sets just moved, in the row that takes them back', async () => {
      api.setExerciseMuscle.mockResolvedValue({
        id: 2,
        name: 'Bench Press',
        muscle_group: 'Hombro',
        set_count: 4,
      })
      const select = await openCorrector()

      await userEvent.selectOptions(select, 'Hombro')

      const undo = await screen.findByText(/4 series/i)
      expect(undo).toHaveTextContent('Sus 4 series ya cuentan como Hombro.')
    })

    // ── El grupo aterriza antes de que conteste el servidor ───────────────
    // Era el único campo del panel que esperaba la respuesta antes de mover
    // nada, y con `Guardar` retirado eso no se lee como "va en camino": se lee
    // como "no". Medido en el banco a 2 s de latencia, 343 ms después de
    // confirmar `Pecho` el desplegable seguía diciendo `Hombro`.
    it('lands the group before the server answers, and takes it back if it fails', async () => {
      let answer
      api.setExerciseMuscle.mockImplementation(
        () => new Promise((resolve, reject) => { answer = reject }),
      )
      const select = await openCorrector()

      await userEvent.selectOptions(select, 'Hombro')

      // Sin esperar a nadie.
      expect(select).toHaveValue('Hombro')

      await act(async () => {
        answer(new Error('Failed to fetch'))
      })

      // Y vuelve al que tenía, diciéndolo — en la tarjeta, que es donde el
      // nombre y la nota dicen también lo suyo.
      await waitFor(() => expect(select).toHaveValue('Pecho'))
      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cambiar el grupo.')
    })

    // Una superficie para los tres campos del editor: el nombre se quejaba
    // dentro del panel, la nota y el grupo al pie de la página. Dos sitios para
    // tres campos de la misma caja, y ninguno donde estaba mirando el pulgar.
    it('says a failed note on the same surface the name uses', async () => {
      api.setExerciseNote.mockRejectedValue(new Error('Failed to fetch'))
      await openCorrector()

      const note = screen.getByLabelText(/nota de Bench Press/i)
      await userEvent.type(note, 'sin rebote')
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('No se pudo guardar la nota.')

      api.setExerciseNote.mockResolvedValue({ id: 2, name: 'Bench Press', note: 'sin rebote' })
      await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }))
      await waitFor(() => expect(api.setExerciseNote).toHaveBeenCalledTimes(2))
    })

    // ── Vaciar la nota era el acto destructivo sin ninguna ceremonia ───────
    // Se borraba el campo, se salía, y `{"note": null}` viajaba: una nota
    // guardada desaparecía sin decir nada y sin vuelta atrás. No lleva
    // confirmación a propósito —colgaría de la salida, y las cuatro salidas
    // del panel tienen que valer lo mismo—, lleva la misma fila de deshacer
    // que el reetiquetado. Y en la tarjeta, no en el cajón: para cuando el
    // servidor contesta, el cajón se ha ido con el cierre que mandó la nota.
    it('says which note it just deleted, and gives it back', async () => {
      api.setExerciseNote.mockResolvedValue({ id: 2, name: 'Bench Press', note: null })
      await openCorrector(tagged({ note: 'sin rebote' }))

      const note = screen.getByLabelText(/nota de Bench Press/i)
      await userEvent.clear(note)
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

      await waitFor(() => expect(api.setExerciseNote).toHaveBeenCalledWith(2, null))
      const undo = await screen.findByText('Se borró la nota: «sin rebote».')

      api.setExerciseNote.mockResolvedValue({ id: 2, name: 'Bench Press', note: 'sin rebote' })
      await userEvent.click(
        within(undo.closest('p')).getByRole('button', { name: 'Deshacer el borrado de la nota' }),
      )
      await waitFor(() => expect(api.setExerciseNote).toHaveBeenLastCalledWith(2, 'sin rebote'))
      expect(screen.queryByText(/Se borró la nota/)).not.toBeInTheDocument()
    })

    // Escribir encima de una nota no es borrarla: hay algo nuevo en pantalla
    // que dice qué pasó. La fila es para la desaparición.
    it('stays quiet when the note is replaced rather than emptied', async () => {
      api.setExerciseNote.mockResolvedValue({ id: 2, name: 'Bench Press', note: 'más alto' })
      await openCorrector(tagged({ note: 'sin rebote' }))

      const note = screen.getByLabelText(/nota de Bench Press/i)
      await userEvent.clear(note)
      await userEvent.type(note, 'más alto')
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

      await waitFor(() => expect(api.setExerciseNote).toHaveBeenCalledWith(2, 'más alto'))
      expect(screen.queryByText(/Se borró la nota/)).not.toBeInTheDocument()
    })

    // Un ejercicio recién creado no tiene nada que mover, así que la fila no
    // cuenta nada: contar cero series es decir que el cambio no ha hecho nada,
    // y sí lo ha hecho.
    it('does not count sets that do not exist', async () => {
      api.setExerciseMuscle.mockResolvedValue({
        id: 2,
        name: 'Bench Press',
        muscle_group: 'Hombro',
        set_count: 0,
      })
      const select = await openCorrector(tagged({ set_count: 0 }))

      await userEvent.selectOptions(select, 'Hombro')

      await waitFor(() => expect(api.setExerciseMuscle).toHaveBeenCalledWith(2, 'Hombro'))
      expect(await screen.findByText('Ahora cuenta como Hombro.')).toBeInTheDocument()
      expect(screen.queryByText(/0 series/)).not.toBeInTheDocument()
    })

    it('offers to put it back afterwards', async () => {
      api.setExerciseMuscle.mockResolvedValue({
        id: 2,
        name: 'Bench Press',
        muscle_group: 'Hombro',
        set_count: 0,
      })
      const select = await openCorrector(tagged({ set_count: 0 }))

      await userEvent.selectOptions(select, 'Hombro')
      await waitFor(() => expect(select).toHaveValue('Hombro'))

      api.setExerciseMuscle.mockResolvedValue({
        id: 2,
        name: 'Bench Press',
        muscle_group: 'Pecho',
        set_count: 0,
      })
      await userEvent.click(screen.getByRole('button', { name: /deshacer/i }))

      // Undo goes back to the group it held before, not to no group at all.
      await waitFor(() => expect(api.setExerciseMuscle).toHaveBeenLastCalledWith(2, 'Pecho'))
      expect(select).toHaveValue('Pecho')
      expect(screen.queryByRole('button', { name: /deshacer/i })).not.toBeInTheDocument()
    })
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
      expect(cardToggle('Bench Press')).toBeInTheDocument()
      expect(screen.getByText(/60 kg x 8/)).toBeInTheDocument()
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

    it('still reaches rest from the header overflow', async () => {
      renderWorkout()
      await screen.findByLabelText('Ejercicio')

      await openSettings()
      expect(screen.getByRole('group', { name: /descanso entre series/i })).toBeInTheDocument()
      // The weight unit used to live beside it. It has no toggle any more.
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

    // Sin botón de guardar: escribir la nota y cerrar el panel la guarda. El
    // aspa es una de las cuatro puertas —las otras son Escape, el gesto de
    // atrás y tocar fuera— y las cuatro valen lo mismo.
    it('writes a note from the same fold that corrects the muscle', async () => {
      standing()
      api.setExerciseNote.mockResolvedValue({ id: 2, name: 'Bench Press', note: 'agarre ancho' })
      renderWorkout()

      await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
      await userEvent.click(screen.getByRole('button', { name: /^Grupo, nota y eliminar/ }))
      await userEvent.type(screen.getByLabelText("Nota de Bench Press"), 'agarre ancho')
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

      await waitFor(() => expect(api.setExerciseNote).toHaveBeenCalledWith(2, 'agarre ancho'))
      expect(await screen.findByText('agarre ancho')).toBeInTheDocument()
    })

    // Volver al nombre también retira la nota de la pantalla, así que también
    // la guarda: si no, la única forma de perderla sería la que más se parece a
    // seguir dentro del editor.
    it('writes the note when you step back to the name', async () => {
      standing()
      api.setExerciseNote.mockResolvedValue({ id: 2, name: 'Bench Press', note: 'agarre ancho' })
      renderWorkout()

      await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
      await userEvent.click(screen.getByRole('button', { name: /^Grupo, nota y eliminar/ }))
      await userEvent.type(screen.getByLabelText("Nota de Bench Press"), 'agarre ancho')
      await userEvent.click(screen.getByRole('button', { name: /volver al nombre/i }))

      await waitFor(() => expect(api.setExerciseNote).toHaveBeenCalledWith(2, 'agarre ancho'))
    })

    // Emptying the field is how you take a note back, and an empty string is
    // not a note — it would leave a blank line under the exercise name forever.
    //
    // Esto era lo que obligaba al botón a llamarse `Borrar` cuando el campo
    // quedaba vacío: pedirle a un botón que dice `Guardar` que guarde nada. Sin
    // botón la pregunta no existe — un campo vacío es no tener nota — y el acto
    // sigue siendo expresable con el mismo gesto que cualquier otro cambio.
    it('clears the note when the field is emptied', async () => {
      standing('agarre ancho')
      api.setExerciseNote.mockResolvedValue({ id: 2, name: 'Bench Press', note: null })
      renderWorkout()

      await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
      await userEvent.click(screen.getByRole('button', { name: /^Grupo, nota y eliminar/ }))
      await userEvent.clear(screen.getByLabelText("Nota de Bench Press"))
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

      await waitFor(() => expect(api.setExerciseNote).toHaveBeenCalledWith(2, null))
      await waitFor(() => expect(screen.queryByText('agarre ancho')).not.toBeInTheDocument())
    })

    // ── Y el acto que a esta pantalla le faltaba ────────────────────────
    // El encargo de este editor nombra cinco actos —renombrar, fusionar,
    // retaguear, anotar y borrar— «sin sacarme de la sesión», y borrar sólo
    // existía en Progreso. Aquí hace más falta, no menos: el duplicado se crea
    // escribiendo mal un nombre **en la sesión**, así que mandarte a otra
    // pantalla a tirarlo es exactamente lo que el encargo prohíbe.
    describe('borrar el ejercicio desde la sesión', () => {
      const log = () => [
        {
          id: 1,
          date: '2026-07-16',
          workouts: [
            {
              id: 1,
              date: '2026-07-16',
              sets: [benchSet(), benchSet({ id: 11, weight: 65, reps: 6 })],
            },
          ],
        },
      ]

      // La cifra se cuenta antes de abrir el diálogo, y del registro: es la
      // misma función que la cuenta en Progreso, para que un mismo acto no se
      // tase con dos precios según por dónde entres.
      it('names the damage from the log before it opens the dialog', async () => {
        standing()
        api.listDays.mockResolvedValue(log())
        renderWorkout()

        await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
        await userEvent.click(screen.getByRole('button', { name: /^Grupo, nota y eliminar/ }))
        await userEvent.click(screen.getByRole('button', { name: /^eliminar ejercicio$/i }))

        const dialog = await screen.findByRole('dialog', { name: /^Eliminar Bench Press$/ })
        expect(dialog).toHaveTextContent(
          'Se borrarán sus 2 series de un solo día de julio, y con ellas su récord de ' +
            '65 kg × 6. No se puede deshacer.',
        )
        expect(api.deleteExercise).not.toHaveBeenCalled()
      })

      it('takes the card and its sets off the session once you confirm', async () => {
        standing()
        api.listDays.mockResolvedValue(log())
        api.deleteExercise.mockResolvedValue(null)
        renderWorkout()

        await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
        await userEvent.click(screen.getByRole('button', { name: /^Grupo, nota y eliminar/ }))
        await userEvent.click(screen.getByRole('button', { name: /^eliminar ejercicio$/i }))
        const dialog = await screen.findByRole('dialog', { name: /^Eliminar Bench Press$/ })
        await userEvent.click(within(dialog).getByRole('button', { name: /sí, eliminar/i }))

        await waitFor(() => expect(api.deleteExercise).toHaveBeenCalledWith(2))
        await waitFor(() => expect(cardToggles('Bench Press')).toHaveLength(0))
        // Y el editor se va con el ejercicio del que hablaba.
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })

      // Sin registro no hay cifra, y sin cifra no hay diálogo: un «¿seguro?»
      // que no dice qué se lleva es lo que este diálogo vino a quitar.
      it('says so instead of asking blind when the log will not load', async () => {
        standing()
        api.listDays.mockRejectedValue(new Error('offline'))
        renderWorkout()

        await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
        await userEvent.click(screen.getByRole('button', { name: /^Grupo, nota y eliminar/ }))
        await userEvent.click(screen.getByRole('button', { name: /^eliminar ejercicio$/i }))

        expect(
          await screen.findByText('No se pudo contar lo que se borraría. Inténtalo de nuevo.'),
        ).toBeInTheDocument()
        expect(screen.queryByRole('dialog', { name: /^Eliminar/ })).not.toBeInTheDocument()
        expect(api.deleteExercise).not.toHaveBeenCalled()
      })
    })

    // No queda ningún botón que decir. Es la prueba de que la fila es de verdad
    // una fila de la rejilla —el rótulo, el valor y nada más— y no un
    // formulario disfrazado.
    it('leaves the note row with nothing to press', async () => {
      standing()
      renderWorkout()

      await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
      await userEvent.click(screen.getByRole('button', { name: /^Grupo, nota y eliminar/ }))

      expect(screen.queryByRole('button', { name: /guardar/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /borrar nota/i })).not.toBeInTheDocument()
    })
  })

  // A name is wrong most often the moment after you type it — in the session,
  // on the card you are staring at. Sending you to Progreso to fix a typo you
  // can see from here is a trip across the app for one letter.
  describe('renombrar el ejercicio', () => {
    const standing = () => {
      api.getWorkout.mockResolvedValue(workoutWith(benchSet()))
      api.listExercises.mockResolvedValue([
        { id: 2, name: 'Bench Press', muscle_group: 'Pecho', set_count: 3, note: null },
        { id: 3, name: 'Dominadas', muscle_group: 'Espalda', set_count: 9, note: null },
      ])
    }

    // Sin botón de guardar: el renombrado se manda con Intro, que es la tecla
    // que el propio campo ofrece. Las otras dos salidas —cerrar el panel y
    // cambiar de paso— tienen sus pruebas aparte, más abajo.
    const rename = async (typed) => {
      await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
      const field = screen.getByLabelText(/nombre de Bench Press/i)
      await userEvent.clear(field)
      await userEvent.type(field, `${typed}{Enter}`)
    }

    // ── La cifra que este trabajo vino a mover ────────────────────────────
    // La tarjeta se llamaba `key={ex.name}` en la lista, así que renombrar le
    // cambiaba la llave a React: desmontaba la tarjeta y montaba otra en su
    // sitio. Y una tarjeta recién montada siembra sus steppers desde
    // `previous`, o sea desde la sesión anterior. Medido en el banco: con
    // `42,5 × 9` escritos a medias, corregir una errata en el nombre los
    // dejaba en `37,5 × 10` — la serie que estabas contando, borrada por
    // arreglar una letra.
    it('mantiene un peso × reps a medio escribir al renombrar', async () => {
      standing()
      api.getPreviousMarks.mockResolvedValue({
        exercise_name: 'Bench Press',
        found: true,
        sets: [{ reps: 10, weight: 37.5 }],
      })
      api.renameExercise.mockResolvedValue({ id: 2, name: 'Press banca', muscle_group: 'Pecho' })
      renderWorkout()

      // Los steppers vienen sembrados con la sesión anterior (`37,5 × 10`);
      // esto es escribir encima la serie de hoy, a medias, sin registrarla.
      await userEvent.clear(await screen.findByLabelText('Peso · kg'))
      await userEvent.type(screen.getByLabelText('Peso · kg'), '42.5')
      await userEvent.clear(screen.getByLabelText('Reps'))
      await userEvent.type(screen.getByLabelText('Reps'), '9')

      await rename('Press banca')

      await waitFor(() => expect(cardToggles('Press banca')).toHaveLength(1))
      expect(screen.getByLabelText('Peso · kg')).toHaveValue('42.5')
      expect(screen.getByLabelText('Reps')).toHaveValue('9')
    })

    it('renames from the same fold that corrects the muscle', async () => {
      standing()
      api.renameExercise.mockResolvedValue({ id: 2, name: 'Press banca', muscle_group: 'Pecho' })
      renderWorkout()

      await rename('Press banca')

      await waitFor(() => expect(api.renameExercise).toHaveBeenCalledWith(2, 'Press banca'))
      await waitFor(() => expect(cardToggles('Press banca')).toHaveLength(1))
      expect(cardToggles('Bench Press')).toHaveLength(0)
    })

    // The rename keeps the id, so the sets are the same rows — but this screen
    // reads them by name, and a card that renames itself out from under its own
    // log looks like the session lost the work.
    it('keeps the sets on the card it renamed', async () => {
      standing()
      api.renameExercise.mockResolvedValue({ id: 2, name: 'Press banca', muscle_group: 'Pecho' })
      renderWorkout()

      await rename('Press banca')

      await waitFor(() => expect(cardToggles('Press banca')).toHaveLength(1))
      expect(screen.getByRole('button', { name: /editar serie 1/i })).toBeInTheDocument()
    })

    // Unsent sets name their exercise by string, and the server takes that name
    // at face value — so a set still in the outbox would quietly stand the old
    // exercise back up the next time the queue drains.
    it('carries unsent sets over to the new name', async () => {
      standing()
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
      // The queue only survives a mount if the flush keeps failing; a set that
      // sends is a set that leaves the outbox before the rename gets there.
      api.logSet.mockRejectedValue(new Error('Failed to fetch'))
      api.renameExercise.mockResolvedValue({ id: 2, name: 'Press banca', muscle_group: 'Pecho' })
      renderWorkout()

      await rename('Press banca')

      await waitFor(() =>
        expect(JSON.parse(localStorage.getItem('fitit_outbox'))[0].payload.exercise_name).toBe(
          'Press banca',
        ),
      )
    })

    // ── El choque de nombre duplicado ───────────────────────────────────
    // 409: el nombre ya es de otro ejercicio tuyo. Antes esto decía «Puedes
    // fusionarlos desde Progreso» —nombraba otra pantalla y te dejaba allí—, y
    // ahora la respuesta trae el ejercicio con el que chocaste, así que la
    // fusión se ofrece aquí mismo y con su precio delante.
    const taken = (exercise) =>
      Object.assign(new Error('request failed: 409'), {
        status: 409,
        detail: {
          code: 'name_taken',
          message: 'an exercise with that name already exists',
          exercise,
        },
      })

    it('turns the collision into a priced offer, in place', async () => {
      standing()
      api.renameExercise.mockRejectedValue(
        taken({ id: 3, name: 'Dominadas', kind: 'strength', set_count: 48 }),
      )
      renderWorkout()

      await rename('Dominadas')

      const alert = await screen.findByRole('alert')
      // Las dos cifras: 48 es lo que te quedas, 3 es lo que arriesgas. Y el
      // reetiquetado que la fusión hacía de tapadillo — Bench Press es de
      // Pecho y Dominadas de Espalda — dicho en voz alta.
      expect(alert).toHaveTextContent(
        'Ya tienes «Dominadas», con 48 series. ' +
          'Fusionar mueve ahí las 3 series de «Bench Press», con sus récords, y lo borra. ' +
          'Quedará todo en Espalda, el grupo de «Dominadas». No se puede deshacer.',
      )
      // Ni una palabra sobre irse a otra pantalla.
      expect(alert).not.toHaveTextContent(/Progreso/i)
      expect(cardToggles('Bench Press')).toHaveLength(1)
    })

    it('folds this exercise into the one it collided with', async () => {
      standing()
      api.renameExercise.mockRejectedValue(
        taken({ id: 3, name: 'Dominadas', kind: 'strength', set_count: 48 }),
      )
      // La fusión mueve las filas en el servidor, así que la sesión que se
      // vuelve a pedir después trae las series de hoy bajo el superviviente.
      api.mergeExercise.mockImplementation(async () => {
        api.getWorkout.mockResolvedValue(
          workoutWith(benchSet({ exercise_id: 3, exercise_name: 'Dominadas' })),
        )
        return { id: 3, name: 'Dominadas', muscle_group: 'Espalda', note: null, set_count: 49 }
      })
      renderWorkout()

      await rename('Dominadas')
      await userEvent.click(
        within(await screen.findByRole('alert')).getByRole('button', { name: 'Sí, fusionar' }),
      )

      // El superviviente es el que ya tenía el nombre, que es el nombre que
      // acabas de pedir: una sola llamada y aterrizas donde querías.
      await waitFor(() => expect(api.mergeExercise).toHaveBeenCalledWith(2, 3))
      await waitFor(() => expect(cardToggles('Dominadas')).toHaveLength(1))
      expect(cardToggles('Bench Press')).toHaveLength(0)
      // Y las series de hoy siguen en la tarjeta: la fusión las mueve de
      // ejercicio, no las tira.
      expect(screen.getByRole('button', { name: /editar serie 1/i })).toBeInTheDocument()
      // El panel se va con el ejercicio del que iba. Aquí se quedaba abierto
      // —la tarjeta no se desmonta, sólo cambia de nombre— y eso lo dejaba
      // editando un ejercicio que el usuario nunca pidió abrir: el que
      // sobrevivió. Progreso ya lo cerraba; ahora las dos pantallas contestan
      // igual a un acto que es el mismo en las dos.
      expect(screen.queryByRole('dialog', { name: /^Editar / })).not.toBeInTheDocument()
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
      // Y la tarjeta lleva la etiqueta del superviviente, no la del duplicado
      // que acaba de desaparecer.
      expect(cardToggles('Dominadas')[0].closest('h2')).toHaveTextContent('Espalda')
    })

    it('does not offer a merge the server would refuse', async () => {
      standing()
      api.renameExercise.mockRejectedValue(
        taken({ id: 9, name: 'Cinta', kind: 'cardio', set_count: 12 }),
      )
      renderWorkout()

      await rename('Cinta')

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(
        'Ya tienes «Cinta», pero es de cardio y «Bench Press» es de fuerza. ' +
          'No se pueden fusionar: ponle otro nombre.',
      )
      expect(within(alert).queryByRole('button', { name: 'Sí, fusionar' })).not.toBeInTheDocument()
    })

    it('does not print a count of zero', async () => {
      standing()
      api.renameExercise.mockRejectedValue(
        taken({ id: 3, name: 'Dominadas', kind: 'strength', set_count: 0 }),
      )
      renderWorkout()

      await rename('Dominadas')

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Ya tienes «Dominadas», todavía sin series.')
      expect(alert).not.toHaveTextContent(/0 series/)
    })

    it('says the collision in the singular', async () => {
      standing()
      api.renameExercise.mockRejectedValue(
        taken({ id: 3, name: 'Dominadas', kind: 'strength', set_count: 1 }),
      )
      renderWorkout()

      await rename('Dominadas')

      expect(await screen.findByRole('alert')).toHaveTextContent('con 1 serie.')
    })

    it('says so when the rename could not be sent', async () => {
      standing()
      api.renameExercise.mockRejectedValue(new Error('offline'))
      renderWorkout()

      await rename('Press banca')

      expect(await screen.findByText(/no se pudo cambiar el nombre/i)).toBeInTheDocument()
    })

    // ── La superficie que no se desmonta ─────────────────────────────────
    // El renombrado se manda también al salir, y por las cuatro puertas la
    // petición sale mientras el panel desaparece: un aviso dentro del panel no
    // llegaba a decir nada. Medido: por el aspa, ni el fallo de red ni el 409
    // decían absolutamente nada, aunque la petición salía y el servidor
    // contestaba 409 puntualmente.
    it('says the collision even when the panel closed on the way out', async () => {
      standing()
      api.renameExercise.mockRejectedValue(
        taken({ id: 3, name: 'Dominadas', kind: 'strength', set_count: 48 }),
      )
      renderWorkout()

      await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
      const field = screen.getByLabelText(/nombre de Bench Press/i)
      await userEvent.clear(field)
      await userEvent.type(field, 'Dominadas')
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Ya tienes «Dominadas»')
      expect(screen.queryByLabelText(/nombre de Bench Press/i)).not.toBeInTheDocument()
    })

    it('says a network failure even when the panel closed on the way out', async () => {
      standing()
      api.renameExercise.mockRejectedValue(new Error('Failed to fetch'))
      renderWorkout()

      await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
      const field = screen.getByLabelText(/nombre de Bench Press/i)
      await userEvent.clear(field)
      await userEvent.type(field, 'Press banca')
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('No se pudo cambiar el nombre.')

      api.renameExercise.mockResolvedValue({ id: 2, name: 'Press banca', muscle_group: 'Pecho' })
      await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }))
      await waitFor(() => expect(cardToggles('Press banca')).toHaveLength(1))
    })

    // La otra salida del choque: el panel vuelve con lo que escribiste todavía
    // dentro, para corregirlo en vez de teclearlo otra vez.
    it('reopens the editor on the draft you typed', async () => {
      standing()
      api.renameExercise.mockRejectedValue(
        taken({ id: 3, name: 'Dominadas', kind: 'strength', set_count: 48 }),
      )
      renderWorkout()

      await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
      const field = screen.getByLabelText(/nombre de Bench Press/i)
      await userEvent.clear(field)
      await userEvent.type(field, 'Dominadas')
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

      await userEvent.click(
        within(await screen.findByRole('alert')).getByRole('button', {
          name: 'Escribir otro nombre',
        }),
      )

      expect(await screen.findByLabelText(/nombre de Bench Press/i)).toHaveValue('Dominadas')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    // Tapping the field and walking away is not a rename, and neither is
    // clearing it: an exercise with no name is a card you cannot find again.
    // Con el guardado colgado de la salida esto pasa a ser la regla que hace
    // inofensivo abrir el editor sin querer: abrir, no tocar nada y cerrar no
    // manda nada.
    it('does not send a blank or unchanged name', async () => {
      standing()
      renderWorkout()

      await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
      await userEvent.click(screen.getByRole('button', { name: /editar ejercicio/i }))
      await userEvent.clear(screen.getByLabelText(/nombre de Bench Press/i))
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

      expect(api.renameExercise).not.toHaveBeenCalled()
    })

    // ── Lo que le pasa a un borrador que dejaste a medias ─────────────────
    // Antes se tiraba, porque no haber pulsado `Guardar nombre` era una
    // respuesta. Sin botón no queda ninguna forma de decir «he escrito esto
    // pero no cuenta», así que salir es confirmar — y las cuatro puertas del
    // panel valen lo mismo, que es lo que impide que el resultado de un gesto
    // dependa de dónde aterrizó el pulgar.
    it('sends what you typed when you close the panel', async () => {
      standing()
      api.renameExercise.mockResolvedValue({ id: 2, name: 'Press banca', muscle_group: 'Pecho' })
      renderWorkout()

      await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
      const field = screen.getByLabelText(/nombre de Bench Press/i)
      await userEvent.clear(field)
      await userEvent.type(field, 'Press banca')
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

      await waitFor(() => expect(api.renameExercise).toHaveBeenCalledWith(2, 'Press banca'))
    })

    // Entrar en el cajón retira el campo del nombre de la pantalla, así que
    // cuenta como dejar de mirarlo.
    it('sends what you typed when you step into the drawer', async () => {
      standing()
      api.renameExercise.mockResolvedValue({ id: 2, name: 'Press banca', muscle_group: 'Pecho' })
      renderWorkout()

      await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))
      const field = screen.getByLabelText(/nombre de Bench Press/i)
      await userEvent.clear(field)
      await userEvent.type(field, 'Press banca')
      await userEvent.click(screen.getByRole('button', { name: /^Grupo, nota y eliminar/ }))

      await waitFor(() => expect(api.renameExercise).toHaveBeenCalledWith(2, 'Press banca'))
    })

    // Intro y después el aspa son dos salidas para un solo acto: mientras el
    // primer envío está en vuelo, el segundo no sale.
    it('does not send the same rename twice while one is in flight', async () => {
      standing()
      let answer
      api.renameExercise.mockImplementation(
        () => new Promise((resolve) => { answer = resolve }),
      )
      renderWorkout()

      await rename('Press banca')
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
      expect(api.renameExercise).toHaveBeenCalledTimes(1)

      await act(async () => {
        answer({ id: 2, name: 'Press banca', muscle_group: 'Pecho' })
      })
    })

    // Y un fallo de red no es una respuesta a lo que preguntaste, así que la
    // siguiente salida vuelve a preguntar. Sin esto —medido en el navegador— un
    // renombrado caído se quedaba sin poder reintentarse hasta cerrar y volver a
    // abrir el panel, que además resiembra el borrador y te borra lo escrito.
    it('lets a failed rename be tried again from the next exit', async () => {
      standing()
      api.renameExercise.mockRejectedValueOnce(new Error('Failed to fetch'))
      api.renameExercise.mockResolvedValue({ id: 2, name: 'Press banca', muscle_group: 'Pecho' })
      renderWorkout()

      await rename('Press banca')
      expect(await screen.findByText(/no se pudo cambiar el nombre/i)).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

      await waitFor(() => expect(api.renameExercise).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(cardToggles('Press banca')).toHaveLength(1))
    })

    // Ya no queda ningún botón de guardar en el panel. La única palabra que
    // sigue siendo suya es `Cerrar`, y esa cierra.
    it('leaves the panel with nothing to press but the way out', async () => {
      standing()
      renderWorkout()

      await userEvent.click(await screen.findByRole('button', { name: /editar ejercicio/i }))

      expect(screen.queryByRole('button', { name: /guardar/i })).not.toBeInTheDocument()
    })
  })

  // Repetir (from Días) hands the session over as a list of names. The cards
  // are already standing when you arrive, each with its previous marks loaded,
  // so a repeat session is taps on steppers rather than five lookups.
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
      expect(cardToggle('Remo')).toBeInTheDocument()
      expect(api.getPreviousMarks).toHaveBeenCalledWith('Dominadas', 1)
      expect(api.getPreviousMarks).toHaveBeenCalledWith('Remo', 1)
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
      const { container } = renderWorkout()

      await screen.findByRole('button', { name: /Curl/i })
      const names = [...container.querySelectorAll('.card-toggle .card-name')].map((el) =>
        el.textContent.trim(),
      )
      expect(names).toEqual(['Remo', 'Dominadas', 'Curl'])
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

      const { container } = renderWorkout()

      await waitFor(() => expect(cardToggles('Sentadilla')).toHaveLength(1))
      const names = [...container.querySelectorAll('.card-toggle .card-name')].map((el) =>
        el.textContent.trim(),
      )
      expect(names).toEqual(['Sentadilla', 'Bench Press'])
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
    it('uno que nunca se guardó se quita con «Eliminar», sin llamar al servidor', async () => {
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
      await userEvent.click(screen.getByRole('button', { name: /^Grupo, nota y eliminar/ }))
      await userEvent.click(screen.getByRole('button', { name: /^eliminar ejercicio$/i }))
      await userEvent.click(screen.getByRole('button', { name: /sí, eliminar/i }))

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
      await userEvent.type(screen.getByLabelText(/reps/i), reps)
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

    it('lets go the moment it is switched off', async () => {
      const release = vi.fn()
      wakelock.holdScreenAwake.mockReturnValue(release)
      renderWorkout()
      await screen.findByLabelText('Ejercicio')

      await userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))
      const toggle = screen.getByRole('group', { name: /pantalla encendida/i })
      await userEvent.click(within(toggle).getByRole('button', { name: 'No' }))

      expect(release).toHaveBeenCalled()
      expect(localStorage.getItem('fitit_screen_awake')).toBe('off')
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
