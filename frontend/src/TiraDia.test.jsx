import { render, screen } from '@testing-library/react'

import { TiraDia, fueraDelPlan } from './TiraDia.jsx'

function fila(slot, overrides = {}) {
  return {
    id: { desayuno: 1, comida: 2, snack: 3, cena: 4 }[slot],
    log_date: '2026-08-31',
    slot,
    dish_id: 70,
    dish_name: 'Pollo con arroz',
    kcal: 600,
    protein: 45,
    carbs: 75,
    fat: 15,
    carbs_shift: null,
    status: null,
    ...overrides,
  }
}

const DIA = {
  desayuno: fila('desayuno', { status: 'done' }),
  comida: fila('comida', { status: 'done', carbs: 90 }),
  snack: fila('snack', { carbs: 0, carbs_shift: -40 }),
  cena: fila('cena', { carbs: 115, carbs_shift: 40 }),
}

describe('TiraDia', () => {
  it('pinta las cuatro comidas en el orden en que se comen', () => {
    render(<TiraDia entradas={DIA} />)
    const nombres = [...document.querySelectorAll('.tira-nombre')].map((e) => e.textContent)
    expect(nombres).toEqual(['DES', 'COM', 'MER', 'CENA'])
  })

  it('lo ya comido se apaga', () => {
    render(<TiraDia entradas={DIA} />)
    const hechas = [...document.querySelectorAll('.tira-col.is-hecha .tira-nombre')].map((e) => e.textContent)
    expect(hechas).toEqual(['DES', 'COM'])
  })

  // Sólo lo que cambia lleva cifra: sin entreno, la tira son formas.
  it('el hidrato que movió el entreno se dice en gramos, y nada más lleva cifra', () => {
    render(<TiraDia entradas={DIA} />)
    expect(screen.getByText('+40 g')).toHaveClass('is-gana')
    expect(screen.getByText('−40 g')).not.toHaveClass('is-gana')
    expect(document.querySelectorAll('.tira-delta')).toHaveLength(2)
  })

  it('una banda sin nada no se dibuja', () => {
    render(<TiraDia entradas={DIA} />)
    const merienda = [...document.querySelectorAll('.tira-col')][2]
    expect(merienda.querySelector('.tira-banda.is-h')).toBeNull()
  })

  it('se lee entera para quien no la ve', () => {
    render(<TiraDia entradas={DIA} />)
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Hidrato del día: desayuno 75 g, comido; comida 90 g, comido; merienda 0 g, −40 g por el entreno; cena 115 g, +40 g por el entreno',
    )
  })

  // `null` no es cero: sin una cifra no hay proporción que dibujar.
  it('sin los macros de alguna comida no se dibuja', () => {
    const { container } = render(<TiraDia entradas={{ ...DIA, cena: fila('cena', { fat: null }) }} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('fueraDelPlan', () => {
  const plan = { desayuno: fila('desayuno', { status: 'done' }), comida: fila('comida') }

  it('lo comido del plan, con su plato, está dentro', () => {
    expect(fueraDelPlan([{ id: 1, meal_slot: 'desayuno', dish_id: 70 }], plan)).toEqual([])
  })

  it('lo apuntado aparte, o en una comida aún sin decir, está fuera', () => {
    const sueltas = [
      { id: 2, meal_slot: 'desayuno', dish_id: null },
      { id: 3, meal_slot: 'comida', dish_id: 70 },
      { id: 4, meal_slot: 'snack', dish_id: null },
    ]
    expect(fueraDelPlan(sueltas, plan).map((e) => e.id)).toEqual([2, 3, 4])
  })
})
