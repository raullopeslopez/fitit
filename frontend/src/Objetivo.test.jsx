import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Objetivo from './Objetivo.jsx'
import { acceptTarget, getTargetProfile, getTargetProposal, saveTargetProfile } from './api.js'

import { publishStepsGoal } from './widgetSummary.js'

vi.mock('./api.js')
vi.mock('./widgetSummary.js', () => ({ publishStepsGoal: vi.fn() }))

const PERFIL = {
  goal: 'maintain',
  goal_rate: 0,
  height_cm: 178,
  birth_year: 1991,
  sex: 'male',
  steps_goal: 10000,
  objetivo_kcal: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  getTargetProfile.mockResolvedValue(PERFIL)
  saveTargetProfile.mockResolvedValue(PERFIL)
  acceptTarget.mockResolvedValue({ ...PERFIL, objetivo_kcal: 2600 })
})

describe('Objetivo', () => {
  it('shows the proposal and where the number came from', async () => {
    getTargetProposal.mockResolvedValue({ kcal: 2600, source: 'measured', days: 21, missing: [] })
    render(<Objetivo onAccepted={() => {}} />)
    expect(await screen.findByText('2600')).toBeInTheDocument()
    expect(screen.getByText(/tus datos/i)).toBeInTheDocument()
  })

  // Presentar una estimación con la misma tinta que una medición es la mentira
  // que esta app evita en todo lo demás.
  it('says when it is only a formula, not a measurement', async () => {
    getTargetProposal.mockResolvedValue({ kcal: 2400, source: 'formula', days: 0, missing: [] })
    render(<Objetivo onAccepted={() => {}} />)
    await screen.findByText('2400')
    expect(screen.getByText(/estimad/i)).toBeInTheDocument()
  })

  it('names what it is missing instead of proposing a number anyway', async () => {
    getTargetProposal.mockResolvedValue({ kcal: null, source: null, days: 0, missing: ['altura', 'sexo'] })
    render(<Objetivo onAccepted={() => {}} />)
    expect(await screen.findByText('—')).toBeInTheDocument()
    expect(screen.getByText(/altura/)).toBeInTheDocument()
  })

  it('warns when the number hit the floor instead of pretending it did not', async () => {
    getTargetProposal.mockResolvedValue({ kcal: 1200, source: 'formula', days: 0, missing: [], floored: true })
    render(<Objetivo onAccepted={() => {}} />)
    await screen.findByText('1200')
    expect(screen.getByText(/no baja de/i)).toBeInTheDocument()
  })

  it('only sets the target when I accept it', async () => {
    getTargetProposal.mockResolvedValue({ kcal: 2600, source: 'measured', days: 21, missing: [] })
    const onAccepted = vi.fn()
    render(<Objetivo onAccepted={onAccepted} />)
    await screen.findByText('2600')
    expect(acceptTarget).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Aceptar' }))
    await waitFor(() => expect(acceptTarget).toHaveBeenCalledWith(2600))
    await waitFor(() => expect(onAccepted).toHaveBeenCalled())
  })

  it('saves the body it needs and asks again', async () => {
    getTargetProposal.mockResolvedValue({ kcal: null, source: null, days: 0, missing: ['altura'] })
    render(<Objetivo onAccepted={() => {}} />)
    await screen.findByText('—')

    await userEvent.clear(screen.getByLabelText('Altura (cm)'))
    await userEvent.type(screen.getByLabelText('Altura (cm)'), '178')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar mis datos' }))

    await waitFor(() => expect(saveTargetProfile).toHaveBeenCalled())
    expect(saveTargetProfile.mock.calls[0][0]).toMatchObject({ height_cm: 178 })
    // Y vuelve a preguntar: el número depende de lo que se acaba de guardar.
    await waitFor(() => expect(getTargetProposal).toHaveBeenCalledTimes(2))
  })

  // Las kcal dicen cuánto; los macros, cómo. Se ven antes de aceptar, porque
  // aceptar fija los dos.
  it('con la propuesta van sus macros', async () => {
    getTargetProposal.mockResolvedValue({
      kcal: 2600,
      source: 'formula',
      days: 0,
      missing: [],
      protein: 156,
      fat: 72,
      carbs: 332,
    })
    render(<Objetivo onAccepted={() => {}} />)

    expect(
      await screen.findByText('Proteína 156 g · Hidratos 332 g · Grasa 72 g'),
    ).toBeInTheDocument()
  })

  describe('Pasos al día', () => {
    beforeEach(() => {
      getTargetProposal.mockResolvedValue({ kcal: 2600, source: 'measured', days: 21, missing: [] })
    })

    it('enseña el objetivo que hay y guarda el nuevo, con o sin punto de miles', async () => {
      render(<Objetivo onAccepted={() => {}} />)
      const field = await screen.findByLabelText('Pasos al día')
      expect(field).toHaveValue('10000')

      await userEvent.clear(field)
      await userEvent.type(field, '12.500')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar mis datos' }))

      await waitFor(() => expect(saveTargetProfile).toHaveBeenCalled())
      expect(saveTargetProfile.mock.calls[0][0]).toMatchObject({ steps_goal: 12500 })
      // Y el widget de Android lo sabe ya, sin esperar a la próxima lectura de pasos.
      await waitFor(() => expect(publishStepsGoal).toHaveBeenCalledWith(12500))
    })

    it('vacío es sin objetivo: se guarda null, no cero', async () => {
      render(<Objetivo onAccepted={() => {}} />)
      await userEvent.clear(await screen.findByLabelText('Pasos al día'))
      await userEvent.click(screen.getByRole('button', { name: 'Guardar mis datos' }))

      await waitFor(() => expect(saveTargetProfile).toHaveBeenCalled())
      expect(saveTargetProfile.mock.calls[0][0]).toMatchObject({ steps_goal: null })
      await waitFor(() => expect(publishStepsGoal).toHaveBeenCalledWith(null))
    })

    it('fuera de 1.000–100.000 no se manda: lo dice en vez de fallar callado', async () => {
      render(<Objetivo onAccepted={() => {}} />)
      const field = await screen.findByLabelText('Pasos al día')
      await userEvent.clear(field)
      await userEvent.type(field, '50')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar mis datos' }))

      expect(await screen.findByText('Entre 1.000 y 100.000 pasos.')).toBeInTheDocument()
      expect(saveTargetProfile).not.toHaveBeenCalled()
    })
  })
})
