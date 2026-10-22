import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import PlanPantalla from './PlanPantalla.jsx'
import * as api from './api.js'

vi.mock('./api.js')

// Comida simple, fase 5 (lienzo fila 5 · Proponme algo nuevo): cambiar un
// plato es elegir otro tuyo de un toque, o pedir tres nuevos y probar uno.

const HOY = '2026-10-10'
const ESTA = '2026-10-05'

const PLAN = {
  id: 1,
  week_start: ESTA,
  entries: [
    { id: 53, log_date: HOY, slot: 'cena', dish_id: 73, dish_name: 'Wrap de pollo', items: [], kcal: 600, status: null },
  ],
}

const PLATOS = [
  { id: 73, name: 'Wrap de pollo', slots: ['cena'], kind: 'casa', servings: 1, ingredients: [], per_serving: { kcal: 600 } },
  { id: 80, name: 'Tortilla de huevo y claras con pavo', slots: ['cena'], kind: 'casa', servings: 1, ingredients: [], per_serving: { kcal: 420 } },
  { id: 81, name: 'Merluza con patata y ensalada', slots: ['cena'], kind: 'casa', servings: 1, ingredients: [], per_serving: { kcal: 500 } },
]

const NUEVOS = [
  { id: 90, name: 'Salmón al horno con boniato y brócoli', servings: 1, ingredients: [], per_serving: { kcal: 610 } },
  { id: 91, name: 'Revuelto de claras con pavo y espinacas', servings: 1, ingredients: [], per_serving: { kcal: 380 } },
  { id: 92, name: 'Pollo al curry suave con arroz', servings: 1, ingredients: [], per_serving: { kcal: 640 } },
]

beforeEach(() => {
  vi.resetAllMocks()
  api.getPlan.mockImplementation(async (week) => (week === ESTA ? PLAN : null))
  api.listDishes.mockImplementation(async (_q, kind) => (kind === 'fuera' ? [] : PLATOS))
  api.getShoppingList.mockResolvedValue({ week_start: ESTA, aisles: [] })
  api.getTargetProfile.mockResolvedValue({ objetivo_kcal: 2569 })
  api.listDays.mockResolvedValue([])
  api.replanEntry.mockResolvedValue({})
  api.generateDishes.mockResolvedValue({ created: NUEVOS })
})

async function abrirCena() {
  render(<PlanPantalla hoy={HOY} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Cambiar Wrap de pollo' }))
  return screen.findByRole('dialog', { name: 'Cambiar la cena' })
}

describe('Cambiar un plato', () => {
  it('dice qué día y qué comida, y qué hay ahora', async () => {
    const hoja = await abrirCena()
    expect(within(hoja).getByText('Sábado · Cena')).toBeInTheDocument()
    expect(within(hoja).getByText('Ahora: Wrap de pollo')).toBeInTheDocument()
  })

  it('las tuyas se eligen de un toque', async () => {
    const hoja = await abrirCena()
    const tuyas = within(hoja).getByRole('list', { name: 'Tuyas' })
    expect(within(tuyas).queryByText('Wrap de pollo')).not.toBeInTheDocument()
    await userEvent.click(within(tuyas).getByRole('button', { name: /Tortilla de huevo y claras con pavo/ }))
    expect(api.replanEntry).toHaveBeenCalledWith(53, 80, HOY)
  })

  it('«Proponme algo nuevo» trae tres, con su espera, y «Probar» pone uno', async () => {
    let soltar
    api.generateDishes.mockImplementation(
      () =>
        new Promise((r) => {
          soltar = r
        }),
    )
    const hoja = await abrirCena()
    await userEvent.click(within(hoja).getByRole('button', { name: 'Proponme algo nuevo' }))
    expect(api.generateDishes).toHaveBeenCalledWith({ slot: 'cena', n: 3 })
    expect(await within(hoja).findByText('Mirando lo que sueles cenar…')).toBeInTheDocument()
    soltar({ created: NUEVOS })
    const nuevas = await within(hoja).findByRole('list', { name: 'Nuevas para ti' })
    expect(within(nuevas).getAllByRole('button', { name: /^Probar/ })).toHaveLength(3)
    await userEvent.click(within(nuevas).getByRole('button', { name: 'Probar Salmón al horno con boniato y brócoli' }))
    expect(api.replanEntry).toHaveBeenCalledWith(53, 90, HOY)
  })

  it('«Otras tres» vuelve a pedir', async () => {
    const hoja = await abrirCena()
    await userEvent.click(within(hoja).getByRole('button', { name: 'Proponme algo nuevo' }))
    await within(hoja).findByRole('list', { name: 'Nuevas para ti' })
    await userEvent.click(within(hoja).getByRole('button', { name: 'Otras tres' }))
    await waitFor(() => expect(api.generateDishes).toHaveBeenCalledTimes(2))
  })

  it('si no sale nada, dice por qué', async () => {
    api.generateDishes.mockResolvedValue({ created: [], refusal: 'quota', quota_scope: 'day' })
    const hoja = await abrirCena()
    await userEvent.click(within(hoja).getByRole('button', { name: 'Proponme algo nuevo' }))
    expect(await within(hoja).findByText('Se ha agotado la cuota de hoy. Vuelve mañana.')).toBeInTheDocument()
  })

  it('sin «Ideas con» ni «Aquí no» en las nuevas', async () => {
    const hoja = await abrirCena()
    await userEvent.click(within(hoja).getByRole('button', { name: 'Proponme algo nuevo' }))
    await within(hoja).findByRole('list', { name: 'Nuevas para ti' })
    expect(within(hoja).queryByText('Ideas con')).not.toBeInTheDocument()
    expect(within(hoja).queryByRole('button', { name: /Aquí no/ })).not.toBeInTheDocument()
  })
})
