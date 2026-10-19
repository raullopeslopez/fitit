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
      await screen.findByRole('button', { name: 'Bajando 0,5 kg/sem · 2230 kcal' }),
    ).toBeInTheDocument()
  })

  it('names maintenance without a rate', async () => {
    getTargetProfile.mockResolvedValue({ goal: 'maintain', goal_rate: 0 })
    render(<ObjetivoLinea targetKcal={2780} onAccepted={() => {}} />)
    expect(
      await screen.findByRole('button', { name: 'Manteniendo · 2780 kcal' }),
    ).toBeInTheDocument()
  })

  it('still shows the figure when no goal was ever chosen', async () => {
    getTargetProfile.mockResolvedValue({})
    render(<ObjetivoLinea targetKcal={2230} onAccepted={() => {}} />)
    expect(await screen.findByRole('button', { name: 'Objetivo · 2230 kcal' })).toBeInTheDocument()
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
    expect(hoja).toHaveTextContent('2569')
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
    await user.click(screen.getByRole('button', { name: /^Aceptar/ }))

    expect(acceptTarget).toHaveBeenCalledWith(2569)
    await waitFor(() => expect(onAccepted).toHaveBeenCalledOnce())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // Con un peso meta, la línea dice en qué semana vas del plan, no sólo el ritmo.
  it('con plan dice la semana en que vas', async () => {
    getTargetProfile.mockResolvedValue({ goal: 'cut', goal_rate: 0.5, objetivo_kcal: 2230 })
    getTargetProposal.mockResolvedValue({
      ...PROPUESTA,
      plan: { week: 3, weeks: 10, remaining_kg: 3.5, eta: '2026-12-11', reached: false, goal_weight_kg: 97.5 },
    })
    render(<ObjetivoLinea targetKcal={2230} onAccepted={() => {}} />)
    expect(
      await screen.findByRole('button', {
        name: 'Bajando 0,5 kg/sem · semana 3 de 10 · 2230 kcal',
      }),
    ).toBeInTheDocument()
  })

  it('con la meta alcanzada lo dice en vez del ritmo', async () => {
    getTargetProfile.mockResolvedValue({ goal: 'cut', goal_rate: 0.5, objetivo_kcal: 2230 })
    getTargetProposal.mockResolvedValue({
      ...PROPUESTA,
      plan: { week: 10, weeks: 10, remaining_kg: 0, eta: null, reached: true, goal_weight_kg: 97.5 },
    })
    render(<ObjetivoLinea targetKcal={2230} onAccepted={() => {}} />)
    expect(
      await screen.findByRole('button', { name: 'Peso meta alcanzado · 2230 kcal' }),
    ).toBeInTheDocument()
  })

  // §31: aceptar a media jornada no reescribe lo congelado de hoy. Sin este aviso
  // «pulsé Aceptar y no cambió nada» es un fallo; con él, es lo que se ve.
  it('si lo aceptado difiere del de hoy, dice cuál rige desde mañana', async () => {
    getTargetProfile.mockResolvedValue({ goal: 'cut', goal_rate: 0.5, objetivo_kcal: 2569 })
    render(<ObjetivoLinea targetKcal={2230} onAccepted={() => {}} />)
    expect(
      await screen.findByRole('button', { name: 'Bajando 0,5 kg/sem · 2230 kcal · mañana 2569' }),
    ).toBeInTheDocument()
  })

  it('si coinciden, no hay aviso', async () => {
    getTargetProfile.mockResolvedValue({ goal: 'cut', goal_rate: 0.5, objetivo_kcal: 2230 })
    render(<ObjetivoLinea targetKcal={2230} onAccepted={() => {}} />)
    expect(await screen.findByRole('button', { name: /^Bajando/ })).not.toHaveTextContent('mañana')
  })

  // Un perfil que no llega no deja a Comida sin la línea: sin ritmo, la cifra.
  it('survives a profile that fails to load', async () => {
    getTargetProfile.mockRejectedValue(new Error('offline'))
    render(<ObjetivoLinea targetKcal={2230} onAccepted={() => {}} />)
    expect(await screen.findByRole('button', { name: 'Objetivo · 2230 kcal' })).toBeInTheDocument()
  })
})
