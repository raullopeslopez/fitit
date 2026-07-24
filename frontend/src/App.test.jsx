import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from './App.jsx'
import * as api from './api.js'
import { setToken } from './auth.js'

vi.mock('./api.js')

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetAllMocks()
  })

  it('shows the login screen when there is no token', () => {
    render(<App />)
    expect(screen.getByLabelText(/usuario/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument()
  })

  it('opens a workout from the days view and can go back', async () => {
    setToken('tok')
    api.listDays.mockResolvedValue([
      { id: 1, date: '2026-07-15', workouts: [{ id: 4, name: 'Legs', sets: [] }] },
    ])
    api.getWorkout.mockResolvedValue({ id: 4, date: '2026-07-15', name: 'Legs', sets: [] })
    api.listExercises.mockResolvedValue([])
    render(<App />)

    // days view -> open a workout
    await userEvent.click(await screen.findByRole('button', { name: /Legs/i }))
    expect(await screen.findByLabelText(/ejercicio/i)).toBeInTheDocument()

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

    expect(await screen.findByLabelText(/ejercicio/i)).toBeInTheDocument()
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

  it('forgets the open workout once you leave it', async () => {
    setToken('tok')
    api.listDays.mockResolvedValue([
      { id: 1, date: '2026-07-15', workouts: [{ id: 4, name: 'Legs', sets: [] }] },
    ])
    api.getWorkout.mockResolvedValue({ id: 4, date: '2026-07-15', name: 'Legs', sets: [] })
    api.listExercises.mockResolvedValue([])
    const { unmount } = render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: /Legs/i }))
    await screen.findByLabelText(/ejercicio/i)
    await userEvent.click(screen.getByRole('button', { name: 'Días' }))
    await screen.findByRole('button', { name: /empezar entreno/i })
    unmount()

    render(<App />)
    expect(await screen.findByRole('button', { name: /empezar entreno/i })).toBeInTheDocument()
  })
})
