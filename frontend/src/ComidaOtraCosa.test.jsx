import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Comida from './Comida.jsx'
import * as api from './api.js'

vi.mock('./api.js')

// Comida simple, fase 2: «Otra cosa». Lo que sueles comer en esa comida, tus
// platos de esa comida y el buscador con el micro y la cámara dentro; nada más.

const vacio = { kcal: null, protein: null, fat: null, carbs: null, fiber: null }

function day() {
  return {
    date: '2026-08-31',
    entries: [],
    totals: vacio,
    unknown: { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
    by_slot: ['desayuno', 'comida', 'cena', 'snack', null].map((slot) => ({ slot, totals: vacio, unknown: {} })),
    label_reading: true,
  }
}

const PLAN = {
  id: 1,
  week_start: '2026-08-31',
  entries: [
    {
      id: 53,
      log_date: '2026-08-31',
      slot: 'cena',
      dish_id: 73,
      dish_name: 'Wrap de pollo',
      items: [{ food_name: 'Pollo', grams: 200 }],
      kcal: 600,
      carbs_shift: null,
      status: null,
      log_entry_id: null,
    },
  ],
}

const MOZZARELLA = {
  food_id: 4,
  name: 'Mozzarella',
  brand: null,
  grams: 67,
  kcal: 170,
  meal_slot: 'cena',
  times: 3,
  with_bone: false,
  measure: null,
  measure_count: null,
}

const PLATOS = [
  { id: 80, name: 'Tortilla de huevo y claras con pavo', slots: ['cena'], kind: 'casa', per_serving: { kcal: 420 } },
  { id: 81, name: 'Batido de proteína', slots: ['desayuno'], kind: 'casa', per_serving: { kcal: 200 } },
]

describe('Otra cosa', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.setSystemTime(new Date(2026, 7, 31, 21, 0))
    api.getFoodDay.mockResolvedValue(day())
    api.searchFoods.mockResolvedValue([])
    api.frequentFoods.mockImplementation(async (_limit, slot) => (slot === 'cena' ? [MOZZARELLA] : []))
    api.usualAmounts.mockResolvedValue([])
    api.listDishes.mockResolvedValue(PLATOS)
    api.getTargetProfile.mockResolvedValue({})
    api.getTargetProposal.mockResolvedValue({ kcal: null, source: null, days: 0, missing: [] })
    api.getCaredDays.mockResolvedValue({ days: [] })
    api.getPlan.mockResolvedValue(PLAN)
    api.logFood.mockResolvedValue({})
    api.logDish.mockResolvedValue({})
    api.getFood.mockResolvedValue({
      id: 4,
      name: 'Mozzarella',
      brand: null,
      kcal_100g: 254,
      protein_100g: 18,
      fat_100g: 19,
      carbs_100g: 2,
      fiber_100g: 0,
      portions: [],
      is_mine: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function abrir() {
    render(<Comida />)
    const ahora = await screen.findByRole('region', { name: 'Lo que toca ahora' })
    await userEvent.click(within(ahora).getByRole('button', { name: 'Otra cosa' }))
    return screen.findByRole('dialog', { name: 'Añadir a cena' })
  }

  it('dice qué comida es y en vez de qué', async () => {
    const hoja = await abrir()
    expect(within(hoja).getByText('Cena · otra cosa')).toBeInTheDocument()
    expect(within(hoja).getByText('en vez de Wrap de pollo')).toBeInTheDocument()
  })

  it('lo que sueles comer en esa comida, y un toque lo apunta con tu cantidad', async () => {
    const hoja = await abrir()
    await waitFor(() => expect(api.frequentFoods).toHaveBeenCalledWith(6, 'cena'))
    const lista = within(hoja).getByRole('list', { name: 'Lo que sueles cenar' })
    expect(within(lista).getByText('Mozzarella')).toBeInTheDocument()
    await userEvent.click(within(lista).getByRole('button', { name: 'Apuntar Mozzarella' }))
    expect(api.logFood).toHaveBeenCalledWith(expect.objectContaining({ foodId: 4, grams: 67, mealSlot: 'cena' }))
  })

  it('tocar la cantidad abre la hoja para cambiarla', async () => {
    const hoja = await abrir()
    const lista = await within(hoja).findByRole('list', { name: 'Lo que sueles cenar' })
    await userEvent.click(within(lista).getByRole('button', { name: 'Cambiar cantidad de Mozzarella' }))
    expect(api.getFood).toHaveBeenCalledWith(4)
    expect(await screen.findByRole('dialog', { name: 'Detalle del alimento' })).toBeInTheDocument()
  })

  it('tus platos de esa comida, y sólo esos', async () => {
    const hoja = await abrir()
    const lista = await within(hoja).findByRole('list', { name: 'Tus platos de cena' })
    expect(within(lista).getByText('Tortilla de huevo y claras con pavo')).toBeInTheDocument()
    expect(within(lista).queryByText('Batido de proteína')).not.toBeInTheDocument()
    await userEvent.click(within(lista).getByRole('button', { name: 'Apuntar Tortilla de huevo y claras con pavo' }))
    expect(api.logDish).toHaveBeenCalledWith(80, { servings: 1, meal_slot: 'cena' })
  })

  it('el micro y la cámara van dentro del buscador', async () => {
    const hoja = await abrir()
    const campo = hoja.querySelector('.food-search-field')
    expect(within(campo).getByRole('button', { name: 'Dictar' })).toBeInTheDocument()
    expect(within(campo).getByLabelText('Abrir la cámara')).toBeInTheDocument()
  })

  it('nada más: ni «Comí fuera», ni altas, ni la tarjeta de la foto', async () => {
    const hoja = await abrir()
    expect(within(hoja).queryByRole('button', { name: 'Comí fuera' })).not.toBeInTheDocument()
    expect(within(hoja).queryByRole('button', { name: 'Nuevo plato' })).not.toBeInTheDocument()
    expect(within(hoja).queryByRole('button', { name: 'Alta a mano' })).not.toBeInTheDocument()
    expect(within(hoja).queryByText('Foto del envase')).not.toBeInTheDocument()
  })
})
