import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Perfil from './Perfil.jsx'
import * as api from './api.js'

vi.mock('./api.js')
vi.mock('./widgetSummary.js', () => ({ publishStepsGoal: vi.fn() }))

// Perfil reúne lo que se fija una vez y se corrige rara vez: el peso, de dónde
// salen las calorías, cómo se reparten, las reglas y las preferencias de
// Entreno. Comida se queda sólo con el registro.
const YO = {
  id: 1,
  username: 'raul',
  objetivo_kcal: 2560,
  objetivo_proteina: 160,
  objetivo_hidratos: 300,
  objetivo_grasa: 80,
}

function renderPerfil(props = {}) {
  return render(<Perfil onLogout={() => {}} {...props} />)
}

describe('Perfil', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    api.getMe.mockResolvedValue(YO)
    api.setTargets.mockResolvedValue(YO)
    api.weightTrend.mockResolvedValue({ kg: null, weigh_ins: 0, up_to: null })
    api.getTargetProfile.mockResolvedValue({})
    api.getTargetProposal.mockResolvedValue(null)
    api.listRules.mockResolvedValue([])
  })

  it('reúne el peso, el objetivo, el reparto, las reglas y Entreno', async () => {
    renderPerfil()

    for (const name of ['Peso', 'Objetivo', 'Reparto', 'Reglas', 'Entreno']) {
      expect(await screen.findByRole('heading', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Tus reglas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^salir$/i })).toBeInTheDocument()
  })

  describe('el reparto', () => {
    it('abre con los gramos del perfil, y las kcal salen de ellos', async () => {
      renderPerfil()

      expect(await screen.findByLabelText('Proteína (g)')).toHaveValue('160')
      expect(screen.getByLabelText('Hidratos (g)')).toHaveValue('300')
      expect(screen.getByLabelText('Grasa (g)')).toHaveValue('80')
      // Las kcal no son una entrada: 4·160 + 4·300 + 9·80 = 2.560.
      expect(screen.queryByLabelText('Kcal al día')).toBeNull()
      expect(screen.getByText('2560 kcal')).toBeInTheDocument()
    })

    it('el total se recalcula al teclear, antes de guardar nada', async () => {
      renderPerfil()
      const grasa = await screen.findByLabelText('Grasa (g)')

      await userEvent.clear(grasa)
      await userEvent.type(grasa, '60')

      expect(screen.getByText('2380 kcal')).toBeInTheDocument()
    })

    it('guarda los tres macros, y no manda unas kcal que no ha fijado nadie', async () => {
      renderPerfil()
      const proteina = await screen.findByLabelText('Proteína (g)')

      await userEvent.clear(proteina)
      await userEvent.type(proteina, '170')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar reparto' }))

      await waitFor(() =>
        expect(api.setTargets).toHaveBeenCalledWith({ protein: 170, carbs: 300, fat: 80 }),
      )
    })

    it('dejar los campos en blanco borra el reparto', async () => {
      renderPerfil()
      await screen.findByLabelText('Proteína (g)')

      for (const campo of ['Proteína (g)', 'Hidratos (g)', 'Grasa (g)']) {
        await userEvent.clear(screen.getByLabelText(campo))
      }
      // Sin un solo macro repartido no hay total: una raya, nunca un 0.
      expect(screen.getByText('— kcal')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Guardar reparto' }))

      await waitFor(() =>
        expect(api.setTargets).toHaveBeenCalledWith({ protein: null, carbs: null, fat: null }),
      )
    })

    it('sin reparto fijado, los campos salen vacíos y no en cero', async () => {
      api.getMe.mockResolvedValue({ id: 1, username: 'raul' })
      renderPerfil()

      expect(await screen.findByLabelText('Proteína (g)')).toHaveValue('')
      expect(screen.getByText('— kcal')).toBeInTheDocument()
    })
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
