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
