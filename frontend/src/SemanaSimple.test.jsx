import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import PlanPantalla from './PlanPantalla.jsx'
import * as api from './api.js'

vi.mock('./api.js')

// Comida simple, fase 4 (lienzo, fila Premium · Semana y El domingo): la
// semana en una cuadrícula 7 × 4, el día elegido debajo, la compra en una
// banda; la que viene se genera con su espera y queda «Tu semana, lista».

// Sábado: la semana en curso empieza el lunes 5 y la que viene el 12.
const HOY = '2026-10-10'
const ESTA = '2026-10-05'
const VIENE = '2026-10-12'

let n = 0
function fila(log_date, slot, dish_name, status = null, dish_id = 7) {
  n += 1
  return { id: n, log_date, slot, dish_id, dish_name, items: [], grams: [150], kcal: 600, status, log_entry_id: null }
}

function planEsta() {
  return {
    id: 1,
    week_start: ESTA,
    entries: [
      fila('2026-10-05', 'desayuno', 'Batido', 'done'),
      fila('2026-10-05', 'comida', 'Lentejas', 'done'),
      fila('2026-10-05', 'cena', 'Tortilla', null),
      fila('2026-10-10', 'desayuno', 'Batido', 'done'),
      fila('2026-10-10', 'comida', 'Macarrones', null),
      fila('2026-10-10', 'cena', 'Wrap de pollo', null),
      fila('2026-10-11', 'comida', 'Garbanzos con espinacas', null),
      fila('2026-10-11', 'cena', 'Merluza con patata', null),
    ],
  }
}

function planViene() {
  return {
    id: 2,
    week_start: VIENE,
    entries: [
      fila('2026-10-12', 'comida', 'Lentejas', null, 1),
      fila('2026-10-12', 'cena', 'Tortilla', null, 2),
      fila('2026-10-13', 'comida', 'Macarrones', null, 3),
    ],
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  api.getPlan.mockImplementation(async (week) => (week === ESTA ? planEsta() : null))
  api.getAdherence.mockResolvedValue(null)
  api.listDishes.mockResolvedValue([])
  api.getReview.mockResolvedValue({ due: true })
  api.getTargetProfile.mockResolvedValue({ objetivo_kcal: 2569 })
  api.getShoppingList.mockResolvedValue({
    week_start: ESTA,
    aisles: [{ name: 'Carne', items: [{ food_id: 1 }, { food_id: 2 }] }, { name: 'Fruta', items: [{ food_id: 3 }] }],
  })
  api.listDays.mockResolvedValue([])
})

describe('Esta semana', () => {
  it('la semana es una cuadrícula: un día por fila, sus comidas en casillas', async () => {
    render(<PlanPantalla hoy={HOY} />)
    const rejilla = await screen.findByRole('table', { name: 'Plan de la semana' })
    const filas = within(rejilla).getAllByRole('row').slice(1)
    expect(filas).toHaveLength(7)
    const lunes = within(rejilla).getByRole('button', { name: 'Lunes 5, 2 de 3 comidas' })
    const celdas = lunes.closest('[role="row"]').querySelectorAll('[role="cell"]')
    expect([...celdas].map((c) => c.dataset.estado)).toEqual(['comido', 'comido', 'vacio', 'sin'])
  })

  it('hoy viene elegido, con sus platos debajo para cambiarlos', async () => {
    render(<PlanPantalla hoy={HOY} />)
    const dia = await screen.findByRole('region', { name: 'Sábado' })
    expect(within(dia).getByRole('button', { name: 'Cambiar Macarrones' })).toBeInTheDocument()
    expect(within(dia).getByRole('button', { name: 'Cambiar Wrap de pollo' })).toBeInTheDocument()
  })

  it('tocar otro día lo elige', async () => {
    render(<PlanPantalla hoy={HOY} />)
    await userEvent.click(await screen.findByRole('button', { name: /^Domingo 11/ }))
    const dia = screen.getByRole('region', { name: 'Domingo' })
    expect(within(dia).getByText('Garbanzos con espinacas')).toBeInTheDocument()
  })

  it('la compra va en una banda con cuántas cosas son, y se prepara de un toque', async () => {
    render(<PlanPantalla hoy={HOY} />)
    const banda = await screen.findByRole('region', { name: 'La compra' })
    await waitFor(() => expect(within(banda).getByText('3')).toBeInTheDocument())
    await userEvent.click(within(banda).getByRole('button', { name: 'Preparar' }))
    expect(await screen.findByRole('dialog', { name: 'Lista de la compra' })).toBeInTheDocument()
  })

  it('el entreno sigue en su sitio', async () => {
    render(<PlanPantalla hoy={HOY} />)
    expect(await screen.findByRole('heading', { name: 'Entreno' })).toBeInTheDocument()
  })

  it('sin revisión del domingo, ni «cómo va», ni «generar otra»', async () => {
    render(<PlanPantalla hoy={HOY} />)
    await screen.findByRole('table', { name: 'Plan de la semana' })
    expect(screen.queryByText('Cómo va la semana')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Generar otra' })).not.toBeInTheDocument()
    expect(api.getReview).not.toHaveBeenCalled()
  })
})

describe('La que viene', () => {
  async function abrir() {
    render(<PlanPantalla hoy={HOY} />)
    await userEvent.click(await screen.findByRole('button', { name: 'La que viene' }))
  }

  it('sin plan: lo dice, con qué objetivo se hará, y un botón', async () => {
    await abrir()
    expect(await screen.findByRole('heading', { name: 'Aún no hay plan' })).toBeInTheDocument()
    expect(await screen.findByText('2569')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generar la semana' })).toBeInTheDocument()
  })

  it('generar enseña la espera y deja «Tu semana, lista» con su compra', async () => {
    let soltar
    api.generatePlan.mockImplementation(
      () =>
        new Promise((r) => {
          soltar = r
        }),
    )
    await abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Generar la semana' }))
    expect(await screen.findByText('Eligiendo platos…')).toBeInTheDocument()
    api.getPlan.mockImplementation(async (week) => (week === ESTA ? planEsta() : planViene()))
    soltar(planViene())
    expect(await screen.findByRole('heading', { name: 'Tu semana, lista' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Preparar la compra/ })).toBeInTheDocument()
    expect(api.generatePlan).toHaveBeenCalledWith(VIENE, null)
  })

  it('la pauta del nutricionista va plegada al pie', async () => {
    await abrir()
    const plegada = await screen.findByRole('button', { name: '¿Tienes una pauta del nutricionista?' })
    expect(screen.queryByRole('button', { name: /Subir plan/ })).not.toBeInTheDocument()
    await userEvent.click(plegada)
    expect(screen.getByRole('button', { name: /Subir plan/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pegar plan/ })).toBeInTheDocument()
  })

  it('sin ticket ni «¿Ya compraste?»', async () => {
    await abrir()
    await screen.findByRole('heading', { name: 'Aún no hay plan' })
    expect(screen.queryByText(/ticket/i)).not.toBeInTheDocument()
  })
})
