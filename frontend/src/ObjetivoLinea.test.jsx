import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { acceptTarget, getTargetProfile, getTargetProposal } from './api.js'
import ObjetivoLinea from './ObjetivoLinea.jsx'

vi.mock('./api.js')

const PROPUESTA = {
  kcal: 2569,
  source: 'formula',
  days: 0,
  missing: [],
  protein: 202,
  carbs: 280,
  fat: 71,
  floored: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  getTargetProposal.mockResolvedValue(PROPUESTA)
  acceptTarget.mockResolvedValue({})
})

describe('La línea del objetivo en Comida', () => {
  // Lo que tienes que comer hoy y por qué, en una línea que se lee sin abrir
  // nada: el ritmo dice qué estás haciendo y la cifra cuánto toca.
  it('says the plan and the day target', async () => {
    getTargetProfile.mockResolvedValue({ goal: 'cut', goal_rate: 0.5 })
    render(<ObjetivoLinea targetKcal={2230} onAccepted={() => {}} />)
    expect(
      await screen.findByRole('button', { name: 'Bajando 0,5 kg/sem · 2.230 kcal' }),
    ).toBeInTheDocument()
  })

  it('names maintenance without a rate', async () => {
    getTargetProfile.mockResolvedValue({ goal: 'maintain', goal_rate: 0 })
    render(<ObjetivoLinea targetKcal={2780} onAccepted={() => {}} />)
    expect(
      await screen.findByRole('button', { name: 'Manteniendo · 2.780 kcal' }),
    ).toBeInTheDocument()
  })

  it('still shows the figure when no goal was ever chosen', async () => {
    getTargetProfile.mockResolvedValue({})
    render(<ObjetivoLinea targetKcal={2230} onAccepted={() => {}} />)
    expect(await screen.findByRole('button', { name: 'Objetivo · 2.230 kcal' })).toBeInTheDocument()
  })

  // El caso que empezó todo: una propuesta calculada en Perfil, sin aceptar,
  // y Comida sin decir que faltaba nada.
  it('says there is no target yet and opens the proposal', async () => {
    getTargetProfile.mockResolvedValue({ goal: 'cut', goal_rate: 0.5 })
    const user = userEvent.setup()
    render(<ObjetivoLinea targetKcal={null} onAccepted={() => {}} />)

    await user.click(
      await screen.findByRole('button', { name: 'Sin objetivo todavía · Calcularlo' }),
    )

    const hoja = await screen.findByRole('dialog', { name: 'Tu objetivo' })
    expect(hoja).toHaveTextContent('2.569')
  })

  it('accepting fixes the target, closes the sheet and tells Comida', async () => {
    getTargetProfile.mockResolvedValue({ goal: 'cut', goal_rate: 0.5 })
    const onAccepted = vi.fn()
    const user = userEvent.setup()
    render(<ObjetivoLinea targetKcal={null} onAccepted={onAccepted} />)

    await user.click(
      await screen.findByRole('button', { name: 'Sin objetivo todavía · Calcularlo' }),
    )
    await screen.findByRole('dialog', { name: 'Tu objetivo' })
    await user.click(screen.getByRole('button', { name: 'Aceptar' }))

    expect(acceptTarget).toHaveBeenCalledWith(2569)
    await waitFor(() => expect(onAccepted).toHaveBeenCalledOnce())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // Un perfil que no llega no deja a Comida sin la línea: sin ritmo, la cifra.
  it('survives a profile that fails to load', async () => {
    getTargetProfile.mockRejectedValue(new Error('offline'))
    render(<ObjetivoLinea targetKcal={2230} onAccepted={() => {}} />)
    expect(await screen.findByRole('button', { name: 'Objetivo · 2.230 kcal' })).toBeInTheDocument()
  })
})
