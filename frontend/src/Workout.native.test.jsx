import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Workout from './Workout.jsx'
import * as api from './api.js'
import * as wakelock from './platform/wakelock.js'

// Entreno dentro del APK: la cola la tiene el nativo y la envía él
// (docs/widgets-entreno.md, fase 1). La página encola, pide el envío y pinta lo
// que el nativo le cuenta; nunca llama a logSet. Lo de la web está en
// Workout.test.jsx, que no cambia.
const session = vi.hoisted(() => ({
  enqueue: vi.fn(),
  adopt: vi.fn(),
  drop: vi.fn(),
  dropFor: vi.fn(),
  rename: vi.fn(),
  snapshot: vi.fn(),
  flush: vi.fn(),
  setSession: vi.fn(),
  clearToken: vi.fn(),
  publish: vi.fn(),
  end: vi.fn(),
  skipRest: vi.fn(),
  ensureNotifications: vi.fn(),
  candidates: vi.fn(),
  onChanged: vi.fn(),
}))
vi.mock('./api.js')
vi.mock('./platform/wakelock.js')
vi.mock('./platform/session.js', () => ({ nativeSession: () => true, session }))

const benchSet = (overrides = {}) => ({
  id: 10,
  exercise_id: 2,
  exercise_name: 'Bench Press',
  set_index: 0,
  reps: 8,
  weight: 60,
  rpe: null,
  note: null,
  created_at: '2026-07-16T18:00:00Z',
  ...overrides,
})
const workoutWith = (...sets) => ({ id: 1, date: '2026-07-16', name: null, sets })

describe('Entreno en el APK', () => {
  let changed

  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    api.getWorkout.mockResolvedValue(workoutWith())
    api.listExercises.mockResolvedValue([])
    api.recentlyTrained.mockResolvedValue([])
    api.getPreviousMarks.mockResolvedValue({
      exercise_name: 'Bench Press',
      found: false,
      sets: [],
    })
    wakelock.holdScreenAwake.mockReturnValue(() => {})
    Object.values(session).forEach((fn) => fn.mockResolvedValue({ queue: [] }))
    session.snapshot.mockResolvedValue({ queue: [], rejected: 0 })
    session.onChanged.mockImplementation((listener) => {
      changed = listener
      return () => {}
    })
  })

  async function logBench() {
    render(<Workout workoutId={1} onExit={() => {}} />)
    await userEvent.type(await screen.findByLabelText(/^ejercicio$/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await userEvent.type(await screen.findByLabelText(/reps/i), '8')
    await userEvent.type(screen.getByLabelText(/peso/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /^registrar/i }))
  }

  it('encola la serie en el nativo y le pide que la envíe, sin enviarla ella', async () => {
    await logBench()

    await waitFor(() => expect(session.enqueue).toHaveBeenCalled())
    expect(session.enqueue.mock.calls[0][0].payload).toMatchObject({
      exercise_name: 'Bench Press',
      reps: 8,
      weight: 60,
    })
    await waitFor(() => expect(session.flush).toHaveBeenCalled())
    expect(api.logSet).not.toHaveBeenCalled()
    // En pantalla al momento, pendiente, como en la web.
    expect(await screen.findByText(/60 kg x 8/)).toBeInTheDocument()
    expect(document.querySelector('.set-pending')).toBeInTheDocument()
  })

  it('cuando el nativo la envía, la fila deja de estar pendiente', async () => {
    await logBench()
    await waitFor(() => expect(session.flush).toHaveBeenCalled())

    act(() =>
      changed({ queue: [], sent: 1, rejected: 0, workout: workoutWith(benchSet({ id: 77 })) }),
    )

    await waitFor(() => expect(document.querySelector('.set-pending')).toBeNull())
    // Una sola fila: la del servidor, no también la de la copia.
    expect(screen.getAllByText(/60 kg x 8/)).toHaveLength(1)
  })

  it('una serie rechazada por el servidor se dice, como en la web', async () => {
    render(<Workout workoutId={1} onExit={() => {}} />)
    await waitFor(() => expect(session.onChanged).toHaveBeenCalled())

    act(() => changed({ queue: [], sent: 0, rejected: 1 }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/rechazó una serie/i)
  })

  it('al abrir, avisa de lo que el servidor rechazó con la app cerrada', async () => {
    session.snapshot.mockResolvedValue({ queue: [], rejected: 1 })
    render(<Workout workoutId={1} onExit={() => {}} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/rechazó una serie/i)
  })

  it('el aviso de otro entreno no toca éste', async () => {
    await logBench()
    await waitFor(() => expect(session.flush).toHaveBeenCalled())
    const queued = JSON.parse(localStorage.getItem('fitit_outbox'))

    act(() => changed({ queue: queued, sent: 1, rejected: 0, workout: { id: 99, sets: [] } }))

    expect(document.querySelector('.set-pending')).toBeInTheDocument()
  })
})

