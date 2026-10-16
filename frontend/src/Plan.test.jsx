import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Adherencia, PlanEnComida, Semana, lunesDe, lunesSiguiente, planDelDia } from './Plan.jsx'

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

describe('la semana', () => {
  it('enseña los siete días con sus comidas', () => {
    render(<Semana plan={PLAN} weekStart={LUNES} onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(screen.getByText('Tu semana')).toBeInTheDocument()
    expect(screen.getByText('Pollo con arroz')).toBeInTheDocument()
    // Siete encabezados de día, aunque sólo uno traiga comidas.
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(7)
  })

  it('cada comida dice sus ingredientes con sus gramos', () => {
    const plan = {
      ...PLAN,
      entries: [entrada({ id: 2, items: [{ food_name: 'Merluza, cruda', grams: 200 }] })],
    }
    render(<Semana plan={plan} weekStart={LUNES} onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(screen.getByLabelText('Ingredientes')).toHaveTextContent('Merluza 200 g')
  })

  it('un día que se sale de su objetivo dice en qué y cuánto', () => {
    const plan = {
      ...PLAN,
      desvios: [
        { log_date: LUNES, nutrient: 'protein', diff: 83 },
        { log_date: LUNES, nutrient: 'carbs', diff: -71 },
        { log_date: LUNES, nutrient: 'kcal', diff: 230 },
      ],
    }
    render(<Semana plan={plan} weekStart={LUNES} onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(screen.getByLabelText('Fuera del objetivo el lunes')).toHaveTextContent(
      'Fuera del objetivo: Proteína +83 g · Hidratos −71 g · +230 kcal',
    )
    // Sólo el día que se sale: el martes no dice nada.
    expect(screen.queryByLabelText('Fuera del objetivo el martes')).not.toBeInTheDocument()
  })

  it('con una pauta no ofrece generar otra semana', () => {
    render(<Semana plan={{ ...PLAN, has_pauta: true }} weekStart={LUNES} onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Generar otra' })).not.toBeInTheDocument()
  })

  it('un día sin comidas lo dice en vez de quedarse en blanco', () => {
    render(<Semana plan={PLAN} weekStart={LUNES} onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(screen.getAllByText('Sin comidas planificadas.')).toHaveLength(6)
  })

  it('deja pedir otra semana con otra semilla', async () => {
    const generar = vi.fn().mockResolvedValue(PLAN)
    render(
      <Semana plan={PLAN} weekStart={LUNES} onClose={vi.fn()} onChanged={vi.fn()} generar={generar} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Generar otra' }))
    await waitFor(() => expect(generar).toHaveBeenCalled())
    // Otra semilla, o saldría exactamente la misma semana.
    expect(generar.mock.calls[0][1]).not.toBe(null)
    expect(generar.mock.calls[0][1]).not.toBe(PLAN.seed)
  })
})

// Plan v2: «Esta semana» es para seguir el plan. Una tira de siete días arriba
// dice cuánto llevas de cada uno y salta a él; la próxima comida de hoy se
// marca; de cómo va la semana queda sólo dónde se cae.
describe('esta semana, para seguir el plan', () => {
  const SEGUIR = {
    ...PLAN,
    entries: [
      entrada({ id: 1, slot: 'desayuno', dish_name: 'Tostada', status: 'done' }),
      entrada({ id: 2, slot: 'comida', dish_name: 'Pollo con arroz' }),
      entrada({ id: 3, slot: 'cena', dish_name: 'Merluza' }),
      entrada({ id: 4, log_date: MARTES, slot: 'comida', dish_name: 'Lentejas' }),
    ],
  }

  function pintar(over = {}) {
    render(
      <Semana
        plan={SEGUIR}
        weekStart={LUNES}
        onClose={vi.fn()}
        onChanged={vi.fn()}
        hoy={LUNES}
        leerAdherencia={vi.fn().mockResolvedValue(null)}
        seguir
        embebida
        {...over}
      />,
    )
  }

  it('la tira dice de cada día cuántas comidas llevas de las planificadas', () => {
    pintar()
    const tira = screen.getByRole('navigation', { name: 'Ir a un día' })
    expect(within(tira).getAllByRole('button')).toHaveLength(7)
    expect(within(tira).getByRole('button', { name: 'Lunes 21, 1 de 3 comidas' })).toHaveTextContent('1/3')
    expect(within(tira).getByRole('button', { name: 'Martes 22, 0 de 1 comidas' })).toHaveTextContent('0/1')
  })

  it('un día sin plan es «—», no un cero', () => {
    pintar()
    const tira = screen.getByRole('navigation', { name: 'Ir a un día' })
    const miercoles = within(tira).getByRole('button', { name: 'Miércoles 23, sin comidas planificadas' })
    expect(miercoles).toHaveTextContent('—')
    expect(miercoles).not.toHaveTextContent('0/0')
  })

  it('tocar un día de la tira lleva a ese día', async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    pintar()
    await userEvent.click(screen.getByRole('button', { name: /^Martes 22/ }))
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(scroll.mock.contexts[0]).toHaveAttribute('id', `plan-dia-${MARTES}`)
  })

  it('marca la primera comida de hoy que aún no tiene estado', () => {
    pintar()
    const siguiente = screen.getAllByText('· Lo siguiente')
    expect(siguiente).toHaveLength(1)
    expect(siguiente[0].closest('li')).toHaveTextContent('Pollo con arroz')
  })

  it('de cómo va la semana sólo dice dónde se cae', async () => {
    const informe = {
      week_start: LUNES, days: 2, eaten_kcal: 3800, planned_kcal: 4000, within_tolerance: true,
      followed: 3, decided: 4, silent: 1, pending: 9, by_slot: [], weakest_slot: 'snack', weakest_missed: 2,
    }
    pintar({ leerAdherencia: vi.fn().mockResolvedValue(informe) })
    expect(await screen.findByText('Donde se cae es el snack.')).toBeInTheDocument()
    expect(screen.getByText('Cómo va la semana')).toBeInTheDocument()
    expect(screen.queryByText(/Comiste/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Seguiste/)).not.toBeInTheDocument()
  })

  it('sin un sitio donde se caiga, no hay tarjeta', async () => {
    const leer = vi.fn().mockResolvedValue({ week_start: LUNES, days: 0, weakest_slot: null, decided: 0 })
    pintar({ leerAdherencia: leer })
    await waitFor(() => expect(leer).toHaveBeenCalled())
    expect(screen.queryByText('Cómo va la semana')).not.toBeInTheDocument()
  })
})

describe('iterar la semana: platos sin comida y cambiar un plato', () => {
  const SEMANA = {
    ...PLAN,
    entries: [
      entrada({ id: 11, slot: 'desayuno', dish_id: 1, dish_name: 'Lentejas con chorizo', kcal: 640 }),
      entrada({ id: 12, slot: 'comida', dish_id: 2, dish_name: 'Pollo al curry', kcal: 720 }),
    ],
  }
  const plato = (id, name, slots, kcal) => ({ id, name, slots, per_serving: { kcal, protein: 20 } })
  const PLATOS = [
    plato(1, 'Lentejas con chorizo', null, 640),
    plato(2, 'Pollo al curry', ['comida', 'cena'], 720),
    plato(3, 'Avena con yogur', ['desayuno'], 455),
    plato(4, 'Tostadas con huevo', null, 410),
  ]

  function pintar(over = {}) {
    const props = {
      plan: SEMANA,
      weekStart: LUNES,
      onClose: vi.fn(),
      onChanged: vi.fn(),
      platos: PLATOS,
      hoy: LUNES,
      leerAdherencia: vi.fn().mockResolvedValue(null),
      replanear: vi.fn().mockResolvedValue({}),
      corregirPlato: vi.fn().mockResolvedValue({}),
      onPlatos: vi.fn(),
      onPlatosChanged: vi.fn(),
      ...over,
    }
    render(<Semana {...props} />)
    return props
  }

  it('avisa de los platos sin comida y lleva a decir a cuál van', async () => {
    const props = pintar()
    expect(screen.getByText('2 platos sin comida')).toBeInTheDocument()
    expect(
      screen.getByText('Valen para cualquier comida, y por eso pueden salir en el desayuno.'),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Decir a qué comida van' }))
    expect(props.onPlatos).toHaveBeenCalled()
  })

  it('concuerda en singular con un solo plato sin comida', () => {
    pintar({ platos: [PLATOS[0], PLATOS[1]] })
    expect(screen.getByText('1 plato sin comida')).toBeInTheDocument()
    expect(
      screen.getByText('Vale para cualquier comida, y por eso puede salir en el desayuno.'),
    ).toBeInTheDocument()
  })

  it('sin platos sin comida no avisa', () => {
    pintar({ platos: [PLATOS[1], PLATOS[2]] })
    expect(screen.queryByText(/sin comida$/)).not.toBeInTheDocument()
  })

  it('tocar un plato abre la hoja con los otros platos que caben en ese hueco', async () => {
    pintar()
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar Lentejas con chorizo' }))
    const hoja = screen.getByRole('dialog', { name: 'Cambiar este plato' })
    expect(hoja).toHaveTextContent('Lunes · Desayuno')
    expect(hoja).toHaveTextContent('Otros platos de desayuno')
    // Avena (sólo desayuno) y Tostadas (cualquiera) caben; el pollo no, y las
    // lentejas son las que ya estaban.
    expect(within(hoja).getByRole('button', { name: /Avena con yogur/ })).toBeInTheDocument()
    expect(within(hoja).getByRole('button', { name: /Tostadas con huevo/ })).toBeInTheDocument()
    expect(within(hoja).queryByRole('button', { name: /Pollo al curry/ })).not.toBeInTheDocument()
    expect(hoja).toHaveTextContent('Sólo cambia el lunes. El resto del día no se reajusta.')
  })

  it('la hoja dice los gramos de lo propuesto y de una ración de cada alternativa', async () => {
    pintar({
      plan: {
        ...SEMANA,
        entries: [
          { ...SEMANA.entries[0], items: [{ food_name: 'Lentejas, crudas', grams: 70 }] },
          SEMANA.entries[1],
        ],
      },
      platos: [
        PLATOS[0],
        {
          ...PLATOS[2],
          servings: 2,
          ingredients: [
            { food_name: 'Avena, copos', grams: 120 },
            { food_name: 'Yogur natural', grams: 250 },
          ],
        },
      ],
    })
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar Lentejas con chorizo' }))
    const hoja = screen.getByRole('dialog', { name: 'Cambiar este plato' })
    const lineas = within(hoja).getAllByLabelText('Ingredientes')
    expect(lineas[0]).toHaveTextContent('Lentejas 70 g')
    // Lo que el plan pondría si lo eliges: una ración de la receta.
    // 60 g es justo el tope de las cucharadas (docs/medidas-caseras.md).
    expect(lineas[1]).toHaveTextContent('Avena 60 g ≈ 4 cdas · Yogur natural 125 g')
  })

  it('elegir otro plato lo pone en el plan de ese día', async () => {
    const props = pintar()
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar Lentejas con chorizo' }))
    await userEvent.click(screen.getByRole('button', { name: /Avena con yogur/ }))
    await waitFor(() => expect(props.replanear).toHaveBeenCalledWith(11, 3, LUNES))
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled())
    expect(screen.queryByRole('dialog', { name: 'Cambiar este plato' })).not.toBeInTheDocument()
  })

  const BAR_PACO = { id: 70, name: 'Bar Paco', kind: 'fuera', per_serving: { kcal: 951.4 } }

  it('en la hoja, «Comer fuera» con tus sitios: elegir uno lo reserva en el plan', async () => {
    const props = pintar({ leerSitios: vi.fn().mockResolvedValue([BAR_PACO]) })
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar Lentejas con chorizo' }))
    const hoja = screen.getByRole('dialog', { name: 'Cambiar este plato' })
    expect(await within(hoja).findByText('Comer fuera')).toBeInTheDocument()
    expect(hoja).toHaveTextContent('Reserva sus kcal y reajusta lo que queda del día.')
    await userEvent.click(within(hoja).getByRole('button', { name: 'Bar Paco · ~951 kcal' }))
    await waitFor(() => expect(props.replanear).toHaveBeenCalledWith(11, 70, LUNES))
  })

  it('sin sitios la hoja no habla de comer fuera', async () => {
    const props = pintar({ leerSitios: vi.fn().mockResolvedValue([]) })
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar Lentejas con chorizo' }))
    await waitFor(() => expect(props.leerSitios).toHaveBeenCalled())
    expect(screen.queryByText('Comer fuera')).not.toBeInTheDocument()
  })

  it('una comida fuera reservada dice sus kcal como reservadas', () => {
    pintar({
      plan: {
        ...SEMANA,
        entries: [
          SEMANA.entries[0],
          entrada({ id: 12, slot: 'comida', dish_id: 70, dish_name: 'Bar Paco', kcal: 795, place: true }),
        ],
      },
    })
    expect(screen.getByText('~795 kcal reservadas')).toBeInTheDocument()
  })

  it('si no se puede cambiar dice por qué y la hoja sigue abierta', async () => {
    pintar({ replanear: vi.fn().mockRejectedValue({ detail: { motivo: 'ese día ya pasó' } }) })
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar Lentejas con chorizo' }))
    await userEvent.click(screen.getByRole('button', { name: /Avena con yogur/ }))
    expect(await screen.findByText('No se ha podido cambiar: ese día ya pasó.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Cambiar este plato' })).toBeInTheDocument()
  })

  it('«No en desayunos» quita el desayuno de un plato que valía para cualquiera', async () => {
    const props = pintar()
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar Lentejas con chorizo' }))
    await userEvent.click(screen.getByRole('button', { name: 'No en desayunos' }))
    await waitFor(() =>
      expect(props.corregirPlato).toHaveBeenCalledWith(1, { slots: ['comida', 'cena', 'snack'] }),
    )
    expect(props.onPlatosChanged).toHaveBeenCalled()
    expect(
      await screen.findByText('Ya no saldrá en desayunos. Elige por cuál cambiarlo.'),
    ).toBeInTheDocument()
  })

  it('a un plato con comidas sólo le quita ésa', async () => {
    const semana = {
      ...SEMANA,
      entries: [entrada({ id: 12, slot: 'comida', dish_id: 2, dish_name: 'Pollo al curry' })],
    }
    const props = pintar({ plan: semana })
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar Pollo al curry' }))
    await userEvent.click(screen.getByRole('button', { name: 'No en comidas' }))
    await waitFor(() => expect(props.corregirPlato).toHaveBeenCalledWith(2, { slots: ['cena'] }))
  })

  it('no ofrece quitar la única comida de un plato: lo dejaría para cualquiera', async () => {
    const semana = {
      ...SEMANA,
      entries: [entrada({ id: 13, slot: 'desayuno', dish_id: 3, dish_name: 'Avena con yogur' })],
    }
    pintar({ plan: semana })
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar Avena con yogur' }))
    expect(screen.queryByRole('button', { name: 'No en desayunos' })).not.toBeInTheDocument()
  })

  it('un día que ya pasó no se puede cambiar', () => {
    pintar({ hoy: MARTES })
    expect(screen.queryByRole('button', { name: /^Cambiar / })).not.toBeInTheDocument()
    expect(screen.getByText('Lentejas con chorizo')).toBeInTheDocument()
  })

  it('una comida ya dicha no se puede cambiar', () => {
    const semana = {
      ...SEMANA,
      entries: [entrada({ id: 11, slot: 'desayuno', dish_id: 1, dish_name: 'Lentejas con chorizo', status: 'done' })],
    }
    pintar({ plan: semana })
    expect(screen.queryByRole('button', { name: 'Cambiar Lentejas con chorizo' })).not.toBeInTheDocument()
  })

  it('sin tus platos a mano no hay ni aviso ni cambio', () => {
    pintar({ platos: null })
    expect(screen.queryByText(/sin comida$/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Cambiar / })).not.toBeInTheDocument()
  })
})

describe('cómo fue la semana', () => {
  const INFORME = {
    week_start: LUNES,
    days: 7,
    eaten_kcal: 12400,
    planned_kcal: 12900,
    within_tolerance: true,
    followed: 12,
    decided: 16,
    silent: 7,
    pending: 0,
    by_slot: [],
    weakest_slot: 'cena',
    weakest_missed: 4,
  }

  it('enseña lo comido contra lo planificado', () => {
    render(<Adherencia informe={INFORME} />)
    expect(screen.getByText('Comiste 12.400 de 12.900 kcal planificadas.')).toBeInTheDocument()
    expect(screen.getByText('Dentro de lo previsto.')).toBeInTheDocument()
  })

  it('dice por cuánto te pasaste cuando te sales de la banda', () => {
    render(<Adherencia informe={{ ...INFORME, eaten_kcal: 14500, within_tolerance: false }} />)
    expect(screen.getByText('Te pasaste 1600 kcal.')).toBeInTheDocument()
  })

  it('dice dónde se cae el plan', () => {
    render(<Adherencia informe={INFORME} />)
    expect(screen.getByText('Donde se cae el plan es la cena: 4 días.')).toBeInTheDocument()
  })

  it('lo callado se cuenta aparte, no como incumplido', () => {
    render(<Adherencia informe={INFORME} />)
    expect(screen.getByText('Seguiste 12 de 16 comidas.')).toBeInTheDocument()
    expect(screen.getByText('Otras 7 pasaron sin que dijeras nada.')).toBeInTheDocument()
  })

  it('concuerda en singular cuando es una sola', () => {
    render(<Adherencia informe={{ ...INFORME, silent: 1, pending: 1 }} />)
    expect(screen.getByText('Otra pasó sin que dijeras nada.')).toBeInTheDocument()
    expect(screen.getByText('Queda una comida por delante.')).toBeInTheDocument()
  })

  it('sin días cerrados no inventa un porcentaje', () => {
    render(
      <Adherencia
        informe={{ ...INFORME, days: 0, eaten_kcal: null, planned_kcal: null, pending: 28 }}
      />,
    )
    expect(screen.getByText('Todavía no hay días cerrados esta semana.')).toBeInTheDocument()
    expect(screen.queryByText(/Comiste/)).not.toBeInTheDocument()
    expect(screen.getByText('Quedan 28 comidas por delante.')).toBeInTheDocument()
  })
})
