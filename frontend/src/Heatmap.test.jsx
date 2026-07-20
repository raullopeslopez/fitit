import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Heatmap from './Heatmap.jsx'

const day = (date, ...setCounts) => ({
  date,
  workouts: setCounts.map((n) => ({ sets: Array.from({ length: n }, (_, i) => ({ id: i })) })),
})

describe('Heatmap', () => {
  it('shows the current streak as the hero number', () => {
    render(<Heatmap days={[day('2026-07-16', 5), day('2026-07-15', 5)]} endDate="2026-07-16" />)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText(/racha/i)).toBeInTheDocument()
  })

  it("renders a heat cell at the level for the day's set count", () => {
    const { container } = render(<Heatmap days={[day('2026-07-16', 12)]} endDate="2026-07-16" />)
    expect(container.querySelector('.heat-3')).not.toBeNull()
  })

  it('shows a readout when you tap a trained day', async () => {
    render(<Heatmap days={[day('2026-07-16', 12)]} endDate="2026-07-16" />)
    await userEvent.click(screen.getByLabelText(/2026-07-16.*12 series/i))
    expect(await screen.findByText(/· 12 series/i)).toBeInTheDocument()
  })

  it('does not make rest days clickable', () => {
    const { container } = render(<Heatmap days={[day('2026-07-16', 12)]} endDate="2026-07-16" />)
    expect(container.querySelectorAll('button.heat-cell')).toHaveLength(1)
  })
})