// Fase 2: la notificación en curso. Entreno le dice qué enseñar en cada serie de
// fuerza, y sigue lo que se toca en ella. Spec: docs/widgets-entreno.md,
// «Comportamiento».
describe('Entreno y la notificación en curso', () => {
  let changed

  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    localStorage.setItem('fitit_rest_seconds', '90')
    api.getWorkout.mockResolvedValue(workoutWith())
    api.listExercises.mockResolvedValue([{ name: 'Bench Press', muscle_group: 'Pecho' }])
    api.recentlyTrained.mockResolvedValue([])
    api.getPreviousMarks.mockResolvedValue({ exercise_name: 'Bench Press', found: false, sets: [] })
    wakelock.holdScreenAwake.mockReturnValue(() => {})
    Object.values(session).forEach((fn) => fn.mockResolvedValue({ queue: [] }))
    session.snapshot.mockResolvedValue({ queue: [], rejected: 0 })
    session.ensureNotifications.mockResolvedValue({ granted: true })
    session.onChanged.mockImplementation((listener) => {
      changed = listener
      return () => {}
    })
  })

  async function addBench() {
    render(<Workout workoutId={1} onExit={() => {}} />)
    await userEvent.type(await screen.findByLabelText(/^ejercicio$/i), 'Bench Press')
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await screen.findByLabelText(/reps/i)
  }

  async function logBench(weight = '60') {
    await userEvent.clear(screen.getByLabelText(/reps/i))
    await userEvent.type(screen.getByLabelText(/reps/i), '8')
    await userEvent.clear(screen.getByLabelText(/peso/i))
    await userEvent.type(screen.getByLabelText(/peso/i), weight)
    await userEvent.click(screen.getByRole('button', { name: /^registrar/i }))
  }

  it('cada serie de fuerza le dice a la notificación qué enseñar', async () => {
    await addBench()
    const before = Date.now()
    await logBench()

    await waitFor(() => expect(session.publish).toHaveBeenCalled())
    const [control] = session.publish.mock.calls[0]
    expect(control).toMatchObject({
      workoutId: 1,
      exercise: 'Bench Press',
      group: 'Pecho',
      template: { exercise_name: 'Bench Press', reps: 8, weight: 60 },
      count: 1,
      restSeconds: 90,
    })
    expect(control.restEndsAt).toBeGreaterThanOrEqual(before + 90_000)
    expect(control.lastSetAt).toBeGreaterThanOrEqual(before)
  })

  it('la segunda serie cuenta dos', async () => {
    await addBench()
    await logBench()
    await waitFor(() => expect(session.publish).toHaveBeenCalledTimes(1))
    await logBench('65')

    await waitFor(() => expect(session.publish).toHaveBeenCalledTimes(2))
    expect(session.publish.mock.calls[1][0]).toMatchObject({
      count: 2,
      template: { weight: 65 },
    })
  })

  it('pide permiso de notificaciones al registrar la primera serie, y una sola vez', async () => {
    await addBench()
    await logBench()
    await waitFor(() => expect(session.publish).toHaveBeenCalledTimes(1))
    await logBench('65')
    await waitFor(() => expect(session.publish).toHaveBeenCalledTimes(2))

    expect(session.ensureNotifications).toHaveBeenCalledTimes(1)
  })

  it('una serie registrada desde la notificación aparece en la tarjeta', async () => {
    await addBench()

    const fromOutside = {
      tmpId: 'n-1',
      workoutId: 1,
      payload: { exercise_name: 'Bench Press', reps: 8, weight: 60, client_id: 'c-1' },
    }
    act(() => changed({ queue: [fromOutside], control: null }))

    expect(await screen.findByText(/60 kg x 8/)).toBeInTheDocument()
    expect(document.querySelector('.set-pending')).toBeInTheDocument()
  })

  it('un +1 desde la notificación arranca el descanso también en la app', async () => {
    await addBench()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()

    act(() =>
      changed({
        queue: [],
        control: { workoutId: 1, restSeconds: 90, restEndsAt: Date.now() + 90_000 },
      }),
    )

    expect(await screen.findByRole('timer')).toBeInTheDocument()
  })

  it('«Saltar» en la notificación quita el descanso de la app', async () => {
    await addBench()
    await logBench()
    expect(await screen.findByRole('timer')).toBeInTheDocument()

    act(() => changed({ queue: [], control: { workoutId: 1, restSeconds: 90, restEndsAt: 0 } }))

    await waitFor(() => expect(screen.queryByRole('timer')).not.toBeInTheDocument())
  })

  it('saltar el descanso en la app se lo dice a la notificación', async () => {
    await addBench()
    await logBench()
    await userEvent.click(await screen.findByRole('button', { name: /^saltar$/i }))

    expect(session.skipRest).toHaveBeenCalled()
  })

  it('el control de otro entreno no toca el descanso de éste', async () => {
    await addBench()

    act(() =>
      changed({ queue: [], control: { workoutId: 99, restSeconds: 90, restEndsAt: Date.now() + 90_000 } }),
    )

    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('«Terminar entreno» en el menú quita la notificación', async () => {
    render(<Workout workoutId={1} onExit={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: /acciones del entreno/i }))
    await userEvent.click(screen.getByRole('button', { name: /^terminar entreno$/i }))

    expect(session.end).toHaveBeenCalled()
  })

  it('«Terminar entreno» para también el descanso de la app', async () => {
    // Visto en el teléfono (0.6.0): la notificación se iba y el reloj de la
    // pantalla seguía contando.
    await addBench()
    await logBench()
    expect(await screen.findByRole('timer')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /acciones del entreno/i }))
    await userEvent.click(screen.getByRole('button', { name: /^terminar entreno$/i }))

    await waitFor(() => expect(screen.queryByRole('timer')).not.toBeInTheDocument())
  })

  it('terminado desde fuera (widget, dos horas sin series), el descanso se para', async () => {
    await addBench()
    await logBench()
    expect(await screen.findByRole('timer')).toBeInTheDocument()

    act(() => changed({ queue: [], control: null, ended: true }))

    await waitFor(() => expect(screen.queryByRole('timer')).not.toBeInTheDocument())
  })

  it('un envío sin control no toca el descanso (una sesión sólo de cardio no publica control)', async () => {
    await addBench()
    await logBench()
    expect(await screen.findByRole('timer')).toBeInTheDocument()

    act(() => changed({ queue: [], sent: 1, rejected: 0, control: null }))

    expect(screen.getByRole('timer')).toBeInTheDocument()
  })
})

