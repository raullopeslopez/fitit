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

// Los nombres de comida que hay en pantalla, en el orden en que se pintan:
// primero las tarjetas con algo dentro, luego los huecos en `dashed`.
const slotNames = () => [...document.querySelectorAll('.food-slot-name')].map((e) => e.textContent)
// Los subtotales. Sólo los llevan las comidas con contenido: un hueco no suma.
const slotMetas = () => [...document.querySelectorAll('.food-slot-meta')].map((e) => e.textContent)

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

// Un día con los cuatro objetivos fijados y algo registrado. Los `remaining`
// llegan restados del servidor (`restante`, en `nutrition.py`) — restarlos aquí
// sería una segunda implementación de la regla de los nulos.
function objetivo(overrides = {}) {
  return day({
    entries: [entry()],
    totals: { kcal: 200, protein: 6, fat: 2, carbs: 38, fiber: 2 },
    by_slot: slots({ desayuno: 200 }),
    target_kcal: 2800,
    target_protein: 160,
    target_fat: 80,
    target_carbs: 300,
    remaining_kcal: 2600,
    remaining_protein: 154,
    remaining_fat: 78,
    remaining_carbs: 262,
    ...overrides,
  })
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
    // Las cuatro comidas en `dashed`, cada una una sola tarjeta: sin «Nada aún»
    // y sin subtotal en cero, porque el hueco ya dice que está vacío.
    await waitFor(() => expect(slotNames()).toEqual(['Desayuno', 'Comida', 'Cena', 'Snack']))
    expect(document.querySelectorAll('.food-blank')).toHaveLength(4)
    expect(screen.queryByText('Nada aún')).not.toBeInTheDocument()
    expect(screen.queryByText('0 kcal')).not.toBeInTheDocument()
    expect(slotMetas()).toEqual([])
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
    // Sin objetivo la cifra grande sigue siendo lo comido: no hay nada que
    // restar, y un «te falta» sin meta no significa nada.
    expect(await screen.findByText('200')).toBeInTheDocument()
    const macros = screen.getByTestId('food-macros')
    expect(within(macros).getByText('6 g')).toBeInTheDocument()
    expect(within(macros).getByText('2,1 g')).toBeInTheDocument()
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
    // Las que tienen algo van primero y en el orden en que se comen; los huecos
    // se agrupan detrás. Todas siguen estando: el hueco es la puerta por la que
    // se registra en esa comida, y una puerta que aparece y desaparece mueve de
    // sitio el control que ibas a pulsar.
    expect(slotNames()).toEqual(['Desayuno', 'Cena', 'Sin asignar', 'Comida', 'Snack'])
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
    expect(slotNames()).toEqual(['Desayuno', 'Comida', 'Cena', 'Snack'])
  })

  it('una comida con algo lleva su subtotal; un hueco no lleva ninguno', async () => {
    api.getFoodDay.mockResolvedValue(
      day({
        entries: [entry()],
        totals: { kcal: 200, protein: 6, fat: 2, carbs: 38, fiber: 2 },
        by_slot: slots({ desayuno: 200 }),
      }),
    )
    render(<Comida />)
    await screen.findByText('Pan de la panadería')
    // Sólo la comida que tiene algo dentro imprime un subtotal — los tres huecos
    // ya dicen que están vacíos, sin necesitar una cifra (ni una raya) al lado.
    // La proteína va delante porque es el macro que la pantalla persigue.
    expect(slotMetas()).toEqual(['— P · 200 kcal'])
  })

  it('una comida con algo, pero de total desconocido, sigue llevando su raya', async () => {
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
    // raya sigue siendo la respuesta correcta, distinta de un hueco vacío.
    expect(slotMetas()).toEqual(['— P · — kcal'])
  })

  it('cada entrada dice cuánto y cuánta proteína', async () => {
    api.getFoodDay.mockResolvedValue(
      day({ entries: [entry()], totals: { kcal: 200, protein: 6, fat: 2, carbs: 38, fiber: 2 } }),
    )
    render(<Comida />)
    const row = await screen.findByRole('button', { name: /Pan de la panadería/ })
    expect(row).toHaveTextContent('80 g')
    // La proteína, no las kcal: es el macro que la cabecera persigue, así que es
    // el que se puede barrer por el borde derecho. Las kcal siguen estando,
    // sumadas en la cabecera de la comida.
    expect(row).toHaveTextContent('6 P')
  })

  it('una entrada sin proteína enseña una raya, no un cero', async () => {
    api.getFoodDay.mockResolvedValue(
      day({
        entries: [entry({ protein: null })],
        unknown: { kcal: 0, protein: 1, fat: 0, carbs: 0, fiber: 0 },
      }),
    )
    render(<Comida />)
    const row = await screen.findByRole('button', { name: /Pan de la panadería/ })
    expect(row).toHaveTextContent('— P')
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

    // El escáner. La puerta barata: un EAN se resuelve contra Open Food Facts
    // sin clave, sin cuota y sin modelo, y la segunda vez ni siquiera sale de
    // la base de datos.
    describe('escanear un código de barras', () => {
      const JPEG = () =>
        new File([new Uint8Array([255, 216, 255])], 'codigo.jpg', { type: 'image/jpeg' })

      // `BarcodeDetector` es nativo en Chrome/Android y no existe en jsdom, así
      // que aquí se pone uno de mentira. Lo que se prueba no es que decodifique
      // —eso lo hace el navegador— sino qué hace la pantalla con lo que salga.
      function conDetector(codigos) {
        window.BarcodeDetector = class {
          static getSupportedFormats() {
            return Promise.resolve(['ean_13'])
          }
          detect() {
            return Promise.resolve(codigos.map((rawValue) => ({ rawValue })))
          }
        }
        window.createImageBitmap = () => Promise.resolve({})
      }

      afterEach(() => {
        delete window.BarcodeDetector
        delete window.createImageBitmap
      })

      async function escanear(respuesta, codigos = ['8410128750121']) {
        conDetector(codigos)
        api.searchFoods.mockResolvedValue([])
        if (respuesta) api.scanBarcode.mockResolvedValue(respuesta)
        api.logFood.mockResolvedValue(entry())
        render(<Comida />)
        await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
        await userEvent.upload(screen.getByLabelText('Código de barras'), JPEG())
      }

      it('un producto que ya tienes se registra sin pasar por el formulario', async () => {
        await escanear({ barcode: '8410128750121', food: { ...PAN, name: 'Yogur natural' } })
        // Va directo a la cantidad: el alimento ya existe, no hay nada que dar
        // de alta.
        expect(await screen.findByLabelText('Gramos')).toBeInTheDocument()
        expect(screen.queryByLabelText('Kcal por 100 g')).toBeNull()
      })

      it('uno que conoce Open Food Facts llega como propuesta, no como alta', async () => {
        await escanear({
          barcode: '8410128750121',
          food: null,
          name: 'Yogur natural',
          brand: 'Hacendado',
          nutrients: { kcal: 61, protein: 3.8, fat: 3.2, carbs: 4.5, fiber: 0.3 },
          refusal: null,
        })
        expect(await screen.findByLabelText('Nombre')).toHaveValue('Yogur natural')
        expect(screen.getByLabelText('Marca')).toHaveValue('Hacendado')
        expect(screen.getByLabelText('Kcal por 100 g')).toHaveValue('61')
        expect(api.createFood).not.toHaveBeenCalled()
      })

      it('el código viaja hasta el alta, para no volver a preguntarlo mañana', async () => {
        await escanear({ barcode: '8410128750121', food: null, refusal: 'unknown' })
        api.createFood.mockResolvedValue({ ...PAN, id: 50 })
        await userEvent.type(await screen.findByLabelText('Nombre'), 'Pan de la panadería')
        await userEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }))
        await waitFor(() =>
          expect(api.createFood).toHaveBeenCalledWith(
            expect.objectContaining({ barcode: '8410128750121' }),
          ),
        )
      })

      it('un código que nadie conoce lo dice, y te deja tecleando', async () => {
        await escanear({ barcode: '8410128750121', food: null, refusal: 'unknown' })
        expect(
          await screen.findByText('Ese código no está en Open Food Facts. Tecléalo.'),
        ).toBeInTheDocument()
        expect(screen.getByLabelText('Nombre')).toHaveValue('')
      })

      it('una ficha por ración se rechaza y se explica', async () => {
        await escanear({
          barcode: '8410128750121',
          food: null,
          refusal: 'unusable',
          refused_reason: 'por ración',
        })
        expect(
          await screen.findByText('Los datos de ese código vienen por ración. No me sirven: tecléalo.'),
        ).toBeInTheDocument()
      })

      it('sin red lo dice, y no lo hace pasar por un código desconocido', async () => {
        await escanear({ barcode: '8410128750121', food: null, refusal: 'offline' })
        expect(
          await screen.findByText('No he podido preguntar por ese código. Tecléalo.'),
        ).toBeInTheDocument()
      })

      it('si en la foto no hay código, lo dice sin preguntar a nadie', async () => {
        await escanear(null, [])
        expect(
          await screen.findByText('No he visto ningún código en la foto.'),
        ).toBeInTheDocument()
        expect(api.scanBarcode).not.toHaveBeenCalled()
      })
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
        await userEvent.upload(screen.getByLabelText('Etiqueta'), JPEG())
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

      it('sin cabecera no pinta unas comillas vacías', async () => {
        // Visto probando en producción: el modelo no vio la cabecera, devolvió
        // «» y la pantalla decía «Esa columna es «», no por 100 g», que no
        // significa nada. No es que la columna fuera mala: es que no se leyó.
        await fotografiar({
          ...LEIDO,
          name: null,
          brand: null,
          column_header: null,
          nutrients: { kcal: null, protein: null, fat: null, carbs: null, fiber: null },
          refusal: 'column',
          refused_column: '',
        })
        expect(
          await screen.findByText('No he encontrado la cabecera de la tabla. Tecléalo.'),
        ).toBeInTheDocument()
        expect(screen.queryByText(/«»/)).toBeNull()
      })

      it('si el servidor no tiene la lectura configurada, lo dice tal cual', async () => {
        // El fallo de producción del 2026-09-04: sin clave en el servidor, el
        // 503 se pintaba como «no he podido leer la etiqueta» y te dejaba
        // repitiendo la foto contra algo que nunca iba a funcionar.
        api.searchFoods.mockResolvedValue([])
        api.readLabel.mockRejectedValue(Object.assign(new Error('nope'), { status: 503 }))
        api.logFood.mockResolvedValue(entry())
        render(<Comida />)
        await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
        await userEvent.upload(screen.getByLabelText('Etiqueta'), JPEG())
        expect(
          await screen.findByText('La lectura de etiquetas no está configurada en el servidor.'),
        ).toBeInTheDocument()
        expect(screen.queryByText(/No he podido leer la etiqueta/)).toBeNull()
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

      // El caso que se vio en producción el 2026-09-04: la llamada salió bien
      // —200 en los logs— y en pantalla no había ni cifras ni aviso. Una
      // lectura de la que no sale ningún número no es una lectura buena, y
      // pintarla como tal deja al usuario mirando siete campos vacíos sin nada
      // que explique por qué.
      it('una lectura de la que no sale ninguna cifra lo dice', async () => {
        await fotografiar({
          ...LEIDO,
          nutrients: { kcal: null, protein: null, fat: null, carbs: null, fiber: null },
          dropped: [],
        })
        expect(
          await screen.findByText('No he sacado ninguna cifra de la foto. Tecléalas.'),
        ).toBeInTheDocument()
      })

      it('y una foto tomada después de escanear no se queda sin pintar', async () => {
        // `scan` se comprobaba antes que la lectura, así que un escaneo previo
        // sin limpiar tapaba lo que devolviera la etiqueta: la llamada se
        // pagaba y su resultado no llegaba a la pantalla.
        api.searchFoods.mockResolvedValue([])
        api.scanBarcode.mockResolvedValue({ barcode: '8410128750121', food: null, refusal: 'unknown' })
        api.readLabel.mockResolvedValue(LEIDO)
        api.logFood.mockResolvedValue(entry())
        window.BarcodeDetector = class {
          detect() {
            return Promise.resolve([{ rawValue: '8410128750121' }])
          }
        }
        window.createImageBitmap = () => Promise.resolve({})
        render(<Comida />)
        await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
        await userEvent.upload(screen.getByLabelText('Código de barras'), JPEG())
        await screen.findByText('Ese código no está en Open Food Facts. Tecléalo.')
        await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
        await userEvent.upload(screen.getByLabelText('Etiqueta'), JPEG())
        expect(await screen.findByLabelText('Nombre')).toHaveValue('Yogur natural')
        expect(screen.getByText('Leído de «por 100 g».')).toBeInTheDocument()
        delete window.BarcodeDetector
        delete window.createImageBitmap
      })

      // Los dos disparadores compartían el mismo indicador, así que mientras
      // uno leía la hoja decía «Leyendo… Leyendo…», dos veces, una al lado de
      // la otra. Sólo se anuncia el que has pulsado.
      it('sólo se pone «Leyendo…» el botón que has pulsado', async () => {
        // Los dos disparadores en pantalla, que es la condición del fallo.
        window.BarcodeDetector = class {
          detect() {
            return Promise.resolve([])
          }
        }
        window.createImageBitmap = () => Promise.resolve({})
        api.searchFoods.mockResolvedValue([])
        let resolve
        api.readLabel.mockImplementation(() => new Promise((r) => { resolve = r }))
        render(<Comida />)
        await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
        await userEvent.upload(screen.getByLabelText('Etiqueta'), JPEG())

        expect(screen.getAllByText('Leyendo…')).toHaveLength(1)
        expect(screen.getByLabelText('Código de barras')).toBeInTheDocument()
        await act(async () => {
          resolve(LEIDO)
        })
        delete window.BarcodeDetector
        delete window.createImageBitmap
      })

      // El `disabled` vivía en el `input`, que no se ve; lo que se ve es el
      // `label` que lo envuelve. Así que mientras una cámara leía, la otra
      // seguía pintada exactamente igual que cuando funciona —misma tinta,
      // mismo peso, mismo borde— y al tocarla no pasaba nada. Un control que
      // no responde y no lo dice no se distingue de uno roto.
      it('la otra cámara se ve apagada mientras una lee', async () => {
        window.BarcodeDetector = class {
          detect() {
            return Promise.resolve([])
          }
        }
        window.createImageBitmap = () => Promise.resolve({})
        api.searchFoods.mockResolvedValue([])
        let resolve
        api.readLabel.mockImplementation(() => new Promise((r) => { resolve = r }))
        render(<Comida />)
        await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
        await userEvent.upload(screen.getByLabelText('Etiqueta'), JPEG())

        // El `label`, y no el `input` que devuelve `getByLabelText`: el input
        // está escondido, y lo que el ojo tiene que ver apagado es el marco.
        const marco = (n) => screen.getByLabelText(n).closest('label')
        expect(marco('Código de barras')).toHaveAttribute('aria-disabled', 'true')
        // Y la que está leyendo no se apaga: está trabajando, no bloqueada.
        expect(marco('Etiqueta')).not.toHaveAttribute('aria-disabled', 'true')
        expect(marco('Etiqueta').className).toContain('is-busy')

        await act(async () => {
          resolve(LEIDO)
        })
        delete window.BarcodeDetector
        delete window.createImageBitmap
      })

      it('una etiqueta por 100 ml se rellena, y lo dice', async () => {
        await fotografiar({ ...LEIDO, column_header: 'ø/100 ml', per: '100ml' })
        expect(await screen.findByLabelText('Kcal por 100 g')).toHaveValue('61')
        expect(
          screen.getByText('Estas cifras son por 100 ml, no por 100 g. Compruébalo antes de guardar.'),
        ).toBeInTheDocument()
      })

      // «¿Qué ha leído?» no se contesta con un veredicto. Con las filas
      // delante se ve de un vistazo si leyó bien y el backend descartó, o si
      // leyó mal desde el principio — y eso no lo dice ningún mensaje.
      it('enseña la tabla que dice haber leído, a un toque', async () => {
        await fotografiar({
          ...LEIDO,
          rows: ['Valor energético 61 kcal', 'Proteínas 3,8 g'],
        })
        await screen.findByLabelText('Nombre')
        expect(screen.queryByText('Valor energético 61 kcal')).toBeNull()
        await userEvent.click(screen.getByRole('button', { name: 'Ver lo que he leído' }))
        expect(screen.getByText('Valor energético 61 kcal')).toBeInTheDocument()
        expect(screen.getByText('Proteínas 3,8 g')).toBeInTheDocument()
      })

      it('y también cuando no ha sacado ninguna cifra, que es cuando más falta hace', async () => {
        await fotografiar({
          ...LEIDO,
          nutrients: { kcal: null, protein: null, fat: null, carbs: null, fiber: null },
          rows: ['Energia 61 kcal'],
        })
        await screen.findByText('No he sacado ninguna cifra de la foto. Tecléalas.')
        await userEvent.click(screen.getByRole('button', { name: 'Ver lo que he leído' }))
        expect(screen.getByText('Energia 61 kcal')).toBeInTheDocument()
      })

      it('sin transcripción no ofrece un desplegable vacío', async () => {
        await fotografiar({ ...LEIDO, rows: [] })
        await screen.findByLabelText('Nombre')
        expect(screen.queryByRole('button', { name: 'Ver lo que he leído' })).toBeNull()
      })

      // La única defensa contra un dígito mal leído. Una fila que existe, un
      // número plausible y la columna correcta pasan todos los demás filtros;
      // lo que no pasa es que las kcal y los macros de la misma etiqueta no
      // den lo mismo.
      it('avisa cuando las cifras no cuadran entre sí, y no las esconde', async () => {
        await fotografiar({
          ...LEIDO,
          nutrients: { ...LEIDO.nutrients, protein: 8.8 },
          mismatch: { declared: 61, computed: 82.6 },
        })
        expect(await screen.findByLabelText('Proteína por 100 g')).toHaveValue('8,8')
        expect(
          screen.getByText(
            'Las cifras no cuadran: pone 61 kcal, pero los macros suman 83. Comprueba la etiqueta.',
          ),
        ).toBeInTheDocument()
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
      expect(document.querySelector('.food-blank')?.contains(panel)).toBe(false)
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
      await waitFor(() => expect(slotNames()).toHaveLength(4))
      expect(screen.queryByText('Lo de siempre')).not.toBeInTheDocument()
    })

    it('cada comida es su propia puerta, y no hay una CTA global', async () => {
      api.frequentFoods.mockResolvedValue(SIEMPRE)
      render(<Comida />)
      await screen.findByRole('button', { name: /Pan de la panadería/ })
      // Una puerta por comida y ninguna más. La CTA fija preguntaba a dónde iba
      // lo que ibas a registrar, y entrando por la comida esa pregunta ya está
      // contestada: cuatro controles que dicen a dónde llevan valen más que uno
      // que no lo dice y hay que corregir después.
      expect(screen.queryByRole('button', { name: 'Añadir alimento' })).not.toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /^Añadir a / })).toHaveLength(4)
    })

    it('entrar por una comida deja ese destino ya puesto', async () => {
      api.searchFoods.mockResolvedValue([PAN])
      api.logFood.mockResolvedValue(entry())
      render(<Comida />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a cena' }))
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
      await waitFor(() => expect(slotNames()).toHaveLength(4))
      expect(screen.queryByText('Lo de siempre')).not.toBeInTheDocument()
    })
  })

  describe('el objetivo diario', () => {
    it('sin objetivo, la cifra grande sigue siendo lo comido', async () => {
      render(<Comida />)
      const macros = await screen.findByTestId('food-macros')
      expect(within(macros).getByText('Llevas')).toBeInTheDocument()
      expect(within(macros).queryByText('Te falta')).not.toBeInTheDocument()
      expect(screen.getByText('Sin fijar')).toBeInTheDocument()
    })

    it('con objetivo, la cifra grande pasa a ser lo que falta de proteína', async () => {
      api.getFoodDay.mockResolvedValue(objetivo())
      render(<Comida />)
      const macros = await screen.findByTestId('food-macros')
      // El héroe es lo que **falta**, y de proteína: es la pregunta que se hace
      // a las 20:00. Contestarla con lo comido obliga a restar de cabeza.
      expect(within(macros).getByText('Te falta')).toBeInTheDocument()
      expect(within(macros).getByText('154')).toBeInTheDocument()
      expect(within(macros).getByText('g de proteína')).toBeInTheDocument()
      // Lo comido no desaparece: baja a la derecha, pequeño y apagado.
      expect(within(macros).getByText('Llevas')).toBeInTheDocument()
      expect(within(macros).getByText('6 / 160')).toBeInTheDocument()
      // Y las kcal dejan de ser el héroe: bajan a la fila de cierre.
      expect(within(macros).getByText('kcal 200 / 2800')).toBeInTheDocument()
    })

    // ---------------------------------------------------------------------
    // El contrato de color: el color codifica **progreso**, no categoría.
    //
    // Estas cuatro pruebas son el contrato escrito. Se fija con clases y no con
    // colores calculados a propósito: en jsdom no hay motor de maquetación y
    // `getComputedStyle` no resuelve `color-mix`, así que lo que se puede
    // afirmar aquí es qué pieza lleva cada papel. El color realmente pintado se
    // mide en `src/browser/`, en Chromium.
    // ---------------------------------------------------------------------
    it('cada barra parte lo cumplido de lo que falta, y sólo la proteína manda', async () => {
      api.getFoodDay.mockResolvedValue(objetivo())
      render(<Comida />)
      const macros = await screen.findByTestId('food-macros')
      // Tres barras: proteína, hidratos y grasa. La fibra no tiene objetivo, así
      // que no tiene barra — una barra sin meta no mide nada.
      expect(macros.querySelectorAll('.food-macro-bar')).toHaveLength(3)
      // Una sola manda, y se dice con intensidad (10px frente a 6px), no con un
      // tono distinto: un color por macro sería redundante con la posición.
      expect(macros.querySelectorAll('.food-macro.is-lead')).toHaveLength(1)
      // Los dos tramos: lo cumplido, desaturado y con su ancho; lo que falta,
      // en cromo y ocupando el resto.
      const done = macros.querySelector('.food-macro.is-lead .food-macro-done')
      expect(done).toHaveStyle({ width: '4%' })
      expect(macros.querySelector('.food-macro.is-lead .food-macro-left')).not.toBeNull()
    })

    it('al cerrar el objetivo la barra pasa a --pr entera, sin costura', async () => {
      api.getFoodDay.mockResolvedValue(
        objetivo({
          totals: { kcal: 2800, protein: 160, fat: 80, carbs: 300, fiber: 2 },
          remaining_protein: 0,
        }),
      )
      render(<Comida />)
      const macros = await screen.findByTestId('food-macros')
      // El único momento en que el tono profundo ocupa la barra entera. Partirla
      // en «cumplido» y «pendiente» cuando no queda pendiente dibujaría una
      // costura donde ya no hay dos cosas.
      const bar = macros.querySelector('.food-macro.is-lead .food-macro-bar')
      expect(bar).toHaveClass('is-closed')
      expect(bar.querySelector('.food-macro-done')).toBeNull()
      expect(bar.querySelector('.food-macro-left')).toBeNull()
      // Y el número deja de ser una resta y pasa a ser el marcador: un «te falta
      // 0» sería la misma cifra diciendo lo contrario de lo que ha pasado.
      expect(within(macros).getByText('Cerrado')).toBeInTheDocument()
      expect(within(macros).getByText('160 / 160')).toBeInTheDocument()
      expect(within(macros).queryByText('Te falta')).not.toBeInTheDocument()
    })

    it('un día vacío con objetivo enseña el objetivo entero como lo que falta', async () => {
      api.getFoodDay.mockResolvedValue(
        objetivo({
          entries: [],
          totals: { kcal: null, protein: null, fat: null, carbs: null, fiber: null },
          by_slot: slots(),
          remaining_protein: 160,
        }),
      )
      render(<Comida />)
      const macros = await screen.findByTestId('food-macros')
      expect(within(macros).getByText('160')).toBeInTheDocument()
      // Nada comido no es cero comido: la cifra de la izquierda es una raya.
      expect(within(macros).getByText('— / 160')).toBeInTheDocument()
    })

    it('la línea de cierre dice lo que falta para cerrar el día', async () => {
      api.getFoodDay.mockResolvedValue(objetivo())
      render(<Comida />)
      const close = await waitFor(() => {
        const el = document.querySelector('.food-close')
        expect(el).not.toBeNull()
        return el
      })
      expect(close).toHaveTextContent('Te faltan 154 g de proteína para cerrar el día.')
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

// La hoja de corregir un alimento. `correctFood` existía en `api.js` desde que
// se escribió el backend y no la llamaba nadie: la U del CRUD tenía endpoint,
// tenía envoltorio y no tenía pantalla (revisión del CRUD, 2026-09-08).
describe('corregir un alimento', () => {
  const abrir = async (food = PAN) => {
    api.searchFoods.mockResolvedValue([food])
    render(<Comida />)
    await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
    await userEvent.type(screen.getByLabelText('Buscar alimento'), 'pan')
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(food.name) }))
  }

  beforeEach(() => {
    // Como el describe grande: sin esto, `toHaveBeenCalled` de un test ve las
    // llamadas del anterior y una aserción de «no se llamó» pasa o falla según
    // el orden en que corran.
    vi.resetAllMocks()
    api.getFoodDay.mockResolvedValue(day())
    api.frequentFoods.mockResolvedValue([])
  })

  it('el catálogo compartido no se ofrece corregir', async () => {
    // `is_mine` es falso en una fila de CIQUAL, y el servidor la rechazaría con
    // un 403. Un control que no puede funcionar es peor que uno que no está.
    await abrir({ ...PAN, is_mine: false, name: 'Arroz blanco cocido' })
    expect(screen.queryByRole('button', { name: 'Corregir' })).not.toBeInTheDocument()
  })

  it('corrige las cifras sin tocar lo ya registrado', async () => {
    api.correctFood.mockResolvedValue({ ...PAN, kcal_100g: 265 })
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Corregir' }))
    await userEvent.clear(screen.getByLabelText('Kcal por 100 g'))
    await userEvent.type(screen.getByLabelText('Kcal por 100 g'), '265')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }))
    await waitFor(() =>
      expect(api.correctFood).toHaveBeenCalledWith(1, expect.objectContaining({ kcal_100g: 265 })),
    )
  })

  it('un macro que se vacía queda desconocido, no en cero', async () => {
    api.correctFood.mockResolvedValue({ ...PAN, fiber_100g: null })
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Corregir' }))
    await userEvent.clear(screen.getByLabelText('Fibra por 100 g'))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }))
    await waitFor(() =>
      expect(api.correctFood).toHaveBeenCalledWith(1, expect.objectContaining({ fiber_100g: null })),
    )
  })

  it('corrige un código de barras mal tecleado', async () => {
    api.correctFood.mockResolvedValue(PAN)
    await abrir({ ...PAN, barcode: '8410000000009' })
    await userEvent.click(screen.getByRole('button', { name: 'Corregir' }))
    await userEvent.clear(screen.getByLabelText('Código de barras'))
    await userEvent.type(screen.getByLabelText('Código de barras'), '8410000000001')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }))
    await waitFor(() =>
      expect(api.correctFood).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ barcode: '8410000000001' }),
      ),
    )
  })

  it('añade una ración y la deja por defecto', async () => {
    api.correctFood.mockResolvedValue(PAN)
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Corregir' }))
    await userEvent.click(screen.getByRole('button', { name: 'Añadir ración' }))
    await userEvent.type(screen.getByLabelText('Ración 1'), 'rebanada')
    await userEvent.type(screen.getByLabelText('Gramos de la ración 1'), '30')
    await userEvent.click(screen.getByRole('radio', { name: 'Ración 1 por defecto' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }))
    await waitFor(() =>
      expect(api.correctFood).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          portions: [{ label: 'rebanada', grams: 30, is_default: true }],
        }),
      ),
    )
  })

  it('quita una ración que ya tenía', async () => {
    api.correctFood.mockResolvedValue(PAN)
    await abrir({
      ...PAN,
      portions: [{ id: 7, label: 'rebanada', grams: 30, is_default: true }],
    })
    await userEvent.click(screen.getByRole('button', { name: 'Corregir' }))
    await userEvent.click(screen.getByRole('button', { name: 'Quitar la ración 1' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }))
    await waitFor(() =>
      expect(api.correctFood).toHaveBeenCalledWith(1, expect.objectContaining({ portions: [] })),
    )
  })

  it('un alimento no se puede borrar, sólo corregir', async () => {
    // «Borrar» en esta app es la entrada del diario, y eso se hace deslizando
    // su fila. Un alimento mal dado de alta se arregla escribiendo encima, que
    // es lo que hace esta misma hoja.
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Corregir' }))
    expect(screen.queryByRole('button', { name: 'Borrar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archivar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar alimento' })).toBeInTheDocument()
  })
})

