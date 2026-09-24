import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { IdeaDraft, motivoBloqueo } from './IdeaDraft.jsx'
import { createDish, getPlanAhead, ideaDraft, previewDish, replanEntry, searchFoods } from './api.js'

vi.mock('./api.js')

const IDEA = {
  id: 3,
  name: 'Acelgas a la crema con huevo al horno',
  url: 'https://okdiario.com/recetas/acelgas-crema',
}

const line = (over) => ({
  text: '500 gr de acelgas',
  quantity: 500,
  unit: 'g',
  recipe_grams: 500,
  grams: null,
  status: 'chosen',
  food: { id: 1, name: 'Acelga, cruda' },
  candidates: [{ id: 1, name: 'Acelga, cruda' }],
  ...over,
})

// Lo que devuelve okdiario: sin raciones, con una línea de cada clase.
const LINES = (grams = null) => [
  line({ grams }),
  line({
    text: '300 g de patatas',
    quantity: 300,
    recipe_grams: 300,
    grams: grams == null ? null : 300 / (500 / grams),
    status: 'ambiguous',
    food: null,
    candidates: [
      { id: 2, name: 'Patata, cruda' },
      { id: 3, name: 'Patata, cocida (alimento medio)' },
    ],
  }),
  line({
    text: '2 huevos',
    quantity: 2,
    unit: null,
    recipe_grams: null,
    grams: null,
    food: { id: 4, name: 'Huevo, crudo' },
    candidates: [{ id: 4, name: 'Huevo, crudo' }],
  }),
  line({
    text: '2 cucharadas de tahini',
    quantity: 2,
    unit: 'cucharada',
    recipe_grams: null,
    grams: null,
    status: 'missing',
    food: null,
    candidates: [],
  }),
]

const draft = (over = {}) => ({
  idea_id: IDEA.id,
  name: IDEA.name,
  url: IDEA.url,
  method: 'horno',
  servings: null,
  servings_published: false,
  lines: LINES(),
  refusal: null,
  dish_id: null,
  ...over,
})

const save = () => screen.getByRole('button', { name: 'Guardar en mis platos' })
const status = () => screen.getByRole('status')
const grams = (name) => screen.getByLabelText(`Gramos por ración de ${name}`)

beforeEach(() => {
  vi.resetAllMocks()
  searchFoods.mockResolvedValue([])
})

