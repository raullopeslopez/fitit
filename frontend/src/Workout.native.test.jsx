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
  resumeRest: vi.fn(),
  ensureNotifications: vi.fn(),
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

  it('un control sin descanso (saltado en otra pantalla) quita el descanso de la app', async () => {
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

  it('un descanso pausado desde el widget se queda quieto en la app, con «Reanudar»', async () => {
    await addBench()
    await logBench()
    expect(await screen.findByRole('timer')).toBeInTheDocument()

    act(() =>
      changed({
        queue: [],
        control: { workoutId: 1, restSeconds: 90, restEndsAt: 0, restPausedMs: 83_000 },
      }),
    )

    const bar = await screen.findByRole('timer')
    await waitFor(() => expect(bar).toHaveTextContent('En pausa'))
    expect(bar.querySelector('.rest-num')).toHaveTextContent('01:23')
    expect(bar.querySelector('.rest-num')).toHaveClass('rest-num-paused')
    expect(screen.getByRole('button', { name: /^reanudar$/i })).toBeInTheDocument()
    // Sigue pudiéndose saltar.
    expect(screen.getByRole('button', { name: /^saltar$/i })).toBeInTheDocument()
  })

  it('«Reanudar» se lo dice al nativo y la barra vuelve a contar desde lo que quedaba', async () => {
    await addBench()
    act(() =>
      changed({
        queue: [],
        control: { workoutId: 1, restSeconds: 90, restEndsAt: 0, restPausedMs: 83_000 },
      }),
    )
    const before = Date.now()

    await userEvent.click(await screen.findByRole('button', { name: /^reanudar$/i }))

    expect(session.resumeRest).toHaveBeenCalled()
    const bar = screen.getByRole('timer')
    expect(bar).toHaveTextContent('Descanso')
    expect(bar.querySelector('.rest-num')).not.toHaveClass('rest-num-paused')
    expect(screen.queryByRole('button', { name: /^reanudar$/i })).not.toBeInTheDocument()
    expect(Number(localStorage.getItem('fitit_rest_until'))).toBeGreaterThanOrEqual(before + 83_000)
  })

  it('al abrir Entreno con el descanso en pausa, la barra sale en pausa', async () => {
    session.snapshot.mockResolvedValue({
      queue: [],
      rejected: 0,
      control: { workoutId: 1, restSeconds: 90, restEndsAt: 0, restPausedMs: 42_000 },
    })
    render(<Workout workoutId={1} onExit={() => {}} />)

    const bar = await screen.findByRole('timer')
    expect(bar).toHaveTextContent('En pausa')
    expect(bar.querySelector('.rest-num')).toHaveTextContent('00:42')
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

// Fase 6: fuera de la app ya no se cambia de ejercicio (se retiró escribir en la
// notificación). La app no le da al nativo ninguna lista, y un control que llega
// de fuera no mueve las tarjetas. Spec: docs/widgets-entreno.md, fase 6.
describe('Entreno y el ejercicio del control', () => {
  let changed
  const marks = {
    'Bench Press': { exercise_name: 'Bench Press', found: false, sets: [] },
    Remo: { exercise_name: 'Remo', found: true, sets: [{ reps: 10, weight: 40 }] },
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

  it('publica el control sin lista de candidatos', async () => {
    render(<Workout workoutId={1} onExit={() => {}} />)
    await add('Remo')
    await add('Bench Press')
    await logOpenCard('8', '60')

    await waitFor(() => expect(session.publish).toHaveBeenCalled())
    expect(session.publish.mock.calls[0][0]).not.toHaveProperty('candidates')
  })

  it('un control de fuera con otro ejercicio no mueve las tarjetas', async () => {
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

    expect(titles()).toEqual(['Bench Press', 'Remo'])
  })
})