// Corregir un alimento y lo que hay en el diario de ese día.
//
// El congelado sigue siendo la regla: nada se recalcula solo. Pero corregir un
// alimento es lo que hace quien acaba de ver que lo tecleó mal, y ahí congelar
// es conservar el error — así que la pantalla lo ofrece, para ese día y sólo si
// se acepta (2026-09-08).
describe('corregir un alimento y el registro de ese día', () => {
  const conPan = (overrides = {}) =>
    day({
      entries: [entry({ id: 10, food_id: 1, food_name: 'Pan de la panadería', kcal: 250 })],
      ...overrides,
    })

  const abrirCorregir = async () => {
    api.searchFoods.mockResolvedValue([PAN])
    render(<Comida />)
    await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
    await userEvent.type(screen.getByLabelText('Buscar alimento'), 'pan')
    // Dentro de la lista de resultados: el día de estos tests ya lleva una
    // entrada con este mismo nombre, y tocar esa abre otra cosa.
    const lista = await screen.findByRole('list')
    // `find` y no `get`: la búsqueda rebota 180 ms, y la lista existe vacía
    // desde el primer pintado.
    await userEvent.click(await within(lista).findByRole('button', { name: /Pan de la panadería/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Corregir' }))
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.setSystemTime(new Date(2026, 7, 31, 12, 0))
    api.frequentFoods.mockResolvedValue([])
    api.correctFood.mockResolvedValue({ ...PAN, kcal_100g: 265 })
    api.recomputeFoodDay.mockResolvedValue({ updated: 1 })
  })

  it('ofrece rehacer lo de ese día, diciendo cuántas entradas son', async () => {
    api.getFoodDay.mockResolvedValue(conPan())
    await abrirCorregir()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }))
    expect(await screen.findByText('1 entrada de este día usa las cifras antiguas.')).toBeInTheDocument()
    // Todavía no ha tocado nada: ofrecer no es hacer.
    expect(api.recomputeFoodDay).not.toHaveBeenCalled()
  })

  it('rehace ese día cuando se acepta', async () => {
    api.getFoodDay.mockResolvedValue(conPan())
    await abrirCorregir()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Actualizar' }))
    await waitFor(() => expect(api.recomputeFoodDay).toHaveBeenCalledWith(1, '2026-08-31'))
  })

  it('decir que no deja el diario como estaba', async () => {
    api.getFoodDay.mockResolvedValue(conPan())
    await abrirCorregir()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Dejarlo como está' }))
    expect(api.recomputeFoodDay).not.toHaveBeenCalled()
  })

  it('sin nada de ese alimento ese día no ofrece nada', async () => {
    api.getFoodDay.mockResolvedValue(day())
    await abrirCorregir()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }))
    await waitFor(() => expect(api.correctFood).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Actualizar' })).not.toBeInTheDocument()
  })

  it('cuenta en plural cuando son varias', async () => {
    api.getFoodDay.mockResolvedValue(
      day({
        entries: [
          entry({ id: 10, food_id: 1, food_name: 'Pan de la panadería', kcal: 250 }),
          entry({ id: 11, food_id: 1, food_name: 'Pan de la panadería', kcal: 500 }),
        ],
      }),
    )
    await abrirCorregir()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }))
    expect(
      await screen.findByText('2 entradas de este día usan las cifras antiguas.'),
    ).toBeInTheDocument()
  })

  it('si rehacer el día falla, lo dice y se puede reintentar', async () => {
    // El alimento ya está corregido cuando esto se intenta, así que un fallo
    // aquí no puede dejar el botón muerto ni callarse lo que sí se guardó.
    api.getFoodDay.mockResolvedValue(conPan())
    api.recomputeFoodDay.mockRejectedValue(new Error('sin red'))
    await abrirCorregir()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Actualizar' }))
    expect(
      await screen.findByText('No se ha podido actualizar. El alimento sí quedó corregido.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeEnabled()
  })

})
