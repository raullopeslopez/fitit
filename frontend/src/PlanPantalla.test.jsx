import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import PlanPantalla, { rangoSemana } from './PlanPantalla.jsx'
import {
  generatePlan,
  getAdherence,
  getPlan,
  getReview,
  getShoppingList,
  getTargetProfile,
  importPlan,
  listDishes,
  saveImportedPlan,
} from './api.js'

vi.mock('./api.js')

// Sábado: la semana en curso empieza el lunes 5 y la que viene el 12.
const HOY = '2026-10-10'
const ESTA = '2026-10-05'
const VIENE = '2026-10-12'

function plan(weekStart, nombre, over = {}) {
  return {
    id: 1,
    week_start: weekStart,
    seed: 3,
    score: 0,
    verdicts: [],
    entries: [
      {
        id: 1,
        log_date: weekStart,
        slot: 'comida',
        dish_id: 7,
        dish_name: nombre,
        grams: [150],
        kcal: 620,
        status: null,
        log_entry_id: null,
        ...over,
      },
    ],
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  getPlan.mockImplementation(async (week) =>
    week === ESTA ? plan(ESTA, 'Pollo con arroz') : null,
  )
  getAdherence.mockResolvedValue(null)
  listDishes.mockResolvedValue([])
  getReview.mockResolvedValue({ due: false })
  getTargetProfile.mockResolvedValue({ objetivo_kcal: 2150 })
  generatePlan.mockResolvedValue(plan(VIENE, 'Merluza'))
  getShoppingList.mockResolvedValue({ week_start: VIENE, aisles: [] })
})

describe('rangoSemana', () => {
  it('dice los dos días con el mes una vez', () => {
    expect(rangoSemana('2026-10-05')).toBe('5 – 11 oct')
  })
  it('con la semana entre dos meses dice los dos', () => {
    expect(rangoSemana('2026-09-28')).toBe('28 sep – 4 oct')
  })
})

