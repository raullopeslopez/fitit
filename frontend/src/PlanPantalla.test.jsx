import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import PlanPantalla, { rangoSemana } from './PlanPantalla.jsx'
import {
  generatePlan,
  getAdherence,
  getPlan,
  getReview,
  getShoppingList,
  getTargetProfile,
  listDishes,
} from './api.js'

vi.mock('./api.js')

// Sábado: la semana en curso empieza el lunes 5 y la que viene el 12.
const HOY = '2026-10-10'
const ESTA = '2026-10-05'
const VIENE = '2026-10-12'

function plan(weekStart, nombre, over = {}) {
  return {
    id: 1,
    week_start: weekStart,
    seed: 3,
    score: 0,
    verdicts: [],
    entries: [
      {
        id: 1,
        log_date: weekStart,
        slot: 'comida',
        dish_id: 7,
        dish_name: nombre,
        grams: [150],
        kcal: 620,
        status: null,
        log_entry_id: null,
        ...over,
      },
    ],
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  getPlan.mockImplementation(async (week) =>
    week === ESTA ? plan(ESTA, 'Pollo con arroz') : null,
  )
  getAdherence.mockResolvedValue(null)
  listDishes.mockResolvedValue([])
  getReview.mockResolvedValue({ due: false })
  getTargetProfile.mockResolvedValue({ objetivo_kcal: 2150 })
  generatePlan.mockResolvedValue(plan(VIENE, 'Merluza'))
  getShoppingList.mockResolvedValue({ week_start: VIENE, aisles: [] })
})

describe('rangoSemana', () => {
  it('dice los dos días con el mes una vez', () => {
    expect(rangoSemana('2026-10-05')).toBe('5 – 11 oct')
  })
  it('con la semana entre dos meses dice los dos', () => {
    expect(rangoSemana('2026-09-28')).toBe('28 sep – 4 oct')
  })
})

describe('la pantalla Plan', () => {
  it('abre en esta semana, con su rango y sus días', async () => {
    render(<PlanPantalla hoy={HOY} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Plan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Esta semana' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('5 – 11 oct')).toBeInTheDocument()
    expect(await screen.findByText('Pollo con arroz')).toBeInTheDocument()
    expect(getPlan).toHaveBeenCalledWith(ESTA)
  })

  it('sin plan esta semana ofrece generarla', async () => {
    getPlan.mockResolvedValue(null)
    render(<PlanPantalla hoy={HOY} />)
    expect(await screen.findByText('Todavía no hay plan para esta semana.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Generar la semana' }))
    await waitFor(() => expect(generatePlan).toHaveBeenCalledWith(ESTA, null))
  })

  it('«La que viene» planifica la semana del lunes siguiente', async () => {
    render(<PlanPantalla hoy={HOY} />)
    await userEvent.click(screen.getByRole('button', { name: 'La que viene' }))
    expect(screen.getByRole('button', { name: 'La que viene' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('12 – 18 oct')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Generar la semana' }))
    await waitFor(() => expect(generatePlan).toHaveBeenCalledWith(VIENE, null))
  })

  it('con la que viene ya generada, enseña su lista de la compra', async () => {
    getPlan.mockImplementation(async (week) => plan(week, week === VIENE ? 'Merluza' : 'Pollo con arroz'))
    render(<PlanPantalla hoy={HOY} inicial="viene" />)
    expect(await screen.findByText('Merluza')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Lista de la compra/ }))
    expect(screen.getByRole('dialog', { name: 'Lista de la compra' })).toBeInTheDocument()
  })

  it('«Tus platos» se abre desde la semana', async () => {
    listDishes.mockResolvedValue([{ id: 7, name: 'Pollo con arroz', slots: ['comida'], ingredients: [] }])
    render(<PlanPantalla hoy={HOY} />)
    await userEvent.click(await screen.findByRole('button', { name: /Tus platos/ }))
    expect(screen.getByRole('dialog', { name: 'Tus platos' })).toBeInTheDocument()
  })

  it('un plan que no llega no deja la pantalla en blanco', async () => {
    getPlan.mockRejectedValue(new Error('red'))
    render(<PlanPantalla hoy={HOY} />)
    expect(await screen.findByText('No se ha podido cargar el plan.')).toBeInTheDocument()
  })
})
