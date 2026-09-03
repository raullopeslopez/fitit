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
    // Cuatro raíles, cada uno con su raya y su «Nada aún». Un cero aquí diría
    // que desayunaste nada, que no es lo mismo que no haber desayunado.
    await waitFor(() => expect(railNames()).toEqual(['Desayuno', 'Comida', 'Cena', 'Snack']))
    expect(screen.getAllByText('Nada aún')).toHaveLength(4)
    expect(screen.queryByText('0 kcal')).not.toBeInTheDocument()
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

  it('cada raíl lleva su propio subtotal, y uno vacío lleva una raya', async () => {
    api.getFoodDay.mockResolvedValue(
      day({
        entries: [entry()],
        totals: { kcal: 200, protein: 6, fat: 2, carbs: 38, fiber: 2 },
        by_slot: slots({ desayuno: 200 }),
      }),
    )
    render(<Comida />)
    await screen.findByText('Pan de la panadería')
    const kcal = [...document.querySelectorAll('.food-rail-kcal')].map((e) => e.textContent)
    expect(kcal).toEqual(['200 kcal', '— kcal', '— kcal', '— kcal'])
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

    it('guarda la marca del alimento', async () => {
      api.searchFoods.mockResolvedValue([])
      api.createFood.mockResolvedValue({ ...PAN, id: 43, name: 'Yogur natural' })
      api.logFood.mockResolvedValue(entry())
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'yogur')
      await userEvent.click(await screen.findByRole('button', { name: 'Crear «yogur»' }))
      await userEvent.type(screen.getByLabelText('Marca'), 'Hacendado')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }))
      await waitFor(() =>
        expect(api.createFood).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'yogur', brand: 'Hacendado' }),
        ),
      )
    })

    // La cámara. Lee la etiqueta y **propone**: el formulario sigue siendo la
    // puerta, y lo que el backend no pudo respaldar llega en blanco, nunca a
    // cero.
    describe('leer la etiqueta de una foto', () => {
      const JPEG = () => new File([new Uint8Array([255, 216, 255])], 'etiqueta.jpg', {
        type: 'image/jpeg',
      })

      const LEIDO = {
        name: 'Yogur natural',
        brand: 'Hacendado',
        column_header: 'por 100 g',
        nutrients: { kcal: 61, protein: 3.8, fat: 3.2, carbs: 4.5, fiber: 0.3 },
        dropped: [],
        refusal: null,
        refused_column: null,
      }

      async function fotografiar(respuesta) {
        api.searchFoods.mockResolvedValue([])
        api.readLabel.mockResolvedValue(respuesta)
        render(<Comida />)
        await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
        await userEvent.upload(screen.getByLabelText('Leer etiqueta'), JPEG())
      }

      it('rellena el formulario con lo que ha leído', async () => {
        await fotografiar(LEIDO)
        expect(await screen.findByLabelText('Nombre')).toHaveValue('Yogur natural')
        expect(screen.getByLabelText('Marca')).toHaveValue('Hacendado')
        expect(screen.getByLabelText('Kcal por 100 g')).toHaveValue('61')
        expect(screen.getByLabelText('Fibra por 100 g')).toHaveValue('0,3')
      })

      it('dice de qué columna salieron los números', async () => {
        await fotografiar(LEIDO)
        expect(await screen.findByText('Leído de «por 100 g».')).toBeInTheDocument()
      })

      it('deja en blanco lo que descartó, y dice cuál', async () => {
        await fotografiar({
          ...LEIDO,
          nutrients: { ...LEIDO.nutrients, fiber: null },
          dropped: ['fiber'],
        })
        expect(await screen.findByLabelText('Fibra por 100 g')).toHaveValue('')
        expect(screen.getByText(/Descarté la fibra/)).toBeInTheDocument()
      })

      it('con una columna que no es por 100 g no propone nada y lo explica', async () => {
        await fotografiar({
          ...LEIDO,
          name: null,
          brand: null,
          column_header: null,
          nutrients: { kcal: null, protein: null, fat: null, carbs: null, fiber: null },
          refusal: 'column',
          refused_column: 'por ración (125 g)',
        })
        expect(await screen.findByLabelText('Kcal por 100 g')).toHaveValue('')
        expect(
          screen.getByText(/«por ración \(125 g\)».*no por 100 g/),
        ).toBeInTheDocument()
      })

      it('si no ha podido leerla, te deja tecleando', async () => {
        await fotografiar({
          ...LEIDO,
          name: null,
          brand: null,
          column_header: null,
          nutrients: { kcal: null, protein: null, fat: null, carbs: null, fiber: null },
          refusal: 'unreadable',
        })
        expect(await screen.findByLabelText('Nombre')).toHaveValue('')
        expect(screen.getByText('No he podido leer la etiqueta. Tecléala.')).toBeInTheDocument()
      })

      it('sin cuota del minuto, dice que esperes, no que la foto esté mal', async () => {
        await fotografiar({
          ...LEIDO,
          name: null,
          brand: null,
          column_header: null,
          nutrients: { kcal: null, protein: null, fat: null, carbs: null, fiber: null },
          refusal: 'quota',
          quota_scope: 'minute',
        })
        expect(
          await screen.findByText('Demasiadas fotos seguidas. Espera un minuto, o tecléalo.'),
        ).toBeInTheDocument()
      })

      it('sin cuota del día, no te manda a esperar un minuto que no sirve', async () => {
        await fotografiar({
          ...LEIDO,
          name: null,
          brand: null,
          column_header: null,
          nutrients: { kcal: null, protein: null, fat: null, carbs: null, fiber: null },
          refusal: 'quota',
          quota_scope: 'day',
        })
        expect(await screen.findByText('Se han acabado las fotos de hoy. Tecléalo.')).toBeInTheDocument()
        expect(screen.queryByText(/Espera un minuto/)).toBeNull()
      })

      it('lo leído es una propuesta: no da de alta nada hasta que lo guardas', async () => {
        await fotografiar(LEIDO)
        await screen.findByLabelText('Nombre')
        expect(api.createFood).not.toHaveBeenCalled()
      })
    })

    it('una marca en blanco se manda como null, no como cadena vacía', async () => {
      api.searchFoods.mockResolvedValue([])
      api.createFood.mockResolvedValue({ ...PAN, id: 44, name: 'Yogur natural' })
      api.logFood.mockResolvedValue(entry())
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'yogur')
      await userEvent.click(await screen.findByRole('button', { name: 'Crear «yogur»' }))
      await userEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }))
      await waitFor(() => expect(api.createFood).toHaveBeenCalled())
      expect(api.createFood.mock.calls[0][0].brand).toBe(null)
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

    it('borra la entrada', async () => {
      api.deleteFoodEntry.mockResolvedValue(null)
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Borrar' }))
      await waitFor(() => expect(api.deleteFoodEntry).toHaveBeenCalledWith(10))
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

    it('el buscador se abre dentro del raíl que lo pidió', async () => {
      api.searchFoods.mockResolvedValue([])
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a snack' }))
      const panel = await screen.findByLabelText('Buscar alimento')
      const rail = [...document.querySelectorAll('.food-rail')].find((r) =>
        r.querySelector('.food-rail-name')?.textContent === 'Snack',
      )
      expect(rail.contains(panel)).toBe(true)
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

    it('ya no hay un botón de añadir al pie: se entra por el raíl', async () => {
      api.frequentFoods.mockResolvedValue(SIEMPRE)
      render(<Comida />)
      await screen.findByRole('button', { name: /Pan de la panadería/ })
      expect(screen.queryByRole('button', { name: 'Añadir alimento' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Buscar otro alimento' })).not.toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /^Añadir a / })).toHaveLength(4)
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
})