describe('la pantalla Plan', () => {
  it('abre en esta semana, con su rango y sus días', async () => {
    render(<PlanPantalla hoy={HOY} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Plan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Esta semana' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('5 – 11 oct')).toBeInTheDocument()
    expect(await screen.findByText('Pollo con arroz')).toBeInTheDocument()
    expect(getPlan).toHaveBeenCalledWith(ESTA)
  })

  it('sin plan esta semana ofrece generarla', async () => {
    getPlan.mockResolvedValue(null)
    render(<PlanPantalla hoy={HOY} />)
    expect(await screen.findByText('Todavía no hay plan para esta semana.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Generar la semana' }))
    await waitFor(() => expect(generatePlan).toHaveBeenCalledWith(ESTA, null))
  })

  it('«La que viene» planifica la semana del lunes siguiente', async () => {
    render(<PlanPantalla hoy={HOY} />)
    await userEvent.click(screen.getByRole('button', { name: 'La que viene' }))
    expect(screen.getByRole('button', { name: 'La que viene' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('12 – 18 oct')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Generar la semana' }))
    await waitFor(() => expect(generatePlan).toHaveBeenCalledWith(VIENE, null))
  })

  it('con la que viene ya generada, enseña su lista de la compra', async () => {
    getPlan.mockImplementation(async (week) => plan(week, week === VIENE ? 'Merluza' : 'Pollo con arroz'))
    render(<PlanPantalla hoy={HOY} inicial="viene" />)
    expect(await screen.findByText('Merluza')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Lista de la compra/ }))
    expect(screen.getByRole('dialog', { name: 'Lista de la compra' })).toBeInTheDocument()
  })

  it('«Tus platos» se abre desde la semana', async () => {
    listDishes.mockResolvedValue([{ id: 7, name: 'Pollo con arroz', slots: ['comida'], ingredients: [] }])
    render(<PlanPantalla hoy={HOY} />)
    await userEvent.click(await screen.findByRole('button', { name: /Tus platos/ }))
    expect(screen.getByRole('dialog', { name: 'Tus platos' })).toBeInTheDocument()
  })

  it('un plan que no llega no deja la pantalla en blanco', async () => {
    getPlan.mockRejectedValue(new Error('red'))
    render(<PlanPantalla hoy={HOY} />)
    expect(await screen.findByText('No se ha podido cargar el plan.')).toBeInTheDocument()
  })

  describe('subir el plan del nutricionista', () => {
    const LECTURA = {
      dishes: [
        { name: 'Pollo con arroz', slots: ['comida'], status: 'existing', dish_id: 7, lines: [] },
      ],
      week: [{ day: 0, slot: 'comida', dish: 0 }],
      refusal: null,
    }
    const pdf = () => new File(['%PDF'], 'plan.pdf', { type: 'application/pdf' })

    it('subir un PDF lo lee y enseña los platos identificados', async () => {
      importPlan.mockResolvedValue(LECTURA)
      render(<PlanPantalla hoy={HOY} />)
      expect(await screen.findByRole('button', { name: /Subir plan/ })).toHaveTextContent('PDF del nutricionista')
      await userEvent.upload(screen.getByLabelText('PDF del plan'), pdf())
      expect(await screen.findByRole('dialog', { name: 'Platos identificados' })).toBeInTheDocument()
      expect(importPlan).toHaveBeenCalled()
    })

    it('si no se puede leer lo dice, y no abre nada', async () => {
      importPlan.mockResolvedValue({ dishes: [], week: [], refusal: 'unreadable' })
      render(<PlanPantalla hoy={HOY} />)
      await userEvent.upload(await screen.findByLabelText('PDF del plan'), pdf())
      expect(await screen.findByText('No se ha podido leer el plan. Prueba otra vez.')).toBeInTheDocument()
      expect(screen.queryByRole('dialog', { name: 'Platos identificados' })).not.toBeInTheDocument()
    })

    it('sin cuota en el día lo dice distinto', async () => {
      importPlan.mockResolvedValue({ dishes: [], week: [], refusal: 'quota', quota_scope: 'day' })
      render(<PlanPantalla hoy={HOY} />)
      await userEvent.upload(await screen.findByLabelText('PDF del plan'), pdf())
      expect(await screen.findByText('Se ha gastado la lectura de hoy. Prueba mañana.')).toBeInTheDocument()
    })

    it('guardar rehace las semanas que no tienen nada confirmado y lo dice', async () => {
      importPlan.mockResolvedValue(LECTURA)
      saveImportedPlan.mockResolvedValue({ pauta_id: 1 })
      getPlan.mockImplementation(async (week) => plan(week, 'Pollo con arroz'))
      render(<PlanPantalla hoy={HOY} />)
      await userEvent.upload(await screen.findByLabelText('PDF del plan'), pdf())
      await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
      await waitFor(() => expect(saveImportedPlan).toHaveBeenCalled())
      expect(saveImportedPlan.mock.calls[0][0].week_start).toBe(ESTA)
      await waitFor(() => expect(generatePlan).toHaveBeenCalledWith(VIENE, null))
      expect(generatePlan).toHaveBeenCalledWith(ESTA, null)
      expect(await screen.findByText('Pauta guardada. Tu semana ya sigue el plan.')).toBeInTheDocument()
    })

    it('una semana con comidas ya confirmadas no se rehace', async () => {
      importPlan.mockResolvedValue(LECTURA)
      saveImportedPlan.mockResolvedValue({ pauta_id: 1 })
      getPlan.mockImplementation(async (week) =>
        week === ESTA ? plan(ESTA, 'Pollo con arroz', { status: 'done' }) : null,
      )
      render(<PlanPantalla hoy={HOY} />)
      await userEvent.upload(await screen.findByLabelText('PDF del plan'), pdf())
      await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
      expect(
        await screen.findByText(
          'Pauta guardada. Esta semana ya tiene comidas confirmadas: el plan se aplica desde la que viene.',
        ),
      ).toBeInTheDocument()
      expect(generatePlan).not.toHaveBeenCalled()
    })
  })
})
