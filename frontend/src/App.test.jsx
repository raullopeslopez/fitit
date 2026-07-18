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

    // back to the days view via the nav
    await userEvent.click(screen.getByRole('button', { name: 'Días' }))
    expect(await screen.findByRole('button', { name: /nuevo entreno/i })).toBeInTheDocument()
  })
})
