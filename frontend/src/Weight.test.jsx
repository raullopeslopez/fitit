import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Weight from './Weight.jsx'
import { logBodyWeight, weightTrend } from './api.js'

vi.mock('./api.js')

const trend = (kg, weigh_ins, up_to = '2026-09-18') => ({ kg, weigh_ins, up_to })

beforeEach(() => {
  vi.clearAllMocks()
  logBodyWeight.mockResolvedValue({ id: 1, measured_on: '2026-09-21', kg: 78.4 })
})

describe('Peso', () => {
  it('prints the trend, not the last weigh-in', async () => {
    weightTrend.mockResolvedValue(trend(78.6, 3))
    render(<Weight />)
    expect(await screen.findByText('78,6')).toBeInTheDocument()
  })

  it('says how many weigh-ins hold the trend up, and when it was measured', async () => {
    weightTrend.mockResolvedValue(trend(78.6, 3, '2026-09-18'))
    const { container } = render(<Weight />)
    await screen.findByText('78,6')
    const stamp = container.querySelector('.weight-stamp').textContent
    expect(stamp).toContain('3 PESADAS')
    expect(stamp).toContain('VIE 18 SEP')
  })

  // La regla del `NULL`: desconocido se imprime con la misma tinta que una
  // cifra. Pintarlo en `--muted` lo degradaría a decoración.
  it('prints an em dash for a trend nobody can compute yet, in full ink', async () => {
    weightTrend.mockResolvedValue(trend(null, 1, '2026-09-18'))
    const { container } = render(<Weight />)
    const figure = await screen.findByText('—')
    expect(figure).toBeInTheDocument()
    expect(figure.className).not.toContain('muted')
  })

  it('names the right failure: one weigh-in is not no weigh-ins', async () => {
    weightTrend.mockResolvedValue(trend(null, 1, '2026-09-18'))
    render(<Weight />)
    expect(await screen.findByText(/Una pesada no es una tendencia/)).toBeInTheDocument()
  })

  it('and says something else when you have never weighed at all', async () => {
    weightTrend.mockResolvedValue(trend(null, 0, null))
    render(<Weight />)
    expect(await screen.findByText(/Todav[ií]a no te has pesado/)).toBeInTheDocument()
  })

  it('saves what you type and refreshes the trend', async () => {
    weightTrend.mockResolvedValueOnce(trend(null, 1)).mockResolvedValue(trend(78.7, 2))
    render(<Weight />)
    await screen.findByText('—')

    await userEvent.type(screen.getByLabelText(/Peso de hoy/), '78,9')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(logBodyWeight).toHaveBeenCalled())
    // La coma decimal es como se escribe aquí; la API habla en punto.
    expect(logBodyWeight.mock.calls[0][0].kg).toBe(78.9)
    expect(await screen.findByText('78,7')).toBeInTheDocument()
  })

  it('does not send a weigh-in that is not a number', async () => {
    weightTrend.mockResolvedValue(trend(null, 0, null))
    render(<Weight />)
    await screen.findByText('—')

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(logBodyWeight).not.toHaveBeenCalled()
  })
})
