import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import PonerEnPlan from './PonerEnPlan.jsx'

const HOY = '2026-09-22'
const PLATO = { id: 42, name: 'Acelgas esparragadas' }

const CON_PLAN = {
  week_start: '2026-09-21',
  has_plan: true,
  entries: [
    {
      id: 7,
      log_date: '2026-09-24',
      slot: 'comida',
      dish_id: 3,
      dish_name: 'Lentejas estofadas',
    },
    {
      id: 8,
      log_date: '2026-09-25',
      slot: 'cena',
      dish_id: 4,
      dish_name: 'Merluza',
    },
  ],
}

const SIN_PLAN = { week_start: '2026-09-21', has_plan: false, entries: [] }

function montar(over = {}) {
  const props = {
    dish: PLATO,
    dayIso: HOY,
    onClose: vi.fn(),
    cargar: vi.fn().mockResolvedValue(CON_PLAN),
    poner: vi.fn().mockResolvedValue({ id: 7 }),
    ...over,
  }
  render(<PonerEnPlan {...props} />)
  return props
}

describe('PonerEnPlan', () => {
  it('se titula con el plato y pide los huecos del día que tiene delante', async () => {
    const { cargar } = montar()
    expect(screen.getByRole('dialog', { name: 'Acelgas esparragadas' })).toBeInTheDocument()
    await screen.findByRole('button', { name: /JUE · Comida/ })
    expect(cargar).toHaveBeenCalledWith(HOY)
  })

  it('ofrece cada hueco con su día, su comida y lo que había', async () => {
    montar()
    const fila = await screen.findByRole('button', { name: /JUE · Comida/ })
    expect(within(fila).getByText('JUE')).toHaveClass('poner-dia')
    expect(within(fila).getByText('Comida')).toHaveClass('poner-slot')
    expect(within(fila).getByText('Lentejas estofadas')).toHaveClass('poner-actual')
    expect(screen.getByRole('button', { name: /VIE · Cena/ })).toBeInTheDocument()
  })

  it('al tocar un hueco pone el plato en él y lo dice', async () => {
    const { poner } = montar()
    await userEvent.click(await screen.findByRole('button', { name: /JUE · Comida/ }))
    expect(poner).toHaveBeenCalledWith(7, 42, HOY)
    expect(await screen.findByText('Puesto el jueves, en la comida.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /VIE · Cena/ })).not.toBeInTheDocument()
  })

  it('sin plan esta semana lo dice, y el plato sigue guardado', async () => {
    montar({ cargar: vi.fn().mockResolvedValue(SIN_PLAN) })
    expect(
      await screen.findByText(
        'Esta semana no tiene plan. El plato queda guardado y el generador lo tendrá en cuenta.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /·/ })).not.toBeInTheDocument()
  })

  it('con plan pero sin huecos por delante, lo dice también', async () => {
    montar({ cargar: vi.fn().mockResolvedValue({ ...CON_PLAN, entries: [] }) })
    expect(
      await screen.findByText('No quedan comidas por delante en el plan de esta semana.'),
    ).toBeInTheDocument()
  })

  it('si el servidor lo rechaza, lo dice y no da por puesto nada', async () => {
    const poner = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { status: 409 }))
    montar({ poner })
    await userEvent.click(await screen.findByRole('button', { name: /JUE · Comida/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se ha podido poner en el plan.')
    expect(screen.queryByText(/^Puesto/)).not.toBeInTheDocument()
  })

  it('se cierra desde Cerrar y desde el fondo', async () => {
    const { onClose } = montar()
    await screen.findByRole('button', { name: /JUE · Comida/ })
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.click(document.querySelector('.sheet-scrim'))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2))
  })
})
