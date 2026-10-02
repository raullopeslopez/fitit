import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Weight from './Weight.jsx'
import { listBodyWeights, logBodyWeight, weightTrend } from './api.js'

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
  listBodyWeights.mockResolvedValue([])
})

describe('Peso', () => {
  // La cifra grande es lo que marcó la báscula: tras pesarte, un «—» se leía
  // como que no se había guardado. La tendencia va al lado, en cifras.
  it('prints the last weigh-in as the figure, even before there is a trend', async () => {
    weightTrend.mockResolvedValue(trend(null, 1, '2026-09-18', 101))
    const { container } = render(<Weight />)
    expect(await screen.findByText('101')).toBeInTheDocument()
    expect(container.querySelector('.weight-last').textContent).toBe('Última · vie 18 sep')
    expect(container.querySelector('.weight-trend')).toBeNull()
  })

  it('puts the trend beside the figure, with how many weigh-ins hold it', async () => {
    weightTrend.mockResolvedValue(trend(78.6, 3, '2026-09-18', 78.9))
    const { container } = render(<Weight />)
    expect(await screen.findByText('78,9')).toBeInTheDocument()
    expect(container.querySelector('.weight-trend').textContent).toBe(
      'Tendencia 78,6 kg · 3 pesadas',
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

  it('no longer carries an inline field: weighing in is the floating button', async () => {
    weightTrend.mockResolvedValue(trend(null, 0, null))
    render(<Weight />)
    await screen.findByText('—')

    expect(screen.queryByLabelText(/^Peso/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pesarme/ })).toBeInTheDocument()
  })

  describe('la curva', () => {
    // Del más antiguo al más reciente, con la última como punto.
    it('draws the weigh-ins oldest to newest, the last one as a dot', async () => {
      weightTrend.mockResolvedValue(trend(78.6, 3, '2026-09-18', 78.9))
      // La API las devuelve de la más reciente a la más antigua.
      listBodyWeights.mockResolvedValue([
        { id: 3, measured_on: '2026-09-18', kg: 78 },
        { id: 2, measured_on: '2026-09-11', kg: 79 },
        { id: 1, measured_on: '2026-09-04', kg: 80 },
      ])
      const { container } = render(<Weight />)

      const line = await waitFor(() => {
        const el = container.querySelector('.weight-spark-line')
        expect(el).not.toBeNull()
        return el
      })
      const ys = line
        .getAttribute('points')
        .split(' ')
        .map((p) => Number(p.split(',')[1]))
      // 80 → 79 → 78: baja, y en un SVG bajar es un `y` mayor.
      expect(ys[0]).toBeLessThan(ys[1])
      expect(ys[1]).toBeLessThan(ys[2])
      const dot = container.querySelector('.weight-spark-dot')
      expect(Number(dot.getAttribute('cy'))).toBeCloseTo(ys[2], 1)
    })

    it('draws nothing with fewer than two weigh-ins', async () => {
      weightTrend.mockResolvedValue(trend(null, 1, '2026-09-18', 101))
      listBodyWeights.mockResolvedValue([{ id: 1, measured_on: '2026-09-18', kg: 101 }])
      const { container } = render(<Weight />)
      await screen.findByText('101')

      expect(container.querySelector('.weight-spark')).toBeNull()
    })

    // El texto de un SVG toma su tamaño de la hoja, donde `typeScale.test.js`
    // puede verlo.
    it('sets no font size on the SVG', async () => {
      weightTrend.mockResolvedValue(trend(78.6, 2, '2026-09-18', 78.9))
      listBodyWeights.mockResolvedValue([
        { id: 2, measured_on: '2026-09-18', kg: 78 },
        { id: 1, measured_on: '2026-09-11', kg: 79 },
      ])
      const { container } = render(<Weight />)
      await waitFor(() => expect(container.querySelector('.weight-spark')).not.toBeNull())

      expect(container.querySelector('[fontSize], [font-size]')).toBeNull()
    })
  })

  describe('Pesarme', () => {
    it('opens «Apuntar pesada», saves what you type and shows it', async () => {
      weightTrend
        .mockResolvedValueOnce(trend(null, 0, null))
        .mockResolvedValue(trend(78.7, 2, '2026-09-18', 78.9))
      const onSaved = vi.fn()
      render(<Weight onSaved={onSaved} />)
      await screen.findByText('—')

      await userEvent.click(screen.getByRole('button', { name: /Pesarme/ }))
      const hoja = await screen.findByRole('dialog', { name: 'Apuntar pesada' })
      await userEvent.type(within(hoja).getByLabelText('Peso (kg)'), '78,9')
      await userEvent.click(within(hoja).getByRole('button', { name: 'Guardar' }))

      await waitFor(() => expect(logBodyWeight).toHaveBeenCalled())
      // La coma decimal es como se escribe aquí; la API habla en punto.
      expect(logBodyWeight.mock.calls[0][0].kg).toBe(78.9)
      expect(await screen.findByText('78,9')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await waitFor(() => expect(onSaved).toHaveBeenCalled())
    })

    it('does not send a weigh-in that is not a number, and says so', async () => {
      weightTrend.mockResolvedValue(trend(null, 0, null))
      render(<Weight />)
      await screen.findByText('—')

      await userEvent.click(screen.getByRole('button', { name: /Pesarme/ }))
      await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }))

      expect(logBodyWeight).not.toHaveBeenCalled()
      expect(await screen.findByText('Escribe el peso, por ejemplo 78,4.')).toBeInTheDocument()
    })

    it('«Cancelar» closes the sheet without saving', async () => {
      weightTrend.mockResolvedValue(trend(null, 0, null))
      render(<Weight />)
      await screen.findByText('—')

      await userEvent.click(screen.getByRole('button', { name: /Pesarme/ }))
      await userEvent.type(await screen.findByLabelText('Peso (kg)'), '80')
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(logBodyWeight).not.toHaveBeenCalled()
    })
  })
})
