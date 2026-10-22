import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Comida from './Comida.jsx'
import * as api from './api.js'

vi.mock('./api.js')

// Comida simple, fase 1 (lienzo «Comida simple», fila Premium): la comida que
// toca en grande con «Comido», el resto del día en filas con su círculo, los
// siete puntos de los días cuidados y el cierre del día.

const SLOT_KEYS = ['desayuno', 'comida', 'cena', 'snack', null]
const vacio = { kcal: null, protein: null, fat: null, carbs: null, fiber: null }

function day(overrides = {}) {
  return {
    date: '2026-08-31',
    entries: [],
    totals: vacio,
    unknown: { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
    by_slot: SLOT_KEYS.map((slot) => ({ slot, totals: vacio, unknown: {} })),
    label_reading: true,
    ...overrides,
  }
}

function comido(slot, id) {
  return {
    id,
    logged_at: '2026-08-31T07:00:00Z',
    log_date: '2026-08-31',
    meal_slot: slot,
    food_id: 1,
    food_name: 'Batido de proteína de suero',
    grams: 500,
    kcal: 200,
    protein: 40,
    fat: 2,
    carbs: 5,
    fiber: 0,
    entry_source: 'plan',
    dish_id: 70,
  }
}

const PLATOS = {
  desayuno: 'Batido de proteína de suero',
  comida: 'Macarrones con tomate + pavo con calabacín',
  snack: 'Porridge de avena con claras',
  cena: 'Wrap de pollo',
}

function plan(estados = {}, extra = {}) {
  return {
    id: 1,
    week_start: '2026-08-31',
    entries: Object.entries(PLATOS).map(([slot, name], i) => ({
      id: 50 + i,
      log_date: '2026-08-31',
      slot,
      dish_id: 70 + i,
      dish_name: name,
      items: [
        { food_name: 'Uno', grams: 400 },
        { food_name: 'Otro', grams: 262 },
      ],
      kcal: 600,
      protein: 45,
      carbs: 75,
      fat: 15,
      carbs_shift: null,
      status: estados[slot] ?? null,
      log_entry_id: null,
      ...(extra[slot] ?? {}),
    })),
  }
}

describe('Hoy, comida simple', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.setSystemTime(new Date(2026, 7, 31, 12, 0))
    api.getFoodDay.mockResolvedValue(day())
    api.searchFoods.mockResolvedValue([])
    api.frequentFoods.mockResolvedValue([])
    api.usualAmounts.mockResolvedValue([])
    api.listDishes.mockResolvedValue([])
    api.getTargetProfile.mockResolvedValue({})
    api.getTargetProposal.mockResolvedValue({ kcal: null, source: null, days: 0, missing: [] })
    api.getCaredDays.mockResolvedValue({ days: [] })
    api.getPlan.mockResolvedValue(null)
    api.setPlanEntry.mockResolvedValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('la comida que toca sale en grande, con su plato, sus gramos y «Comido»', async () => {
    api.getFoodDay.mockResolvedValue(day({ entries: [comido('desayuno', 10)] }))
    api.getPlan.mockResolvedValue(plan({ desayuno: 'done' }))
    render(<Comida />)
    const ahora = await screen.findByRole('region', { name: 'Lo que toca ahora' })
    expect(within(ahora).getByText('Ahora · Comida')).toBeInTheDocument()
    expect(within(ahora).getByRole('heading', { name: PLATOS.comida })).toBeInTheDocument()
    expect(within(ahora).getByText('662 g')).toBeInTheDocument()
    await userEvent.click(within(ahora).getByRole('button', { name: 'Comido' }))
    expect(api.setPlanEntry).toHaveBeenCalledWith(51, 'done', null, expect.any(String))
  })

  it('el hidrato que el entreno movió a esa comida se dice con una etiqueta', async () => {
    api.getPlan.mockResolvedValue(plan({}, { desayuno: { carbs_shift: 30 } }))
    render(<Comida />)
    const ahora = await screen.findByRole('region', { name: 'Lo que toca ahora' })
    expect(within(ahora).getByText('+ hidrato · has entrenado')).toBeInTheDocument()
  })

  it('«Otra cosa» abre añadir en esa comida', async () => {
    api.getPlan.mockResolvedValue(plan())
    render(<Comida />)
    const ahora = await screen.findByRole('region', { name: 'Lo que toca ahora' })
    await userEvent.click(within(ahora).getByRole('button', { name: 'Otra cosa' }))
    expect(await screen.findByLabelText('Buscar alimento')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Destino: Desayuno' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('la comida que toca no se repite en «Tu día»', async () => {
    api.getPlan.mockResolvedValue(plan())
    render(<Comida />)
    await screen.findByRole('region', { name: 'Lo que toca ahora' })
    const nombres = [...document.querySelectorAll('.hoy-fila-nombre')].map((e) => e.textContent)
    expect(nombres).toEqual(['Comida', 'Cena', 'Snack'])
  })

  it('el resto del día se marca desde su círculo', async () => {
    api.getPlan.mockResolvedValue(plan())
    render(<Comida />)
    await userEvent.click(await screen.findByRole('button', { name: 'Comido: Cena' }))
    expect(api.setPlanEntry).toHaveBeenCalledWith(53, 'done', null, expect.any(String))
  })

  it('una comida dicha lleva su ✓ aunque no traiga entradas', async () => {
    api.getPlan.mockResolvedValue(plan({ desayuno: 'done' }))
    render(<Comida />)
    await screen.findByRole('region', { name: 'Lo que toca ahora' })
    const desayuno = document.querySelector('.food-slot[data-slot="desayuno"]')
    expect(within(desayuno).getByLabelText('Comido')).toHaveTextContent('✓')
  })

  it('con las cuatro dichas, el día se cierra', async () => {
    api.getPlan.mockResolvedValue(plan({ desayuno: 'done', comida: 'done', snack: 'swapped', cena: 'done' }))
    api.getCaredDays.mockResolvedValue({ days: ['2026-08-29', '2026-08-30', '2026-08-31'] })
    render(<Comida />)
    const cierre = await screen.findByRole('region', { name: 'Día cerrado' })
    expect(within(cierre).getByRole('heading', { name: 'Día cuidado' })).toBeInTheDocument()
    await waitFor(() => expect(within(cierre).getByText(/de los últimos 7/)).toHaveTextContent('3 de los últimos 7'))
    expect(screen.queryByRole('region', { name: 'Lo que toca ahora' })).not.toBeInTheDocument()
  })

  it('los siete puntos son los últimos siete días, no la semana', async () => {
    api.getCaredDays.mockResolvedValue({ days: ['2026-08-26', '2026-08-30'] })
    render(<Comida />)
    await waitFor(() => expect(api.getCaredDays).toHaveBeenCalledWith('2026-08-25', '2026-08-31'))
    await waitFor(() =>
      expect(document.querySelector('.hoy-puntos-cuenta')).toHaveTextContent('2 de 7 días cuidados'),
    )
    const domingo = screen.getByRole('button', { name: 'Domingo 30' })
    expect(domingo).toHaveClass('is-cuidado')
    expect(screen.getByRole('button', { name: 'Martes 25' })).toBeInTheDocument()
  })

  it('un punto lleva a su día', async () => {
    render(<Comida />)
    await userEvent.click(await screen.findByRole('button', { name: 'Domingo 30' }))
    await waitFor(() => expect(api.getFoodDay).toHaveBeenCalledWith('2026-08-30'))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ayer')
  })

  it('sin plan esta semana, lo dice y lleva a hacerlo', async () => {
    const onPlan = vi.fn()
    render(<Comida onPlan={onPlan} />)
    expect(await screen.findByText('Esta semana no hay plan')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Hacer el plan/ }))
    expect(onPlan).toHaveBeenCalled()
  })

  it('ya no hay botones flotantes: lo de fuera de las comidas va al pie', async () => {
    api.getPlan.mockResolvedValue(plan())
    render(<Comida />)
    await screen.findByRole('region', { name: 'Lo que toca ahora' })
    expect(screen.queryByRole('button', { name: 'Añadir comida' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dictar comida' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Algo más, fuera de las comidas' }))
    expect(await screen.findByLabelText('Buscar alimento')).toBeInTheDocument()
  })

  it('con plan no hay anillos ni tira del día', async () => {
    api.getPlan.mockResolvedValue(plan())
    render(<Comida />)
    await screen.findByRole('region', { name: 'Lo que toca ahora' })
    expect(screen.queryByTestId('food-macros')).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Hidrato del día/ })).not.toBeInTheDocument()
  })
})
