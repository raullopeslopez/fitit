import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Comida from './Comida.jsx'
import EsperaIA from './EsperaIA.jsx'
import * as api from './api.js'

vi.mock('./api.js')

// Comida simple, fase 3: «Apuntar lo que has escrito». La frase va al
// servidor, que la parte en líneas casadas con tus alimentos; nada entra hasta
// «Revisa lo que entendí» → «Apuntar».

const vacio = { kcal: null, protein: null, fat: null, carbs: null, fiber: null }

function day(overrides = {}) {
  return {
    date: '2026-08-31',
    entries: [],
    totals: vacio,
    unknown: { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
    by_slot: ['desayuno', 'comida', 'cena', 'snack', null].map((slot) => ({ slot, totals: vacio, unknown: {} })),
    label_reading: true,
    ...overrides,
  }
}

const LEIDO = {
  transcript: 'menú del día: lentejas y un filete',
  refusal: null,
  lines: [
    {
      text: 'lentejas',
      status: 'chosen',
      food: { id: 1, name: 'Lentejas estofadas' },
      candidates: [],
      grams: 350,
      measure: null,
      measure_count: null,
      estimated: true,
      unit_question: null,
    },
    {
      text: 'un filete',
      status: 'chosen',
      food: { id: 2, name: 'Filete de ternera' },
      candidates: [],
      grams: 150,
      measure: null,
      measure_count: null,
      estimated: true,
      unit_question: null,
    },
  ],
}

describe('Apuntar lo que has escrito', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.setSystemTime(new Date(2026, 7, 31, 14, 0))
    api.getFoodDay.mockResolvedValue(day())
    api.searchFoods.mockResolvedValue([])
    api.frequentFoods.mockResolvedValue([])
    api.usualAmounts.mockResolvedValue([])
    api.listDishes.mockResolvedValue([])
    api.getTargetProfile.mockResolvedValue({})
    api.getTargetProposal.mockResolvedValue({ kcal: null, source: null, days: 0, missing: [] })
    api.getCaredDays.mockResolvedValue({ days: [] })
    api.getPlan.mockResolvedValue(null)
    api.readText.mockResolvedValue(LEIDO)
    api.logVoice.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function escribir(texto) {
    render(<Comida />)
    await userEvent.click(await screen.findByRole('button', { name: 'Añadir a comida' }))
    await userEvent.type(screen.getByLabelText('Buscar alimento'), texto)
  }

  it('una frase ofrece apuntarla entera; una palabra, no', async () => {
    await escribir('pan')
    expect(screen.queryByRole('button', { name: /Apuntar lo que has escrito/ })).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Buscar alimento'), ' con tomate')
    expect(await screen.findByRole('button', { name: /Apuntar lo que has escrito/ })).toBeInTheDocument()
  })

  it('sin modelo en el servidor no se ofrece', async () => {
    api.getFoodDay.mockResolvedValue(day({ label_reading: false }))
    await escribir('lentejas y un filete')
    await screen.findByLabelText('Buscar alimento')
    expect(screen.queryByRole('button', { name: /Apuntar lo que has escrito/ })).not.toBeInTheDocument()
  })

  it('la frase pasa por «Revisa lo que entendí» y se apunta entera', async () => {
    await escribir('menú del día: lentejas y un filete')
    await userEvent.click(await screen.findByRole('button', { name: /Apuntar lo que has escrito/ }))
    expect(api.readText).toHaveBeenCalledWith('menú del día: lentejas y un filete')
    const hoja = await screen.findByRole('dialog', { name: 'Revisa lo que entendí' })
    expect(within(hoja).getByText('«menú del día: lentejas y un filete»')).toBeInTheDocument()
    expect(await within(hoja).findByText('Lentejas estofadas')).toBeInTheDocument()
    expect(within(hoja).getByText('Filete de ternera')).toBeInTheDocument()
    await userEvent.click(within(hoja).getByRole('button', { name: 'Apuntar · 2 cosas' }))
    await waitFor(() =>
      expect(api.logVoice).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: [
            { food_id: 1, grams: 350, estimated: true },
            { food_id: 2, grams: 150, estimated: true },
          ],
          mealSlot: 'comida',
        }),
      ),
    )
  })

  it('«Cambiar la frase» vuelve a añadir con lo escrito', async () => {
    await escribir('lentejas y un filete')
    await userEvent.click(await screen.findByRole('button', { name: /Apuntar lo que has escrito/ }))
    const hoja = await screen.findByRole('dialog', { name: 'Revisa lo que entendí' })
    await within(hoja).findByText('Lentejas estofadas')
    await userEvent.click(within(hoja).getByRole('button', { name: 'Cambiar la frase' }))
    expect(await screen.findByLabelText('Buscar alimento')).toHaveValue('lentejas y un filete')
  })

  it('si el modelo no puede, lo dice y deja la frase a la vista', async () => {
    api.readText.mockResolvedValue({ transcript: 'lentejas y un filete', refusal: 'busy', lines: [] })
    await escribir('lentejas y un filete')
    await userEvent.click(await screen.findByRole('button', { name: /Apuntar lo que has escrito/ }))
    const hoja = await screen.findByRole('dialog', { name: 'Revisa lo que entendí' })
    expect(await within(hoja).findByText(/Prueba en un minuto/)).toBeInTheDocument()
    expect(within(hoja).getByText('«lentejas y un filete»')).toBeInTheDocument()
  })
})

describe('la espera mientras piensa', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const PASOS = ['Separando en alimentos…', 'Buscando en tus platos…', 'Calculando gramos…']

  it('si contesta enseguida, no se enseña nada', () => {
    render(<EsperaIA pasos={PASOS} />)
    act(() => vi.advanceTimersByTime(300))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('dice el paso, y va pasando al siguiente sin volver a empezar', () => {
    render(<EsperaIA pasos={PASOS} />)
    act(() => vi.advanceTimersByTime(400))
    expect(screen.getByRole('status')).toHaveTextContent('Separando en alimentos…')
    act(() => vi.advanceTimersByTime(900))
    expect(screen.getByRole('status')).toHaveTextContent('Buscando en tus platos…')
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByRole('status')).toHaveTextContent('Calculando gramos…')
  })

  it('a los 8 s dice que está tardando y ofrece escribirlo uno mismo', () => {
    const onRendirse = vi.fn()
    render(<EsperaIA pasos={PASOS} onRendirse={onRendirse} />)
    act(() => vi.advanceTimersByTime(8000))
    expect(screen.getByText('Está tardando')).toBeInTheDocument()
    act(() => screen.getByRole('button', { name: 'Escribirlo yo' }).click())
    expect(onRendirse).toHaveBeenCalled()
  })

  it('«Seguir esperando» quita el aviso', () => {
    render(<EsperaIA pasos={PASOS} onRendirse={() => {}} />)
    act(() => vi.advanceTimersByTime(8000))
    act(() => screen.getByRole('button', { name: 'Seguir esperando' }).click())
    expect(screen.queryByText('Está tardando')).not.toBeInTheDocument()
  })
})
