import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import PlanDelDia, { Adherencia, Semana, lunesDe } from './Plan.jsx'

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
