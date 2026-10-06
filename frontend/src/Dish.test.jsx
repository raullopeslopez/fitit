import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DishChips, NewDish, ProposeDishes } from './Dish.jsx'
import { createDish, generateDishes, logDish, searchFoods } from './api.js'

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

describe('ProposeDishes', () => {
  it('asks for dishes and says how many arrived', async () => {
    generateDishes.mockResolvedValue({
      created: [LENTEJAS, { ...LENTEJAS, id: 4, name: 'Pechuga a la air fryer' }],
      suggestions: [],
    })
    const onCreated = vi.fn()
    render(<ProposeDishes onCreated={onCreated} />)

    await userEvent.click(screen.getByRole('button', { name: 'Proponme platos' }))
    expect(await screen.findByText(/2 platos nuevos/)).toBeInTheDocument()
    expect(screen.getByText('Pechuga a la air fryer')).toBeInTheDocument()
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
  })

  // «Un resultado vacío tiene que nombrar el fallo correcto»: esperar un minuto
  // y esperar a mañana no se le dicen igual a nadie.
  it('tells the day quota apart from the minute one', async () => {
    generateDishes.mockResolvedValue({ created: [], suggestions: [], refusal: 'quota', quota_scope: 'day' })
    render(<ProposeDishes onCreated={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Proponme platos' }))
    expect(await screen.findByText(/mañana/i)).toBeInTheDocument()
  })

  it('and sends you to log something when the pantry is empty', async () => {
    generateDishes.mockResolvedValue({ created: [], suggestions: [], refusal: 'empty_pantry' })
    render(<ProposeDishes onCreated={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Proponme platos' }))
    expect(await screen.findByText(/no has registrado nada/i)).toBeInTheDocument()
  })

  it('shows what a suggestion is missing instead of saving it half-done', async () => {
    generateDishes.mockResolvedValue({
      created: [],
      suggestions: [
        { name: 'Tofu salteado', basis: 'raw', servings: 1, ingredients: [], missing: ['Tofu ahumado'] },
      ],
    })
    render(<ProposeDishes onCreated={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Proponme platos' }))
    expect(await screen.findByText('Tofu salteado')).toBeInTheDocument()
    expect(screen.getByText(/Tofu ahumado/)).toBeInTheDocument()
  })

  // El modelo propone; la aritmética tumba. Lo que tumba se enseña con su
  // cifra, para que el descarte se entienda y no parezca que el modelo falló.
  it('dice qué descartó por poca proteína, con cuánto daba y cuánto hacía falta', async () => {
    generateDishes.mockResolvedValue({
      created: [],
      suggestions: [],
      discarded: [
        { name: 'Pasta al pesto', protein: 18, floor: 40.4 },
        { name: 'Pechuga sin medir', protein: null, floor: 40.4 },
      ],
    })
    render(<ProposeDishes onCreated={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Proponme platos' }))
    expect(await screen.findByText('Descartados por poca proteína')).toBeInTheDocument()
    expect(screen.getByText('Pasta al pesto')).toBeInTheDocument()
    expect(screen.getByText('18 P · mínimo 40')).toBeInTheDocument()
    expect(screen.getByText('proteína sin medir · mínimo 40')).toBeInTheDocument()
    // Hubo respuesta: no es el «no ha salido nada» de cuando no hay ninguna.
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

