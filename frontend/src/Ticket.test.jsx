import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Ticket from './Ticket.jsx'

const LINEAS = [
  { text: '1000 g pollo', grams: 1000, status: 'chosen', food: { id: 1, name: 'Pollo' }, candidates: [] },
  {
    text: '6000 g leche semidesnatada',
    grams: 6000,
    status: 'ambiguous',
    food: null,
    candidates: [
      { id: 2, name: 'Leche semidesnatada' },
      { id: 3, name: 'Leche entera' },
    ],
  },
  { text: '300 g kombucha', grams: 300, status: 'missing', food: null, candidates: [] },
]

function pintar(over = {}) {
  const props = {
    lineas: LINEAS,
    weekStart: '2026-10-12',
    guardar: vi.fn().mockResolvedValue({ saved: 2, in_list: 21, off_list: 2, missing: ['Merluza'] }),
    onClose: vi.fn(),
    ...over,
  }
  render(<Ticket {...props} />)
  return props
}

describe('el ticket', () => {
  it('enseña lo leído para revisarlo', () => {
    pintar()
    expect(screen.getByRole('dialog', { name: 'Ticket de la compra' })).toBeInTheDocument()
    expect(screen.getByText('Cantidades leídas del ticket: revisa lo dudoso antes de guardar.')).toBeInTheDocument()
    expect(screen.getByText('Pollo')).toBeInTheDocument()
    expect(screen.getByText('¿Cuál? 6000 g leche semidesnatada')).toBeInTheDocument()
    expect(screen.getByText('Falta: 300 g kombucha. No se guarda.')).toBeInTheDocument()
  })

  it('guarda lo revisado con la semana, y dice cómo fue la compra', async () => {
    const props = pintar()
    await userEvent.click(screen.getByRole('button', { name: 'Leche semidesnatada' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(props.guardar).toHaveBeenCalledWith(
        [
          { food_id: 1, grams: 1000 },
          { food_id: 2, grams: 6000 },
        ],
        '2026-10-12',
      ),
    )
    expect(await screen.findByText('21 en tu lista · 2 fuera de lista')).toBeInTheDocument()
    expect(screen.getByText('Falta: Merluza')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Hecho' }))
    expect(props.onClose).toHaveBeenCalled()
  })

  it('sin nada que falte lo dice', async () => {
    pintar({ guardar: vi.fn().mockResolvedValue({ saved: 1, in_list: 1, off_list: 0, missing: [] }) })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('No falta nada de la lista.')).toBeInTheDocument()
  })

  it('sin lista con la que comparar, sólo dice lo guardado', async () => {
    pintar({ guardar: vi.fn().mockResolvedValue({ saved: 1, in_list: null, off_list: null, missing: [] }) })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('1 alimento guardado en casa.')).toBeInTheDocument()
    expect(screen.getByText('Esta semana no tiene lista con la que compararlo.')).toBeInTheDocument()
  })
})