describe('IdeaDraft', () => {
  it('trae las líneas de la receta tal cual: elegida, «¿Cuál?», sin gramos y «Falta»', async () => {
    ideaDraft.mockResolvedValue(draft())
    render(<IdeaDraft idea={IDEA} onSaved={() => {}} onCancel={() => {}} />)

    expect(await screen.findByText('Acelga, cruda')).toBeInTheDocument()
    expect(screen.getByText('500 gr de acelgas')).toBeInTheDocument()
    expect(screen.getByText('¿Cuál?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Patata, cruda' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByText('Huevo, crudo')).toBeInTheDocument()
    expect(screen.getByText('Falta: 2 cucharadas de tahini')).toBeInTheDocument()
    // NULL no es 0: el campo sin gramos pinta `—`, no «0».
    expect(grams('Huevo, crudo')).toHaveValue('')
    expect(grams('Huevo, crudo')).toHaveAttribute('placeholder', '—')
    expect(screen.getByRole('link', { name: 'Ver receta original ↗' })).toHaveAttribute(
      'href',
      IDEA.url,
    )
  })

  it('sin raciones publicadas pregunta, vacío, y no deja guardar', async () => {
    ideaDraft.mockResolvedValue(draft())
    render(<IdeaDraft idea={IDEA} onSaved={() => {}} onCancel={() => {}} />)
    const raciones = await screen.findByLabelText('¿Para cuántas raciones es?')
    expect(raciones).toHaveValue('')
    expect(screen.getByText(/La receta no lo dice/)).toBeInTheDocument()
    expect(save()).toBeDisabled()
    expect(status()).toHaveTextContent('Dime para cuántas raciones es.')
  })

  it('con raciones publicadas las trae puestas', async () => {
    ideaDraft.mockResolvedValue(draft({ servings: 4, servings_published: true, lines: LINES(125) }))
    render(<IdeaDraft idea={IDEA} onSaved={() => {}} onCancel={() => {}} />)
    expect(await screen.findByLabelText('¿Para cuántas raciones es?')).toHaveValue('4')
    expect(screen.getByText(/Lo dice la receta/)).toBeInTheDocument()
    expect(grams('Acelga, cruda')).toHaveValue('125')
  })

  it('decir las raciones pide al servidor los gramos, y no pisa lo que tecleaste', async () => {
    ideaDraft.mockImplementation(async (_id, { servings } = {}) =>
      servings ? draft({ servings, lines: LINES(250) }) : draft(),
    )
    render(<IdeaDraft idea={IDEA} onSaved={() => {}} onCancel={() => {}} />)
    await userEvent.type(await screen.findByLabelText('Gramos por ración de Huevo, crudo'), '60')
    await userEvent.type(screen.getByLabelText('¿Para cuántas raciones es?'), '2')

    await waitFor(() => expect(grams('Acelga, cruda')).toHaveValue('250'))
    expect(ideaDraft).toHaveBeenLastCalledWith(IDEA.id, { servings: 2 })
    expect(grams('Huevo, crudo')).toHaveValue('60')
  })

  it('dice lo que falta, en orden, hasta que se puede guardar; y guarda por POST /dishes', async () => {
    ideaDraft.mockImplementation(async (_id, { servings } = {}) =>
      servings ? draft({ servings, lines: LINES(250) }) : draft(),
    )
    previewDish.mockResolvedValue({ per_serving: { kcal: 123.4, protein: 9, carbs: null, fat: 3 } })
    createDish.mockResolvedValue({ id: 42, name: IDEA.name })
    const onSaved = vi.fn()
    render(<IdeaDraft idea={IDEA} onSaved={onSaved} onCancel={() => {}} />)

    await userEvent.type(await screen.findByLabelText('¿Para cuántas raciones es?'), '2')
    await waitFor(() => expect(grams('Acelga, cruda')).toHaveValue('250'))
    expect(status()).toHaveTextContent(
      '«2 cucharadas de tahini» no está en tus alimentos: quítala para guardar.',
    )
    // Mientras falta algo no hay cifra: una suma incompleta es otra cifra.
    expect(previewDish).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Quitar 2 cucharadas de tahini' }))
    expect(status()).toHaveTextContent('Elige cuál es «300 g de patatas».')

    await userEvent.click(screen.getByRole('button', { name: 'Patata, cruda' }))
    expect(screen.getByRole('button', { name: 'Patata, cruda' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(status()).toHaveTextContent('Faltan los gramos de Huevo, crudo.')
    expect(save()).toBeDisabled()

    await userEvent.type(grams('Huevo, crudo'), '60')
    expect(save()).toBeEnabled()
    expect(status()).toHaveTextContent('')

    // Las macros las calcula el servidor, con los gramos de una ración.
    await waitFor(() =>
      expect(previewDish).toHaveBeenCalledWith({
        servings: 1,
        ingredients: [
          { food_id: 1, grams: 250 },
          { food_id: 2, grams: 150 },
          { food_id: 4, grams: 60 },
        ],
      }),
    )
    const macros = screen.getByLabelText('Por ración')
    expect(await within(macros).findByText('123')).toBeInTheDocument()
    // Sin hidratos medidos: `—`, no 0.
    expect(within(macros).getByText('—')).toBeInTheDocument()

    await userEvent.click(save())
    expect(createDish).toHaveBeenCalledWith({
      name: IDEA.name,
      servings: 1,
      basis: 'raw',
      method: 'horno',
      idea_id: IDEA.id,
      ingredients: [
        { food_id: 1, grams: 250 },
        { food_id: 2, grams: 150 },
        { food_id: 4, grams: 60 },
      ],
    })
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 42, name: IDEA.name }))
  })

  it('un nombre repetido lo dice debajo del botón, con el plato con el que choca', async () => {
    ideaDraft.mockResolvedValue(
      draft({ servings: 2, servings_published: true, lines: [line({ grams: 250 })] }),
    )
    previewDish.mockResolvedValue({ per_serving: { kcal: 50 } })
    createDish.mockRejectedValue(Object.assign(new Error('x'), { status: 409, detail: 'ya tienes «Acelgas»' }))
    render(<IdeaDraft idea={IDEA} onSaved={() => {}} onCancel={() => {}} />)
    await waitFor(() => expect(save()).toBeEnabled())
    await userEvent.click(save())
    expect(await screen.findByText('No se ha guardado: ya tienes «Acelgas».')).toBeInTheDocument()
  })

  it('una receta que no publica ingredientes abre «Nuevo plato» con el nombre y el enlace', async () => {
    ideaDraft.mockResolvedValue(draft({ refusal: 'no_recipe_data', lines: [] }))
    render(<IdeaDraft idea={IDEA} onSaved={() => {}} onCancel={() => {}} />)
    expect(
      await screen.findByText('Esta receta no publica sus ingredientes. Añádelos a mano.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Alta de plato' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue(IDEA.name)
    expect(screen.getByRole('link', { name: 'Ver receta original ↗' })).toHaveAttribute(
      'href',
      IDEA.url,
    )
  })

  it('una página que no contesta dice otra cosa', async () => {
    ideaDraft.mockResolvedValue(draft({ refusal: 'unreachable', lines: [] }))
    render(<IdeaDraft idea={IDEA} onSaved={() => {}} onCancel={() => {}} />)
    expect(await screen.findByText(/No he podido abrir la receta/)).toBeInTheDocument()
  })

  it('«Nuevo plato» desde una idea guarda la idea en el plato', async () => {
    ideaDraft.mockResolvedValue(draft({ refusal: 'no_recipe_data', lines: [] }))
    searchFoods.mockResolvedValue([{ id: 1, name: 'Acelga, cruda' }])
    createDish.mockResolvedValue({ id: 9 })
    const onSaved = vi.fn()
    render(<IdeaDraft idea={IDEA} onSaved={onSaved} onCancel={() => {}} />)
    await userEvent.type(await screen.findByLabelText('Añadir ingrediente'), 'acel')
    await userEvent.click(await screen.findByRole('button', { name: 'Acelga, cruda' }))
    await userEvent.type(screen.getByLabelText('Gramos de Acelga, cruda'), '200')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar plato' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 9 }))
    expect(createDish.mock.calls[0][0]).toMatchObject({ name: IDEA.name, idea_id: IDEA.id })
    // Por aquí también se llega al plato guardado, con su «Ponerlo en el plan».
    expect(await screen.findByText('Guardado en tus platos.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ponerlo en el plan' })).toBeInTheDocument()
  })
})

// Un jueves y un viernes que nunca serán «hoy», para que la frase no dependa
// del día en que corre la suite.
const AHEAD = {
  week_start: '2098-12-29',
  has_plan: true,
  entries: [
    { id: 7, log_date: '2099-01-01', slot: 'comida', dish_id: 3, dish_name: 'Lentejas estofadas' },
    { id: 8, log_date: '2099-01-02', slot: 'cena', dish_id: 4, dish_name: 'Merluza' },
  ],
}

describe('IdeaDraft · guardado', () => {
  async function guardarPlato(props = {}) {
    ideaDraft.mockResolvedValue(
      draft({ servings: 2, servings_published: true, lines: [line({ grams: 250 })] }),
    )
    previewDish.mockResolvedValue({ per_serving: { kcal: 50 } })
    createDish.mockResolvedValue({ id: 42, name: 'Acelgas de la abuela' })
    const all = { onSaved: vi.fn(), onCancel: vi.fn(), onPuesto: vi.fn(), ...props }
    render(<IdeaDraft idea={IDEA} {...all} />)
    await waitFor(() => expect(save()).toBeEnabled())
    await userEvent.click(save())
    await screen.findByText('Guardado en tus platos.')
    return all
  }

  it('al guardar no se cierra: dice que está guardado y ofrece ponerlo en el plan', async () => {
    const { onSaved, onCancel } = await guardarPlato()
    expect(onSaved).toHaveBeenCalledWith({ id: 42, name: 'Acelgas de la abuela' })
    // El nombre con el que se guardó, no el de la receta.
    expect(screen.getByRole('heading', { name: 'Acelgas de la abuela' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar en mis platos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
    expect(onCancel).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Hecho' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('«Ponerlo en el plan» abre la hoja con el plato guardado y al elegir avisa', async () => {
    getPlanAhead.mockResolvedValue(AHEAD)
    replanEntry.mockResolvedValue({ id: 7 })
    const { onPuesto } = await guardarPlato()

    await userEvent.click(screen.getByRole('button', { name: 'Ponerlo en el plan' }))
    const hoja = await screen.findByRole('dialog', { name: 'Acelgas de la abuela' })
    await userEvent.click(await within(hoja).findByRole('button', { name: /JUE · Comida/ }))

    expect(replanEntry).toHaveBeenCalledWith(7, 42, expect.any(String))
    expect(await within(hoja).findByText('Puesto el jueves, en la comida.')).toBeInTheDocument()
    expect(onPuesto).toHaveBeenCalledTimes(1)

    // Al cerrar la hoja, la pantalla del plato guardado se acuerda de dónde fue.
    await userEvent.click(within(hoja).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog', { name: 'Acelgas de la abuela' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Puesto el jueves, en la comida.')
  })
})

describe('motivoBloqueo', () => {
  const ok = { name: 'x', servings: '2', lines: [{ status: 'chosen', food: { id: 1, name: 'A' }, grams: '10', text: 'a' }] }
  it('nada que decir cuando está completo', () => {
    expect(motivoBloqueo(ok)).toBeNull()
  })
  it('cero raciones no son raciones', () => {
    expect(motivoBloqueo({ ...ok, servings: '0' })).toBe('Dime para cuántas raciones es.')
  })
  it('sin líneas no hay plato', () => {
    expect(motivoBloqueo({ ...ok, lines: [] })).toBe('Un plato necesita al menos un ingrediente.')
  })
  it('sin nombre, lo primero', () => {
    expect(motivoBloqueo({ ...ok, name: '  ' })).toBe('Ponle nombre al plato.')
  })
})
