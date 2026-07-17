import { render, screen } from '@testing-library/react'

import History from './History.jsx'
import * as api from './api.js'

vi.mock('./api.js')

function benchSet(overrides = {}) {
  return {
    id: 10,
    exercise_id: 2,
    exercise_name: 'Bench Press',
    set_index: 0,
    reps: 8,
    weight: 60,
    unit: 'kg',
    ...overrides,
  }
}

describe('History', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('lists past workouts with their sets', async () => {
    api.listWorkouts.mockResolvedValue([
      { id: 2, date: '2026-07-16', name: 'Day B', sets: [benchSet()] },
      { id: 1, date: '2026-07-15', name: 'Day A', sets: [] },
    ])
    render(<History />)

    expect(await screen.findByText('Day B')).toBeInTheDocument()
    expect(screen.getByText('Day A')).toBeInTheDocument()
    expect(screen.getByText(/60 kg x 8/i)).toBeInTheDocument()
  })

  it('shows an empty state when there are no workouts', async () => {
    api.listWorkouts.mockResolvedValue([])
    render(<History />)

    expect(await screen.findByText(/no workouts yet/i)).toBeInTheDocument()
  })
})
