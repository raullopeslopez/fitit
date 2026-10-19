import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Comida from './Comida.jsx'
import * as api from './api.js'
import { foodDayIso } from './food.js'

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
const slotNames = () => [...document.querySelectorAll('.hoy-fila-nombre')].map((e) => e.textContent)
// Los subtotales. Sólo los llevan las comidas con contenido: un hueco no suma.
const slotMetas = () => [...document.querySelectorAll('.hoy-fila-cifras')].map((e) => e.textContent)

// Del lunes 31 al domingo 30: la tira es la semana, así que el día de antes de
// un lunes está en la semana anterior.
async function alDomingo30() {
  await userEvent.click(screen.getByRole('button', { name: 'Semana anterior' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Domingo 30' }))
}

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
    // Este servidor sabe leer una etiqueta. Sin esto la cámara no se dibuja —a
    // propósito: un disparador que no puede funcionar es peor que uno que no
    // está— y ninguna prueba de cámara encontraría a qué subir la foto.
    label_reading: true,
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
    api.usualAmounts.mockResolvedValue([])
    // Lo que la pantalla pide además del día: los platos, las reglas y su
    // veredicto. Vacíos por defecto — lo que se mide aquí es el diario, y una
    // sección sin nada dentro no se dibuja.
    api.listDishes.mockResolvedValue([])
    api.listRules.mockResolvedValue([])
    api.dayVerdicts.mockResolvedValue({ date: '2026-08-31', verdicts: [], acceptable: true })
    api.getTargetProfile.mockResolvedValue({})
    // Sin plan para la semana: la tarjeta ofrece generarlo y no estorba al resto.
    api.getPlan.mockResolvedValue(null)
    api.getAdherence.mockResolvedValue(null)
    api.getTargetProposal.mockResolvedValue({ kcal: null, source: null, days: 0, missing: [] })
    // La revisión semanal no toca por defecto: lo que se mide aquí es el diario.
    api.getReview.mockResolvedValue({ due: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('abre en el día alimentario en curso', async () => {
    render(<Comida abiertas />)
    await waitFor(() => expect(api.getFoodDay).toHaveBeenCalledWith('2026-08-31'))
    expect(screen.getByText('LUN 31 AGO')).toBeInTheDocument()
  })

  describe('el objetivo, a la vista (sistema v2)', () => {
    // Una propuesta sin aceptar y Comida sin decir nada: así se pasaron semanas.
    it('hoy sin objetivo lo dice arriba y ofrece calcularlo', async () => {
      render(<Comida abiertas />)
      expect(
        await screen.findByRole('button', { name: 'Sin objetivo todavía · Calcularlo' }),
      ).toBeInTheDocument()
    })

    it('con objetivo, la línea dice el plan y la cifra del día', async () => {
      api.getFoodDay.mockResolvedValue(day({ target_kcal: 2230 }))
      api.getTargetProfile.mockResolvedValue({ goal: 'cut', goal_rate: 0.5 })
      render(<Comida abiertas />)
      expect(
        await screen.findByRole('button', { name: 'Bajando 0,5 kg/sem · 2230 kcal' }),
      ).toBeInTheDocument()
    })

    // Un día pasado tiene el objetivo que tenía, congelado; el plan de hoy al
    // lado haría creer que aquel día se comía con este ritmo.
    it('un día pasado no enseña la línea del plan', async () => {
      render(<Comida abiertas />)
      await screen.findByRole('button', { name: 'Sin objetivo todavía · Calcularlo' })
      await userEvent.click(screen.getByRole('button', { name: 'Semana anterior' }))
      await waitFor(() => expect(api.getFoodDay).toHaveBeenCalledWith('2026-08-24'))
      expect(screen.queryByRole('button', { name: /Sin objetivo todavía/ })).not.toBeInTheDocument()
    })

    // §31: aceptar a media jornada no reescribe lo congelado de hoy.
    it('si lo aceptado difiere del de hoy, la línea dice cuál rige mañana', async () => {
      api.getFoodDay.mockResolvedValue(day({ target_kcal: 2230 }))
      api.getTargetProfile.mockResolvedValue({ goal: 'cut', goal_rate: 0.5, objetivo_kcal: 2569 })
      render(<Comida abiertas />)
      expect(
        await screen.findByRole('button', { name: 'Bajando 0,5 kg/sem · 2230 kcal · mañana 2569' }),
      ).toBeInTheDocument()
    })

    // Planificar es de la pestaña Plan: Comida sólo mira el plan de la semana
    // del día, para poner cada plato dentro de su comida.
    it('Comida ya no planifica la semana que viene', async () => {
      render(<Comida abiertas />)
      await waitFor(() => expect(api.getPlan).toHaveBeenCalledWith('2026-08-31'))
      expect(api.getPlan).not.toHaveBeenCalledWith('2026-09-07')
      expect(screen.queryByRole('button', { name: /semana que viene/ })).not.toBeInTheDocument()
      expect(screen.queryByText('Tu plan')).not.toBeInTheDocument()
    })

    it('lo planificado de hoy va dentro de su comida, y confirmarlo pregunta el peso', async () => {
      api.getPlan.mockResolvedValue({
        id: 1,
        week_start: '2026-08-31',
        entries: [
          {
            id: 5,
            log_date: '2026-08-31',
            slot: 'comida',
            dish_id: 7,
            dish_name: 'Lentejas con chorizo',
            grams: [150],
            kcal: 640,
            status: null,
            log_entry_id: null,
          },
        ],
      })
      api.setPlanEntry.mockResolvedValue({})
      api.listBodyWeights.mockResolvedValue([])
      render(<Comida abiertas />)
      const comida = (await screen.findByText('Lentejas con chorizo')).closest('.food-slot')
      expect(comida.dataset.slot).toBe('comida')
      // Con algo planificado, la comida ya no dice que está vacía: dice qué toca.
      expect(within(comida).queryByText('Nada todavía')).not.toBeInTheDocument()
      await userEvent.click(within(comida).getByRole('button', { name: 'Lo comí' }))
      await waitFor(() => expect(api.setPlanEntry).toHaveBeenCalledWith(5, 'done', null, expect.any(String)))
      expect(await screen.findByText('¿Te has pesado hoy?')).toBeInTheDocument()
    })

    // Marcador: cada comida es una fila plegada. Lo previsto va debajo del
    // nombre, y «Comido» lo da por comido en un toque, sin desplegar nada.
    it('plegada, la comida dice lo previsto y «Comido» lo confirma en un toque', async () => {
      api.getPlan.mockResolvedValue({
        id: 1,
        week_start: '2026-08-31',
        entries: [
          { id: 5, log_date: '2026-08-31', slot: 'comida', dish_id: 7, dish_name: 'Lentejas con chorizo',
            grams: [150], kcal: 640, status: null, log_entry_id: null },
        ],
      })
      api.setPlanEntry.mockResolvedValue({})
      api.listBodyWeights.mockResolvedValue([])
      render(<Comida />)
      const linea = await screen.findByText('Lentejas con chorizo', { selector: '.hoy-fila-linea' })
      const comida = linea.closest('.food-slot')
      expect(within(comida).queryByRole('button', { name: 'Lo comí' })).not.toBeInTheDocument()
      await userEvent.click(within(comida).getByRole('button', { name: 'Comido' }))
      await waitFor(() => expect(api.setPlanEntry).toHaveBeenCalledWith(5, 'done', null, expect.any(String)))
    })

    it('al final de Hoy, la fila «Peso» abre «Apuntar pesada»', async () => {
      api.weightTrend.mockResolvedValue({ last_kg: 78.4, kg: 78.6, weigh_ins: 3, up_to: '2026-08-30' })
      api.listBodyWeights.mockResolvedValue([])
      render(<Comida onTrain={() => {}} />)
      const fila = await screen.findByRole('button', { name: /^Peso 78,4 kg$/ })
      await userEvent.click(fila)
      expect(await screen.findByRole('dialog', { name: 'Apuntar pesada' })).toBeInTheDocument()
    })

    it('tocar la fila la despliega: las demás respuestas al plan', async () => {
      api.getPlan.mockResolvedValue({
        id: 1,
        week_start: '2026-08-31',
        entries: [
          { id: 5, log_date: '2026-08-31', slot: 'comida', dish_id: 7, dish_name: 'Lentejas con chorizo',
            grams: [150], kcal: 640, status: null, log_entry_id: null },
        ],
      })
      render(<Comida />)
      const linea = await screen.findByText('Lentejas con chorizo', { selector: '.hoy-fila-linea' })
      const toggle = linea.closest('button')
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await userEvent.click(toggle)
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      const comida = toggle.closest('.food-slot')
      expect(within(comida).getByRole('button', { name: 'Me lo salté' })).toBeInTheDocument()
    })

    // Reorganización Comida/Plan (17 oct): Comida es hoy. Lo que quedó sin
    // decir ayer se cierra igual, pero debajo: arriba obligaba a bajar ocho
    // tarjetas de otros días para llegar al desayuno de hoy.
    it('lo sin decir de ayer va debajo de las comidas de hoy', async () => {
      api.getPlan.mockImplementation(async (lunes) =>
        lunes === '2026-08-24'
          ? {
              id: 2,
              week_start: '2026-08-24',
              entries: [
                {
                  id: 9,
                  log_date: '2026-08-30',
                  slot: 'cena',
                  dish_id: 7,
                  dish_name: 'Merluza al horno',
                  grams: [150],
                  kcal: 480,
                  status: null,
                  log_entry_id: null,
                },
              ],
            }
          : null,
      )
      render(<Comida abiertas />)
      const sinDecir = await screen.findByRole('region', { name: 'Sin decir' })
      const diario = document.querySelector('.food-diario')
      expect(diario).not.toBeNull()
      expect(diario.compareDocumentPosition(sinDecir) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('el botón flotante abre la pantalla de añadir', async () => {
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir comida' }))
      expect(await screen.findByLabelText('Buscar alimento')).toBeInTheDocument()
      // Con la pantalla de añadir abierta no hay un segundo «añadir» flotando encima.
      expect(screen.queryByRole('button', { name: 'Añadir comida' })).not.toBeInTheDocument()
    })
  })

  it('un día vacío lo dice comida por comida, en vez de enseñar ceros', async () => {
    render(<Comida abiertas />)
    // Las cuatro comidas, cada una diciendo que está vacía con palabras y sin
    // subtotal en cero: un 0 afirmaría que se sabe que no comiste nada.
    await waitFor(() => expect(slotNames()).toEqual(['Desayuno', 'Comida', 'Cena', 'Snack']))
    expect(screen.getAllByText('Nada todavía')).toHaveLength(4)
    expect(screen.queryByText('0 kcal')).not.toBeInTheDocument()
    expect(slotMetas()).toEqual([])
  })

  // La tira es la semana del día que miras: un toque por día, y las flechas
  // saltan de semana.
  it('se mueve por la semana y vuelve a hoy', async () => {
    render(<Comida abiertas />)
    await screen.findByText('LUN 31 AGO')
    await alDomingo30()
    await waitFor(() => expect(api.getFoodDay).toHaveBeenLastCalledWith('2026-08-30'))
    expect(screen.getByRole('button', { name: 'Domingo 30' })).toHaveAttribute('aria-pressed', 'true')
    // Una semana adelante desde el domingo 30 sería el 6, que no ha llegado: hoy.
    await userEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }))
    await waitFor(() => expect(api.getFoodDay).toHaveBeenLastCalledWith('2026-08-31'))
  })

  it('dice qué día miras con una palabra: hoy, ayer o su nombre', async () => {
    render(<Comida abiertas />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Hoy' })).toBeInTheDocument()
    await alDomingo30()
    expect(await screen.findByRole('heading', { level: 1, name: 'Ayer' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Viernes 28' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Viernes' })).toBeInTheDocument()
  })

  it('no deja adelantarse a un día que todavía no ha pasado', async () => {
    render(<Comida abiertas />)
    await screen.findByText('LUN 31 AGO')
    expect(screen.getByRole('button', { name: 'Martes 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Semana siguiente' })).toBeDisabled()
  })

  it('imprime el total y sus macros', async () => {
    api.getFoodDay.mockResolvedValue(
      day({
        entries: [entry()],
        totals: { kcal: 200, protein: 6.4, fat: 2.4, carbs: 38.4, fiber: 2.1 },
        by_slot: slots({ desayuno: 200 }),
      }),
    )
    render(<Comida abiertas />)
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
    render(<Comida abiertas />)
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
    render(<Comida abiertas />)
    await screen.findByText('Tortilla')
    // Los cuatro raíles están siempre, hayas comido o no: son la puerta por la
    // que se registra en esa comida, y una puerta que aparece y desaparece
    // mueve de sitio el control que ibas a pulsar.
    // En el orden en que se comen, llenas o no: el diario se lee de arriba
    // abajo, y lo que no elegiste va al final.
    expect(slotNames()).toEqual(['Desayuno', 'Comida', 'Cena', 'Snack', 'Sin asignar'])
  })

  it('el montón sin asignar no se dibuja si está vacío', async () => {
    api.getFoodDay.mockResolvedValue(
      day({
        entries: [entry()],
        totals: { kcal: 200, protein: 6, fat: 2, carbs: 38, fiber: 2 },
        by_slot: slots({ desayuno: 200 }),
      }),
    )
    render(<Comida abiertas />)
    await screen.findByText('Pan de la panadería')
    // Nadie quiere *decidir* no decidir: el montón no lleva `+`, así que
    // enseñarlo vacío sería una cabecera sin nada que hacer debajo.
    expect(slotNames()).toEqual(['Desayuno', 'Comida', 'Cena', 'Snack'])
  })

  // El tono de cada comida se cablea aquí y se pinta en `styles.css`. Lo que
  // esta prueba fija es sólo lo que jsdom puede ver: qué tarjeta lleva qué
  // marca. Que el color resultante se distinga del papel, y que no le quite el
  // sitio al ámbar, lo mide `comida.browser-test.jsx` sobre el color pintado —
  // aquí no hay pintado que medir.
  it('cada comida dice cuál es, y el montón sin asignar no', async () => {
    api.getFoodDay.mockResolvedValue(
      day({
        entries: [
          entry({ id: 1, meal_slot: 'desayuno', food_name: 'Pan' }),
          entry({ id: 2, meal_slot: 'cena', food_name: 'Tortilla' }),
          entry({ id: 3, meal_slot: null, food_name: 'Café' }),
        ],
        totals: { kcal: 600, protein: 20, fat: 10, carbs: 80, fiber: 6 },
        by_slot: slots({ desayuno: 200, cena: 340, sin: 60 }),
      }),
    )
    render(<Comida abiertas />)
    await screen.findByText('Tortilla')

    const tarjeta = (nombre) =>
      [...document.querySelectorAll('.food-slot')].find(
        (el) => el.querySelector('.hoy-fila-nombre').textContent === nombre,
      )

    // Las que tienen algo dentro.
    expect(tarjeta('Desayuno').dataset.slot).toBe('desayuno')
    expect(tarjeta('Cena').dataset.slot).toBe('cena')
    // Y los huecos, que también son esa comida aunque no tengan nada.
    expect(tarjeta('Comida').dataset.slot).toBe('comida')
    expect(tarjeta('Snack').dataset.slot).toBe('snack')

    // El montón sin asignar no es una comida que elegiste — es lo que se quedó
    // sin elegir — y no lleva atributo.
    expect(tarjeta('Sin asignar').hasAttribute('data-slot')).toBe(false)
  })

  it('una comida con algo lleva su subtotal; un hueco no lleva ninguno', async () => {
    api.getFoodDay.mockResolvedValue(
      day({
        entries: [entry()],
        totals: { kcal: 200, protein: 6, fat: 2, carbs: 38, fiber: 2 },
        by_slot: slots({ desayuno: 200 }),
      }),
    )
    render(<Comida abiertas />)
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
    render(<Comida abiertas />)
    await screen.findByText('Pan de la panadería')
    // Aquí sí hay algo —una entrada—, sólo que a su kcal le falta el dato: la
    // raya sigue siendo la respuesta correcta, distinta de un hueco vacío.
    expect(slotMetas()).toEqual(['— P · — kcal'])
  })

  it('cada entrada dice cuánto y cuánta proteína', async () => {
    api.getFoodDay.mockResolvedValue(
      day({ entries: [entry()], totals: { kcal: 200, protein: 6, fat: 2, carbs: 38, fiber: 2 } }),
    )
    render(<Comida abiertas />)
    const row = await screen.findByRole('button', { name: /Pan de la panadería/ })
    expect(row).toHaveTextContent('80 g')
    // La proteína, no las kcal: es el macro que la cabecera persigue, así que es
    // el que se puede barrer por el borde derecho. Las kcal siguen estando,
    // sumadas en la cabecera de la comida.
    expect(row).toHaveTextContent('6 P')
  })

  it('lo apuntado en cucharadas dice la medida, y sus gramos como aproximados', async () => {
    api.getFoodDay.mockResolvedValue(
      day({ entries: [entry({ grams: 30, measure: 'cda', measure_count: 2 })] }),
    )
    render(<Comida abiertas />)
    const row = await screen.findByRole('button', { name: /Pan de la panadería/ })
    expect(row).toHaveTextContent('2 cdas · ~30 g')
    // La medida, en tinta: es lo que hiciste. Los gramos aproximados, apagados.
    expect(row.querySelector('.food-entry-measure')).toHaveTextContent(/^2 cdas$/)
  })

  it('una entrada sin proteína enseña una raya, no un cero', async () => {
    api.getFoodDay.mockResolvedValue(
      day({
        entries: [entry({ protein: null })],
        unknown: { kcal: 0, protein: 1, fat: 0, carbs: 0, fiber: 0 },
      }),
    )
    render(<Comida abiertas />)
    const row = await screen.findByRole('button', { name: /Pan de la panadería/ })
    expect(row).toHaveTextContent('— P')
  })

  describe('dictar', () => {
    it('el micro está junto a «Añadir comida» y dentro de «Añadir a»', async () => {
      render(<Comida abiertas />)
      expect(await screen.findByRole('button', { name: 'Dictar comida' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Añadir a desayuno' }))
      expect(screen.getByRole('button', { name: 'Dictar' })).toBeInTheDocument()
    })

    it('sin modelo en el servidor no hay micro', async () => {
      api.getFoodDay.mockResolvedValue(day({ label_reading: false }))
      render(<Comida abiertas />)
      await screen.findByRole('button', { name: 'Añadir a desayuno' })
      expect(screen.queryByRole('button', { name: 'Dictar comida' })).not.toBeInTheDocument()
    })

    it('tocar el micro empieza a escuchar', async () => {
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Dictar comida' }))
      // jsdom no tiene micrófono: la grabación falla al instante y lo dice.
      expect(await screen.findByText('No se ha podido escuchar. Prueba otra vez.')).toBeInTheDocument()
    })
  })

  describe('añadir', () => {
    it('busca y registra en gramos', async () => {
      api.searchFoods.mockResolvedValue([PAN])
      api.logFood.mockResolvedValue(entry())
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'pan')
      await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
      await userEvent.clear(screen.getByLabelText('Cantidad'))
      await userEvent.type(screen.getByLabelText('Cantidad'), '80')
      await userEvent.click(screen.getByRole('button', { name: /^Añadir \d/ }))
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
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'pan')
      await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
      // La porción por defecto llega ya elegida: registrar "una rebanada" no
      // puede obligarte a pensar en gramos.
      expect(screen.getByRole('button', { name: 'rebanada · 30 g' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await userEvent.click(screen.getByRole('button', { name: /^Añadir \d/ }))
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
      render(<Comida abiertas />)
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
      render(<Comida abiertas />)
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
    describe('tus cantidades', () => {
    async function abrirPan(food = PAN) {
      api.searchFoods.mockResolvedValue([food])
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'pan')
      await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
    }

    it('la hoja arranca en la cantidad que más repites, y ofrece las otras', async () => {
      api.usualAmounts.mockResolvedValue([
        { grams: 125, times: 3 },
        { grams: 250, times: 1 },
      ])
      await abrirPan()
      expect(api.usualAmounts).toHaveBeenCalledWith(1)
      await waitFor(() => expect(screen.getByLabelText('Cantidad')).toHaveValue('125'))
      expect(screen.getByText('Tus cantidades')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '125 g · 3 veces' })).toHaveAttribute('aria-pressed', 'true')
      await userEvent.click(screen.getByRole('button', { name: '250 g · 1 vez' }))
      expect(screen.getByLabelText('Cantidad')).toHaveValue('250')
    })

    it('sin historial no hay fila y se queda en 100 g, como antes', async () => {
      api.usualAmounts.mockResolvedValue([])
      await abrirPan()
      await waitFor(() => expect(api.usualAmounts).toHaveBeenCalled())
      expect(screen.queryByText('Tus cantidades')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Cantidad')).toHaveValue('100')
    })

    it('una cantidad que son raciones exactas se dice en raciones, y manda sobre la de por defecto', async () => {
      api.usualAmounts.mockResolvedValue([{ grams: 60, times: 4 }])
      api.logFood.mockResolvedValue(entry())
      await abrirPan({ ...PAN, portions: [{ id: 7, label: 'rebanada', grams: 30, is_default: true }] })
      const chip = await screen.findByRole('button', { name: '2 × rebanada · 4 veces' })
      expect(chip).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByLabelText('Cuántas')).toHaveValue('2')
      await userEvent.click(screen.getByRole('button', { name: /^Añadir \d/ }))
      await waitFor(() =>
        expect(api.logFood).toHaveBeenCalledWith(
          expect.objectContaining({ portionId: 7, quantity: 2, grams: null }),
        ),
      )
    })

    it('con el selector se apunta en cucharadas, de media en media', async () => {
      api.usualAmounts.mockResolvedValue([])
      api.logFood.mockResolvedValue(entry())
      await abrirPan()
      await waitFor(() => expect(api.usualAmounts).toHaveBeenCalled())
      expect(screen.getByLabelText('Unidad')).toHaveValue('g')
      await userEvent.selectOptions(screen.getByLabelText('Unidad'), 'cda')
      expect(screen.getByLabelText('Cuántas')).toHaveValue('1')
      expect(screen.getByText('≈ 15 g')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Más cantidad' }))
      expect(screen.getByLabelText('Cuántas')).toHaveValue('1.5')
      await userEvent.click(screen.getByRole('button', { name: 'Más cantidad' }))
      expect(screen.getByText('≈ 30 g')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /^Añadir 2 cdas/ }))
      await waitFor(() =>
        expect(api.logFood).toHaveBeenCalledWith(
          expect.objectContaining({ foodId: 1, grams: null, portionId: null, measure: 'cda', quantity: 2 }),
        ),
      )
    })

    it('se abre en la unidad de la última vez, con lo que más repites en ella', async () => {
      api.usualAmounts.mockResolvedValue([
        { grams: 80, times: 3, measure: null, measure_count: null, latest: false },
        { grams: 30, times: 2, measure: 'cda', measure_count: 2, latest: false },
        { grams: 15, times: 1, measure: 'cda', measure_count: 1, latest: true },
      ])
      await abrirPan()
      await waitFor(() => expect(screen.getByLabelText('Unidad')).toHaveValue('cda'))
      expect(screen.getByLabelText('Cuántas')).toHaveValue('2')
      expect(screen.getByRole('button', { name: '2 cdas · 2 veces' })).toHaveAttribute('aria-pressed', 'true')
      await userEvent.click(screen.getByRole('button', { name: '80 g · 3 veces' }))
      expect(screen.getByLabelText('Unidad')).toHaveValue('g')
      expect(screen.getByLabelText('Cantidad')).toHaveValue('80')
    })

    it('si ya has escrito, lo que llega tarde no te pisa', async () => {
      let llegar
      api.usualAmounts.mockReturnValue(new Promise((resolve) => (llegar = resolve)))
      await abrirPan()
      await userEvent.clear(screen.getByLabelText('Cantidad'))
      await userEvent.type(screen.getByLabelText('Cantidad'), '80')
      await act(async () => llegar([{ grams: 125, times: 3 }]))
      expect(screen.getByLabelText('Cantidad')).toHaveValue('80')
      // La fila sí aparece: elegirla sigue siendo un toque.
      expect(screen.getByRole('button', { name: '125 g · 3 veces' })).toHaveAttribute('aria-pressed', 'false')
    })
  })

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
        render(<Comida abiertas />)
        await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
        await userEvent.upload(screen.getByLabelText('Abrir la cámara'), JPEG())
      }

      it('un producto que ya tienes se registra sin pasar por el formulario', async () => {
        await escanear({ barcode: '8410128750121', food: { ...PAN, name: 'Yogur natural' } })
        // Va directo a la cantidad: el alimento ya existe, no hay nada que dar
        // de alta.
        expect(await screen.findByLabelText('Cantidad')).toBeInTheDocument()
        expect(screen.queryByLabelText('Kcal por 100 g')).toBeNull()
      })

      // El ahorro que hace que esto valga la pena.
      //
      // Un producto resuelto por su código se guarda sin preguntar: el código lo
      // identifica mejor que cualquier nombre que yo teclee, la ficha viene de
      // una base pública, y poner un formulario delante es pedir una firma sin
      // lectura —nadie corrige campo por campo un dato que no ha medido—. Es lo
      // que convierte «veinte fotos al día» en «veinte productos nuevos al día».
      //
      // La excepción no llega a la lectura de la tabla: allí las cifras las ha
      // interpretado un modelo mirando una foto y la revisión sigue siendo
      // obligatoria. La frontera es dato identificado contra dato interpretado.
      it('uno que conoce Open Food Facts se guarda solo, con su código', async () => {
        api.createFood.mockResolvedValue({ ...PAN, id: 70, name: 'Yogur natural' })
        await escanear({
          barcode: '8410128750121',
          food: null,
          name: 'Yogur natural',
          brand: 'Hacendado',
          nutrients: { kcal: 61, protein: 3.8, fat: 3.2, carbs: 4.5, fiber: 0.3 },
          refusal: null,
        })
        await waitFor(() =>
          expect(api.createFood).toHaveBeenCalledWith(
            expect.objectContaining({
              name: 'Yogur natural',
              brand: 'Hacendado',
              barcode: '8410128750121',
              kcal_100g: 61,
              fiber_100g: 0.3,
            }),
          ),
        )
        // Y va derecho a «cuánto», que es lo único que faltaba por decidir.
        expect(await screen.findByLabelText('Cantidad')).toBeInTheDocument()
        expect(screen.queryByLabelText('Kcal por 100 g')).toBeNull()
      })

      it('y dice de dónde salió, y que ya está en tus alimentos', async () => {
        api.createFood.mockResolvedValue({ ...PAN, id: 70, name: 'Yogur natural' })
        await escanear({
          barcode: '8410128750121',
          food: null,
          name: 'Yogur natural',
          brand: 'Hacendado',
          nutrients: { kcal: 61, protein: 3.8, fat: 3.2, carbs: 4.5, fiber: 0.3 },
          refusal: null,
        })
        // Se cuenta **después**, no antes: el peldaño barato no se anuncia como
        // una opción que elegir, se usa y se dice que se ha usado.
        expect(
          await screen.findByText('Leído del código de barras. No ha hecho falta la tabla.'),
        ).toBeInTheDocument()
        expect(screen.getByText('Se guarda en tus alimentos, con su código.')).toBeInTheDocument()
      })

      it('un nutriente que la ficha no trae se guarda desconocido, no en cero', async () => {
        api.createFood.mockResolvedValue({ ...PAN, id: 70 })
        await escanear({
          barcode: '8410128750121',
          food: null,
          name: 'Yogur natural',
          brand: 'Hacendado',
          nutrients: { kcal: 61, protein: 3.8, fat: 3.2, carbs: 4.5 },
          refusal: null,
        })
        // Guardar sin preguntar no puede convertir un hueco en una medición: la
        // fibra que la ficha no declara viaja como `null`, igual que si nadie la
        // hubiera tecleado.
        await waitFor(() =>
          expect(api.createFood).toHaveBeenCalledWith(
            expect.objectContaining({ fiber_100g: null }),
          ),
        )
      })

      it('el código viaja hasta el alta aunque acabes tecleando, para no volver a preguntarlo mañana', async () => {
        await escanear({ barcode: '8410128750121', food: null, refusal: 'unknown' })
        // La escalada no tira el único dato que la foto sí dio. Se teclea el
        // alimento entero y el código se guarda con él igual.
        await userEvent.click(await screen.findByRole('button', { name: 'Teclearlo' }))
        api.createFood.mockResolvedValue({ ...PAN, id: 50 })
        await userEvent.type(await screen.findByLabelText('Nombre'), 'Pan de la panadería')
        await userEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }))
        await waitFor(() =>
          expect(api.createFood).toHaveBeenCalledWith(
            expect.objectContaining({ barcode: '8410128750121' }),
          ),
        )
      })

      // ── El peldaño de en medio ──────────────────────────────────────────
      //
      // Un código que no resuelve **no** dispara la lectura cara sobre esa misma
      // foto: el código y la tabla están en caras distintas del envase, así que
      // esa foto casi nunca trae tabla y pagarla sería comprar un fallo seguro.
      // Se pide otra, y se dice por qué.
      it('un código que nadie conoce pide la tabla, y no gasta la lectura en la foto del código', async () => {
        await escanear({ barcode: '8410128750121', food: null, refusal: 'unknown' })
        expect(await screen.findByText('Ese código no está en ninguna base.')).toBeInTheDocument()
        expect(screen.getByText('Acerca la foto a la tabla nutricional y la leo.')).toBeInTheDocument()
        expect(api.readLabel).not.toHaveBeenCalled()
      })

      it('las dos salidas del peldaño están, y ninguna es la única', async () => {
        await escanear({ barcode: '8410128750121', food: null, refusal: 'unknown' })
        await screen.findByRole('button', { name: 'Teclearlo' })
        // «Enfocar la tabla» es un `label` sobre un `input[type=file]`: el
        // disparador de verdad es el input, y es a él a quien se le sube la foto.
        expect(screen.getByLabelText('Enfocar la tabla')).toBeInTheDocument()
      })

      it('una ficha que existe pero no sirve también escala, y lo dice distinto', async () => {
        await escanear({
          barcode: '8410128750121',
          food: null,
          refusal: 'unusable',
          refused_reason: 'por ración',
        })
        // No es lo mismo que nadie lo conozca: está en la base, y lo que no
        // vale son sus cifras. La tabla del envase puede estar bien.
        expect(await screen.findByText('Los datos de ese código no me sirven.')).toBeInTheDocument()
      })

      it('sin red lo dice, y no lo hace pasar por un código desconocido', async () => {
        await escanear({ barcode: '8410128750121', food: null, refusal: 'offline' })
        expect(
          await screen.findByText('No he podido preguntar por ese código.'),
        ).toBeInTheDocument()
      })

      it('si en la foto no hay código, se lee la tabla de esa misma foto', async () => {
        api.readLabel.mockResolvedValue({
          name: 'Yogur natural',
          brand: 'Hacendado',
          column_header: 'por 100 g',
          nutrients: { kcal: 61, protein: 3.8, fat: 3.2, carbs: 4.5, fiber: 0.3 },
          dropped: [],
          refusal: null,
        })
        await escanear(null, [])
        // Sin código que probar no hay peldaño gratis que gastar, y la foto es
        // del envase igual: pedir otra sería pedir la misma.
        expect(api.scanBarcode).not.toHaveBeenCalled()
        expect(await screen.findByLabelText('Nombre')).toHaveValue('Yogur natural')
      })
    })

    // La cámara. Lee la etiqueta y **propone**: el formulario sigue siendo la
    // puerta, y lo que el backend no pudo respaldar llega en blanco, nunca a
    // cero.
    describe('leer la etiqueta de una foto', () => {
      const JPEG = () => new File([new Uint8Array([255, 216, 255])], 'etiqueta.jpg', {
        type: 'image/jpeg',
      })

      // Fuera del cuerpo de la prueba a propósito: dentro, un fallo se salta el
      // `delete` y `BarcodeDetector` se filtra a las pruebas siguientes, que
      // entonces escalan cuando no deberían y fallan por un motivo que no es el
      // suyo. Pasó al montar esta escalada, y cuesta media hora de depuración.
      afterEach(() => {
        delete window.BarcodeDetector
        delete window.createImageBitmap
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
        render(<Comida abiertas />)
        await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
        await userEvent.upload(screen.getByLabelText('Abrir la cámara'), JPEG())
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
        expect(await screen.findByText('Leído de «por 100 g»')).toBeInTheDocument()
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
        render(<Comida abiertas />)
        await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
        await userEvent.upload(screen.getByLabelText('Abrir la cámara'), JPEG())
        expect(
          await screen.findByText('La lectura de etiquetas no está configurada en el servidor.'),
        ).toBeInTheDocument()
        expect(screen.queryByText(/No he podido leer la etiqueta/)).toBeNull()
      })

      it('si no ha podido leerla, ofrece repetir o teclear —y teclear abre el formulario en blanco', async () => {
        api.searchFoods.mockResolvedValue([])
        api.readLabel.mockResolvedValue({
          ...LEIDO,
          name: null,
          brand: null,
          column_header: null,
          nutrients: { kcal: null, protein: null, fat: null, carbs: null, fiber: null },
          refusal: 'unreadable',
        })
        render(<Comida abiertas />)
        await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
        await userEvent.upload(screen.getByLabelText('Abrir la cámara'), JPEG())
        // Un `unreadable` que llega en un 200 del servidor y uno que llega como
        // error de red son el mismo callejón, y salen por la misma puerta.
        expect(await screen.findByText('No he podido leer la etiqueta.')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Teclearlo' }))
        expect(await screen.findByLabelText('Nombre')).toHaveValue('')
        expect(screen.getByLabelText('Kcal por 100 g')).toHaveValue('')
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

      // La escalada entera, de punta a punta: el código se lee, no lo conoce
      // nadie, se pide la tabla y la segunda foto sí resuelve.
      //
      // Hereda un defecto que este flujo ya tuvo: `scan` se miraba antes que la
      // lectura, así que un escaneo anterior sin limpiar tapaba lo que
      // devolviera la tabla — la llamada se pagaba y su resultado no llegaba a
      // la pantalla. Por eso la aserción es sobre los campos rellenos.
      it('la segunda foto sí lee la tabla, y su resultado llega a la pantalla', async () => {
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
        render(<Comida abiertas />)
        await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
        await userEvent.upload(screen.getByLabelText('Abrir la cámara'), JPEG())
        await screen.findByText('Ese código no está en ninguna base.')
        expect(api.readLabel).not.toHaveBeenCalled()

        await userEvent.upload(screen.getByLabelText('Enfocar la tabla'), JPEG())
        expect(await screen.findByLabelText('Nombre')).toHaveValue('Yogur natural')
        expect(screen.getByText('Leído de «por 100 g»')).toBeInTheDocument()
        // Y el código que abrió todo esto sigue vivo: se guardará con el
        // alimento, que es lo que evita repetir la escalada mañana.
        api.createFood.mockResolvedValue({ ...PAN, id: 60 })
        // La lectura de la tabla **sí** pasa por confirmación: las cifras las ha
        // interpretado un modelo mirando una foto, y ahí no hay código que las
        // identifique. Es la frontera de la excepción del escaneo.
        await userEvent.click(screen.getByRole('button', { name: 'Dar de alta y continuar' }))
        await waitFor(() =>
          expect(api.createFood).toHaveBeenCalledWith(
            expect.objectContaining({ barcode: '8410128750121' }),
          ),
        )
      })

      // Ya no hay dos disparadores que elegir: hay uno, y el sistema escala por
      // dentro. Lo que queda por fijar no es cuál de los dos se anuncia, sino
      // que el único diga que está trabajando y no se pueda disparar dos veces.
      it('el disparador dice que está leyendo, y no se puede disparar otra vez', async () => {
        api.searchFoods.mockResolvedValue([])
        let resolve
        api.readLabel.mockImplementation(() => new Promise((r) => { resolve = r }))
        render(<Comida abiertas />)
        await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
        await userEvent.upload(screen.getByLabelText('Abrir la cámara'), JPEG())

        expect(screen.getAllByText('Leyendo…')).toHaveLength(1)
        // Una lectura a la vez: mientras ésta viaja, el disparador no acepta
        // otra foto. Y el `disabled` vive en el `input`, que no se ve, así que
        // el marco que sí se ve también tiene que decirlo.
        expect(screen.getByLabelText('Abrir la cámara')).toBeDisabled()
        expect(screen.getByLabelText('Abrir la cámara').closest('label').className).toContain(
          'is-busy',
        )
        await act(async () => {
          resolve(LEIDO)
        })
      })

      it('una etiqueta por 100 ml se rellena, y lo dice', async () => {
        await fotografiar({ ...LEIDO, column_header: 'ø/100 ml', per: '100ml' })
        expect(await screen.findByLabelText('Kcal por 100 g')).toHaveValue('61')
        expect(
          screen.getByText('Los números son por 100 ml, no por 100 g. Los guardo tal cual.'),
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
        await userEvent.click(screen.getByRole('button', { name: 'Ver' }))
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
        await userEvent.click(screen.getByRole('button', { name: 'Ver' }))
        expect(screen.getByText('Energia 61 kcal')).toBeInTheDocument()
      })

      it('sin transcripción no ofrece un desplegable vacío', async () => {
        await fotografiar({ ...LEIDO, rows: [] })
        await screen.findByLabelText('Nombre')
        expect(screen.queryByRole('button', { name: 'Ver' })).toBeNull()
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
      render(<Comida abiertas />)
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
      render(<Comida abiertas />)
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
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'huevo')
      expect(
        await screen.findByText('ningún alimento se llama así'),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Crear «huevo»' })).toBeInTheDocument()
    })

    it('vuelve a leer el día después de registrar', async () => {
      api.searchFoods.mockResolvedValue([PAN])
      api.logFood.mockResolvedValue(entry())
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'pan')
      await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
      await userEvent.click(screen.getByRole('button', { name: /^Añadir \d/ }))
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
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
      const field = screen.getByLabelText('Cantidad')
      await userEvent.clear(field)
      await userEvent.type(field, '120')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
      await waitFor(() =>
        expect(api.correctFoodEntry).toHaveBeenCalledWith(10, { grams: 120 }),
      )
    })

    it('un toque sin arrastre abre la fila para editar', async () => {
      render(<Comida abiertas />)
      const row = await screen.findByRole('button', { name: /Pan de la panadería/ })
      await userEvent.click(row)
      expect(screen.getByLabelText('Cantidad')).toBeInTheDocument()
      // Borrar ya no vive en el formulario: sólo quedan gramos y Guardar.
      expect(screen.queryByRole('button', { name: 'Borrar' })).not.toBeInTheDocument()
    })

    it('deslizar la fila revela «Borrar», fuera del formulario', async () => {
      render(<Comida abiertas />)
      const row = await screen.findByRole('button', { name: /Pan de la panadería/ })
      // Cerrada, la acción no es alcanzable — ni por el ojo ni por un lector.
      expect(screen.queryByRole('button', { name: 'Borrar Pan de la panadería' })).not.toBeInTheDocument()
      swipeOpen(row)
      expect(screen.getByRole('button', { name: 'Borrar Pan de la panadería' })).toBeInTheDocument()
    })

    it('borra desde el «Borrar» revelado al deslizar, y dejar un Deshacer en su sitio', async () => {
      api.deleteFoodEntry.mockResolvedValue(null)
      render(<Comida abiertas />)
      const row = await screen.findByRole('button', { name: /Pan de la panadería/ })
      swipeOpen(row)
      await userEvent.click(screen.getByRole('button', { name: 'Borrar Pan de la panadería' }))
      // Deslizar ya no borra: revela el control que **pide** el borrado, y la
      // decisión se toma en el diálogo, con el impacto en el día delante.
      await userEvent.click(await screen.findByRole('button', { name: 'Borrar' }))
      await waitFor(() => expect(api.deleteFoodEntry).toHaveBeenCalledWith(10))
      // No es un aviso flotante: se queda en el raíl del que salió la entrada,
      // hasta que se deshaga o se registre otra cosa.
      expect(await screen.findByText('Pan de la panadería borrada.')).toBeInTheDocument()
    })

    it('deshacer vuelve a registrar la entrada con su hora original', async () => {
      api.deleteFoodEntry.mockResolvedValue(null)
      api.logFood.mockResolvedValue({})
      render(<Comida abiertas />)
      const row = await screen.findByRole('button', { name: /Pan de la panadería/ })
      swipeOpen(row)
      await userEvent.click(screen.getByRole('button', { name: 'Borrar Pan de la panadería' }))
      await userEvent.click(await screen.findByRole('button', { name: 'Borrar' }))
      await waitFor(() => expect(api.deleteFoodEntry).toHaveBeenCalled())
      await userEvent.click(await screen.findByRole('button', { name: /Deshacer el borrado/ }))
      await waitFor(() =>
        expect(api.logFood).toHaveBeenCalledWith(
          expect.objectContaining({ foodId: 1, grams: 80, mealSlot: 'desayuno' }),
        ),
      )
      // La hora original, pero contada por el reloj de pared del móvil y no en
      // UTC: mandar el instante tal cual volvía a fechar por un reloj que no
      // era el tuyo, y entre las 04:00 y las 04:00 más tu offset eso movía la
      // entrada al día anterior. Se comprueba por el instante y por el día, que
      // es lo que el servidor deriva del sello.
      const { loggedAt } = api.logFood.mock.calls[0][0]
      expect(loggedAt).toMatch(/[+-]\d{2}:\d{2}$/)
      expect(new Date(loggedAt).toISOString()).toBe('2026-08-31T07:00:00.000Z')
      expect(foodDayIso(new Date(loggedAt))).toBe('2026-08-31')
      // Y el «Deshacer» se retira: ya se deshizo.
      await waitFor(() => expect(screen.queryByText('Pan de la panadería borrada.')).not.toBeInTheDocument())
    })
  })
  describe('el raíl como puerta', () => {
    it('el + de un raíl abre el buscador con esa comida ya puesta', async () => {
      api.searchFoods.mockResolvedValue([PAN])
      api.logFood.mockResolvedValue(entry())
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a cena' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'pan')
      await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
      // La pregunta «¿a qué comida?» ya viene contestada por el sitio del que
      // vienes; sigue siendo cambiable, pero no hay que contestarla.
      expect(screen.getByRole('button', { name: 'Cena' })).toHaveAttribute('aria-pressed', 'true')
      await userEvent.click(screen.getByRole('button', { name: /^Añadir \d/ }))
      await waitFor(() =>
        expect(api.logFood).toHaveBeenCalledWith(
          expect.objectContaining({ foodId: 1, mealSlot: 'cena' }),
        ),
      )
    })

    it('en un día pasado se fecha en ese día, no en el de hoy', async () => {
      // El fallo: `logFood` sellaba con el reloj del móvil y nada más, así que
      // un snack que te acordabas de apuntar al día siguiente se guardaba en
      // hoy. Ni un error: las kcal faltaban en el día que mirabas y sobraban en
      // el otro. La pantalla promete un día — el que tiene en la cabecera — y
      // es ese el que tiene que viajar con la entrada.
      api.searchFoods.mockResolvedValue([PAN])
      api.logFood.mockResolvedValue(entry())
      render(<Comida abiertas />)
      await waitFor(() => expect(slotNames()).toHaveLength(4))
      await alDomingo30()
      await waitFor(() => expect(api.getFoodDay).toHaveBeenCalledWith('2026-08-30'))
      await userEvent.click(screen.getByRole('button', { name: 'Añadir a snack' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'pan')
      await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
      await userEvent.click(screen.getByRole('button', { name: /^Añadir \d/ }))
      await waitFor(() => expect(api.logFood).toHaveBeenCalled())
      const { mealSlot, loggedAt } = api.logFood.mock.calls[0][0]
      expect(mealSlot).toBe('snack')
      // Se comprueba por la regla, no por la hora exacta: lo que importa es en
      // qué día alimentario cae el sello, que es lo que el servidor deriva.
      expect(foodDayIso(new Date(loggedAt))).toBe('2026-08-30')
    })

    it('y se puede corregir a otra comida, o a ninguna', async () => {
      api.searchFoods.mockResolvedValue([PAN])
      api.logFood.mockResolvedValue(entry())
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a cena' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'pan')
      await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Sin asignar' }))
      await userEvent.click(screen.getByRole('button', { name: /^Añadir \d/ }))
      await waitFor(() =>
        expect(api.logFood).toHaveBeenCalledWith(expect.objectContaining({ mealSlot: null })),
      )
    })

    it('el buscador se abre a pantalla completa, con el destino ya resuelto', async () => {
      api.searchFoods.mockResolvedValue([])
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a snack' }))
      const panel = await screen.findByLabelText('Buscar alimento')
      // Ya no es un panel dentro de la tarjeta que lo abrió, ni una hoja anclada
      // al pie: es una pantalla, porque la lista es larga y hay cámara.
      expect(document.querySelector('.food-slot')?.contains(panel)).toBe(false)
      const pantalla = screen.getByRole('dialog', { name: 'Añadir a snack' })
      expect(pantalla.contains(panel)).toBe(true)
      // Y la cabecera afirma el destino en vez de preguntarlo: has entrado por
      // Snack, así que no queda nada que elegir.
      expect(within(pantalla).getByText('Añadir a')).toBeInTheDocument()
      expect(within(pantalla).getByText('Snack')).toBeInTheDocument()
    })
  })

  // ── La pantalla Añadir ────────────────────────────────────────────────
  describe('la pantalla de añadir', () => {
    const CIQUAL = {
      ...PAN,
      id: 900,
      name: 'Pan, baguette',
      brand: null,
      protein_100g: 7.6,
      is_mine: false,
    }
    const MIO = { ...PAN, id: 901, name: 'Pan de masa madre', brand: 'La Esquina', is_mine: true }

    async function buscar(termino = 'pan') {
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), termino)
      await screen.findByText(termino === 'pan' ? 'Pan de masa madre' : /./)
    }

    it('lo tuyo va delante de la base pública, sea cual sea el orden que llegue', async () => {
      // El servidor puntúa por lo bien que casa lo escrito, que es lo que decide
      // **qué** filas vuelven. En qué orden se leen lo decide la pantalla, y ahí
      // manda la procedencia: si tienes tu propio pan, es el que querías.
      api.searchFoods.mockResolvedValue([CIQUAL, MIO])
      await buscar()
      const nombres = [...document.querySelectorAll('.food-result-name')].map((e) => e.textContent)
      expect(nombres.slice(0, 2)).toEqual(['Pan de masa madre', 'Pan, baguette'])
    })

    it('la procedencia se dice con palabras, no con un color', async () => {
      api.searchFoods.mockResolvedValue([MIO, CIQUAL])
      await buscar()
      const metas = [...document.querySelectorAll('.food-result-meta')].map((e) => e.textContent)
      // La marca acompaña donde la hay: de un producto envasado te acuerdas por
      // el súper antes que por su nombre comercial.
      expect(metas[0]).toBe('La Esquina · tuyo')
      expect(metas[1]).toBe('base pública')
    })

    it('cada resultado lleva su proteína, que es lo que la pantalla persigue', async () => {
      api.searchFoods.mockResolvedValue([MIO, CIQUAL])
      await buscar()
      const p = [...document.querySelectorAll('.food-result-protein')].map((e) => e.textContent)
      expect(p).toEqual(['8 P', '8 P'])
    })

    it('hay una sola cámara, y dice a qué le apuntas', async () => {
      api.searchFoods.mockResolvedValue([])
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
      await screen.findByLabelText('Buscar alimento')
      expect(screen.getByText('Foto del envase')).toBeInTheDocument()
      expect(screen.getByText('Para productos envasados que no tengas todavía.')).toBeInTheDocument()
      expect(screen.getByLabelText('Abrir la cámara')).toBeInTheDocument()
      // Y ninguna de las dos que había antes: elegir entre «código de barras» y
      // «etiqueta» era elegir tecnología, que es lo que este rediseño quita.
      expect(screen.queryByLabelText('Código de barras')).toBeNull()
      expect(screen.queryByLabelText('Etiqueta')).toBeNull()
    })

    it('la palabra «IA» no aparece por ninguna parte', async () => {
      api.searchFoods.mockResolvedValue([])
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
      await screen.findByLabelText('Buscar alimento')
      // La lectura de etiqueta es una capacidad, no una función con nombre
      // propio: lo que el usuario ve es «Foto del envase».
      expect(document.body.textContent).not.toMatch(/\bIA\b/)
    })

    it('sin clave en el servidor la cámara no se dibuja', async () => {
      api.getFoodDay.mockResolvedValue(day({ label_reading: false }))
      api.searchFoods.mockResolvedValue([])
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
      await screen.findByLabelText('Buscar alimento')
      // Un botón que no puede funcionar es peor que uno que no está: al pulsarlo
      // no hay forma de saber por qué ha fallado. Antes se enteraba uno con un
      // 503, después de la foto y con el envase ya en la mano.
      expect(screen.queryByLabelText('Abrir la cámara')).toBeNull()
      expect(screen.queryByText('Foto del envase')).toBeNull()
      // Y el buscador sigue en pie: es la vía normal, no el plan B.
      expect(screen.getByLabelText('Buscar alimento')).toBeInTheDocument()
    })

    it('el pie dice qué hacer con lo que no tiene envase', async () => {
      api.searchFoods.mockResolvedValue([])
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
      expect(
        await screen.findByText(
          'Sin envase —una manzana, un guiso de casa— se busca o se teclea arriba.',
        ),
      ).toBeInTheDocument()
    })
  })

  // ── Confirmar el borrado ──────────────────────────────────────────────
  //
  // Nunca borrar sin decir qué se pierde en el día. Es el único destructivo de
  // la pantalla y el único diálogo centrado: una hoja se descarta deslizando y
  // esto no se puede descartar por accidente.
  describe('confirmar el borrado', () => {
    const CENA = () =>
      objetivo({
        entries: [entry({ id: 7, meal_slot: 'cena', food_name: 'Arroz con pollo', protein: 28 })],
        totals: { kcal: 500, protein: 94, fat: 12, carbs: 60, fiber: 3 },
        by_slot: slots({ cena: 500 }),
        remaining_protein: 66,
      })

    async function pedirBorrado(day_ = CENA()) {
      api.getFoodDay.mockResolvedValue(day_)
      render(<Comida abiertas />)
      const fila = await screen.findByRole('button', { name: /Arroz con pollo/ })
      swipeOpen(fila)
      await userEvent.click(screen.getByRole('button', { name: 'Borrar Arroz con pollo' }))
    }

    it('pregunta antes de borrar, y dice en qué queda el día', async () => {
      await pedirBorrado()
      expect(await screen.findByText('¿Borrar «Arroz con pollo»?')).toBeInTheDocument()
      // 94 g menos los 28 de esta entrada son 66, y 160 − 66 son 94 por debajo.
      const impacto = screen.getByTestId('food-delete-impact')
      expect(impacto).toHaveTextContent('Tu día baja a 66 g de proteína, 94 g por debajo del objetivo.')
      // Y no ha borrado nada todavía.
      expect(api.deleteFoodEntry).not.toHaveBeenCalled()
    })

    it('sin objetivo dice a cuánto baja, y no inventa una comparación', async () => {
      await pedirBorrado(
        day({
          entries: [entry({ id: 7, food_name: 'Arroz con pollo', protein: 28 })],
          totals: { kcal: 500, protein: 94, fat: 12, carbs: 60, fiber: 3 },
        }),
      )
      expect(await screen.findByTestId('food-delete-impact')).toHaveTextContent(
        'Tu día baja a 66 g de proteína.',
      )
    })

    it('si el total no se sabe, no se finge que sí', async () => {
      await pedirBorrado(
        day({
          entries: [entry({ id: 7, food_name: 'Arroz con pollo', protein: 28 })],
          totals: { kcal: 500, protein: null, fat: 12, carbs: 60, fiber: 3 },
          unknown: { kcal: 0, protein: 1, fat: 0, carbs: 0, fiber: 0 },
        }),
      )
      // «Tu día baja a — g» sería una frase sin contenido. Lo que sí se sabe es
      // lo que se va, y eso es lo que se dice.
      expect(await screen.findByTestId('food-delete-impact')).toHaveTextContent(
        'Se van 28 g de proteína del día.',
      )
    })

    it('cancelar no borra nada', async () => {
      await pedirBorrado()
      await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
      expect(api.deleteFoodEntry).not.toHaveBeenCalled()
      expect(screen.queryByText('¿Borrar «Arroz con pollo»?')).toBeNull()
    })

    it('confirmar sí borra, y deja el deshacer donde estaba la fila', async () => {
      api.deleteFoodEntry.mockResolvedValue({})
      await pedirBorrado()
      await userEvent.click(await screen.findByRole('button', { name: 'Borrar' }))
      await waitFor(() => expect(api.deleteFoodEntry).toHaveBeenCalledWith(7))
      // El diálogo confirma; no sustituye al «Deshacer», que sigue viviendo en
      // la comida donde estaba la entrada.
      expect(await screen.findByText('Arroz con pollo borrada.')).toBeInTheDocument()
    })
  })

  // ── El resumen del día ────────────────────────────────────────────────
  describe('el resumen del día', () => {
    async function abrirResumen(day_ = objetivo()) {
      api.getFoodDay.mockResolvedValue(day_)
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Resumen' }))
      await screen.findByText('Resumen del día')
    }

    it('se abre desde la línea de cierre', async () => {
      await abrirResumen()
      const hoja = screen.getByRole('dialog', { name: 'Resumen del día' })
      expect(within(hoja).getByText('LUN 31 AGO')).toBeInTheDocument()
    })

    it('dice el cumplimiento de cada macro con su porcentaje', async () => {
      await abrirResumen()
      const hoja = screen.getByRole('dialog', { name: 'Resumen del día' })
      // 6 de 160 es un 4%; 38 de 300 un 13%; 2 de 80 un 3%.
      expect(within(hoja).getByText('6 / 160 g · 4 %')).toBeInTheDocument()
      expect(within(hoja).getByText('38 / 300 g · 13 %')).toBeInTheDocument()
      expect(within(hoja).getByText('2 / 80 g · 3 %')).toBeInTheDocument()
    })

    it('pasarse no desborda la barra: la llena y lo dice el porcentaje', async () => {
      await abrirResumen(
        objetivo({
          totals: { kcal: 3000, protein: 200, fat: 90, carbs: 320, fiber: 2 },
        }),
      )
      const hoja = screen.getByRole('dialog', { name: 'Resumen del día' })
      expect(within(hoja).getByText('200 / 160 g · 125 %')).toBeInTheDocument()
      // Sin juicio: se dice con el número, no con rojo ni con un icono.
      const barra = hoja.querySelector('.food-summary-fill')
      expect(barra).toHaveStyle({ width: '100%' })
      expect(barra.className).not.toContain('danger')
    })

    it('reparte el día por comida, con las kcal en la cabecera', async () => {
      await abrirResumen()
      const hoja = screen.getByRole('dialog', { name: 'Resumen del día' })
      expect(within(hoja).getByText('Reparto por comida')).toBeInTheDocument()
      // El fixture tiene 200 kcal en desayuno y nada en las demás.
      expect(within(hoja).getByText('200 kcal')).toBeInTheDocument()
      const desayuno = within(hoja).getByText('Desayuno').closest('.food-summary-slot')
      expect(desayuno).toHaveTextContent('— P · 200 kcal')
    })

    it('un total desconocido no tiene porcentaje, y no lo finge en cero', async () => {
      await abrirResumen(
        objetivo({ totals: { kcal: 200, protein: null, fat: 2, carbs: 38, fiber: 2 } }),
      )
      const hoja = screen.getByRole('dialog', { name: 'Resumen del día' })
      // Un «0 %» aquí afirma que no has comido nada de proteína, y lo que pasa
      // es que no se sabe cuánta llevas. Es la misma distinción de siempre, en
      // el sitio donde más fácil se pierde: dentro de un porcentaje.
      expect(within(hoja).getByText('— / 160 g')).toBeInTheDocument()
      expect(within(hoja).queryByText(/0 %/)).toBeNull()
    })

    it('una comida vacía suma una raya, no un cero', async () => {
      await abrirResumen()
      const hoja = screen.getByRole('dialog', { name: 'Resumen del día' })
      const cena = within(hoja).getByText('Cena').closest('.food-summary-slot')
      expect(cena).toHaveTextContent('— P · — kcal')
    })
  })

  // ── La hoja de detalle ────────────────────────────────────────────────
  describe('el detalle de un alimento', () => {
    const POLLO = {
      ...PAN,
      id: 2,
      name: 'Pechuga de pollo',
      kcal_100g: 165,
      protein_100g: 31,
      fat_100g: 3.6,
      carbs_100g: 0,
      fiber_100g: null,
      is_mine: false,
    }

    async function abrir(food = POLLO) {
      api.searchFoods.mockResolvedValue([food])
      api.logFood.mockResolvedValue(entry())
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a cena' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'pollo')
      await userEvent.click(await screen.findByRole('button', { name: /Pechuga de pollo/ }))
      await screen.findByLabelText('Cantidad')
    }

    // La hoja se pinta **encima** del buscador, que sigue montado detrás: sin
    // acotar, media consulta encuentra la fila del resultado en vez de la hoja.
    const hoja = () => screen.getByRole('dialog', { name: 'Detalle del alimento' })

    it('la cabecera dice lo que rinde el alimento por 100 g', async () => {
      await abrir()
      expect(within(hoja()).getByText('Pechuga de pollo')).toBeInTheDocument()
      expect(within(hoja()).getByText('31 P · 165 kcal / 100 g')).toBeInTheDocument()
    })

    it('los macros se recalculan con la cantidad, sin ir al servidor', async () => {
      await abrir()
      await userEvent.clear(screen.getByLabelText('Cantidad'))
      await userEvent.type(screen.getByLabelText('Cantidad'), '150')
      // 165 kcal y 31 g de proteína por 100 g, a 150 g. Las kcal se imprimen sin
      // decimales, como en el resto de la app.
      expect(within(hoja()).getByText('46,5 g')).toBeInTheDocument()
      expect(within(hoja()).getByText('248 kcal')).toBeInTheDocument()
    })

    it('un nutriente desconocido sigue siendo una raya después de escalar', async () => {
      await abrir()
      // La fibra de este pollo no la sabe nadie: 1,5 veces desconocido sigue
      // siendo desconocido, no cero.
      const fila = within(hoja()).getByText('Fibra').closest('.food-detail-row')
      expect(fila).toHaveTextContent('—')
    })

    it('el botón lleva dentro lo que va a registrar', async () => {
      await abrir()
      await userEvent.clear(screen.getByLabelText('Cantidad'))
      await userEvent.type(screen.getByLabelText('Cantidad'), '150')
      // Sin esto hay que mirar arriba para saber qué se está a punto de hacer.
      expect(screen.getByRole('button', { name: 'Añadir 150 g · 47 P' })).toBeInTheDocument()
    })

    it('el stepper mueve la cantidad sin teclado', async () => {
      await abrir()
      await userEvent.click(screen.getByRole('button', { name: 'Más cantidad' }))
      expect(screen.getByLabelText('Cantidad')).toHaveValue('110')
      await userEvent.click(screen.getByRole('button', { name: 'Menos cantidad' }))
      expect(screen.getByLabelText('Cantidad')).toHaveValue('100')
    })

    it('la cantidad no baja de cero', async () => {
      await abrir()
      await userEvent.clear(screen.getByLabelText('Cantidad'))
      await userEvent.type(screen.getByLabelText('Cantidad'), '5')
      await userEvent.click(screen.getByRole('button', { name: 'Menos cantidad' }))
      // Cinco gramos menos diez no son menos cinco gramos de pollo.
      expect(screen.getByLabelText('Cantidad')).toHaveValue('5')
    })

    it('el destino viene resuelto y se puede corregir', async () => {
      await abrir()
      expect(within(hoja()).getByText('Se añade a')).toBeInTheDocument()
      // Ya contestado por la comida desde la que entraste; la pregunta
      // desaparece, la libertad no.
      expect(screen.getByRole('button', { name: 'Cena' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('registra lo que la pantalla estaba enseñando', async () => {
      await abrir()
      await userEvent.clear(screen.getByLabelText('Cantidad'))
      await userEvent.type(screen.getByLabelText('Cantidad'), '150')
      await userEvent.click(screen.getByRole('button', { name: 'Añadir 150 g · 47 P' }))
      await waitFor(() =>
        expect(api.logFood).toHaveBeenCalledWith(
          expect.objectContaining({ foodId: 2, grams: 150, mealSlot: 'cena' }),
        ),
      )
    })
  })

  // ── Los cinco rechazos ────────────────────────────────────────────────
  //
  // Cinco causas y **cinco salidas distintas**. La única que se arregla
  // repitiendo la foto es «ilegible», así que es la única que ofrece repetirla:
  // ofrecer reintento donde no puede funcionar es mandar a alguien a gastar
  // otra foto contra un fallo seguro.
  //
  // Y ninguno reintenta solo. Un rechazo por columna o por ilegible repetido
  // sin cambiar nada duplica el coste con la misma probabilidad de fallo.
  describe('los rechazos de la lectura', () => {
    const JPEG = () => new File([new Uint8Array([255, 216, 255])], 'e.jpg', { type: 'image/jpeg' })

    async function fotoQueFalla(respuesta) {
      api.searchFoods.mockResolvedValue([])
      if (respuesta instanceof Error) api.readLabel.mockRejectedValue(respuesta)
      else api.readLabel.mockResolvedValue(respuesta)
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
      await userEvent.upload(screen.getByLabelText('Abrir la cámara'), JPEG())
    }

    it('columna equivocada: formulario en blanco, y no se reescala nada', async () => {
      await fotoQueFalla({ refusal: 'column', refused_column: 'por ración (125 g)' })
      expect(
        await screen.findByText(
          'Esa columna es «por ración (125 g)», no por 100 g. No me sirve: tecléalo.',
        ),
      ).toBeInTheDocument()
      // El formulario se abre en blanco: reescalar por un factor que nadie
      // eligió da una cifra creíble y falsa, que es peor que ninguna.
      expect(screen.getByLabelText('Kcal por 100 g')).toHaveValue('')
      // Y no se ofrece repetir: la foto era legible, la columna era la mala.
      expect(screen.queryByRole('button', { name: 'Repetir la foto' })).toBeNull()
    })

    it('ilegible: es el único que ofrece repetir la foto', async () => {
      await fotoQueFalla(new Error('boom'))
      expect(await screen.findByText('No he podido leer la etiqueta.')).toBeInTheDocument()
      expect(screen.getByLabelText('Repetir la foto')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Teclearlo' })).toBeInTheDocument()
      // No se abre el formulario por su cuenta: la salida la eliges tú.
      expect(screen.queryByLabelText('Nombre')).toBeNull()
    })

    it('y no reintenta solo: repetir es un gesto tuyo', async () => {
      await fotoQueFalla(new Error('boom'))
      await screen.findByText('No he podido leer la etiqueta.')
      // Una sola llamada. Reintentar sin que nadie cambie nada duplica el coste
      // con la misma probabilidad de fallo.
      expect(api.readLabel).toHaveBeenCalledTimes(1)
    })

    it('sin cuota del minuto: el disparador se apaga con su cuenta atrás', async () => {
      await fotoQueFalla({ refusal: 'quota', quota_scope: 'minute' })
      expect(
        await screen.findByText('Demasiadas fotos seguidas. Espera un minuto, o tecléalo.'),
      ).toBeInTheDocument()
      // No vacía la pantalla: sólo apaga el botón. Esperar un minuto es una
      // salida real, y quitar la cámara la escondería.
      expect(screen.getByLabelText('Abrir la cámara')).toBeDisabled()
      expect(screen.getByText(/Espera .* s/)).toBeInTheDocument()
      expect(screen.getByLabelText('Buscar alimento')).toBeInTheDocument()
    })

    it('sin cuota del día: la cámara desaparece, y no hay reintento', async () => {
      await fotoQueFalla({ refusal: 'quota', quota_scope: 'day' })
      expect(await screen.findByText('Se han acabado las fotos de hoy. Tecléalo.')).toBeInTheDocument()
      // Hasta mañana no se arregla con nada, así que el botón no se queda
      // apagado esperando: se va. Un control que no puede funcionar hoy es peor
      // que uno que no está.
      expect(screen.queryByLabelText('Abrir la cámara')).toBeNull()
      expect(screen.getByRole('button', { name: 'Dar de alta a mano' })).toBeInTheDocument()
    })

    it('y la cámara sigue sin estar al volver a entrar en la pantalla', async () => {
      await fotoQueFalla({ refusal: 'quota', quota_scope: 'day' })
      await screen.findByText('Se han acabado las fotos de hoy. Tecléalo.')
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a cena' }))
      // La cuota es de la cuenta y del día, no de esta pantalla: cerrarla y
      // volver a abrirla no la devuelve, y ofrecer la cámara otra vez sería
      // gastar otra foto para que conteste lo mismo.
      await screen.findByLabelText('Buscar alimento')
      expect(screen.queryByLabelText('Abrir la cámara')).toBeNull()
    })

    it('no configurada: se dice y la cámara se retira', async () => {
      const err = new Error('503')
      err.status = 503
      await fotoQueFalla(err)
      expect(
        await screen.findByText('La lectura de etiquetas no está configurada en el servidor.'),
      ).toBeInTheDocument()
      // Ni la foto ni la red: falta la clave, y quien puede arreglarlo es quien
      // lee esto. Repetir no sirve de nada.
      expect(screen.queryByLabelText('Abrir la cámara')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Repetir la foto' })).toBeNull()
    })

    it('todos los rechazos se anuncian, no sólo se pintan', async () => {
      await fotoQueFalla({ refusal: 'quota', quota_scope: 'day' })
      const aviso = await screen.findByText('Se han acabado las fotos de hoy. Tecléalo.')
      expect(aviso).toHaveAttribute('role', 'alert')
    })
  })

  // ── Revisa la lectura ─────────────────────────────────────────────────
  describe('revisar la lectura', () => {
    const JPEG = () => new File([new Uint8Array([255, 216, 255])], 'e.jpg', { type: 'image/jpeg' })

    async function leer(respuesta) {
      api.searchFoods.mockResolvedValue([])
      api.readLabel.mockResolvedValue(respuesta)
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
      await userEvent.upload(screen.getByLabelText('Abrir la cámara'), JPEG())
      await screen.findByLabelText('Nombre')
    }

    const CON_DESCARTE = {
      name: 'Yogur natural',
      brand: 'Hacendado',
      column_header: 'Valores medios por 100 g',
      per: '100g',
      nutrients: { kcal: 61, protein: 3.8, fat: 3.2, carbs: 4.5, fiber: null },
      dropped: ['fiber'],
      rows: [
        'Valor energético 61 kcal',
        'Proteínas 3,8 g',
        'Grasas 3,2 g',
        'de las cuales saturadas 2,1 g',
        'Hidratos de carbono 4,5 g',
      ],
      refusal: null,
    }

    it('la pantalla dice que se revisa, no que se rellena', async () => {
      await leer(CON_DESCARTE)
      // Un formulario en blanco se rellena; éste viene lleno y lo que toca es
      // mirarlo. Decirlo desde el título es la diferencia entre confirmar y
      // firmar en blanco.
      expect(screen.getByText('Alta de alimento')).toBeInTheDocument()
      expect(screen.getByText('Revisa la lectura')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Dar de alta y continuar' })).toBeInTheDocument()
      expect(
        screen.getByText('Nada entra en tu catálogo hasta que lo confirmes aquí.'),
      ).toBeInTheDocument()
    })

    it('el bloque de procedencia cuenta cuántas cifras salieron y de dónde', async () => {
      await leer(CON_DESCARTE)
      expect(screen.getByText('4 de 5 cifras')).toBeInTheDocument()
      expect(screen.getByText('Leído de «Valores medios por 100 g»')).toBeInTheDocument()
      // «sin conversión» no es un adorno: afirma que nadie ha multiplicado nada
      // por un factor que no estaba impreso.
      expect(screen.getByText('columna única · sin conversión')).toBeInTheDocument()
    })

    it('el campo descartado queda vacío, y se dice por qué', async () => {
      await leer(CON_DESCARTE)
      // Vacío, no en cero: un cero ahí es una afirmación —«medido, y no
      // tiene»— que nadie va a desmentir después.
      expect(screen.getByLabelText('Fibra por 100 g')).toHaveValue('')
      expect(screen.getByLabelText('Fibra por 100 g')).toHaveAttribute('placeholder', '—')
      // Y el hueco no se queda mudo: sin esta línea se lee como «la etiqueta no
      // lo declara», que es lo contrario de lo que ha pasado.
      const nota = screen.getByText('Descarté la fibra: no aparece en la tabla que leí.')
      expect(nota).toHaveAttribute('role', 'alert')
    })

    it('la unidad se dice una vez, y el nombre accesible la conserva entera', async () => {
      await leer(CON_DESCARTE)
      // Cinco rótulos con «… por 100 g» eran la misma frase cinco veces para
      // distinguir cinco cosas que ya se distinguen por su nombre.
      expect(screen.getByText('Por 100 g')).toBeInTheDocument()
      // Quien navega a ciegas oye el campo suelto, sin el encabezado que lo
      // enmarca, así que ahí la unidad sigue entera.
      expect(screen.getByLabelText('Kcal por 100 g')).toHaveValue('61')
      expect(screen.getByLabelText('Hidratos por 100 g')).toHaveValue('4,5')
    })

    it('la transcripción llega plegada, y se abre a un toque', async () => {
      await leer(CON_DESCARTE)
      // Plegada porque cuando la lectura sale bien es ruido: lo que hace falta
      // ya está en los campos.
      expect(screen.getByText('Lo que transcribí')).toBeInTheDocument()
      expect(screen.queryByText('Proteínas 3,8 g')).toBeNull()
      await userEvent.click(screen.getByRole('button', { name: 'Ver' }))
      expect(screen.getByText('Proteínas 3,8 g')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Ocultar' })).toBeInTheDocument()
    })

    it('una fila que no respalda ningún campo se lee a media voz', async () => {
      await leer(CON_DESCARTE)
      await userEvent.click(screen.getByRole('button', { name: 'Ver' }))
      // «de las cuales saturadas» es un desglose de la fila de arriba, no la
      // fila que sostiene la grasa: apagarla deja que salten a la vista las que
      // sí respaldan una cifra.
      expect(screen.getByText('de las cuales saturadas 2,1 g')).toHaveClass('is-aside')
      expect(screen.getByText('Grasas 3,2 g')).not.toHaveClass('is-aside')
    })

    it('por 100 ml se acepta y se dice, no se convierte', async () => {
      await leer({ ...CON_DESCARTE, column_header: 'por 100 ml', per: '100ml' })
      // Convertir exigiría una densidad que la etiqueta no trae. En un líquido
      // acuoso la diferencia es del 3%: se guardan tal cual y se dice.
      expect(screen.getByText('columna única · por 100 ml')).toBeInTheDocument()
      const aviso = screen.getByText('Los números son por 100 ml, no por 100 g. Los guardo tal cual.')
      expect(aviso).toHaveAttribute('role', 'alert')
      expect(screen.getByLabelText('Kcal por 100 g')).toHaveValue('61')
    })

    it('un alta a mano no finge que hay algo que revisar', async () => {
      api.searchFoods.mockResolvedValue([])
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'piquillos')
      await userEvent.click(await screen.findByRole('button', { name: 'Crear «piquillos»' }))
      await screen.findByLabelText('Nombre')
      // Sin lectura no hay procedencia que contar ni transcripción que enseñar,
      // y el título dice otra cosa: esto se rellena, no se revisa.
      expect(screen.getByText('Nuevo alimento')).toBeInTheDocument()
      expect(screen.queryByText('Revisa la lectura')).toBeNull()
      expect(screen.queryByText('Procedencia')).toBeNull()
      expect(screen.queryByText('Lo que transcribí')).toBeNull()
      expect(screen.getByRole('button', { name: 'Guardar alimento' })).toBeInTheDocument()
    })
  })

  describe('los frecuentes', () => {
    // Se mudaron de Comida a Añadir. En Comida competían por sitio con lo que
    // la pantalla mide de verdad —el objetivo y las comidas— y contestaban a
    // una pregunta («¿qué registro?») que sólo te haces cuando ya has decidido
    // registrar algo. Ahora viven donde se hace esa pregunta, y con el destino
    // ya resuelto: el chip se registra en la comida por la que has entrado.
    async function abrirAnadir(slot = 'desayuno') {
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: `Añadir a ${slot}` }))
    }

    const SIEMPRE = [
      { food_id: 1, name: 'Pan de la panadería', brand: null, grams: 80, kcal: 200, meal_slot: 'desayuno', times: 7 },
      { food_id: 2, name: 'Huevo cocido', brand: null, grams: 120, kcal: 166, meal_slot: null, times: 4 },
    ]

    it('pone lo que repites a un toque, con su cantidad dentro del chip', async () => {
      api.frequentFoods.mockResolvedValue(SIEMPRE)
      await abrirAnadir()
      const chip = await screen.findByRole('button', { name: /Pan de la panadería/ })
      expect(within(chip).getByText('80 g')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Huevo cocido/ })).toBeInTheDocument()
    })

    it('lo que repites en cucharadas vuelve en cucharadas', async () => {
      api.frequentFoods.mockResolvedValue([
        { food_id: 3, name: 'Aceite de oliva', brand: null, grams: 30, kcal: 270, meal_slot: null, times: 5, measure: 'cda', measure_count: 2 },
      ])
      api.logFood.mockResolvedValue({})
      await abrirAnadir()
      const chip = await screen.findByRole('button', { name: /Aceite de oliva/ })
      expect(within(chip).getByText('2 cdas')).toBeInTheDocument()
      await userEvent.click(chip)
      await waitFor(() =>
        expect(api.logFood).toHaveBeenCalledWith(
          expect.objectContaining({ foodId: 3, grams: null, measure: 'cda', quantity: 2 }),
        ),
      )
    })

    it('un toque lo registra con la cantidad de siempre, en la comida por la que entraste', async () => {
      api.frequentFoods.mockResolvedValue(SIEMPRE)
      api.logFood.mockResolvedValue({})
      await abrirAnadir('cena')
      await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
      // `meal_slot` del repertorio dice «desayuno», y aquí manda la cena: ya
      // has dicho a dónde va, y contradecirte sería raro.
      await waitFor(() =>
        expect(api.logFood).toHaveBeenCalledWith(
          expect.objectContaining({ foodId: 1, grams: 80, mealSlot: 'cena' }),
        ),
      )
      // Y con el día que la pantalla tiene delante, igual que el resto de
      // escrituras: el sello no lo pone el reloj del móvil por su cuenta.
      const { loggedAt } = api.logFood.mock.calls[0][0]
      expect(foodDayIso(new Date(loggedAt))).toBe('2026-08-31')
    })

    it('y vuelve a leer el día y el repertorio, que acaban de cambiar', async () => {
      api.frequentFoods.mockResolvedValue(SIEMPRE)
      api.logFood.mockResolvedValue({})
      await abrirAnadir()
      await userEvent.click(await screen.findByRole('button', { name: /Huevo cocido/ }))
      await waitFor(() => expect(api.getFoodDay).toHaveBeenCalledTimes(2))
      expect(api.frequentFoods).toHaveBeenCalledTimes(2)
    })

    it('sin repertorio todavía, la sección no existe', async () => {
      await abrirAnadir()
      await screen.findByLabelText('Buscar alimento')
      expect(screen.queryByText('Frecuentes')).not.toBeInTheDocument()
    })

    it('cada comida es su propia puerta, y no hay una CTA global', async () => {
      api.frequentFoods.mockResolvedValue(SIEMPRE)
      render(<Comida abiertas />)
      await waitFor(() => expect(slotNames()).toHaveLength(4))
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
      render(<Comida abiertas />)
      await userEvent.click(await screen.findByRole('button', { name: 'Añadir a cena' }))
      await userEvent.type(screen.getByLabelText('Buscar alimento'), 'pan')
      await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
      expect(screen.getByRole('button', { name: 'Cena' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('no se ofrece en un día pasado', async () => {
      api.frequentFoods.mockResolvedValue(SIEMPRE)
      render(<Comida abiertas />)
      await waitFor(() => expect(slotNames()).toHaveLength(4))
      await alDomingo30()
      await waitFor(() => expect(api.getFoodDay).toHaveBeenCalledWith('2026-08-30'))
      // Ya no es por el fechado —`momentForDay` sella con el día que hay en la
      // cabecera, también en el toque de un frecuente—: es que todavía no está
      // decidido si el repertorio tiene sentido rellenando un día pasado.
      await userEvent.click(screen.getByRole('button', { name: 'Añadir a desayuno' }))
      await screen.findByLabelText('Buscar alimento')
      expect(screen.queryByText('Frecuentes')).not.toBeInTheDocument()
    })

    it('si el repertorio no se puede leer, la pantalla sigue en pie', async () => {
      api.frequentFoods.mockRejectedValue(new Error('offline'))
      render(<Comida abiertas />)
      await waitFor(() => expect(slotNames()).toHaveLength(4))
      expect(screen.queryByText('Lo de siempre')).not.toBeInTheDocument()
    })
  })

  describe('el objetivo diario', () => {
    it('sin objetivo, la cifra grande sigue siendo lo comido', async () => {
      render(<Comida abiertas />)
      const macros = await screen.findByTestId('food-macros')
      expect(within(macros).getByText('Llevas')).toBeInTheDocument()
      expect(within(macros).queryByText('Te falta')).not.toBeInTheDocument()
    })

    // Comida es registro: el objetivo, el reparto y las reglas se fijan en
    // Perfil (Perfil.test.jsx). Aquí sólo se comparan con lo comido.
    it('no ofrece fijar el objetivo, el reparto ni las reglas', async () => {
      api.getFoodDay.mockResolvedValue(objetivo())
      render(<Comida abiertas />)
      await screen.findByTestId('food-macros')

      expect(screen.queryByRole('button', { name: /objetivo diario/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Tus reglas' })).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Proteína (g)')).not.toBeInTheDocument()
    })

    it('con objetivo, la cifra grande pasa a ser lo que falta de proteína', async () => {
      api.getFoodDay.mockResolvedValue(objetivo())
      render(<Comida abiertas />)
      const macros = await screen.findByTestId('food-macros')
      // El héroe es lo que **falta**, y de proteína: es la pregunta que se hace
      // a las 20:00. Va en el centro de los anillos.
      expect(within(macros).getByText('154')).toBeInTheDocument()
      expect(within(macros).getByText('g faltan')).toBeInTheDocument()
      // Al lado, la leyenda de los dos anillos: lo comido de proteína y de kcal.
      const proteina = within(macros).getByText('Proteína').closest('.food-ring-item')
      expect(proteina).toHaveTextContent('6 / 160 g')
      const kcal = within(macros).getByText('Kcal').closest('.food-ring-item')
      expect(kcal).toHaveTextContent('200 / 2800')
      // Lo que queda de kcal lo resta el servidor; aquí sólo se imprime.
      expect(kcal).toHaveTextContent(`quedan ${2800 - 200}`)
    })

    it('pasado de kcal, dice lo que sobra y no una resta negativa', async () => {
      api.getFoodDay.mockResolvedValue(
        objetivo({
          totals: { kcal: 3000, protein: 100, fat: 80, carbs: 300, fiber: 2 },
          remaining_kcal: -200,
          remaining_protein: 60,
        }),
      )
      render(<Comida abiertas />)
      const macros = await screen.findByTestId('food-macros')
      const kcal = within(macros).getByText('Kcal').closest('.food-ring-item')
      expect(kcal).toHaveTextContent('200 de más')
      expect(kcal).not.toHaveTextContent('quedan')
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
    it('la proteína va en el anillo de fuera, y hidratos y grasa en barra', async () => {
      api.getFoodDay.mockResolvedValue(objetivo())
      render(<Comida abiertas />)
      const macros = await screen.findByTestId('food-macros')
      // Dos barras: hidratos y grasa. La fibra no tiene objetivo, así que no
      // tiene barra — una barra sin meta no mide nada.
      expect(macros.querySelectorAll('.food-macro-bar')).toHaveLength(2)
      // La proteína es el anillo de fuera, con su arco al 4 % de la vuelta; las
      // kcal, el de dentro.
      const arco = macros.querySelector('.food-ring-arc.is-protein')
      const vuelta = 2 * Math.PI * 62
      expect(parseFloat(arco.getAttribute('stroke-dasharray'))).toBeCloseTo(vuelta * 0.04, 1)
      expect(macros.querySelector('.food-ring-arc.is-kcal')).not.toBeNull()
      // Los dos tramos de cada barra: lo comido, con su ancho; lo que falta, el
      // carril vacío que ocupa el resto.
      expect(macros.querySelector('.food-macro-done')).not.toBeNull()
      expect(macros.querySelector('.food-macro-left')).not.toBeNull()
    })

    it('sin nada comido no se dibuja ningún arco, ni un punto', async () => {
      api.getFoodDay.mockResolvedValue(
        objetivo({
          entries: [],
          totals: { kcal: null, protein: null, fat: null, carbs: null, fiber: null },
          by_slot: slots(),
          remaining_protein: 160,
          remaining_kcal: 2800,
        }),
      )
      render(<Comida abiertas />)
      const macros = await screen.findByTestId('food-macros')
      // Con el extremo redondo, un arco de 0 deja un punto que se lee «algo
      // comido». Sólo quedan los carriles.
      expect(macros.querySelectorAll('.food-ring-arc')).toHaveLength(0)
      expect(macros.querySelectorAll('.food-ring-track')).toHaveLength(2)
    })

    it('al cerrar el objetivo el anillo pasa a --pr entero', async () => {
      api.getFoodDay.mockResolvedValue(
        objetivo({
          totals: { kcal: 2800, protein: 160, fat: 80, carbs: 300, fiber: 2 },
          remaining_protein: 0,
        }),
      )
      render(<Comida abiertas />)
      const macros = await screen.findByTestId('food-macros')
      // El único momento en que el tono profundo ocupa el anillo entero.
      const arco = macros.querySelector('.food-ring-arc.is-protein')
      expect(arco).toHaveClass('is-closed')
      expect(parseFloat(arco.getAttribute('stroke-dasharray'))).toBeCloseTo(2 * Math.PI * 62, 1)
      // Y el número deja de ser una resta y pasa a ser el marcador: un «te falta
      // 0» sería la misma cifra diciendo lo contrario de lo que ha pasado.
      expect(within(macros).getByText('Cerrado')).toBeInTheDocument()
      expect(within(macros).getByText('160 / 160')).toBeInTheDocument()
      expect(within(macros).queryByText('g faltan')).not.toBeInTheDocument()
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
      render(<Comida abiertas />)
      const macros = await screen.findByTestId('food-macros')
      expect(within(macros).getByText('160')).toBeInTheDocument()
      // Nada comido no es cero comido: la cifra de lo comido es una raya.
      const proteina = within(macros).getByText('Proteína').closest('.food-ring-item')
      expect(proteina).toHaveTextContent('— / 160 g')
    })

    it('la línea de cierre dice lo que falta para cerrar el día', async () => {
      api.getFoodDay.mockResolvedValue(objetivo())
      render(<Comida abiertas />)
      const close = await waitFor(() => {
        const el = document.querySelector('.food-close')
        expect(el).not.toBeNull()
        return el
      })
      expect(close).toHaveTextContent('Te faltan 154 g de proteína para cerrar el día.')
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
      render(<Comida abiertas />)
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
    render(<Comida abiertas />)
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
    expect(screen.queryByRole('button', { name: 'Corregir este alimento' })).not.toBeInTheDocument()
  })

  it('corrige las cifras sin tocar lo ya registrado', async () => {
    api.correctFood.mockResolvedValue({ ...PAN, kcal_100g: 265 })
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Corregir este alimento' }))
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
    await userEvent.click(screen.getByRole('button', { name: 'Corregir este alimento' }))
    await userEvent.clear(screen.getByLabelText('Fibra por 100 g'))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }))
    await waitFor(() =>
      expect(api.correctFood).toHaveBeenCalledWith(1, expect.objectContaining({ fiber_100g: null })),
    )
  })

  it('corrige un código de barras mal tecleado', async () => {
    api.correctFood.mockResolvedValue(PAN)
    await abrir({ ...PAN, barcode: '8410000000009' })
    await userEvent.click(screen.getByRole('button', { name: 'Corregir este alimento' }))
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
    await userEvent.click(screen.getByRole('button', { name: 'Corregir este alimento' }))
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
    await userEvent.click(screen.getByRole('button', { name: 'Corregir este alimento' }))
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
    await userEvent.click(screen.getByRole('button', { name: 'Corregir este alimento' }))
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
    render(<Comida abiertas />)
    await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
    await userEvent.type(screen.getByLabelText('Buscar alimento'), 'pan')
    // Dentro de la lista de resultados: el día de estos tests ya lleva una
    // entrada con este mismo nombre, y tocar esa abre otra cosa.
    const lista = await screen.findByRole('list')
    // `find` y no `get`: la búsqueda rebota 180 ms, y la lista existe vacía
    // desde el primer pintado.
    await userEvent.click(await within(lista).findByRole('button', { name: /Pan de la panadería/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Corregir este alimento' }))
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

// Reorganización del 17 oct: las ideas de recetas eran una puerta a planificar
// desde el detalle de un alimento. Planificar es de Plan, y salen allí, en
// «Cambiar este plato» (Plan.test.jsx). Aquí no queda nada que las abra.
describe('ideas con un alimento', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.frequentFoods.mockResolvedValue([])
  })

  it('el detalle del alimento ya no ofrece ideas, aunque el servidor pueda buscarlas', async () => {
    api.getFoodDay.mockResolvedValue(day({ dish_ideas: true }))
    api.searchFoods.mockResolvedValue([{ ...PAN, name: 'Pan de la panadería' }])
    render(<Comida abiertas />)
    await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
    await userEvent.type(screen.getByLabelText('Buscar alimento'), 'pan')
    await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
    expect(await screen.findByRole('button', { name: 'Corregir este alimento' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ideas con/ })).not.toBeInTheDocument()
  })
})

describe('alimentos con hueso', () => {
  // Un muslo de CIQUAL: sus kcal son de la parte comestible, y el 30 % de lo
  // que pesas con hueso no se come (tabla de referencia del servidor).
  const MUSLO = {
    id: 5,
    name: 'Pollo, muslo, carne y piel, crudo',
    brand: null,
    kcal_100g: 192,
    protein_100g: 18,
    fat_100g: 13,
    carbs_100g: 0,
    fiber_100g: 0,
    portions: [],
    is_mine: false,
    refuse_pct: 30,
    refuse_source: 'referencia',
    kcal_basis: 'edible',
  }

  const abrir = async (food = MUSLO) => {
    api.searchFoods.mockResolvedValue([food])
    render(<Comida abiertas />)
    await userEvent.click(await screen.findByRole('button', { name: 'Añadir a comida' }))
    await userEvent.type(screen.getByLabelText('Buscar alimento'), 'muslo')
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(food.name) }))
    await userEvent.clear(screen.getByLabelText('Cantidad'))
    await userEvent.type(screen.getByLabelText('Cantidad'), '300')
  }

  // Lo que hay en la fila del total de la hoja: la previsión de kcal.
  const totalKcal = () => document.querySelector('.food-detail-total .food-detail-value').textContent

  beforeEach(() => {
    vi.resetAllMocks()
    api.getFoodDay.mockResolvedValue(day())
    api.frequentFoods.mockResolvedValue([])
    api.listDishes.mockResolvedValue([])
    api.logFood.mockResolvedValue({})
  })

  it('se pesa con hueso por defecto y cuenta sólo lo que se come', async () => {
    await abrir()
    expect(screen.getByRole('button', { name: 'Pesado con hueso' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText(/300 g con hueso → 210 g comestibles/)).toBeInTheDocument()
    expect(screen.getByText(/30 % de hueso, típico/)).toBeInTheDocument()
    // 210 g × 1,92 = 403,2 kcal: la previsión es de la carne, no de la bandeja.
    expect(totalKcal()).toBe('403 kcal')
    await userEvent.click(screen.getByRole('button', { name: /^Añadir \d/ }))
    await waitFor(() =>
      expect(api.logFood).toHaveBeenCalledWith(
        expect.objectContaining({ foodId: 5, grams: 300, withBone: true }),
      ),
    )
  })

  it('sin hueso, lo pesado es lo que se come', async () => {
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Pesado con hueso' }))
    expect(screen.queryByText(/comestibles/)).not.toBeInTheDocument()
    expect(totalKcal()).toBe('576 kcal')
    await userEvent.click(screen.getByRole('button', { name: /^Añadir \d/ }))
    await waitFor(() =>
      expect(api.logFood).toHaveBeenCalledWith(
        expect.objectContaining({ foodId: 5, grams: 300, withBone: false }),
      ),
    )
  })

  it('con kcal de la bandeja, el hueso ya va dentro y lo dice', async () => {
    await abrir({ ...MUSLO, kcal_100g: 135, kcal_basis: 'as_sold' })
    expect(screen.getByText(/Las kcal de la etiqueta ya cuentan el hueso/)).toBeInTheDocument()
    expect(totalKcal()).toBe('405 kcal')
  })

  it('un alimento que no lleva hueso no enseña nada de esto', async () => {
    await abrir({ ...MUSLO, refuse_pct: null, refuse_source: null, kcal_basis: null })
    expect(screen.queryByRole('button', { name: 'Pesado con hueso' })).not.toBeInTheDocument()
  })

  it('si no se sabe a qué son las kcal, pregunta antes de dejar añadir', async () => {
    const mio = {
      ...MUSLO,
      id: 6,
      name: 'Muslos de pollo',
      is_mine: true,
      kcal_100g: 165,
      kcal_basis: 'unknown',
    }
    api.correctFood.mockResolvedValue({ ...mio, kcal_basis: 'edible' })
    await abrir(mio)
    expect(screen.getByText('¿Las kcal de la etiqueta cuentan el hueso?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Añadir \d/ })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'No, son solo de la carne' }))
    await waitFor(() => expect(api.correctFood).toHaveBeenCalledWith(6, { kcal_basis: 'edible' }))
    expect(await screen.findByText(/300 g con hueso → 210 g comestibles/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Añadir \d/ })).toBeEnabled()
  })

  it('la fila de una entrada pesada con hueso dice las dos cifras', async () => {
    api.getFoodDay.mockResolvedValue(
      day({
        entries: [entry({ food_id: 5, food_name: MUSLO.name, grams: 300, edible_grams: 210 })],
      }),
    )
    render(<Comida abiertas />)
    const row = await screen.findByRole('button', { name: new RegExp(MUSLO.name) })
    expect(row).toHaveTextContent('300 g con hueso · 210 g comestibles')
  })

  it('pesar el hueso que sobró corrige la entrada', async () => {
    api.getFoodDay.mockResolvedValue(
      day({
        entries: [entry({ food_id: 5, food_name: MUSLO.name, grams: 300, edible_grams: 210 })],
      }),
    )
    api.weighLeftoverBone.mockResolvedValue({ entry: entry(), refuse_pct: 20, food_updated: false })
    render(<Comida abiertas />)
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(MUSLO.name) }))
    await userEvent.type(screen.getByLabelText('Hueso que ha sobrado'), '60')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(api.weighLeftoverBone).toHaveBeenCalledWith(10, 60))
    // Los gramos no han cambiado: no se repesa lo que no se tocó.
    expect(api.correctFoodEntry).not.toHaveBeenCalled()
  })

  it('una entrada sin hueso no pregunta por el hueso', async () => {
    api.getFoodDay.mockResolvedValue(day({ entries: [entry()] }))
    render(<Comida abiertas />)
    await userEvent.click(await screen.findByRole('button', { name: /Pan de la panadería/ }))
    expect(screen.queryByLabelText('Hueso que ha sobrado')).not.toBeInTheDocument()
  })

  it('lo de siempre se vuelve a pesar como la última vez', async () => {
    api.frequentFoods.mockResolvedValue([
      {
        food_id: 5,
        name: MUSLO.name,
        brand: null,
        grams: 300,
        kcal: 403.2,
        meal_slot: 'comida',
        times: 3,
        with_bone: true,
      },
    ])
    render(<Comida abiertas />)
    await userEvent.click(await screen.findByRole('button', { name: 'Añadir a comida' }))
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(MUSLO.name) }))
    await waitFor(() =>
      expect(api.logFood).toHaveBeenCalledWith(
        expect.objectContaining({ foodId: 5, grams: 300, withBone: true }),
      ),
    )
  })
})

describe('el hueso al dar de alta', () => {
  const crear = async (texto) => {
    api.searchFoods.mockResolvedValue([])
    render(<Comida abiertas />)
    await userEvent.click(await screen.findByRole('button', { name: 'Añadir a comida' }))
    await userEvent.type(screen.getByLabelText('Buscar alimento'), texto)
    await userEvent.click(await screen.findByRole('button', { name: `Crear «${texto}»` }))
  }
  const guardar = () => screen.getByRole('button', { name: 'Guardar alimento' })
  const llevaHueso = () => screen.getByRole('button', { name: 'Lleva hueso' })

  beforeEach(() => {
    vi.resetAllMocks()
    api.getFoodDay.mockResolvedValue(day())
    api.frequentFoods.mockResolvedValue([])
    api.listDishes.mockResolvedValue([])
    api.createFood.mockResolvedValue({ ...PAN, id: 50, name: 'muslos de pollo' })
  })

  it('un nombre con hueso lo propone, y no deja guardar sin decir si las kcal lo cuentan', async () => {
    api.boneReference.mockResolvedValue({ refuse_pct: 30 })
    await crear('muslos de pollo')
    await waitFor(() => expect(llevaHueso()).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.getByText('¿Las kcal de la etiqueta cuentan el hueso?')).toBeInTheDocument()
    // Ninguna respuesta elegida de antemano: elegirla por ti es adivinar.
    expect(screen.getByRole('button', { name: 'No, son solo de la carne' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(guardar()).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'No, son solo de la carne' }))
    expect(screen.getByLabelText('% de hueso')).toHaveValue('30')
    await userEvent.click(guardar())
    // El 30 % es el de la tabla y no se ha tocado: no se guarda como tuyo.
    await waitFor(() =>
      expect(api.createFood).toHaveBeenCalledWith(
        expect.objectContaining({ kcal_basis: 'edible', refuse_pct: null }),
      ),
    )
  })

  it('con las kcal de la pieza entera no hace falta el % de hueso', async () => {
    api.boneReference.mockResolvedValue({ refuse_pct: 30 })
    await crear('muslos de pollo')
    await waitFor(() => expect(llevaHueso()).toHaveAttribute('aria-pressed', 'true'))
    await userEvent.click(screen.getByRole('button', { name: 'Sí, son de la pieza entera' }))
    expect(screen.queryByLabelText('% de hueso')).not.toBeInTheDocument()
    await userEvent.click(guardar())
    await waitFor(() =>
      expect(api.createFood).toHaveBeenCalledWith(
        expect.objectContaining({ kcal_basis: 'as_sold', refuse_pct: null }),
      ),
    )
  })

  it('quitar «Lleva hueso» a un nombre que lo sugiere lo guarda sin hueso', async () => {
    api.boneReference.mockResolvedValue({ refuse_pct: 30 })
    await crear('muslos de pollo')
    await waitFor(() => expect(llevaHueso()).toHaveAttribute('aria-pressed', 'true'))
    await userEvent.click(llevaHueso())
    expect(screen.queryByText('¿Las kcal de la etiqueta cuentan el hueso?')).not.toBeInTheDocument()
    await userEvent.click(guardar())
    await waitFor(() =>
      expect(api.createFood).toHaveBeenCalledWith(
        expect.objectContaining({ refuse_pct: 0, kcal_basis: null }),
      ),
    )
  })

  it('un nombre que la tabla no conoce sale sin hueso, y se le puede poner', async () => {
    api.boneReference.mockResolvedValue({ refuse_pct: null })
    await crear('rabo de toro')
    await waitFor(() => expect(api.boneReference).toHaveBeenCalled())
    expect(llevaHueso()).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(llevaHueso())
    await userEvent.click(screen.getByRole('button', { name: 'No, son solo de la carne' }))
    // Sin tabla no hay % que proponer, y sin % no hay nada que descontar.
    expect(screen.getByLabelText('% de hueso')).toHaveValue('')
    expect(guardar()).toBeDisabled()
    await userEvent.type(screen.getByLabelText('% de hueso'), '40')
    await userEvent.click(guardar())
    await waitFor(() =>
      expect(api.createFood).toHaveBeenCalledWith(
        expect.objectContaining({ kcal_basis: 'edible', refuse_pct: 40 }),
      ),
    )
  })

  it('sin red para preguntar a la tabla, el alta sigue funcionando', async () => {
    api.boneReference.mockRejectedValue(new Error('offline'))
    await crear('yogur')
    expect(llevaHueso()).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(guardar())
    await waitFor(() =>
      expect(api.createFood).toHaveBeenCalledWith(
        expect.objectContaining({ refuse_pct: null, kcal_basis: null }),
      ),
    )
  })
})

describe('el hueso al corregir un alimento', () => {
  const MUSLOS = {
    ...PAN,
    id: 6,
    name: 'Muslos de pollo',
    is_mine: true,
    kcal_100g: 190,
    refuse_pct: 30,
    refuse_source: 'referencia',
    kcal_basis: 'unknown',
  }
  const abrir = async (food) => {
    api.searchFoods.mockResolvedValue([food])
    render(<Comida abiertas />)
    await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
    await userEvent.type(screen.getByLabelText('Buscar alimento'), 'muslos')
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(food.name) }))
    await userEvent.click(screen.getByRole('button', { name: 'Corregir este alimento' }))
  }

  beforeEach(() => {
    vi.resetAllMocks()
    api.getFoodDay.mockResolvedValue(day())
    api.frequentFoods.mockResolvedValue([])
  })

  it('un alimento tuyo con hueso sin contestar se contesta aquí', async () => {
    api.correctFood.mockResolvedValue({ ...MUSLOS, kcal_basis: 'edible' })
    await abrir(MUSLOS)
    expect(screen.getByRole('button', { name: 'Lleva hueso' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(screen.getByRole('button', { name: 'No, son solo de la carne' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }))
    await waitFor(() =>
      expect(api.correctFood).toHaveBeenCalledWith(6, expect.objectContaining({ kcal_basis: 'edible' })),
    )
    // El % no se ha tocado: sigue siendo el de la tabla.
    expect(api.correctFood.mock.calls[0][1]).not.toHaveProperty('refuse_pct')
  })

  it('corregir otra cifra no obliga a contestar lo del hueso', async () => {
    api.correctFood.mockResolvedValue(MUSLOS)
    await abrir(MUSLOS)
    await userEvent.clear(screen.getByLabelText('Kcal por 100 g'))
    await userEvent.type(screen.getByLabelText('Kcal por 100 g'), '200')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }))
    // Sin tocar el hueso no hay nada que avisar: guardar funciona igual.
    expect(screen.queryByText('Contéstalo para poder guardar.')).not.toBeInTheDocument()
    await waitFor(() => expect(api.correctFood).toHaveBeenCalled())
    expect(api.correctFood.mock.calls[0][1]).not.toHaveProperty('kcal_basis')
  })

  it('quitar el hueso lo guarda como 0 %', async () => {
    api.correctFood.mockResolvedValue({ ...MUSLOS, refuse_pct: null })
    await abrir({ ...MUSLOS, kcal_basis: 'edible' })
    await userEvent.click(screen.getByRole('button', { name: 'Lleva hueso' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }))
    await waitFor(() =>
      expect(api.correctFood).toHaveBeenCalledWith(6, expect.objectContaining({ refuse_pct: 0 })),
    )
  })
})

// Fase 3 de la épica de cuatro comidas: mientras comes lo previsto, Hoy no
// enseña cifras; sólo lo que se sale del plan dice cuánto descuadra.
describe('Comida: sin cifras mientras cumples', () => {
  function planDeHoy(entradas) {
    return {
      id: 1,
      week_start: '2026-08-31',
      entries: entradas.map((e, i) => ({
        id: 50 + i,
        log_date: '2026-08-31',
        dish_id: 70,
        dish_name: 'Pollo con arroz',
        grams: [150],
        kcal: 600,
        protein: 45,
        carbs: 75,
        fat: 15,
        carbs_shift: null,
        status: null,
        log_entry_id: null,
        ...e,
      })),
    }
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.setSystemTime(new Date(2026, 7, 31, 12, 0))
    api.searchFoods.mockResolvedValue([])
    api.frequentFoods.mockResolvedValue([])
    api.usualAmounts.mockResolvedValue([])
    api.listDishes.mockResolvedValue([])
    api.listRules.mockResolvedValue([])
    api.dayVerdicts.mockResolvedValue({ date: '2026-08-31', verdicts: [], acceptable: true })
    api.getTargetProfile.mockResolvedValue({})
    api.getAdherence.mockResolvedValue(null)
    api.getTargetProposal.mockResolvedValue({ kcal: null, source: null, days: 0, missing: [] })
    api.getReview.mockResolvedValue({ due: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('con el plan cumplido no hay anillos: hay la tira del día', async () => {
    api.getFoodDay.mockResolvedValue(
      objetivo({ entries: [entry({ dish_id: 70 })], by_slot: slots({ desayuno: 600 }) }),
    )
    api.getPlan.mockResolvedValue(
      planDeHoy([{ slot: 'desayuno', status: 'done' }, { slot: 'comida' }, { slot: 'snack' }, { slot: 'cena' }]),
    )
    render(<Comida abiertas />)
    expect(await screen.findByRole('img', { name: /Hidrato del día/ })).toBeInTheDocument()
    expect(screen.queryByTestId('food-macros')).not.toBeInTheDocument()
    // Ni el subtotal de la comida: «Comido» ya lo dice.
    expect(slotMetas()).toEqual([])
  })

  it('lo que se sale del plan trae de vuelta los anillos y dice cuánto descuadra', async () => {
    api.getFoodDay.mockResolvedValue(
      objetivo({
        entries: [entry({ dish_id: 70 }), entry({ id: 11, meal_slot: 'snack', kcal: 150, food_name: 'Almendras' })],
        by_slot: slots({ desayuno: 600, snack: 150 }),
      }),
    )
    api.getPlan.mockResolvedValue(
      planDeHoy([{ slot: 'desayuno', status: 'done' }, { slot: 'comida' }, { slot: 'snack' }, { slot: 'cena' }]),
    )
    render(<Comida abiertas />)
    expect(await screen.findByTestId('food-macros')).toBeInTheDocument()
    const merienda = screen.getByText('Fuera del plan · +150 kcal').closest('.food-slot')
    expect(merienda.dataset.slot).toBe('snack')
  })

  it('sin plan, todo sigue como estaba', async () => {
    api.getFoodDay.mockResolvedValue(objetivo())
    api.getPlan.mockResolvedValue(null)
    render(<Comida abiertas />)
    expect(await screen.findByTestId('food-macros')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Hidrato del día/ })).not.toBeInTheDocument()
  })

  it('el hidrato que movió el entreno se dice dentro de su comida', async () => {
    api.getFoodDay.mockResolvedValue(day())
    api.getPlan.mockResolvedValue(
      planDeHoy([{ slot: 'snack', carbs: 0, carbs_shift: -40 }, { slot: 'cena', carbs: 115, carbs_shift: 40 }]),
    )
    render(<Comida abiertas />)
    const cena = (await screen.findByText('+40 g de hidrato · por el entreno')).closest('.food-slot')
    expect(cena.dataset.slot).toBe('cena')
    expect(screen.getByText('−40 g de hidrato · por el entreno')).toBeInTheDocument()
  })
})

// Fase 7: los días cuidados, en la franja de la semana — un punto, no otra fila.
describe('Comida: días cuidados en la semana', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.setSystemTime(new Date(2026, 7, 31, 12, 0))
    api.getFoodDay.mockResolvedValue(day())
    api.searchFoods.mockResolvedValue([])
    api.frequentFoods.mockResolvedValue([])
    api.listDishes.mockResolvedValue([])
    api.listRules.mockResolvedValue([])
    api.dayVerdicts.mockResolvedValue({ date: '2026-08-31', verdicts: [], acceptable: true })
    api.getTargetProfile.mockResolvedValue({})
    api.getPlan.mockResolvedValue(null)
    api.getTargetProposal.mockResolvedValue({ kcal: null, source: null, days: 0, missing: [] })
    api.getReview.mockResolvedValue({ due: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('los días cuidados de la semana llevan su punto', async () => {
    api.getCaredDays.mockResolvedValue({ days: ['2026-08-31'] })
    render(<Comida abiertas />)
    await waitFor(() => expect(api.getCaredDays).toHaveBeenCalledWith('2026-08-31', '2026-09-06'))
    const lunes = screen.getByRole('button', { name: 'Lunes 31' })
    await waitFor(() => expect(lunes).toHaveClass('is-cuidado'))
    expect(lunes).toHaveAccessibleDescription('Día cuidado')
  })
})
