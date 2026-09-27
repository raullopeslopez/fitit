import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Weight from './Weight.jsx'
import { logBodyWeight, weightTrend } from './api.js'

vi.mock('./api.js')

const trend = (kg, weigh_ins, up_to = '2026-09-18', last_kg = null) => ({
  kg,
  weigh_ins,
  up_to,
  last_kg,
})

beforeEach(() => {
  vi.clearAllMocks()
  logBodyWeight.mockResolvedValue({ id: 1, measured_on: '2026-09-21', kg: 78.4 })
})

describe('Peso', () => {
  // La cifra grande es lo que marcó la báscula: tras pesarte, un «—» se leía
  // como que no se había guardado. La tendencia va debajo, en pequeño.
  it('prints the last weigh-in as the figure, even before there is a trend', async () => {
    weightTrend.mockResolvedValue(trend(null, 1, '2026-09-18', 101))
    const { container } = render(<Weight />)
    expect(await screen.findByText('101')).toBeInTheDocument()
    expect(container.querySelector('.weight-stamp').textContent).toBe(
      'ÚLTIMA PESADA · VIE 18 SEP',
    )
    expect(container.querySelector('.weight-trend')).toBeNull()
  })

  it('puts the trend under the figure, with how many weigh-ins hold it', async () => {
    weightTrend.mockResolvedValue(trend(78.6, 3, '2026-09-18', 78.9))
    const { container } = render(<Weight />)
    expect(await screen.findByText('78,9')).toBeInTheDocument()
    expect(container.querySelector('.weight-trend').textContent).toBe(
      'TENDENCIA 78,6 KG · 3 PESADAS',
    )
  })

  // La regla del `NULL`: desconocido se imprime con la misma tinta que una
  // cifra. Pintarlo en `--muted` lo degradaría a decoración.
  it('prints an em dash when you have never weighed, in full ink', async () => {
    weightTrend.mockResolvedValue(trend(null, 0, null))
    render(<Weight />)
    const figure = await screen.findByText('—')
    expect(figure.className).not.toContain('muted')
    expect(screen.getByText(/Todav[ií]a no te has pesado/)).toBeInTheDocument()
  })

  it('saves what you type and shows it', async () => {
    weightTrend.mockResolvedValueOnce(trend(null, 0, null)).mockResolvedValue(trend(78.7, 2, '2026-09-18', 78.9))
    render(<Weight />)
    await screen.findByText('—')

    await userEvent.type(screen.getByLabelText('Peso'), '78,9')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(logBodyWeight).toHaveBeenCalled())
    // La coma decimal es como se escribe aquí; la API habla en punto.
    expect(logBodyWeight.mock.calls[0][0].kg).toBe(78.9)
    expect(await screen.findByText('78,9')).toBeInTheDocument()
  })

  it('does not send a weigh-in that is not a number', async () => {
    weightTrend.mockResolvedValue(trend(null, 0, null))
    render(<Weight />)
    await screen.findByText('—')

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(logBodyWeight).not.toHaveBeenCalled()
  })
})
