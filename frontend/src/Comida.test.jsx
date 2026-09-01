import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Comida from './Comida.jsx'
import * as api from './api.js'

vi.mock('./api.js')

const PAN = {
  id: 1,
  name: 'Pan de la panadería',
  brand: null,
  kcal_100g: 250,
  protein_100g: 8,
  fat_100g: 3,
  carbs_100g: 48,
  fiber_100g: 2.6,
  portions: [],
  is_mine: true,
}

function day(overrides = {}) {
  return {
    date: '2026-08-31',
    entries: [],
    totals: { kcal: null, protein: null, fat: null, carbs: null, fiber: null },
    unknown: { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
    ...overrides,
  }
}

function entry(overrides = {}) {
  return {
    id: 10,
    logged_at: '2026-08-31T07:00:00Z',
    log_date: '2026-08-31',
    meal_slot: 'desayuno',
    food_id: 1,
    food_name: 'Pan de la panadería',
    grams: 80,
    kcal: 200,
    protein: 6.4,
    fat: 2.4,
    carbs: 38.4,
    fiber: 2.1,
    entry_source: 'manual',
    ...overrides,
  }
}

describe('Comida', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.setSystemTime(new Date(2026, 7, 31, 12, 0))
    api.getFoodDay.mockResolvedValue(day())
    api.searchFoods.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('abre en el día alimentario en curso', async () => {
    render(<Comida />)
    await waitFor(() => expect(api.getFoodDay).toHaveBeenCalledWith('2026-08-31'))
    expect(screen.getByText('LUN 31 AGO')).toBeInTheDocument()
  })

  it('un día vacío lo dice, en vez de enseñar ceros', async () => {
    render(<Comida />)
    expect(await screen.findByText('Aún no has registrado nada.')).toBeInTheDocument()
  })

  it('se mueve al día anterior y vuelve', async () => {
    render(<Comida />)
    await screen.findByText('LUN 31 AGO')
    await userEvent.click(screen.getByRole('button', { name: 'Día anterior' }))
    await waitFor(() => expect(api.getFoodDay).toHaveBeenCalledWith('2026-08-30'))
    await userEvent.click(screen.getByRole('button', { name: 'Día siguiente' }))
    await waitFor(() => expect(api.getFoodDay).toHaveBeenLastCalledWith('2026-08-31'))
  })

  it('no deja adelantarse a un día que todavía no ha pasado', async () => {
    render(<Comida />)
    await screen.findByText('LUN 31 AGO')
    expect(screen.getByRole('button', { name: 'Día siguiente' })).toBeDisabled()
  })

  it('imprime el total y sus macros', async () => {
    api.getFoodDay.mockResolvedValue(
      day({
        entries: [entry()],
        totals: { kcal: 200, protein: 6.4, fat: 2.4, carbs: 38.4, fiber: 2.1 },
      }),
    )
    render(<Comida />)
    expect(await screen.findByText('200')).toBeInTheDocument()
    const macros = screen.getByTestId('food-macros')
    expect(within(macros).getByText('6')).toBeInTheDocument()
    expect(within(macros).getByText('2,1')).toBeInTheDocument()
  })

  it('un total desconocido es una raya, y dice por qué', async () => {
    api.getFoodDay.mockResolvedValue(
      day({
        entries: [entry({ fiber: null })],
        totals: { kcal: 200, protein: 6.4, fat: 2.4, carbs: 38.4, fiber: null },
        unknown: { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 1 },
      }),
    )
    render(<Comida />)
    const macros = await screen.findByTestId('food-macros')
    expect(within(macros).getByText('—')).toBeInTheDocument()
    expect(screen.getByText('— no es cero: 1 entrada sin fibra.')).toBeInTheDocument()
  })

  it('agrupa las entradas por comida, en el orden en que se comen', async () => {
    api.getFoodDay.mockResolvedValue(
      day({
        entries: [
          entry({ id: 1, meal_slot: 'cena', food_name: 'Tortilla' }),
          entry({ id: 2, meal_slot: 'desayuno', food_name: 'Pan' }),
          entry({ id: 3, meal_slot: null, food_name: 'Café' }),
        ],
        totals: { kcal: 600, protein: 20, fat: 10, carbs: 80, fiber: 6 },
      }),
    )
    render(<Comida />)
    await screen.findByText('Tortilla')
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual(['Desayuno', 'Cena', 'Sin asignar'])
  })

  it('cada entrada dice cuánto y cuántas kcal', async () => {
    api.getFoodDay.mockResolvedValue(
      day({ entries: [entry()], totals: { kcal: 200, protein: 6, fat: 2, carbs: 38, fiber: 2 } }),
    )
    render(<Comida />)
    const row = await screen.findByRole('button', { name: /Pan de la panadería/ })
    expect(row).toHaveTextContent('80 g')
    expect(row).toHaveTextContent('200 kcal')
  })

  it('una entrada sin kcal enseña una raya, no un cero', async () => {
    api.getFoodDay.mockResolvedValue(
      day({
        entries: [entry({ kcal: null })],
        unknown: { kcal: 1, protein: 0, fat: 0, carbs: 0, fiber: 0 },
      }),
    )
    render(<Comida />)
    const row = await screen.findByRole('button', { name: /Pan de la panadería/ })
    expect(row).toHaveTextContent('— kcal')
  })

  describe('añadir', () => {
    it('busca y registra en gramos', async () => {
      api.searchFoods.mockResolvedValue([PAN])
      api.logFood.mockResolvedValue(entry())
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir alimento' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'pan')
      await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
      await userEvent.clear(screen.getByLabelText('Gramos'))
      await userEvent.type(screen.getByLabelText('Gramos'), '80')
      await userEvent.click(screen.getByRole('button', { name: 'Añadir' }))
      await waitFor(() =>
        expect(api.logFood).toHaveBeenCalledWith(
          expect.objectContaining({ foodId: 1, grams: 80, portionId: null }),
        ),
      )
    })

    it('una porción se registra sin pesar nada', async () => {
      api.searchFoods.mockResolvedValue([
        { ...PAN, portions: [{ id: 7, label: 'rebanada', grams: 30, is_default: true }] },
      ])
      api.logFood.mockResolvedValue(entry())
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir alimento' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'pan')
      await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
      // La porción por defecto llega ya elegida: registrar "una rebanada" no
      // puede obligarte a pensar en gramos.
      expect(screen.getByRole('button', { name: 'rebanada · 30 g' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await userEvent.click(screen.getByRole('button', { name: 'Añadir' }))
      await waitFor(() =>
        expect(api.logFood).toHaveBeenCalledWith(
          expect.objectContaining({ foodId: 1, portionId: 7, quantity: 1, grams: null }),
        ),
      )
    })

    it('da de alta un alimento que el catálogo no tiene', async () => {
      api.searchFoods.mockResolvedValue([])
      api.createFood.mockResolvedValue({ ...PAN, id: 42, name: 'Piquillos de mi madre' })
      api.logFood.mockResolvedValue(entry())
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir alimento' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'piquillos')
      await userEvent.click(await screen.findByRole('button', { name: 'Crear «piquillos»' }))
      await userEvent.type(screen.getByLabelText('Kcal por 100 g'), '60')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }))
      await waitFor(() =>
        expect(api.createFood).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'piquillos', kcal_100g: 60 }),
        ),
      )
      // Un macro que no has escrito se manda como null, no como 0: nadie lo ha
      // medido, y un 0 diría que lo midió y no hay.
      expect(api.createFood.mock.calls[0][0].protein_100g).toBe(null)
    })

    it('vuelve a leer el día después de registrar', async () => {
      api.searchFoods.mockResolvedValue([PAN])
      api.logFood.mockResolvedValue(entry())
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir alimento' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'pan')
      await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Añadir' }))
      await waitFor(() => expect(api.getFoodDay).toHaveBeenCalledTimes(2))
    })
  })

  describe('corregir una entrada', () => {
    beforeEach(() => {
      api.getFoodDay.mockResolvedValue(
        day({ entries: [entry()], totals: { kcal: 200, protein: 6, fat: 2, carbs: 38, fiber: 2 } }),
      )
    })

    it('tocar la fila la abre para editarla', async () => {
      api.correctFoodEntry.mockResolvedValue(entry({ grams: 120 }))
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
      const field = screen.getByLabelText('Gramos')
      await userEvent.clear(field)
      await userEvent.type(field, '120')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
      await waitFor(() =>
        expect(api.correctFoodEntry).toHaveBeenCalledWith(10, { grams: 120 }),
      )
    })

    it('borra la entrada', async () => {
      api.deleteFoodEntry.mockResolvedValue(null)
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Borrar' }))
      await waitFor(() => expect(api.deleteFoodEntry).toHaveBeenCalledWith(10))
    })
  })
})
