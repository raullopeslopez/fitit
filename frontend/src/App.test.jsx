import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from './App.jsx'
import * as api from './api.js'
import { setToken } from './auth.js'

vi.mock('./api.js')

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetAllMocks()
    // Entreno asks what is still recovering as soon as it mounts. These specs
    // are about navigation, so the quiet answer is the right one — but it has
    // to be a promise, or the auto-mock hands the effect an undefined.
    api.recentlyTrained.mockResolvedValue([])
  })

  it('shows the login screen when there is no token', () => {
    render(<App />)
    expect(screen.getByLabelText(/usuario/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument()
  })

  it('switches to the register screen and back', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: /crear cuenta/i }))
    expect(screen.getByRole('button', { name: /ya tengo cuenta/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^entrar$/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /ya tengo cuenta/i }))
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument()
  })

  it('opens a workout from the days view and can go back', async () => {
    setToken('tok')
    api.listDays.mockResolvedValue([
      {
        id: 1,
        date: '2026-07-15',
        // The API nests the day's date on each workout too; the seed handed to
        // Entreno needs it to render its header before the fetch lands.
        workouts: [{ id: 4, date: '2026-07-15', name: 'Legs', sets: [] }],
      },
    ])
    api.getWorkout.mockResolvedValue({ id: 4, date: '2026-07-15', name: 'Legs', sets: [] })
    api.listExercises.mockResolvedValue([])
    render(<App />)

    // days view -> open a workout
    await userEvent.click(await screen.findByRole('button', { name: /^Legs/ }))
    expect(await screen.findByLabelText('Ejercicio')).toBeInTheDocument()

    // back to the days view via the bottom nav
    await userEvent.click(screen.getByRole('button', { name: 'Días' }))
    expect(await screen.findByRole('button', { name: /empezar entreno/i })).toBeInTheDocument()
  })

  // Reopening the app between sets used to land on Días — a tap and a fetch
  // away from the set you were about to log. The open workout is the state you
  // were in, so it survives the relaunch.
  it('reopens the workout you were logging', async () => {
    setToken('tok')
    localStorage.setItem('fitit_open_workout', JSON.stringify({ id: 4, at: Date.now() }))
    api.getWorkout.mockResolvedValue({ id: 4, date: '2026-07-15', name: 'Legs', sets: [] })
    api.listExercises.mockResolvedValue([])
    render(<App />)

    expect(await screen.findByLabelText('Ejercicio')).toBeInTheDocument()
    expect(api.getWorkout).toHaveBeenCalledWith(4)
  })

  it('does not reopen a workout you left hours ago', async () => {
    setToken('tok')
    const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000
    localStorage.setItem('fitit_open_workout', JSON.stringify({ id: 4, at: fiveHoursAgo }))
    api.listDays.mockResolvedValue([])
    api.listExercises.mockResolvedValue([])
    render(<App />)

    expect(await screen.findByRole('button', { name: /empezar entreno/i })).toBeInTheDocument()
    expect(api.getWorkout).not.toHaveBeenCalled()
  })

  // The launch screen is for the launch that has to wake the backend, and for
  // no other. On the normal open it must never be seen — not even for a frame.
  it('goes straight into the app when the first request lands fast', async () => {
    setToken('tok')
    api.checkHealth.mockResolvedValue({ status: 'ok' })
    api.listDays.mockResolvedValue([])
    api.listExercises.mockResolvedValue([])
    render(<App />)

    expect(await screen.findByRole('button', { name: /empezar entreno/i })).toBeInTheDocument()
    expect(screen.queryByText('Tu primera sesión')).not.toBeInTheDocument()
  })

  it('puts the waiting screen up once the first request has been out 800 ms', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setToken('tok')
    let wake
    api.checkHealth.mockReturnValue(
      new Promise((resolve) => {
        wake = resolve
      }),
    )
    api.listDays.mockResolvedValue([])
    api.listExercises.mockResolvedValue([])
    render(<App />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700)
    })
    expect(screen.queryByText('Tu primera sesión')).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(screen.getByText('Tu primera sesión')).toBeInTheDocument()

    // …and it gets out of the way the moment the backend answers.
    await act(async () => {
      wake({ status: 'ok' })
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(screen.queryByText('Tu primera sesión')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /empezar entreno/i })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('gives up after a minute and offers the way out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setToken('tok')
    api.checkHealth.mockReturnValue(new Promise(() => {}))
    api.listDays.mockResolvedValue([])
    api.listExercises.mockResolvedValue([])
    render(<App />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })
    expect(screen.getByText('No hemos podido cargar tu sesión')).toBeInTheDocument()

    // Logging on the device is always an option: the app already keeps sets in
    // an outbox, so the way out is the app itself, not a lesser copy of it.
    await act(async () => {
      screen.getByRole('button', { name: /empezar a registrar ya/i }).click()
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(screen.getByRole('button', { name: /empezar entreno/i })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('forgets the open workout once you leave it', async () => {
    setToken('tok')
    api.listDays.mockResolvedValue([
      {
        id: 1,
        date: '2026-07-15',
        // The API nests the day's date on each workout too; the seed handed to
        // Entreno needs it to render its header before the fetch lands.
        workouts: [{ id: 4, date: '2026-07-15', name: 'Legs', sets: [] }],
      },
    ])
    api.getWorkout.mockResolvedValue({ id: 4, date: '2026-07-15', name: 'Legs', sets: [] })
    api.listExercises.mockResolvedValue([])
    const { unmount } = render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: /^Legs/ }))
    await screen.findByLabelText('Ejercicio')
    await userEvent.click(screen.getByRole('button', { name: 'Días' }))
    await screen.findByRole('button', { name: /empezar entreno/i })
    unmount()

    render(<App />)
    expect(await screen.findByRole('button', { name: /empezar entreno/i })).toBeInTheDocument()
  })
})
