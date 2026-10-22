import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PlanEnComida, lunesDe, lunesSiguiente, planDelDia } from './Plan.jsx'

const LUNES = '2026-09-21'
const MARTES = '2026-09-22'

function entrada(over = {}) {
  return {
    id: 1,
    log_date: LUNES,
    slot: 'comida',
    dish_id: 7,
    dish_name: 'Pollo con arroz',
    grams: [150, 80],
    kcal: 620,
    status: null,
    log_entry_id: null,
    ...over,
  }
}

const PLAN = {
  id: 1,
  week_start: LUNES,
  seed: 3,
  score: 0,
  verdicts: [],
  entries: [
    entrada({ id: 1, slot: 'desayuno', dish_name: 'Tostada', kcal: 380 }),
    entrada({ id: 2, slot: 'comida' }),
    entrada({ id: 3, slot: 'cena', dish_name: 'Merluza', kcal: 500 }),
    entrada({ id: 4, slot: 'snack', dish_name: 'Yogur', kcal: 180 }),
  ],
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('lunesDe', () => {
  it('lleva cualquier día al lunes de su semana', () => {
    expect(lunesDe('2026-09-24')).toBe(LUNES)
    expect(lunesDe(LUNES)).toBe(LUNES)
    expect(lunesDe('2026-09-27')).toBe(LUNES)
  })
})

describe('lunesSiguiente', () => {
  it('lleva cualquier día al lunes de la semana siguiente', () => {
    expect(lunesSiguiente('2026-09-24')).toBe('2026-09-28')
    expect(lunesSiguiente(LUNES)).toBe('2026-09-28')
    expect(lunesSiguiente('2026-09-27')).toBe('2026-09-28')
  })
})

// Lo planificado vive dentro de su comida en el diario: se confirma donde se
// registra, con la comida delante, y no en una tarjeta aparte que partía el día
// en dos.
describe('lo planificado, dentro de su comida', () => {
  const COMIDA = entrada({ id: 2, slot: 'comida' })

  function pintar(over = {}) {
    const props = {
      entrada: COMIDA,
      hoy: LUNES,
      onChanged: vi.fn(),
      onComido: vi.fn(),
      platos: [],
      setEntry: vi.fn().mockResolvedValue({ ...COMIDA, status: 'done' }),
      ...over,
    }
    render(<PlanEnComida {...props} />)
    return props
  }

  it('una comida fuera reservada se confirma de un toque', async () => {
    const fuera = entrada({ id: 2, slot: 'comida', dish_id: 70, dish_name: 'Bar Paco', kcal: 795, place: true })
    const props = pintar({ entrada: fuera })
    expect(screen.getByText('~795 kcal reservadas')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lo comí' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lo cambié' })).not.toBeInTheDocument()
    for (const name of ['Otro sitio', 'Me lo salté', 'No sé']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(props.setEntry).toHaveBeenCalledWith(2, 'out', 70, expect.any(String)))
    expect(props.onComido).toHaveBeenCalled()
  })

  describe('con la olla pesada', () => {
    const OLLA = {
      id: 7,
      name: 'Pollo con arroz',
      servings: 4,
      batch: { id: 3, cooked_grams: 2400, cooked_on: LUNES },
    }

    it('lo previsto es una parte de la olla, y se apunta de un toque', async () => {
      const props = pintar({ platos: [OLLA], comerOlla: vi.fn().mockResolvedValue({}) })
      expect(screen.queryByRole('button', { name: 'Lo comí' })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '¼ de la olla · 600 g' }))
      await waitFor(() => expect(props.comerOlla).toHaveBeenCalledWith(2, 0.25, expect.any(String)))
      expect(props.onComido).toHaveBeenCalled()
    })

    it('½ y ⅓ están a un toque', async () => {
      const props = pintar({ platos: [OLLA], comerOlla: vi.fn().mockResolvedValue({}) })
      expect(screen.getByRole('button', { name: '⅓ · 800 g' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '½ · 1200 g' }))
      await waitFor(() => expect(props.comerOlla).toHaveBeenCalledWith(2, 0.5, expect.any(String)))
    })

    it('«Otra» pide los gramos que te serviste y los convierte en parte de la olla', async () => {
      const props = pintar({ platos: [OLLA], comerOlla: vi.fn().mockResolvedValue({}) })
      await userEvent.click(screen.getByRole('button', { name: 'Otra' }))
      await userEvent.type(screen.getByRole('textbox', { name: 'Gramos que te serviste' }), '480')
      await userEvent.click(screen.getByRole('button', { name: 'Apuntar' }))
      await waitFor(() => expect(props.comerOlla).toHaveBeenCalledWith(2, 0.2, expect.any(String)))
    })

    it('sin olla, «Lo comí» de siempre', () => {
      pintar({ platos: [{ ...OLLA, batch: null }] })
      expect(screen.getByRole('button', { name: 'Lo comí' })).toBeInTheDocument()
      expect(screen.queryByText(/de la olla/)).not.toBeInTheDocument()
    })
  })

  it('dice qué toca y lo que suma', () => {
    pintar()
    expect(screen.getByText('Planificado')).toBeInTheDocument()
    expect(screen.getByText('Pollo con arroz')).toBeInTheDocument()
    expect(screen.getByText('620 kcal')).toBeInTheDocument()
  })

  it('dice cuánto de cada ingrediente, con el nombre corto', () => {
    pintar({
      entrada: entrada({
        id: 2,
        items: [
          { food_name: 'Pollo, pechuga, sin piel, cruda', grams: 150 },
          { food_name: 'Arroz blanco, crudo', grams: 80.5 },
        ],
      }),
    })
    expect(screen.getByLabelText('Ingredientes')).toHaveTextContent('Pollo 150 g · Arroz blanco 80,5 g')
  })

  it('el aceite se dice también en cucharadas', () => {
    pintar({
      entrada: entrada({
        id: 2,
        items: [
          { food_name: 'Pollo, pechuga, sin piel, cruda', grams: 150 },
          { food_name: 'Aceite de oliva', grams: 13.5 },
        ],
      }),
    })
    expect(screen.getByLabelText('Ingredientes')).toHaveTextContent('Pollo 150 g · Aceite de oliva 13,5 g ≈ 1 cda')
  })

  // Fase 4: lo que va por piezas se dice en piezas, y manda sobre la cucharada.
  it('lo que va por piezas se dice en piezas', () => {
    pintar({
      entrada: entrada({
        id: 2,
        items: [
          { food_name: 'Huevo, crudo', grams: 110, measure: '2 huevos' },
          { food_name: 'Pan integral (harina T150)', grams: 70, measure: '2½ rebanadas' },
        ],
      }),
    })
    expect(screen.getByLabelText('Ingredientes')).toHaveTextContent('Huevo 110 g ≈ 2 huevos · Pan integral (harina T150) 70 g ≈ 2½ rebanadas')
  })

  it('sin ingredientes que decir no pinta la línea', () => {
    pintar()
    expect(screen.queryByLabelText('Ingredientes')).not.toBeInTheDocument()
  })

  it('confirma de un toque y avisa de que se ha comido', async () => {
    const props = pintar()
    await userEvent.click(screen.getByRole('button', { name: 'Lo comí' }))
    await waitFor(() => expect(props.setEntry).toHaveBeenCalledWith(2, 'done', null, expect.any(String)))
    expect(props.onChanged).toHaveBeenCalled()
    // Comer es cuando tienes el móvil en la mano: el diario pregunta el peso.
    expect(props.onComido).toHaveBeenCalled()
  })

  it('saltarse una comida no cuenta como comerla', async () => {
    const props = pintar({ setEntry: vi.fn().mockResolvedValue({ ...COMIDA, status: 'skipped' }) })
    await userEvent.click(screen.getByRole('button', { name: 'Me lo salté' }))
    await waitFor(() => expect(props.setEntry).toHaveBeenCalledWith(2, 'skipped', null, expect.any(String)))
    expect(props.onComido).not.toHaveBeenCalled()
  })

  it('«Lo cambié» ofrece tus platos que caben en esa comida y manda el cambio', async () => {
    const props = pintar({
      platos: [
        { id: 8, name: 'Merluza', slots: ['comida', 'cena'], per_serving: { kcal: 400 } },
        { id: 9, name: 'Avena', slots: ['desayuno'], per_serving: { kcal: 300 } },
      ],
    })
    await userEvent.click(screen.getByRole('button', { name: 'Lo cambié' }))
    expect(screen.queryByRole('button', { name: /Avena/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Merluza/ }))
    await waitFor(() => expect(props.setEntry).toHaveBeenCalledWith(2, 'swapped', 8, expect.any(String)))
    expect(props.onComido).toHaveBeenCalled()
  })

  it('«Lo cambié» pone arriba lo que tienes en casa', async () => {
    const dos = [{ food_id: 1 }, { food_id: 2 }]
    pintar({
      platos: [
        { id: 8, name: 'Merluza', slots: ['comida'], per_serving: { kcal: 400 }, ingredients: dos, at_home: 0 },
        { id: 10, name: 'Pollo con patatas', slots: ['comida'], per_serving: { kcal: 600 }, ingredients: dos, at_home: 1 },
      ],
    })
    await userEvent.click(screen.getByRole('button', { name: 'Lo cambié' }))
    const casa = screen.getByRole('group', { name: 'Tienes en casa' })
    expect(within(casa).getByRole('button', { name: /Pollo con patatas/ })).toBeInTheDocument()
    expect(within(casa).queryByRole('button', { name: /Merluza/ })).not.toBeInTheDocument()
    const otros = screen.getByRole('group', { name: 'Otros platos' })
    expect(within(otros).getByRole('button', { name: /Merluza/ })).toBeInTheDocument()
  })

  it('sin nada en casa, la lista de siempre', async () => {
    pintar({ platos: [{ id: 8, name: 'Merluza', slots: ['comida'], per_serving: { kcal: 400 } }] })
    await userEvent.click(screen.getByRole('button', { name: 'Lo cambié' }))
    expect(screen.getByText('¿Por cuál?')).toBeInTheDocument()
    expect(screen.queryByText('Tienes en casa')).not.toBeInTheDocument()
  })

  it('sin otro plato para esa comida lo dice', async () => {
    pintar()
    await userEvent.click(screen.getByRole('button', { name: 'Lo cambié' }))
    expect(screen.getByText('No tienes otro plato para esta comida.')).toBeInTheDocument()
  })

  // Lo comido ya está en el diario, con sus cifras: repetirlo encima sería
  // contar dos veces lo mismo.
  it('lo ya comido no se pinta: está en el diario', () => {
    const { container } = render(
      <PlanEnComida entrada={entrada({ status: 'done', log_entry_id: 40 })} hoy={LUNES} onChanged={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('una comida saltada lo dice y ya no ofrece nada', () => {
    pintar({ entrada: entrada({ id: 2, status: 'skipped' }) })
    expect(screen.getByText('Saltado')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lo comí' })).not.toBeInTheDocument()
  })

  // Lo que todavía no ha pasado no se confirma: confirmar el jueves desde el
  // lunes pondría comida del jueves en el lunes.
  it('en un día que todavía no ha llegado enseña lo planificado pero no deja confirmarlo', () => {
    pintar({ hoy: '2026-09-20' })
    expect(screen.getByText('Pollo con arroz')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lo comí' })).not.toBeInTheDocument()
    expect(screen.getByText('Todavía no ha llegado.')).toBeInTheDocument()
  })

  // Registro sin huecos, fase 1: una comida que se olvidó se cierra después, y
  // se apunta en su día —el sello es de aquel día, no de ahora—.
  it('en un día pasado deja cerrarla, y la apunta en aquel día', async () => {
    const props = pintar({ hoy: '2026-09-23' })
    await userEvent.click(screen.getByRole('button', { name: 'Lo comí' }))
    expect(props.setEntry).toHaveBeenCalledWith(2, 'done', null, expect.stringMatching(/^2026-09-21T12:00:00/))
  })

  // Registro sin huecos, fase 2: dos salidas más. «No sé» dice la comida sin
  // inventar el dato; «Fuera» abre la hoja de comer fuera.
  it('«No sé» la deja dicha sin escribir nada', async () => {
    const props = pintar()
    await userEvent.click(screen.getByRole('button', { name: 'No sé' }))
    expect(props.setEntry).toHaveBeenCalledWith(2, 'unknown', null, expect.any(String))
  })

  it('una comida que no sabes enseña «No sé», sin botones', () => {
    pintar({ entrada: entrada({ id: 2, status: 'unknown' }) })
    expect(screen.getByText('No sé')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lo comí' })).not.toBeInTheDocument()
  })

  it('«Fuera» abre la hoja de comer fuera', async () => {
    pintar()
    await userEvent.click(screen.getByRole('button', { name: 'Fuera' }))
    expect(screen.getByRole('dialog', { name: 'Comer fuera' })).toBeInTheDocument()
  })

  it('con etiqueta dice de qué día y comida es', () => {
    pintar({ hoy: '2026-09-22', etiqueta: 'Ayer · Comida' })
    expect(screen.getByText('Ayer · Comida')).toBeInTheDocument()
  })

  it('si no se puede guardar lo dice, con el motivo del servidor', async () => {
    pintar({ setEntry: vi.fn().mockRejectedValue({ detail: { motivo: 'ese día ya pasó' } }) })
    await userEvent.click(screen.getByRole('button', { name: 'Lo comí' }))
    expect(await screen.findByText('ese día ya pasó')).toBeInTheDocument()
  })
})

describe('las comidas planificadas de un día', () => {
  it('sólo las de ese día, una por comida', () => {
    const plan = { ...PLAN, entries: [...PLAN.entries, entrada({ id: 9, log_date: MARTES, dish_name: 'De mañana' })] }
    expect(planDelDia(plan, LUNES).comida.dish_name).toBe('Pollo con arroz')
    expect(planDelDia(plan, MARTES).comida.dish_name).toBe('De mañana')
    expect(planDelDia(plan, MARTES).desayuno).toBeUndefined()
  })

  it('un cuerpo con otra forma se lee como que no hay plan, y no revienta', () => {
    // `[]` es lo que devuelve un servidor que no conoce la ruta. `[].entries`
    // existe —es el iterador de Array— y un `?? []` lo daría por bueno.
    expect(planDelDia([], LUNES)).toEqual({})
    expect(planDelDia(null, LUNES)).toEqual({})
  })
})
