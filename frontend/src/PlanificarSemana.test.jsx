import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import PlanificarSemana from './PlanificarSemana.jsx'
import { acceptTarget, answerReview, generatePlan, getAdherence, getReview, getTargetProfile, listDishes } from './api.js'

vi.mock('./api.js')

const LUNES = '2026-10-12'

const PLAN = {
  id: 1,
  week_start: LUNES,
  seed: 3,
  score: 0,
  verdicts: [],
  entries: [
    { id: 1, log_date: LUNES, slot: 'comida', dish_id: 7, dish_name: 'Pollo con arroz', grams: [150], kcal: 620, status: null },
  ],
}

beforeEach(() => {
  vi.resetAllMocks()
  getReview.mockResolvedValue({ due: true, answer: null })
  answerReview.mockResolvedValue({ kcal: 2230, source: 'measured', expenditure: 2780 })
  getTargetProfile.mockResolvedValue({ objetivo_kcal: 2150 })
  acceptTarget.mockResolvedValue({})
  generatePlan.mockResolvedValue(PLAN)
  getAdherence.mockResolvedValue(null)
})

// Revisar y planificar son un solo momento: el objetivo se decide antes de
// generar la semana y comprar con ella, no un domingo fijo después de comprar.
describe('Planificar la semana que viene', () => {
  it('dice qué semana es', async () => {
    render(<PlanificarSemana weekStart={LUNES} plan={null} onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(screen.getByText('Semana del 12 oct')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Planificar la semana que viene' })).toBeInTheDocument()
    await screen.findByText('¿Apuntaste todo lo que comiste?')
  })

  it('empieza por la revisión, y generar llega después', async () => {
    render(<PlanificarSemana weekStart={LUNES} plan={null} onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(await screen.findByText('¿Apuntaste todo lo que comiste?')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Generar la semana' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Sí, todo' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Mantener 2150' }))

    expect(await screen.findByRole('button', { name: 'Generar la semana' })).toBeInTheDocument()
    expect(await screen.findByText('Se planifica con tu objetivo de 2150 kcal al día.')).toBeInTheDocument()
  })

  it('aceptar el objetivo nuevo planifica con él', async () => {
    const onChanged = vi.fn()
    render(<PlanificarSemana weekStart={LUNES} plan={null} onClose={vi.fn()} onChanged={onChanged} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, todo' }))
    getTargetProfile.mockResolvedValue({ objetivo_kcal: 2230 })
    await userEvent.click(await screen.findByRole('button', { name: 'Aceptar 2230' }))

    expect(acceptTarget).toHaveBeenCalledWith(2230)
    expect(await screen.findByText('Se planifica con tu objetivo de 2230 kcal al día.')).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalled()
  })

  it('si la revisión no toca, va directo a generar', async () => {
    getReview.mockResolvedValue({ due: false })
    render(<PlanificarSemana weekStart={LUNES} plan={null} onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(await screen.findByRole('button', { name: 'Generar la semana' })).toBeInTheDocument()
    expect(screen.queryByText('REVISIÓN SEMANAL')).not.toBeInTheDocument()
  })

  it('sin objetivo lo dice, en vez de inventarse uno', async () => {
    getReview.mockResolvedValue({ due: false })
    getTargetProfile.mockResolvedValue({ objetivo_kcal: null })
    render(<PlanificarSemana weekStart={LUNES} plan={null} onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(
      await screen.findByText('Todavía no tienes objetivo de kcal: la semana no se ajustará a ninguno.'),
    ).toBeInTheDocument()
  })

  it('genera la semana que viene, no la de hoy', async () => {
    getReview.mockResolvedValue({ due: false })
    const onChanged = vi.fn()
    render(<PlanificarSemana weekStart={LUNES} plan={null} onClose={vi.fn()} onChanged={onChanged} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Generar la semana' }))
    expect(generatePlan).toHaveBeenCalledWith(LUNES, null)
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('dice por qué no se ha podido generar', async () => {
    getReview.mockResolvedValue({ due: false })
    generatePlan.mockRejectedValue(
      Object.assign(new Error('unprocessable'), {
        status: 422,
        detail: { slot: null, motivo: 'no hay platos en el repertorio' },
      }),
    )
    render(<PlanificarSemana weekStart={LUNES} plan={null} onClose={vi.fn()} onChanged={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Generar la semana' }))
    expect(await screen.findByText(/Necesitas platos/)).toBeInTheDocument()
  })

  it('con la semana ya generada, la enseña', async () => {
    getReview.mockResolvedValue({ due: false })
    render(<PlanificarSemana weekStart={LUNES} plan={PLAN} onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(await screen.findByRole('dialog', { name: 'Semana del 12 oct' })).toBeInTheDocument()
    expect(screen.getByText('La semana que viene')).toBeInTheDocument()
    expect(screen.getByText('Pollo con arroz')).toBeInTheDocument()
  })

  it('«Cerrar» cierra en cualquier paso', async () => {
    const onClose = vi.fn()
    render(<PlanificarSemana weekStart={LUNES} plan={null} onClose={onClose} onChanged={vi.fn()} />)
    await screen.findByText('¿Apuntaste todo lo que comiste?')
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  // Los platos se miran justo antes de generar: es ahí donde importa qué hay.
  it('enseña cuántos platos tienes y abre «Tus platos»', async () => {
    getReview.mockResolvedValue({ due: false })
    listDishes.mockResolvedValue([])
    render(
      <PlanificarSemana weekStart={LUNES} plan={null} onClose={vi.fn()} onChanged={vi.fn()} platos={[{ id: 1 }, { id: 2 }]} />,
    )
    await userEvent.click(await screen.findByRole('button', { name: /Tus platos/ }))
    expect(screen.getByRole('dialog', { name: 'Tus platos' })).toBeInTheDocument()
  })

  it('la fila dice cuántos son', async () => {
    getReview.mockResolvedValue({ due: false })
    render(
      <PlanificarSemana weekStart={LUNES} plan={null} onClose={vi.fn()} onChanged={vi.fn()} platos={[{ id: 1 }, { id: 2 }]} />,
    )
    const fila = await screen.findByRole('button', { name: /Tus platos/ })
    expect(fila).toHaveTextContent('2')
  })
})
