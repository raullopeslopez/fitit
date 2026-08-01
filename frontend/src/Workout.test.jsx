import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Workout from './Workout.jsx'
import * as api from './api.js'
import * as notify from './notify.js'
import * as wakelock from './wakelock.js'

vi.mock('./api.js')
vi.mock('./notify.js')
vi.mock('./wakelock.js')

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

// The header of each exercise card is its expand/collapse control.
const cardToggle = (name) => screen.getByRole('button', { name: new RegExp(name, 'i') })

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
    // The lock screen is off by default (it needs a permission), so unless a
    // test turns it on these are the quiet answers a browser with a service
    // worker and nothing queued would give.
    notify.notificationState.mockReturnValue('granted')
    notify.claimLockScreenSets.mockResolvedValue({ queued: [], sent: 0 })
    notify.onLockScreenSets.mockReturnValue(() => {})
    notify.startRestNotice.mockResolvedValue({ ok: true, shown: 1 })
    notify.stopRestNotice.mockResolvedValue(true)
    wakelock.holdScreenAwake.mockReturnValue(() => {})
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
      await userEvent.type(screen.getByLabelText(/ejercicio/i), 'Sentadilla')
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
      expect(await foldedDigest(/^3 series hoy · tope 80 kg × 8$/)).toBeInTheDocument()
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
      expect(await foldedDigest(/^2 series hoy · 60 kg × 8$/)).toBeInTheDocument()
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
      expect(await foldedDigest(/^2 series hoy · tope 70 kg × 5$/)).toBeInTheDocument()
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

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
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
    })
    api.logSet.mockResolvedValue(
      workoutWith(benchSet({ id: 20, reps: 5, weight: 70 })), // 70x5 -> 81.7
    )
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
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

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
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

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
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

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Apertura')
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

  it('clears the note and RPE after logging so they are not carried into the next set', async () => {
    // Weight and reps repeat; the per-set qualia do not. A stale "felt strong"
    // or RPE 8 silently riding onto the next set is worse than an empty field.
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Apertura', found: false, sets: [] })
    api.logSet.mockResolvedValue(
      workoutWith(benchSet({ id: 31, exercise_name: 'Apertura', reps: 15, weight: 25 })),
    )
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Apertura')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.type(screen.getByLabelText(/reps/i), '15')
    await userEvent.type(screen.getByLabelText(/peso/i), '25')
    await userEvent.click(screen.getByRole('button', { name: /rpe.*nota/i }))
    await userEvent.type(screen.getByLabelText(/^rpe$/i), '8')
    await userEvent.type(screen.getByLabelText(/^nota$/i), 'felt strong')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    await screen.findByText(/25 kg x 15/i)
    // Logging folds the extras back up, and folded means empty — reopening
    // must not hand you the last set's qualia.
    await userEvent.click(screen.getByRole('button', { name: /rpe.*nota/i }))
    expect(screen.getByLabelText(/^rpe$/i)).toHaveValue('')
    expect(screen.getByLabelText(/^nota$/i)).toHaveValue('')
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

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
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

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
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

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    expect(await screen.findByText(/última vez/i)).toBeInTheDocument()
  })

  it('headers today’s logged sets as "Hoy" so they read apart from the previous marks', async () => {
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

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    expect(await screen.findByText(/^Hoy · \d+ serie/)).toBeInTheDocument()
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
        rpe: null,
        note: null,
      }),
    )
  })

  // The kg/lb toggle is gone, so a set can only be logged in kilos. What used to
  // be two tests of the toggle is now one test that there is nothing to flip.
  it('logs in kilos, with no unit to choose', async () => {
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false, sets: [] })
    api.logSet.mockResolvedValue(workoutWith(benchSet({ weight: 60 })))
    renderWorkout()
    await screen.findByLabelText(/ejercicio/i)

    await userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))
    expect(screen.queryByRole('button', { name: 'lb' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /^unidad$/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))

    await userEvent.type(screen.getByLabelText(/ejercicio/i), 'Bench Press')
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
    await screen.findByLabelText(/ejercicio/i)

    // Name it first: the kind toggle only appears once what you've typed is a
    // name nothing knows yet, which is the only time the choice matters.
    await userEvent.type(screen.getByLabelText(/ejercicio/i), 'Correr')
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
      }),
    )
    expect(await screen.findByRole('listitem')).toHaveTextContent(
      /24:30 · 5\.2 km · 4:43\/km/i,
    )
    // "Última vez" (previous marks, absent here) vs "Hoy" (this session's log)
    // must read as visually distinct sections.
    // Cardio keeps a bare "Hoy" and its own Total: time and distance are real
    // quantities, unlike the tonnage the strength card dropped.
    expect(screen.getByText('Hoy')).toBeInTheDocument()
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
    // No muscle group to colour by, so the header dot is an amber ring instead.
    expect(document.querySelector('.dot-cardio')).toBeInTheDocument()
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
    await userEvent.click(screen.getByRole('button', { name: /rpe.*nota/i }))
    await userEvent.type(screen.getByLabelText(/^rpe$/i), '8')
    await userEvent.type(screen.getByLabelText(/^nota$/i), 'felt strong')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    await waitFor(() =>
      expect(api.logSet).toHaveBeenCalledWith(1, {
        exercise_name: 'Bench Press',
        reps: 8,
        weight: 60,
        rpe: 8,
        note: 'felt strong',
      }),
    )
    expect(await screen.findByText(/RPE 8/i)).toBeInTheDocument()
    expect(screen.getByText(/felt strong/i)).toBeInTheDocument()
  })

  // The record is marked where the record is: on the row, not in a banner that
  // covers the log for a moment and then leaves nothing behind.
  it('marks a real weight record on the set that took it', async () => {
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

    // 80 kg at 3 reps, against 60 kg at 8: more than you had ever moved at
    // three reps or more. No banner — the label rides the row and survives a
    // reload, which the banner never did.
    expect(await screen.findByText(/PR peso/i)).toBeInTheDocument()
    expect(screen.queryByText(/nuevo récord/i)).not.toBeInTheDocument()
  })

  async function logOneSet() {
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false, sets: [] })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet()],
    })
    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
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
    await screen.findByLabelText(/ejercicio/i)
    // Rest lives in the header overflow now, under its "Descanso" label.
    await userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))
    await userEvent.click(screen.getByRole('button', { name: /^sin$/i }))
    await userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))

    await logOneSet()

    await waitFor(() => expect(api.logSet).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /saltar/i })).not.toBeInTheDocument()
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

    await screen.findByLabelText(/ejercicio/i)
    expect(screen.queryByRole('button', { name: /saltar/i })).not.toBeInTheDocument()
  })

  it('flags the record set itself in the log, not just the banner', async () => {
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
      // 60x8 -> 76.0 (ties the prior best, no flag); 80x3 -> 88.0 beats it.
      sets: [benchSet({ id: 20 }), benchSet({ id: 21, reps: 3, weight: 80 })],
    })
    const { container } = renderWorkout()

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
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

    await userEvent.click(await screen.findByRole('button', { name: /^corregir$/i }))
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

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
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

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/peso/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    const row = (await screen.findByText(/60 kg x 8/)).closest('li')
    expect(row).not.toHaveTextContent(/18:04/)
    expect(row).toHaveTextContent(/S1/)
  })

  it('counts the series in the session summary', async () => {
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false, sets: [] })
    api.logSet.mockResolvedValue({
      id: 1,
      date: '2026-07-16',
      name: null,
      sets: [benchSet(), benchSet({ id: 11 }), benchSet({ id: 12 })],
    })
    renderWorkout()

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/peso/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

    expect(await screen.findByText(/3 series/i)).toBeInTheDocument()
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

  // Tonnage was the one figure on the card no decision depended on: you don't
  // change the next set because the sum reads 830. The count you do use stays.
  it('reports the series count and no tonnage', async () => {
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

    // volume would have been 60*8 + 70*5 = 830; best 1RM = max(76.0, 81.7).
    expect(await screen.findByText(/2 series/i)).toBeInTheDocument()
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

      await userEvent.click(screen.getByRole('button', { name: /^corregir$/i }))
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

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
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
      }),
    )
  })

  it('edits RPE and note on a set inline', async () => {
    api.editSet.mockResolvedValue(benchSet({ id: 10, reps: 8, weight: 60, rpe: 9, note: 'tough' }))
    await logBenchSet()

    await userEvent.click(screen.getByRole('button', { name: /editar serie 1/i }))
    await userEvent.type(screen.getByLabelText(/editar rpe/i), '9')
    await userEvent.type(screen.getByLabelText(/editar nota/i), 'tough')
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))

    await waitFor(() =>
      expect(api.editSet).toHaveBeenCalledWith(10, {
        exercise_name: 'Bench Press',
        reps: 8,
        weight: 60,
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
    await screen.findByRole('heading', { name: /Bench Press/i })

    await userEvent.type(screen.getByLabelText(/ejercicio/i), 'Squat')
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

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
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

    await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

    const card = (await screen.findByRole('heading', { name: /Bench Press/ })).closest('.card')
    await userEvent.click(within(card).getByRole('button', { name: /^corregir$/i }))
    expect(card.querySelectorAll('.dot')).toHaveLength(1)
  })

  it('lets me re-label an exercise muscle group from the workout', async () => {
    api.getWorkout.mockResolvedValue(workoutWith(benchSet()))
    api.listExercises.mockResolvedValue([
      { id: 2, name: 'Bench Press', muscle_group: 'Pecho', set_count: 0 },
    ])
    api.setExerciseMuscle.mockResolvedValue({ id: 2, name: 'Bench Press', muscle_group: 'Hombro' })
    renderWorkout()

    // The newest card is open; the editor lives behind Corregir at its foot.
    await userEvent.click(await screen.findByRole('button', { name: /^corregir$/i }))
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

    await userEvent.click(await screen.findByRole('button', { name: /^corregir$/i }))
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
      await userEvent.click(await screen.findByRole('button', { name: /^corregir$/i }))
      return screen.getByLabelText(/grupo muscular de Bench Press/i)
    }

    it('asks first, naming how many logged sets would move', async () => {
      const select = await openCorrector()

      await userEvent.selectOptions(select, 'Hombro')

      const dialog = await screen.findByRole('dialog')
      expect(dialog).toHaveTextContent(/4 series/i)
      expect(dialog).toHaveTextContent(/Hombro/)
      expect(api.setExerciseMuscle).not.toHaveBeenCalled()
    })

    it('applies the change once you confirm', async () => {
      api.setExerciseMuscle.mockResolvedValue({
        id: 2,
        name: 'Bench Press',
        muscle_group: 'Hombro',
        set_count: 4,
      })
      const select = await openCorrector()

      await userEvent.selectOptions(select, 'Hombro')
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: /sí, mover/i }),
      )

      await waitFor(() => expect(api.setExerciseMuscle).toHaveBeenCalledWith(2, 'Hombro'))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('leaves the group untouched when you cancel, select included', async () => {
      const select = await openCorrector()

      await userEvent.selectOptions(select, 'Hombro')
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: /cancelar/i }),
      )

      expect(api.setExerciseMuscle).not.toHaveBeenCalled()
      // The select must snap back: left showing Hombro it would claim a change
      // that never happened.
      expect(select).toHaveValue('Pecho')
    })

    it('does not ask when nothing has been logged against it yet', async () => {
      api.setExerciseMuscle.mockResolvedValue({
        id: 2,
        name: 'Bench Press',
        muscle_group: 'Hombro',
        set_count: 0,
      })
      const select = await openCorrector(tagged({ set_count: 0 }))

      await userEvent.selectOptions(select, 'Hombro')

      await waitFor(() => expect(api.setExerciseMuscle).toHaveBeenCalledWith(2, 'Hombro'))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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

      await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'gemelo')

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

      await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'gemelo')
      await userEvent.click(await screen.findByRole('button', { name: 'Gemelo Máq.' }))

      expect(
        await screen.findByRole('heading', { level: 2, name: /Gemelo Máq\./i }),
      ).toBeInTheDocument()
      // The box holds what you are typing, not what you already found.
      expect(screen.getByLabelText(/ejercicio/i)).toHaveValue('')
    })

    it('does not offer an exercise already standing in this session', async () => {
      someKnown()
      api.getWorkout.mockResolvedValue(
        workoutWith(benchSet({ exercise_name: 'Gemelo Máq.' })),
      )
      renderWorkout()

      await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'gemelo')

      await waitFor(() => expect(api.listExercises).toHaveBeenCalled())
      // The heading is the card that is already up; no suggestion row beside it.
      expect(screen.queryByRole('button', { name: 'Gemelo Máq.' })).not.toBeInTheDocument()
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

    // Without a prior best, prSetIds compares each set against the session's
    // own running peak — so set 2 beating set 1 wore a PR badge while sitting
    // far under the actual record. A wrong record is worse than no record.
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
      await screen.findByLabelText(/ejercicio/i)

      expect(screen.queryByRole('group', { name: /^unidad$/i })).not.toBeInTheDocument()
      expect(
        screen.queryByRole('group', { name: /descanso entre series/i }),
      ).not.toBeInTheDocument()
    })

    it('still reaches rest from the header overflow', async () => {
      renderWorkout()
      await screen.findByLabelText(/ejercicio/i)

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

      await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Press banca')
      expect(screen.queryByRole('group', { name: /fuerza o cardio/i })).not.toBeInTheDocument()
    })

    it('appears for a name nothing knows yet', async () => {
      renderWorkout()

      await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Face Pull')
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

  // RPE and nota are optional, cleared after every log, and untouched in a
  // straight-sets session — but they pushed Registrar two rows down the card.
  describe('RPE and nota', () => {
    it('stay folded until asked for', async () => {
      api.getPreviousMarks.mockResolvedValue({
        exercise_name: 'Bench Press',
        found: false,
        sets: [],
      })
      renderWorkout()

      await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Bench Press')
      await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))

      await screen.findByRole('button', { name: /registrar/i })
      expect(screen.queryByLabelText(/^RPE$/i)).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /rpe.*nota/i }))
      expect(screen.getByLabelText(/^RPE$/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^Nota$/i)).toBeInTheDocument()
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

      expect(await screen.findByRole('button', { name: /Dominadas/i })).toBeInTheDocument()
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

      await screen.findByLabelText(/ejercicio/i)
      expect(screen.queryByRole('button', { name: /Dominadas/i })).not.toBeInTheDocument()
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
      expect(screen.getByText(/hoy · 1 serie/i)).toBeInTheDocument()
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
      expect(screen.getByText(/hoy · 2 series/i)).toBeInTheDocument()

      // The first response knows about one set only.
      pending[0](workoutWith(benchSet({ id: 77, reps: 8, weight: 60 })))

      await waitFor(() => expect(screen.getByText(/hoy · 2 series/i)).toBeInTheDocument())
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

  // Spec: the session reaches the lock screen so a straight set costs one tap on
  // a phone you never take out of your pocket. public/sw.js owns what happens
  // there; these are the two ends of the wire, in the session.
  describe('the session on the lock screen', () => {
    const turnNoticeOn = () => localStorage.setItem('fitit_lock_logging', 'on')

    it('hands the worker the set that +1 serie would repeat', async () => {
      turnNoticeOn()
      renderWorkout()
      await logOneSet()

      await waitFor(() => expect(notify.startRestNotice).toHaveBeenCalled())
      const [rest] = notify.startRestNotice.mock.lastCall
      expect(rest.workoutId).toBe(1)
      // The set itself, not a sentence about it: the worker writes the wording,
      // and it has to rewrite it anyway once you type a different set.
      expect(rest.payload).toMatchObject({ exercise_name: 'Bench Press', reps: 8, weight: 60 })
      expect(rest.series).toBe(1)
      expect(rest.seconds).toBe(90)
      expect(rest.endsAt).toBeGreaterThan(Date.now())
    })

    it('reaches the lock screen even with the rest switched off', async () => {
      // The two are different wants. Tying them meant "Sin descanso" quietly
      // took the pocket away too.
      turnNoticeOn()
      localStorage.setItem('fitit_rest_seconds', '0')
      const { container } = renderWorkout()
      await logOneSet()

      await waitFor(() => expect(notify.startRestNotice).toHaveBeenCalled())
      const [rest] = notify.startRestNotice.mock.lastCall
      expect(rest.endsAt).toBeNull()
      expect(rest.seconds).toBe(0)
      // No countdown anywhere: not on the notification, not on the screen.
      expect(container.querySelector('.rest-bar')).toBeNull()
    })

    it('drops the clock but keeps the remote when the rest is switched off mid-session', async () => {
      turnNoticeOn()
      renderWorkout()
      await logOneSet()
      await screen.findByRole('button', { name: /saltar/i })

      await userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))
      await userEvent.click(screen.getByRole('button', { name: /^sin$/i }))

      const [rest] = notify.startRestNotice.mock.lastCall
      expect(rest.endsAt).toBeNull()
      // The new rest length, not the one this render still remembers — or a
      // tap on +1 would restart the 90 s you just turned off.
      expect(rest.seconds).toBe(0)
      expect(notify.stopRestNotice).not.toHaveBeenCalled()
    })

    // The one feature whose whole output happens where the app cannot see it.
    // Four failures used to look identical from the menu: the worker never
    // woke, the worker threw, Android dropped the notification, or nothing had
    // been handed over yet. One muted line tells them apart.
    describe('saying whether it is actually alive', () => {
      const openMenu = () =>
        userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))

      it('explains that it waits for a set, before any set exists', async () => {
        turnNoticeOn()
        renderWorkout()
        await screen.findByLabelText(/ejercicio/i)

        await openMenu()

        expect(screen.getByText(/se activa al registrar una serie/i)).toBeInTheDocument()
      })

      it('says it is live, and when, once the worker confirms', async () => {
        turnNoticeOn()
        notify.startRestNotice.mockResolvedValue({ ok: true, shown: 1 })
        renderWorkout()
        await logOneSet()
        await waitFor(() => expect(notify.startRestNotice).toHaveBeenCalled())

        await openMenu()

        expect(await screen.findByText(/^Activo · última a las \d{2}:\d{2}$/)).toBeInTheDocument()
      })

      it('names a worker that refused instead of leaving it a mystery', async () => {
        turnNoticeOn()
        notify.startRestNotice.mockResolvedValue({
          ok: false,
          error: 'el service worker no responde',
        })
        renderWorkout()
        await logOneSet()
        await waitFor(() => expect(notify.startRestNotice).toHaveBeenCalled())

        await openMenu()

        expect(
          await screen.findByText(/no se pudo enviar: el service worker no responde/i),
        ).toBeInTheDocument()
      })

      it('separates "Android dropped it" from "the worker failed"', async () => {
        // Everything worked and the platform kept nothing. Completely
        // different problem, completely different fix.
        turnNoticeOn()
        notify.startRestNotice.mockResolvedValue({ ok: true, shown: 0 })
        renderWorkout()
        await logOneSet()
        await waitFor(() => expect(notify.startRestNotice).toHaveBeenCalled())

        await openMenu()

        expect(await screen.findByText(/pero Android no lo muestra/i)).toBeInTheDocument()
      })

      it('says nothing at all while the setting is off', async () => {
        renderWorkout()
        await screen.findByLabelText(/ejercicio/i)

        await openMenu()

        expect(screen.queryByText(/se activa al registrar/i)).not.toBeInTheDocument()
      })
    })

    describe('arriving again when the phone is pocketed', () => {
      const setVisibility = (value) => {
        Object.defineProperty(document, 'visibilityState', { value, configurable: true })
        document.dispatchEvent(new Event('visibilitychange'))
      }
      const pocket = () => setVisibility('hidden')
      const show = () => setVisibility('visible')

      afterEach(() => {
        Object.defineProperty(document, 'visibilityState', {
          value: 'visible',
          configurable: true,
        })
      })

      it('re-announces when the app is hidden, which is the phone going away', async () => {
        // Android draws on a locked screen what arrives while locked. The page
        // being hidden *is* the phone being pocketed, so it beats any timer
        // guessing at how long that takes.
        turnNoticeOn()
        renderWorkout()
        await logOneSet()
        await waitFor(() => expect(notify.startRestNotice).toHaveBeenCalled())

        pocket()

        expect(notify.announceRestNotice).toHaveBeenCalled()
      })

      it('announces once per set, not every time you leave the app', async () => {
        // Hidden also means "switched to WhatsApp", and an arrival has to make
        // a sound to count as one. Announcing on every hide turned a
        // between-sets aid into a banner interrupting whatever else you were
        // doing on the phone.
        turnNoticeOn()
        renderWorkout()
        await logOneSet()
        await waitFor(() => expect(notify.startRestNotice).toHaveBeenCalled())

        pocket()
        show()
        pocket()
        show()
        pocket()

        expect(notify.announceRestNotice).toHaveBeenCalledTimes(1)
      })

      it('earns another arrival by logging another set', async () => {
        turnNoticeOn()
        renderWorkout()
        await logOneSet()
        await waitFor(() => expect(notify.startRestNotice).toHaveBeenCalled())
        pocket()
        show()

        await userEvent.click(screen.getByRole('button', { name: /repetir serie/i }))

        pocket()
        expect(notify.announceRestNotice).toHaveBeenCalledTimes(2)
      })

      it('has nothing to announce before the first set', async () => {
        turnNoticeOn()
        renderWorkout()
        await screen.findByLabelText(/ejercicio/i)

        pocket()

        expect(notify.announceRestNotice).not.toHaveBeenCalled()
      })

      it('stays quiet while the setting is off', async () => {
        renderWorkout()
        await logOneSet()

        pocket()

        expect(notify.announceRestNotice).not.toHaveBeenCalled()
      })
    })

    it('goes up straight away when switched on mid-session', async () => {
      // Against the set you already logged, rather than making you log another
      // one to find out whether it worked.
      notify.notificationState.mockReturnValue('granted')
      renderWorkout()
      await logOneSet()
      expect(notify.startRestNotice).not.toHaveBeenCalled()

      await userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))
      const toggle = screen.getByRole('group', { name: /pantalla bloqueada/i })
      await userEvent.click(within(toggle).getByRole('button', { name: 'Sí' }))

      await waitFor(() => expect(notify.startRestNotice).toHaveBeenCalled())
      expect(notify.startRestNotice.mock.lastCall[0].payload).toMatchObject({
        exercise_name: 'Bench Press',
      })
    })

    it('stays off the lock screen until it is asked for', async () => {
      renderWorkout()
      await logOneSet()

      await screen.findByRole('button', { name: /saltar/i })
      expect(notify.startRestNotice).not.toHaveBeenCalled()
    })

    it('tells the worker what is still unsent, so it does not jump the queue', async () => {
      // set_index is assigned server-side in arrival order: a set logged from
      // the lock screen must not overtake one this page queued earlier.
      turnNoticeOn()
      api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false, sets: [] })
      renderWorkout()
      await userEvent.type(await screen.findByLabelText(/^ejercicio$/i), 'Bench Press')
      await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
      api.logSet.mockRejectedValue(new Error('Failed to fetch'))
      await userEvent.type(await screen.findByLabelText(/reps/i), '8')
      await userEvent.type(screen.getByLabelText(/peso/i), '60')
      await userEvent.click(screen.getByRole('button', { name: /^registrar/i }))

      await waitFor(() => expect(notify.startRestNotice).toHaveBeenCalledTimes(2))
      // Sent twice on purpose: once for the notification to appear on the tap,
      // and again once the outbox has had its chance to drain.
      expect(notify.startRestNotice.mock.lastCall[0].pending).toBe(1)
    })

    it('does not put a repeat button on a cardio interval', async () => {
      // The interval you just ran is not the interval you are about to run.
      turnNoticeOn()
      api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Cinta', found: false, sets: [] })
      api.logSet.mockResolvedValue(workoutWith())
      renderWorkout()
      await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Cinta')
      await userEvent.click(screen.getByRole('button', { name: /^cardio$/i }))
      await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
      await userEvent.type(await screen.findByLabelText(/duración/i), '20:00')
      await userEvent.click(screen.getByRole('button', { name: /registrar/i }))

      await waitFor(() => expect(api.logSet).toHaveBeenCalled())
      expect(notify.startRestNotice).not.toHaveBeenCalled()
    })

    it('keeps the notification alive when the rest simply runs out', async () => {
      // The notification turns into "Descanso terminado" and its +1 serie
      // button is the whole point — taking it away at the moment you are about
      // to use it would be the one wrong thing to do here.
      turnNoticeOn()
      localStorage.setItem('fitit_rest_until', String(Date.now() + 60))
      const { container } = renderWorkout()
      await screen.findByRole('button', { name: /saltar/i })

      await waitFor(() => expect(container.querySelector('.rest-bar')).toBeNull())
      expect(notify.stopRestNotice).not.toHaveBeenCalled()
    })

    it('keeps the remote when the rest is skipped, minus its countdown', async () => {
      // Skipping the rest is not leaving the session, and the button is the
      // reason the notification is there at all.
      turnNoticeOn()
      renderWorkout()
      await logOneSet()

      await userEvent.click(await screen.findByRole('button', { name: /saltar/i }))

      expect(notify.stopRestNotice).not.toHaveBeenCalled()
      expect(notify.startRestNotice.mock.lastCall[0].endsAt).toBeNull()
    })

    it('takes it off the screen when the session is left', async () => {
      turnNoticeOn()
      const view = renderWorkout()
      await logOneSet()
      await screen.findByRole('button', { name: /saltar/i })

      notify.stopRestNotice.mockClear()
      view.unmount()

      // A +1 serie button for a workout you have walked out of would log into
      // the wrong session.
      expect(notify.stopRestNotice).toHaveBeenCalled()
    })

    it('absorbs the sets logged from the lock screen when the app comes back', async () => {
      notify.claimLockScreenSets.mockResolvedValue({
        queued: [
          {
            tmpId: 'sw-1',
            workoutId: 1,
            payload: { exercise_name: 'Bench Press', reps: 8, weight: 60 },
          },
        ],
        sent: 0,
      })
      api.logSet.mockResolvedValue(workoutWith(benchSet()))
      renderWorkout()

      // Sent by the page — which is the only thing allowed to drain, so the
      // session keeps one order — and standing on a card of its own, because a
      // set on disk with no card is a set you cannot see.
      await waitFor(() =>
        expect(api.logSet).toHaveBeenCalledWith(1, {
          exercise_name: 'Bench Press',
          reps: 8,
          weight: 60,
        }),
      )
      expect(await screen.findByText(/60 kg x 8/)).toBeInTheDocument()
    })

    it('follows the rest clock when the set was logged from the shade', async () => {
      // Tapped while the app happened to be awake. Two clocks on one phone
      // disagreeing about the same countdown is worse than either being wrong.
      let announce = null
      notify.onLockScreenSets.mockImplementation((handler) => {
        announce = handler
        return () => {}
      })
      const { container } = renderWorkout()
      await screen.findByLabelText(/ejercicio/i)

      await act(async () => announce({ type: 'sets-logged', endsAt: Date.now() + 90_000 }))

      await screen.findByRole('button', { name: /saltar/i })
      expect(container.querySelector('.rest-num').textContent).toMatch(/^01:[0-3]\d$/)
    })

    it('refetches when the worker already sent sets of its own', async () => {
      notify.claimLockScreenSets.mockResolvedValue({ queued: [], sent: 1 })
      api.getWorkout.mockResolvedValue(workoutWith(benchSet({ reps: 12, weight: 40 })))
      renderWorkout()

      // Nothing to absorb, but the session on screen is a set out of date.
      await waitFor(() => expect(api.getWorkout).toHaveBeenCalledTimes(2))
      expect(await screen.findByText(/40 kg x 12/)).toBeInTheDocument()
    })

    it('asks for the permission from the tap that needs it', async () => {
      notify.notificationState.mockReturnValue('default')
      notify.askForNotifications.mockResolvedValue(true)
      renderWorkout()
      await screen.findByLabelText(/ejercicio/i)

      await userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))
      const notice = screen.getByRole('group', { name: /pantalla bloqueada/i })
      await userEvent.click(within(notice).getByRole('button', { name: 'Sí' }))

      expect(notify.askForNotifications).toHaveBeenCalled()
      await waitFor(() => expect(localStorage.getItem('fitit_lock_logging')).toBe('on'))
    })

    it('offers nothing to tap when the browser has already said no', async () => {
      notify.notificationState.mockReturnValue('denied')
      renderWorkout()
      await screen.findByLabelText(/ejercicio/i)

      await userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))

      expect(screen.queryByRole('group', { name: /pantalla bloqueada/i })).not.toBeInTheDocument()
      expect(screen.getByText(/bloqueado en el navegador/i)).toBeInTheDocument()
    })

    it('says nothing at all where the browser cannot do this', async () => {
      notify.notificationState.mockReturnValue('unsupported')
      renderWorkout()
      await screen.findByLabelText(/ejercicio/i)

      await userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))

      expect(screen.queryByText(/registrar sin abrir/i)).not.toBeInTheDocument()
    })
  })

  describe('the screen staying awake', () => {
    it('holds the screen while the session is open, and lets go on the way out', async () => {
      const release = vi.fn()
      wakelock.holdScreenAwake.mockReturnValue(release)
      const view = renderWorkout()
      await screen.findByLabelText(/ejercicio/i)

      expect(wakelock.holdScreenAwake).toHaveBeenCalled()
      view.unmount()
      expect(release).toHaveBeenCalled()
    })

    it('lets go the moment it is switched off', async () => {
      const release = vi.fn()
      wakelock.holdScreenAwake.mockReturnValue(release)
      renderWorkout()
      await screen.findByLabelText(/ejercicio/i)

      await userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))
      const toggle = screen.getByRole('group', { name: /pantalla encendida/i })
      await userEvent.click(within(toggle).getByRole('button', { name: 'No' }))

      expect(release).toHaveBeenCalled()
      expect(localStorage.getItem('fitit_screen_awake')).toBe('off')
    })

    it('does not take the screen when the session was told not to', async () => {
      localStorage.setItem('fitit_screen_awake', 'off')
      renderWorkout()
      await screen.findByLabelText(/ejercicio/i)

      expect(wakelock.holdScreenAwake).not.toHaveBeenCalled()
    })
  })

  it('deletes the current workout and exits, after confirming', async () => {
    const onExit = vi.fn()
    api.deleteWorkout.mockResolvedValue(null)
    renderWorkout({ onExit })
    await screen.findByLabelText(/ejercicio/i)

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
      await userEvent.type(await screen.findByLabelText(/ejercicio/i), 'Fondos')
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
