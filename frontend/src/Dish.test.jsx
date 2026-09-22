import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DishChips, NewDish } from './Dish.jsx'
import { createDish, logDish, searchFoods } from './api.js'

vi.mock('./api.js')

const LENTEJAS = {
  id: 3,
  name: 'Lentejas de mi madre',
  servings: 4,
  basis: 'raw',
  method: null,
  ingredients: [{ id: 1, food_id: 9, food_name: 'Lenteja cocida', grams: 400 }],
  per_serving: { kcal: 229.75, protein: 15, fat: 8, carbs: 30, fiber: null },
  unknown: { fiber: 1 },
}

beforeEach(() => {
  vi.clearAllMocks()
  logDish.mockResolvedValue([{ id: 11 }])
  createDish.mockResolvedValue({ ...LENTEJAS })
  searchFoods.mockResolvedValue([{ id: 9, name: 'Lenteja cocida', kcal_100g: 116 }])
})

describe('DishChips', () => {
  it('offers each dish with what one serving costs', () => {
    render(<DishChips dishes={[LENTEJAS]} onLogged={() => {}} />)
    const chip = screen.getByRole('button', { name: /Lentejas de mi madre/ })
    expect(chip).toHaveTextContent('1 ración')
    expect(chip).toHaveTextContent('230')
  })

  it('logs one serving into the meal it was opened from', async () => {
    const onLogged = vi.fn()
    render(<DishChips dishes={[LENTEJAS]} slot="comida" onLogged={onLogged} />)
    await userEvent.click(screen.getByRole('button', { name: /Lentejas de mi madre/ }))
    await waitFor(() => expect(logDish).toHaveBeenCalledWith(3, { servings: 1, meal_slot: 'comida' }))
    await waitFor(() => expect(onLogged).toHaveBeenCalled())
  })

  // Un plato al que le falta un nutriente no puede decir una cifra redonda de
  // ese nutriente: es la regla del `NULL`, en el sitio donde más tienta.
  it('prints a dash, not a zero, for what nobody measured', () => {
    render(<DishChips dishes={[{ ...LENTEJAS, per_serving: { ...LENTEJAS.per_serving, kcal: null } }]} onLogged={() => {}} />)
    expect(screen.getByRole('button', { name: /Lentejas de mi madre/ })).toHaveTextContent('—')
  })

  it('says nothing at all when there are no dishes yet', () => {
    const { container } = render(<DishChips dishes={[]} onLogged={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('NewDish', () => {
  it('will not save a dish with no ingredients', async () => {
    render(<NewDish onCreated={() => {}} onCancel={() => {}} />)
    await userEvent.type(screen.getByLabelText('Nombre'), 'Lentejas de mi madre')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar plato' }))
    expect(createDish).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(/ingrediente/i)
  })

  it('builds a dish from searched foods and saves it', async () => {
    const onCreated = vi.fn()
    render(<NewDish onCreated={onCreated} onCancel={() => {}} />)

    await userEvent.type(screen.getByLabelText('Nombre'), 'Lentejas de mi madre')
    await userEvent.clear(screen.getByLabelText('Raciones'))
    await userEvent.type(screen.getByLabelText('Raciones'), '4')

    await userEvent.type(screen.getByLabelText('Añadir ingrediente'), 'lenteja')
    const hit = await screen.findByRole('button', { name: /Lenteja cocida/ })
    await userEvent.click(hit)

    const row = screen.getByRole('listitem')
    await userEvent.clear(within(row).getByLabelText(/gramos/i))
    await userEvent.type(within(row).getByLabelText(/gramos/i), '400')

    await userEvent.click(screen.getByRole('button', { name: 'Guardar plato' }))
    await waitFor(() => expect(createDish).toHaveBeenCalled())
    expect(createDish.mock.calls[0][0]).toMatchObject({
      name: 'Lentejas de mi madre',
      servings: 4,
      ingredients: [{ food_id: 9, grams: 400 }],
    })
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
  })

  it('asks how it is weighed, because raw and cooked are not the same weight', async () => {
    render(<NewDish onCreated={() => {}} onCancel={() => {}} />)
    const basis = screen.getByLabelText('Cómo lo peso')
    expect(basis).toHaveValue('raw')
    await userEvent.selectOptions(basis, 'cooked')
    expect(basis).toHaveValue('cooked')
  })
})
