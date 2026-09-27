import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Perfil from './Perfil.jsx'
import * as api from './api.js'

vi.mock('./api.js')
vi.mock('./widgetSummary.js', () => ({ publishStepsGoal: vi.fn() }))

// Perfil reúne lo que se fija una vez y se corrige rara vez: el peso, de dónde
// salen las calorías, cómo se reparten, las reglas y las preferencias de
// Entreno. Comida se queda sólo con el registro.
function renderPerfil(props = {}) {
  return render(<Perfil onLogout={() => {}} {...props} />)
}

describe('Perfil', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    api.weightTrend.mockResolvedValue({ kg: null, weigh_ins: 0, up_to: null })
    api.getTargetProfile.mockResolvedValue({})
    api.getTargetProposal.mockResolvedValue(null)
    api.listRules.mockResolvedValue([])
  })

  it('reúne el peso, el objetivo, el reparto, las reglas y Entreno', async () => {
    renderPerfil()

    for (const name of ['Peso', 'Objetivo', 'Reglas', 'Entreno']) {
      expect(await screen.findByRole('heading', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Tus reglas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^salir$/i })).toBeInTheDocument()
  })

  // Los macros no se deciden aquí: aceptar la propuesta de Objetivo fija las
  // kcal y sus gramos (derived_target.feature). No hay tarjeta que teclear.
  it('no hay tarjeta de macros que rellenar', async () => {
    renderPerfil()
    await screen.findByRole('heading', { name: 'Objetivo' })

    expect(screen.queryByRole('heading', { name: 'Macros' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Proteína (g)')).not.toBeInTheDocument()
  })

  // La propuesta sale de tu peso: una pesada nueva la cambia, y verla sin salir
  // de Perfil es lo que dice si toca pulsar «Aceptar».
  it('al guardar un peso, la propuesta se vuelve a pedir', async () => {
    api.logBodyWeight.mockResolvedValue({ id: 1, measured_on: '2026-09-27', kg: 80 })
    api.getTargetProposal.mockResolvedValue({ kcal: 2450, source: 'formula', days: 0, missing: [] })
    renderPerfil()
    await screen.findByText('2450')
    api.getTargetProposal.mockResolvedValue({ kcal: 2480, source: 'formula', days: 0, missing: [] })

    await userEvent.type(screen.getByLabelText('Peso'), '80')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('2480')).toBeInTheDocument()
  })

  it('«Tus reglas» abre las reglas, y se cierran', async () => {
    renderPerfil()

    await userEvent.click(await screen.findByRole('button', { name: 'Tus reglas' }))

    expect(await screen.findByRole('dialog', { name: 'Tus reglas' })).toBeInTheDocument()
  })

  describe('Entreno', () => {
    it('el descanso entre series se elige aquí y se recuerda', async () => {
      renderPerfil()
      const descanso = await screen.findByRole('group', { name: /descanso entre series/i })

      // 90 s si nunca se eligió nada.
      expect(within(descanso).getByRole('button', { name: '90s' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await userEvent.click(within(descanso).getByRole('button', { name: '120s' }))

      expect(within(descanso).getByRole('button', { name: '120s' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      expect(localStorage.getItem('fitit_rest_seconds')).toBe('120')
    })

    it('la pantalla encendida se elige aquí y se recuerda', async () => {
      renderPerfil()
      const pantalla = await screen.findByRole('group', { name: /pantalla encendida/i })

      await userEvent.click(within(pantalla).getByRole('button', { name: 'No' }))

      expect(localStorage.getItem('fitit_screen_awake')).toBe('off')
    })
  })

  it('«Salir» cierra la sesión', async () => {
    const onLogout = vi.fn()
    renderPerfil({ onLogout })

    await userEvent.click(await screen.findByRole('button', { name: /^salir$/i }))

    expect(onLogout).toHaveBeenCalled()
  })
})