// Fase 5: cambiar de ejercicio desde fuera. La app le da al nativo la lista de
// candidatos (el nativo no tiene red para elegir), y sigue lo que se elija allí.
// Spec: docs/widgets-entreno.md, fase 5.
describe('Entreno y el cambio de ejercicio desde fuera', () => {
  let changed
  const marks = {
    'Bench Press': { exercise_name: 'Bench Press', found: false, sets: [] },
    Remo: { exercise_name: 'Remo', found: true, sets: [{ reps: 10, weight: 40 }] },
    Dominadas: { exercise_name: 'Dominadas', found: true, sets: [{ reps: 8, weight: null }] },
    Sentadilla: { exercise_name: 'Sentadilla', found: false, sets: [] },
  }
  const titles = () =>
    screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.querySelector('.card-name')?.textContent)

  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    localStorage.setItem('fitit_rest_seconds', '90')
    api.getWorkout.mockResolvedValue(workoutWith())
    api.listExercises.mockResolvedValue([])
    api.recentlyTrained.mockResolvedValue([])
    api.getPreviousMarks.mockImplementation(
      async (name) => marks[name] ?? { exercise_name: name, found: false, sets: [] },
    )
    wakelock.holdScreenAwake.mockReturnValue(() => {})
    Object.values(session).forEach((fn) => fn.mockResolvedValue({ queue: [] }))
    session.snapshot.mockResolvedValue({ queue: [], rejected: 0 })
    session.ensureNotifications.mockResolvedValue({ granted: true })
    session.onChanged.mockImplementation((listener) => {
      changed = listener
      return () => {}
    })
  })

  async function add(name) {
    const input = await screen.findByLabelText(/^ejercicio$/i)
    await userEvent.clear(input)
    await userEvent.type(input, name)
    await userEvent.click(screen.getByRole('button', { name: /añadir ejercicio/i }))
    await waitFor(() => expect(titles()).toContain(name))
  }

  // Registra en la tarjeta abierta, que es la de arriba.
  async function logOpenCard(reps, weight) {
    await userEvent.clear(screen.getByLabelText(/reps/i))
    await userEvent.type(screen.getByLabelText(/reps/i), reps)
    await userEvent.clear(screen.getByLabelText(/peso/i))
    if (weight) await userEvent.type(screen.getByLabelText(/peso/i), weight)
    await userEvent.click(screen.getByRole('button', { name: /^registrar/i }))
  }

  it('publica con el control los ejercicios a los que se puede cambiar, con su marca', async () => {
    render(<Workout workoutId={1} onExit={() => {}} />)
    await add('Remo')
    await add('Sentadilla')
    await add('Bench Press')
    await logOpenCard('8', '60')

    await waitFor(() => expect(session.publish).toHaveBeenCalled())
    const [control] = session.publish.mock.calls[0]
    // Primero lo que aún no tiene series, en el orden de la pantalla, y sin el
    // ejercicio en curso. Sin marca no hay plantilla: nada que inventar.
    expect(control.candidates).toEqual([
      { exercise: 'Sentadilla', template: null, count: 0 },
      {
        exercise: 'Remo',
        template: { exercise_name: 'Remo', reps: 10, weight: 40 },
        count: 0,
      },
    ])
  })

  it('los ya hechos en este entreno van detrás, con su última serie y cuántas lleva', async () => {
    render(<Workout workoutId={1} onExit={() => {}} />)
    await add('Remo')
    await logOpenCard('12', '45')
    await waitFor(() => expect(session.publish).toHaveBeenCalledTimes(1))
    await add('Dominadas')
    await add('Bench Press')
    await logOpenCard('8', '60')

    await waitFor(() => expect(session.publish).toHaveBeenCalledTimes(2))
    expect(session.publish.mock.calls[1][0].candidates).toEqual([
      {
        exercise: 'Dominadas',
        template: { exercise_name: 'Dominadas', reps: 8, weight: null },
        count: 0,
      },
      {
        exercise: 'Remo',
        template: { exercise_name: 'Remo', reps: 12, weight: 45 },
        count: 1,
      },
    ])
  })

  it('como mucho cuatro', async () => {
    render(<Workout workoutId={1} onExit={() => {}} />)
    for (const name of ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Bench Press']) await add(name)
    await logOpenCard('8', '60')

    await waitFor(() => expect(session.publish).toHaveBeenCalled())
    expect(session.publish.mock.calls[0][0].candidates.map((c) => c.exercise)).toEqual([
      'Cinco',
      'Cuatro',
      'Tres',
      'Dos',
    ])
  })

  it('al añadir un ejercicio con el control ya en marcha, se lo vuelve a decir al nativo', async () => {
    render(<Workout workoutId={1} onExit={() => {}} />)
    await add('Bench Press')
    await logOpenCard('8', '60')
    await waitFor(() => expect(session.publish).toHaveBeenCalled())

    await add('Remo')

    await waitFor(() =>
      expect(session.candidates).toHaveBeenLastCalledWith(1, [
        {
          exercise: 'Remo',
          template: { exercise_name: 'Remo', reps: 10, weight: 40 },
          count: 0,
        },
      ]),
    )
  })

  it('si fuera se cambia a un ejercicio sin tarjeta, aparece arriba y abierta', async () => {
    render(<Workout workoutId={1} onExit={() => {}} />)
    await add('Bench Press')
    await logOpenCard('8', '60')
    await waitFor(() => expect(session.publish).toHaveBeenCalled())

    act(() =>
      changed({
        queue: [],
        control: { workoutId: 1, exercise: 'Remo', restSeconds: 90, restEndsAt: 0 },
      }),
    )

    await waitFor(() => expect(titles()).toEqual(['Remo', 'Bench Press']))
    const [remo] = screen.getAllByRole('button', { name: /Remo/ })
    expect(remo).toHaveAttribute('aria-expanded', 'true')
    // Y queda apuntada para este entreno, como una añadida a mano: salir de la
    // app antes de su primera serie no la pierde.
    const saved = JSON.parse(localStorage.getItem('fitit_added_exercises'))
    expect(saved.workoutId).toBe(1)
    expect(saved.exercises).toContainEqual({ name: 'Remo', kind: 'strength' })
  })

  it('si fuera se cambia a una tarjeta que ya estaba, sube y se abre', async () => {
    render(<Workout workoutId={1} onExit={() => {}} />)
    await add('Remo')
    await add('Bench Press')
    await logOpenCard('8', '60')
    await waitFor(() => expect(session.publish).toHaveBeenCalled())
    expect(titles()).toEqual(['Bench Press', 'Remo'])

    act(() =>
      changed({
        queue: [],
        control: { workoutId: 1, exercise: 'Remo', restSeconds: 90, restEndsAt: 0 },
      }),
    )

    await waitFor(() => expect(titles()).toEqual(['Remo', 'Bench Press']))
    const [remo] = screen.getAllByRole('button', { name: /Remo/ })
    expect(remo).toHaveAttribute('aria-expanded', 'true')
  })

  it('un +1 desde fuera del mismo ejercicio no mueve nada', async () => {
    render(<Workout workoutId={1} onExit={() => {}} />)
    await add('Bench Press')
    await logOpenCard('8', '60')
    await waitFor(() => expect(session.publish).toHaveBeenCalled())
    await add('Remo')
    expect(titles()).toEqual(['Remo', 'Bench Press'])

    act(() =>
      changed({
        queue: [],
        control: { workoutId: 1, exercise: 'Bench Press', restSeconds: 90, restEndsAt: 0 },
      }),
    )

    expect(titles()).toEqual(['Remo', 'Bench Press'])
  })

  it('el cambio en otro entreno no toca éste', async () => {
    render(<Workout workoutId={1} onExit={() => {}} />)
    await add('Bench Press')

    act(() => changed({ queue: [], control: { workoutId: 99, exercise: 'Remo' } }))

    expect(titles()).toEqual(['Bench Press'])
  })

  it('abierta con «Nuevo…», el campo de añadir ejercicio espera con el foco', async () => {
    render(<Workout workoutId={1} onExit={() => {}} focusAdd={1} />)

    await waitFor(() => expect(screen.getByLabelText(/^ejercicio$/i)).toHaveFocus())
  })
})
