import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Progress from './Progress.jsx'
import * as api from './api.js'

vi.mock('./api.js')

describe('Progress', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.listExercises.mockResolvedValue([])
  })

  it('charts an exercise 1RM history', async () => {
    api.getExerciseHistory.mockResolvedValue([
      { date: '2026-07-10', one_rm: 76 },
      { date: '2026-07-12', one_rm: 88 },
    ])
    const { container } = render(<Progress />)

    await userEvent.type(screen.getByLabelText(/ejercicio/i), 'Bench')
    await userEvent.click(screen.getByRole('button', { name: /ver progreso/i }))

    expect(await screen.findByText(/88/)).toBeInTheDocument()
    expect(container.querySelector('svg')).not.toBeNull()
    expect(api.getExerciseHistory).toHaveBeenCalledWith('Bench')
  })

  it('shows an empty state when there is no history', async () => {
    api.getExerciseHistory.mockResolvedValue([])
    render(<Progress />)

    await userEvent.type(screen.getByLabelText(/ejercicio/i), 'Squat')
    await userEvent.click(screen.getByRole('button', { name: /ver progreso/i }))

    expect(await screen.findByText(/aún no hay datos/i)).toBeInTheDocument()
  })
})
