import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

// Los subtotales por comida que ahora manda el servidor. `sin` es el montón sin
// asignar. Lo que no se nombra queda en `null`, que es «no hay nada aquí» — no
// cero, igual que en el backend.
const SLOT_KEYS = ['desayuno', 'comida', 'cena', 'snack', null]
function slots(kcal = {}) {
  return SLOT_KEYS.map((slot) => ({
    slot,
    totals: {
      kcal: kcal[slot ?? 'sin'] ?? null,
      protein: null,
      fat: null,
      carbs: null,
      fiber: null,
    },
    unknown: { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
  }))
}

const railNames = () => [...document.querySelectorAll('.food-rail-name')].map((e) => e.textContent)

// Arrastra una fila lo bastante a la izquierda como para revelar «Borrar».
function swipeOpen(row) {
  fireEvent.pointerDown(row, { clientX: 200 })
  fireEvent.pointerMove(row, { clientX: 100 })
  fireEvent.pointerUp(row, { clientX: 100 })
}

function day(overrides = {}) {
  return {
    date: '2026-08-31',
    entries: [],
    totals: { kcal: null, protein: null, fat: null, carbs: null, fiber: null },
    unknown: { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
    by_slot: slots(),
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
    api.frequentFoods.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('abre en el día alimentario en curso', async () => {
    render(<Comida />)
    await waitFor(() => expect(api.getFoodDay).toHaveBeenCalledWith('2026-08-31'))
    expect(screen.getByText('LUN 31 AGO')).toBeInTheDocument()
  })

  it('un día vacío lo dice comida por comida, en vez de enseñar ceros', async () => {
    render(<Comida />)
    // Cuatro raíles, cada uno una sola línea: sin «Nada aún» y sin subtotal en
    // cero, porque la cabecera con su `+` ya dice que está vacío.
    await waitFor(() => expect(railNames()).toEqual(['Desayuno', 'Comida', 'Cena', 'Snack']))
    expect(screen.queryByText('Nada aún')).not.toBeInTheDocument()
    expect(screen.queryByText('0 kcal')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.food-rail-kcal')).toHaveLength(0)
  })

  it('se mueve al día anterior y vuelve', async () => {
    render(<Comida />)
    await screen.findByText('LUN 31 AGO')
    await userEvent.click(screen.getByRole('button', { name: 'Día anterior' }))
    await waitFor(() => expect(api.getFoodDay).toHaveBeenCalledWith('2026-08-30'))
    await userEvent.click(screen.getByRole('button', { name: 'Día siguiente' }))
    await waitFor(() => expect(api.getFoodDay).toHaveBeenLastCalledWith('2026-08-31'))
  })

  it('dice si estás en hoy, en vez de dejarlo deducir de una flecha apagada', async () => {
    render(<Comida />)
    expect(await screen.findByText('Hoy')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Día anterior' }))
    await waitFor(() => expect(api.getFoodDay).toHaveBeenCalledWith('2026-08-30'))
    expect(screen.queryByText('Hoy')).not.toBeInTheDocument()
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
        by_slot: slots({ desayuno: 200 }),
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
        by_slot: slots({ desayuno: 200 }),
      }),
    )
    render(<Comida />)
    const macros = await screen.findByTestId('food-macros')
    expect(within(macros).getByText('—')).toBeInTheDocument()
    expect(screen.getByText('— no es cero: 1 entrada sin fibra.')).toBeInTheDocument()
  })

  it('dibuja las cuatro comidas, y el montón sin asignar sólo si tiene algo', async () => {
    api.getFoodDay.mockResolvedValue(
      day({
        entries: [
          entry({ id: 1, meal_slot: 'cena', food_name: 'Tortilla' }),
          entry({ id: 2, meal_slot: 'desayuno', food_name: 'Pan' }),
          entry({ id: 3, meal_slot: null, food_name: 'Café' }),
        ],
        totals: { kcal: 600, protein: 20, fat: 10, carbs: 80, fiber: 6 },
        by_slot: slots({ desayuno: 200, cena: 340, sin: 60 }),
      }),
    )
    render(<Comida />)
    await screen.findByText('Tortilla')
    // Los cuatro raíles están siempre, hayas comido o no: son la puerta por la
    // que se registra en esa comida, y una puerta que aparece y desaparece
    // mueve de sitio el control que ibas a pulsar.
    expect(railNames()).toEqual(['Desayuno', 'Comida', 'Cena', 'Snack', 'Sin asignar'])
  })

  it('el montón sin asignar no se dibuja si está vacío', async () => {
    api.getFoodDay.mockResolvedValue(
      day({
        entries: [entry()],
        totals: { kcal: 200, protein: 6, fat: 2, carbs: 38, fiber: 2 },
        by_slot: slots({ desayuno: 200 }),
      }),
    )
    render(<Comida />)
    await screen.findByText('Pan de la panadería')
    // Nadie quiere *decidir* no decidir: el montón no lleva `+`, así que
    // enseñarlo vacío sería una cabecera sin nada que hacer debajo.
    expect(railNames()).toEqual(['Desayuno', 'Comida', 'Cena', 'Snack'])
  })

  it('un raíl con algo lleva su subtotal; uno vacío no lleva ninguno', async () => {
    api.getFoodDay.mockResolvedValue(
      day({
        entries: [entry()],
        totals: { kcal: 200, protein: 6, fat: 2, carbs: 38, fiber: 2 },
        by_slot: slots({ desayuno: 200 }),
      }),
    )
    render(<Comida />)
    await screen.findByText('Pan de la panadería')
    // Sólo el raíl que tiene algo dentro imprime un subtotal — la cabecera de
    // los otros tres ya dice que están vacíos con su `+`, sin necesitar una
    // cifra (ni siquiera una raya) al lado.
    const kcal = [...document.querySelectorAll('.food-rail-kcal')].map((e) => e.textContent)
    expect(kcal).toEqual(['200 kcal'])
  })

  it('un raíl con algo, pero de total desconocido, sigue llevando su raya', async () => {
    api.getFoodDay.mockResolvedValue(
      day({
        entries: [entry({ kcal: null })],
        totals: { kcal: null, protein: 6, fat: 2, carbs: 38, fiber: 2 },
        unknown: { kcal: 1, protein: 0, fat: 0, carbs: 0, fiber: 0 },
        by_slot: [
          {
            slot: 'desayuno',
            totals: { kcal: null, protein: null, fat: null, carbs: null, fiber: null },
            unknown: { kcal: 1, protein: 0, fat: 0, carbs: 0, fiber: 0 },
          },
          ...slots().slice(1),
        ],
      }),
    )
    render(<Comida />)
    await screen.findByText('Pan de la panadería')
    // Aquí sí hay algo —una entrada—, sólo que a su kcal le falta el dato: la
    // raya sigue siendo la respuesta correcta, distinta de un raíl vacío.
    expect(document.querySelector('.food-rail-kcal').textContent).toBe('— kcal')
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
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
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
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
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
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
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

    // Mientras la búsqueda está en vuelo, la lista está vacía — y una lista
    // vacía con «Crear «huevo»» debajo es una frase: «esto no está en el
    // catálogo». Es la frase equivocada, porque todavía no se ha mirado.
    it('mientras busca lo dice, y no ofrece crear lo que aún no ha buscado', async () => {
      let resolve
      api.searchFoods.mockImplementation(() => new Promise((r) => { resolve = r }))
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'huevo')

      expect(await screen.findByText('Buscando…')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Crear «huevo»' })).toBeNull()

      // El rebote de 180 ms va por delante de la llamada: `Buscando…` se pinta
      // antes de que `searchFoods` llegue a existir, que es exactamente la
      // ventana que esta prueba defiende.
      await waitFor(() => expect(api.searchFoods).toHaveBeenCalled())
      await act(async () => {
        resolve([PAN])
      })
      expect(screen.queryByText('Buscando…')).toBeNull()
      expect(screen.getByRole('button', { name: 'Crear «huevo»' })).toBeInTheDocument()
    })

    // Y cuando de verdad no hay nada, se dice con palabras. Un hueco no es una
    // respuesta (DESIGN.md: «An empty result must name the right failure»).
    it('cuando el catálogo no tiene nada lo dice con palabras', async () => {
      api.searchFoods.mockResolvedValue([])
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'huevo')
      expect(
        await screen.findByText('Ningún alimento se llama «huevo».'),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Crear «huevo»' })).toBeInTheDocument()
    })

    it('vuelve a leer el día después de registrar', async () => {
      api.searchFoods.mockResolvedValue([PAN])
      api.logFood.mockResolvedValue(entry())
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
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

    it('un toque sin arrastre abre la fila para editar', async () => {
      render(<Comida />)
      const row = await screen.findByRole('button', { name: /Pan de la panadería/ })
      await userEvent.click(row)
      expect(screen.getByLabelText('Gramos')).toBeInTheDocument()
      // Borrar ya no vive en el formulario: sólo quedan gramos y Guardar.
      expect(screen.queryByRole('button', { name: 'Borrar' })).not.toBeInTheDocument()
    })

    it('deslizar la fila revela «Borrar», fuera del formulario', async () => {
      render(<Comida />)
      const row = await screen.findByRole('button', { name: /Pan de la panadería/ })
      // Cerrada, la acción no es alcanzable — ni por el ojo ni por un lector.
      expect(screen.queryByRole('button', { name: 'Borrar Pan de la panadería' })).not.toBeInTheDocument()
      swipeOpen(row)
      expect(screen.getByRole('button', { name: 'Borrar Pan de la panadería' })).toBeInTheDocument()
    })

    it('borra desde el «Borrar» revelado al deslizar, y dejar un Deshacer en su sitio', async () => {
      api.deleteFoodEntry.mockResolvedValue(null)
      render(<Comida />)
      const row = await screen.findByRole('button', { name: /Pan de la panadería/ })
      swipeOpen(row)
      await userEvent.click(screen.getByRole('button', { name: 'Borrar Pan de la panadería' }))
      await waitFor(() => expect(api.deleteFoodEntry).toHaveBeenCalledWith(10))
      // No es un aviso flotante: se queda en el raíl del que salió la entrada,
      // hasta que se deshaga o se registre otra cosa.
      expect(await screen.findByText('Pan de la panadería borrada.')).toBeInTheDocument()
    })

    it('deshacer vuelve a registrar la entrada con su hora original', async () => {
      api.deleteFoodEntry.mockResolvedValue(null)
      api.logFood.mockResolvedValue({})
      render(<Comida />)
      const row = await screen.findByRole('button', { name: /Pan de la panadería/ })
      swipeOpen(row)
      await userEvent.click(screen.getByRole('button', { name: 'Borrar Pan de la panadería' }))
      await waitFor(() => expect(api.deleteFoodEntry).toHaveBeenCalled())
      await userEvent.click(await screen.findByRole('button', { name: /Deshacer el borrado/ }))
      await waitFor(() =>
        expect(api.logFood).toHaveBeenCalledWith({
          foodId: 1,
          grams: 80,
          mealSlot: 'desayuno',
          loggedAt: '2026-08-31T07:00:00Z',
        }),
      )
      // Y el «Deshacer» se retira: ya se deshizo.
      await waitFor(() => expect(screen.queryByText('Pan de la panadería borrada.')).not.toBeInTheDocument())
    })
  })
  describe('el raíl como puerta', () => {
    it('el + de un raíl abre el buscador con esa comida ya puesta', async () => {
      api.searchFoods.mockResolvedValue([PAN])
      api.logFood.mockResolvedValue(entry())
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a cena' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'pan')
      await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
      // La pregunta «¿a qué comida?» ya viene contestada por el sitio del que
      // vienes; sigue siendo cambiable, pero no hay que contestarla.
      expect(screen.getByRole('button', { name: 'Cena' })).toHaveAttribute('aria-pressed', 'true')
      await userEvent.click(screen.getByRole('button', { name: 'Añadir' }))
      await waitFor(() =>
        expect(api.logFood).toHaveBeenCalledWith(
          expect.objectContaining({ foodId: 1, mealSlot: 'cena' }),
        ),
      )
    })

    it('y se puede corregir a otra comida, o a ninguna', async () => {
      api.searchFoods.mockResolvedValue([PAN])
      api.logFood.mockResolvedValue(entry())
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a cena' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'pan')
      await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Sin asignar' }))
      await userEvent.click(screen.getByRole('button', { name: 'Añadir' }))
      await waitFor(() =>
        expect(api.logFood).toHaveBeenCalledWith(expect.objectContaining({ mealSlot: null })),
      )
    })

    it('el buscador se abre en una hoja, no empujando la lista', async () => {
      api.searchFoods.mockResolvedValue([])
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a snack' }))
      const panel = await screen.findByLabelText('Buscar alimento')
      // Ya no es un panel dentro del raíl que lo abrió: vive en una hoja aparte,
      // que es lo que le quita el `scrollIntoView` que antes hacía falta.
      expect(document.querySelector('.food-rail')?.contains(panel)).toBe(false)
      expect(screen.getByRole('dialog', { name: 'Añadir alimento' }).contains(panel)).toBe(true)
    })
  })

  describe('lo de siempre', () => {
    const SIEMPRE = [
      { food_id: 1, name: 'Pan de la panadería', brand: null, grams: 80, kcal: 200, meal_slot: 'desayuno', times: 7 },
      { food_id: 2, name: 'Huevo cocido', brand: null, grams: 120, kcal: 166, meal_slot: null, times: 4 },
    ]

    it('pone lo que repites a un toque, con su cantidad y sus kcal', async () => {
      api.frequentFoods.mockResolvedValue(SIEMPRE)
      render(<Comida />)
      const tile = await screen.findByRole('button', { name: /Pan de la panadería/ })
      expect(within(tile).getByText('80 g · 200 kcal')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Huevo cocido/ })).toBeInTheDocument()
    })

    it('un toque lo registra con la cantidad y la comida de siempre', async () => {
      api.frequentFoods.mockResolvedValue(SIEMPRE)
      api.logFood.mockResolvedValue({})
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
      await waitFor(() =>
        expect(api.logFood).toHaveBeenCalledWith({ foodId: 1, grams: 80, mealSlot: 'desayuno' }),
      )
    })

    it('y vuelve a leer el día y el repertorio, que acaban de cambiar', async () => {
      api.frequentFoods.mockResolvedValue(SIEMPRE)
      api.logFood.mockResolvedValue({})
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: /Huevo cocido/ }))
      await waitFor(() => expect(api.getFoodDay).toHaveBeenCalledTimes(2))
      expect(api.frequentFoods).toHaveBeenCalledTimes(2)
    })

    it('sin repertorio todavía, la sección no existe', async () => {
      render(<Comida />)
      await waitFor(() => expect(railNames()).toHaveLength(4))
      expect(screen.queryByText('Lo de siempre')).not.toBeInTheDocument()
    })

    it('hay un solo destino para añadir, y el + del raíl sigue siendo un atajo', async () => {
      api.frequentFoods.mockResolvedValue(SIEMPRE)
      render(<Comida />)
      await screen.findByRole('button', { name: /Pan de la panadería/ })
      // La CTA fija es el destino principal…
      expect(screen.getByRole('button', { name: 'Añadir alimento' })).toBeInTheDocument()
      // …y el `+` de cada raíl sigue ahí como atajo con la comida ya puesta.
      expect(screen.getAllByRole('button', { name: /^Añadir a / })).toHaveLength(4)
    })

    it('la CTA fija abre el buscador con la comida inferida por la hora', async () => {
      vi.setSystemTime(new Date(2026, 7, 31, 21, 0)) // 21:00 → cena
      api.searchFoods.mockResolvedValue([PAN])
      api.logFood.mockResolvedValue(entry())
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir alimento' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'pan')
      await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
      expect(screen.getByRole('button', { name: 'Cena' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('no se ofrece en un día pasado: registraría en hoy sin decirlo', async () => {
      api.frequentFoods.mockResolvedValue(SIEMPRE)
      render(<Comida />)
      await screen.findByRole('button', { name: /Pan de la panadería/ })
      await userEvent.click(screen.getByRole('button', { name: 'Día anterior' }))
      await waitFor(() => expect(api.getFoodDay).toHaveBeenCalledWith('2026-08-30'))
      expect(screen.queryByText('Lo de siempre')).not.toBeInTheDocument()
    })

    it('si el repertorio no se puede leer, la pantalla sigue en pie', async () => {
      api.frequentFoods.mockRejectedValue(new Error('offline'))
      render(<Comida />)
      await waitFor(() => expect(railNames()).toHaveLength(4))
      expect(screen.queryByText('Lo de siempre')).not.toBeInTheDocument()
    })
  })

  describe('el objetivo diario', () => {
    it('sin objetivo, la cifra grande sigue siendo lo comido', async () => {
      render(<Comida />)
      await waitFor(() => expect(document.querySelector('.food-strip')).not.toBeNull())
      expect(document.querySelector('.food-hero')).toBeNull()
      expect(screen.getByText('Sin fijar')).toBeInTheDocument()
    })

    it('con objetivo, la cifra grande pasa a ser lo que queda', async () => {
      api.getFoodDay.mockResolvedValue(
        day({
          entries: [entry()],
          totals: { kcal: 200, protein: 6, fat: 2, carbs: 38, fiber: 2 },
          by_slot: slots({ desayuno: 200 }),
          target_kcal: 2800,
          target_protein: 160,
          remaining_kcal: 2600,
        }),
      )
      render(<Comida />)
      await waitFor(() => expect(document.querySelector('.food-hero')).not.toBeNull())
      expect(document.querySelector('.food-strip')).toBeNull()
      expect(screen.getByText('2600')).toBeInTheDocument()
      expect(screen.getByText('kcal por comer')).toBeInTheDocument()
      // Cuatro cifras van sin separador de millar en es-ES (1841, no 1.841).
      expect(document.querySelector('.food-hero-total').textContent).toBe('200 / 2800')
      expect(screen.getByText('2800 kcal')).toBeInTheDocument() // el resumen del cajón
    })

    it('abre con los valores actuales y los guarda', async () => {
      api.getFoodDay.mockResolvedValue(day({ target_kcal: 2800, target_protein: 160 }))
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: /Objetivo diario/ }))
      expect(screen.getByLabelText('Kcal al día')).toHaveValue('2800')
      expect(screen.getByLabelText('Proteína al día (g)')).toHaveValue('160')
      await userEvent.clear(screen.getByLabelText('Kcal al día'))
      await userEvent.type(screen.getByLabelText('Kcal al día'), '2500')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
      await waitFor(() => expect(api.setTargets).toHaveBeenCalledWith({ kcal: 2500, protein: 160 }))
    })

    it('dejar el campo en blanco borra el objetivo', async () => {
      api.getFoodDay.mockResolvedValue(day({ target_kcal: 2800, target_protein: 160 }))
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: /Objetivo diario/ }))
      await userEvent.clear(screen.getByLabelText('Kcal al día'))
      await userEvent.clear(screen.getByLabelText('Proteína al día (g)'))
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
      await waitFor(() => expect(api.setTargets).toHaveBeenCalledWith({ kcal: null, protein: null }))
    })
  })

  describe('el dato que falta', () => {
    it('el pie de una raya se toca, y filtra el día a lo incompleto', async () => {
      api.getFoodDay.mockResolvedValue(
        day({
          entries: [
            entry({ id: 1, food_name: 'Pan', fiber: null }),
            entry({ id: 2, food_name: 'Pollo', meal_slot: 'comida' }),
          ],
          totals: { kcal: 400, protein: 12, fat: 4, carbs: 76, fiber: null },
          unknown: { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 1 },
          by_slot: slots({ desayuno: 200, comida: 200 }),
        }),
      )
      render(<Comida />)
      const chip = await screen.findByRole('button', {
        name: '— no es cero: 1 entrada sin fibra.',
      })
      expect(screen.getByText('Pan')).toBeInTheDocument()
      expect(screen.getByText('Pollo')).toBeInTheDocument()

      await userEvent.click(chip)
      expect(chip).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByText('Pan')).toBeInTheDocument()
      expect(screen.queryByText('Pollo')).not.toBeInTheDocument()

      await userEvent.click(chip)
      expect(screen.getByText('Pollo')).toBeInTheDocument()
    })
  })
})
