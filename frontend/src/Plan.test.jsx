import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import PlanDelDia, { Adherencia, Semana, lunesDe, lunesSiguiente } from './Plan.jsx'

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

describe('el plan del día', () => {
  it('pinta las cuatro comidas con lo que suman', () => {
    render(<PlanDelDia plan={PLAN} dayIso={LUNES} isToday onChanged={vi.fn()} />)
    expect(screen.getByText('Pollo con arroz')).toBeInTheDocument()
    expect(screen.getByText('Tostada')).toBeInTheDocument()
    expect(screen.getByText('620 kcal')).toBeInTheDocument()
  })

  it('sólo enseña las comidas de ese día', () => {
    const plan = { ...PLAN, entries: [...PLAN.entries, entrada({ id: 9, log_date: MARTES, dish_name: 'De mañana' })] }
    render(<PlanDelDia plan={plan} dayIso={LUNES} isToday onChanged={vi.fn()} />)
    expect(screen.queryByText('De mañana')).not.toBeInTheDocument()
  })

  it('confirma una comida de un toque', async () => {
    const onChanged = vi.fn()
    const setPlanEntry = vi.fn().mockResolvedValue({ ...entrada(), status: 'done' })
    render(
      <PlanDelDia plan={PLAN} dayIso={LUNES} isToday onChanged={onChanged} setEntry={setPlanEntry} />,
    )
    await userEvent.click(screen.getAllByRole('button', { name: /Lo comí/ })[1])
    await waitFor(() => expect(setPlanEntry).toHaveBeenCalledWith(2, 'done', null))
    expect(onChanged).toHaveBeenCalled()
  })

  // Confirmar es el momento en que ya tienes el móvil en la mano: si hoy no te
  // has pesado, se pregunta ahí, dentro de la tarjeta.
  it('tras confirmar, pregunta el peso de hoy si falta', async () => {
    const setPlanEntry = vi.fn().mockResolvedValue({ ...entrada(), status: 'done' })
    render(
      <PlanDelDia
        plan={PLAN}
        dayIso={LUNES}
        isToday
        onChanged={vi.fn()}
        setEntry={setPlanEntry}
        leerPesadas={vi.fn().mockResolvedValue([])}
        guardarPeso={vi.fn()}
      />,
    )
    expect(screen.queryByText('¿Te has pesado hoy?')).not.toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: /Lo comí/ })[1])
    expect(await screen.findByText('¿Te has pesado hoy?')).toBeInTheDocument()
  })

  it('saltarse una comida no pregunta el peso', async () => {
    const setPlanEntry = vi.fn().mockResolvedValue({ ...entrada(), status: 'skipped' })
    const leer = vi.fn().mockResolvedValue([])
    render(
      <PlanDelDia plan={PLAN} dayIso={LUNES} isToday onChanged={vi.fn()} setEntry={setPlanEntry} leerPesadas={leer} guardarPeso={vi.fn()} />,
    )
    await userEvent.click(screen.getAllByRole('button', { name: /Me lo salté/ })[1])
    await waitFor(() => expect(setPlanEntry).toHaveBeenCalled())
    expect(screen.queryByText('¿Te has pesado hoy?')).not.toBeInTheDocument()
  })

  it('una comida confirmada lo dice y ya no se puede volver a confirmar', () => {
    const plan = {
      ...PLAN,
      entries: [entrada({ id: 2, status: 'done', log_entry_id: 40 })],
    }
    render(<PlanDelDia plan={plan} dayIso={LUNES} isToday onChanged={vi.fn()} />)
    expect(screen.getByText('Comido')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Lo comí/ })).not.toBeInTheDocument()
  })

  it('una comida saltada se distingue de una que no has dicho nada', () => {
    const plan = {
      ...PLAN,
      entries: [entrada({ id: 2, status: 'skipped' }), entrada({ id: 3, slot: 'cena' })],
    }
    render(<PlanDelDia plan={plan} dayIso={LUNES} isToday onChanged={vi.fn()} />)
    expect(screen.getByText('Saltado')).toBeInTheDocument()
    // La que no dice nada sigue ofreciendo confirmar: no confirmada no es saltada.
    expect(screen.getAllByRole('button', { name: /Lo comí/ })).toHaveLength(1)
    // Y el botón no se llama igual que el estado, o la fila parecería ofrecer
    // lo que ya hizo.
    expect(screen.getAllByRole('button', { name: 'Me lo salté' })).toHaveLength(1)
  })

  // Una entrada del diario se fecha por el instante en que la escribes, así que
  // confirmar el jueves desde el lunes pondría comida del jueves en el lunes.
  it('en un día que no es hoy enseña el plan pero no deja confirmarlo', () => {
    render(<PlanDelDia plan={PLAN} dayIso={LUNES} isToday={false} onChanged={vi.fn()} />)
    expect(screen.getByText('Pollo con arroz')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Lo comí/ })).not.toBeInTheDocument()
    expect(screen.getByText('Sólo se confirma el día de hoy.')).toBeInTheDocument()
  })

  it('un cuerpo con otra forma se lee como que no hay plan, y no revienta', () => {
    // `[]` es lo que devuelve un servidor que no conoce la ruta. `[].entries`
    // existe —es el iterador de Array— y un `?? []` lo daría por bueno.
    render(<PlanDelDia plan={[]} dayIso={LUNES} isToday onChanged={vi.fn()} />)
    expect(screen.queryByText('Pollo con arroz')).not.toBeInTheDocument()
  })

  it('sin plan para esa semana ofrece generarla', async () => {
    const generar = vi.fn().mockResolvedValue(PLAN)
    const onChanged = vi.fn()
    render(<PlanDelDia plan={null} dayIso={LUNES} isToday onChanged={onChanged} generar={generar} />)
    expect(screen.getByText('Todavía no hay plan para esta semana.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Generar la semana' }))
    await waitFor(() => expect(generar).toHaveBeenCalledWith(LUNES, null))
  })

  it('dice por qué no se ha podido generar, con el hueco', async () => {
    const generar = vi.fn().mockRejectedValue(
      Object.assign(new Error('unprocessable'), {
        status: 422,
        detail: { slot: 'cena', motivo: 'sin candidatos' },
      }),
    )
    render(<PlanDelDia plan={null} dayIso={LUNES} isToday onChanged={vi.fn()} generar={generar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Generar la semana' }))
    expect(await screen.findByText(/No hay platos que puedan ir en la cena/)).toBeInTheDocument()
  })

  it('sin platos dice que empieces por ahí', async () => {
    const generar = vi.fn().mockRejectedValue(
      Object.assign(new Error('unprocessable'), {
        status: 422,
        detail: { slot: null, motivo: 'no hay platos en el repertorio' },
      }),
    )
    render(<PlanDelDia plan={null} dayIso={LUNES} isToday onChanged={vi.fn()} generar={generar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Generar la semana' }))
    expect(await screen.findByText(/Necesitas platos/)).toBeInTheDocument()
  })
})

// La semana que viene se planifica cualquier día: compras una vez a la semana
// pero no siempre el mismo, y para comprar hace falta el plan antes del lunes.
describe('la semana que viene, desde el plan del día', () => {
  it('sin plan para la que viene, ofrece planificarla', async () => {
    const onPlanificar = vi.fn()
    render(
      <PlanDelDia plan={PLAN} dayIso={LUNES} isToday onChanged={vi.fn()} siguiente={null} onPlanificar={onPlanificar} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Planificar la semana que viene' }))
    expect(onPlanificar).toHaveBeenCalledOnce()
  })

  it('también cuando esta semana tampoco tiene plan', () => {
    render(
      <PlanDelDia plan={null} dayIso={LUNES} isToday onChanged={vi.fn()} siguiente={null} onPlanificar={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Planificar la semana que viene' })).toBeInTheDocument()
  })

  it('con la que viene ya planificada, se ve', () => {
    render(
      <PlanDelDia plan={PLAN} dayIso={LUNES} isToday onChanged={vi.fn()} siguiente={PLAN} onPlanificar={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Ver la semana que viene' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Planificar la semana que viene' })).not.toBeInTheDocument()
  })

  it('mirando otro día no se ofrece: «la que viene» es la de hoy', () => {
    render(
      <PlanDelDia plan={PLAN} dayIso={LUNES} isToday={false} onChanged={vi.fn()} siguiente={null} onPlanificar={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: /semana que viene/ })).not.toBeInTheDocument()
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

  it('elegir otro plato lo pone en el plan de ese día', async () => {
    const props = pintar()
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar Lentejas con chorizo' }))
    await userEvent.click(screen.getByRole('button', { name: /Avena con yogur/ }))
    await waitFor(() => expect(props.replanear).toHaveBeenCalledWith(11, 3, LUNES))
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled())
    expect(screen.queryByRole('dialog', { name: 'Cambiar este plato' })).not.toBeInTheDocument()
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

describe('qué me queda por comer', () => {
  it('nombra las comidas que quedan y lo que suman', () => {
    render(<PlanDelDia plan={PLAN} dayIso={LUNES} isToday onChanged={vi.fn()} />)
    expect(
      screen.getByText('Te quedan el desayuno, la comida, la cena y el snack: 1680 kcal.'),
    ).toBeInTheDocument()
  })

  it('con una sola concuerda en singular', () => {
    const plan = {
      ...PLAN,
      entries: [
        entrada({ id: 1, slot: 'desayuno', status: 'done' }),
        entrada({ id: 2, slot: 'cena', kcal: 500 }),
      ],
    }
    render(<PlanDelDia plan={plan} dayIso={LUNES} isToday onChanged={vi.fn()} />)
    expect(screen.getByText('Te queda la cena: 500 kcal.')).toBeInTheDocument()
  })

  it('cuando ya has dicho de todas, lo dice', () => {
    const plan = {
      ...PLAN,
      entries: [entrada({ id: 1, status: 'done' }), entrada({ id: 2, slot: 'cena', status: 'skipped' })],
    }
    render(<PlanDelDia plan={plan} dayIso={LUNES} isToday onChanged={vi.fn()} />)
    expect(screen.getByText('Nada más por hoy.')).toBeInTheDocument()
  })

  it('en un día que no es hoy no cuenta lo que queda', () => {
    render(<PlanDelDia plan={PLAN} dayIso={LUNES} isToday={false} onChanged={vi.fn()} />)
    expect(screen.queryByText(/Te quedan/)).not.toBeInTheDocument()
  })
})

const PLATOS = [
  { id: 7, name: 'Pollo con arroz', slots: null, per_serving: { kcal: 620 } },
  { id: 8, name: 'Merluza al horno', slots: ['comida', 'cena'], per_serving: { kcal: 500 } },
  { id: 9, name: 'Tostada', slots: ['desayuno'], per_serving: { kcal: 380 } },
]

describe('cambiar una comida', () => {
  it('ofrece los platos tuyos que caben en ese hueco', async () => {
    render(
      <PlanDelDia plan={PLAN} dayIso={LUNES} isToday onChanged={vi.fn()} platos={PLATOS} />,
    )
    await userEvent.click(screen.getAllByRole('button', { name: 'Lo cambié' })[1])
    expect(screen.getByText('¿Por cuál?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Merluza al horno/ })).toBeInTheDocument()
    // El que ya estaba planificado no se ofrece, y el del desayuno tampoco.
    expect(screen.queryByRole('button', { name: /Pollo con arroz/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tostada/ })).not.toBeInTheDocument()
  })

  it('al elegir uno lo manda como cambio', async () => {
    const setEntry = vi.fn().mockResolvedValue({ ...entrada(), status: 'swapped' })
    render(
      <PlanDelDia
        plan={PLAN}
        dayIso={LUNES}
        isToday
        onChanged={vi.fn()}
        platos={PLATOS}
        setEntry={setEntry}
      />,
    )
    await userEvent.click(screen.getAllByRole('button', { name: 'Lo cambié' })[1])
    await userEvent.click(screen.getByRole('button', { name: /Merluza al horno/ }))
    await waitFor(() => expect(setEntry).toHaveBeenCalledWith(2, 'swapped', 8))
  })

  it('sin ningún plato que quepa lo dice en vez de enseñar una lista vacía', async () => {
    render(
      <PlanDelDia
        plan={PLAN}
        dayIso={LUNES}
        isToday
        onChanged={vi.fn()}
        platos={[PLATOS[0], PLATOS[2]]}
      />,
    )
    await userEvent.click(screen.getAllByRole('button', { name: 'Lo cambié' })[1])
    expect(screen.getByText('No tienes otro plato para esta comida.')).toBeInTheDocument()
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
