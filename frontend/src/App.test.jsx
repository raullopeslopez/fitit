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
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
  })

  it('switches between the log and history views', async () => {
    setToken('tok')
    api.createWorkout.mockResolvedValue({ id: 1, date: '2026-07-16', name: null, sets: [] })
    api.listExercises.mockResolvedValue([])
    api.listWorkouts.mockResolvedValue([
      { id: 1, date: '2026-07-15', name: 'Day A', sets: [] },
    ])
    render(<App />)

    // default: the log view (add-exercise form)
    expect(await screen.findByLabelText(/exercise/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'History' }))
    expect(await screen.findByText('Day A')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Log' }))
    expect(await screen.findByLabelText(/exercise/i)).toBeInTheDocument()
  })
})
