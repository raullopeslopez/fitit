import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Perfil from './Perfil.jsx'
import * as api from './api.js'
import { publishStepsGoal } from './widgetSummary.js'

vi.mock('./api.js')
vi.mock('./widgetSummary.js', () => ({ publishStepsGoal: vi.fn() }))

const PERFIL = {
  goal: 'cut',
  goal_rate: 0.5,
  height_cm: 190,
  birth_year: 1996,
  sex: 'male',
  steps_goal: 10000,
  objetivo_kcal: 2230,
}

// Perfil reúne lo que se fija una vez y se corrige rara vez: el peso, de dónde
// salen las calorías, tus datos, las reglas y las preferencias de Entreno.
// Comida se queda sólo con el registro. Cada ajuste es una fila que abre su hoja.
function renderPerfil(props = {}) {
  return render(<Perfil onLogout={() => {}} {...props} />)
}

// Una fila, por su etiqueta: su nombre accesible es etiqueta + pista + valor.
const fila = (label) => screen.findByRole('button', { name: new RegExp(`^${label}`) })

describe('Perfil', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    api.weightTrend.mockResolvedValue({ kg: null, weigh_ins: 0, up_to: null })
    api.listBodyWeights.mockResolvedValue([])
    api.getTargetProfile.mockResolvedValue(PERFIL)
    api.saveTargetProfile.mockResolvedValue(PERFIL)
    api.getTargetProposal.mockResolvedValue({ kcal: 2569, source: 'formula', days: 0, missing: [] })
    api.listRules.mockResolvedValue([])
  })

  it('reúne el peso, tu objetivo, tus datos, las reglas y Entreno', async () => {
    renderPerfil()

    for (const name of ['Tu objetivo', 'Tus datos', 'Reglas', 'Entreno']) {
      expect(await screen.findByRole('heading', { name })).toBeInTheDocument()
    }
    expect(screen.getByText('Peso')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pesarme/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^salir$/i })).toBeInTheDocument()
  })

  // Ya no hay formulario: cada dato se edita en su hoja y se guarda ahí.
  it('no queda ningún «Guardar mis datos»', async () => {
    renderPerfil()
    await fila('Altura')

    expect(screen.queryByRole('button', { name: /guardar mis datos/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
  })

  // Los macros no se deciden aquí: aceptar la propuesta fija las kcal y sus
  // gramos (derived_target.feature). No hay tarjeta que teclear.
  it('no hay tarjeta de macros que rellenar', async () => {
    renderPerfil()
    await fila('Altura')

    expect(screen.queryByRole('heading', { name: 'Macros' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Proteína (g)')).not.toBeInTheDocument()
  })

  describe('Tu objetivo', () => {
    it('Objetivo diario enseña lo aceptado, y la propuesta lo suyo con su procedencia', async () => {
      renderPerfil()

      expect(await fila('Objetivo diario')).toHaveTextContent('2230 kcal')
      const propuesta = await fila('Propuesta')
      expect(propuesta).toHaveTextContent('2569 kcal')
      expect(propuesta).toHaveTextContent('Estimado con una fórmula')
      expect(await fila('Ritmo')).toHaveTextContent('Bajar · 0,5 kg/sem')
    })

    // La regla del `NULL`: sin objetivo aceptado es una raya y la pista lo dice.
    it('sin objetivo aceptado, Objetivo diario es «—» y dice «Sin aceptar»', async () => {
      api.getTargetProfile.mockResolvedValue({ ...PERFIL, objetivo_kcal: null })
      renderPerfil()

      const diario = await fila('Objetivo diario')
      expect(diario).toHaveTextContent('Sin aceptar')
      expect(diario).toHaveTextContent('—')
    })

    it('si a la propuesta le falta algo, dice qué en vez de una cifra', async () => {
      api.getTargetProposal.mockResolvedValue({
        kcal: null,
        source: null,
        days: 0,
        missing: ['peso', 'altura'],
      })
      renderPerfil()

      const propuesta = await fila('Propuesta')
      expect(propuesta).toHaveTextContent('Falta: peso, altura')
      expect(propuesta).toHaveTextContent('—')
    })

    it('sin objetivo (querer bajar, mantener…) el ritmo es «—»', async () => {
      api.getTargetProfile.mockResolvedValue({ ...PERFIL, goal: null, goal_rate: null })
      renderPerfil()

      expect(await fila('Ritmo')).toHaveTextContent('—')
    })

    it('las tres filas abren la misma hoja «Tu objetivo»', async () => {
      renderPerfil()
      for (const label of ['Objetivo diario', 'Propuesta', 'Ritmo']) {
        await userEvent.click(await fila(label))
        const hoja = await screen.findByRole('dialog', { name: 'Tu objetivo' })
        expect(within(hoja).getByText('2569')).toBeInTheDocument()
        await userEvent.keyboard('{Escape}')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      }
    })

    // Aceptar fija el objetivo; la fila de fuera lo enseña sin salir de Perfil.
    it('«Aceptar» fija la propuesta, cierra la hoja y la fila ya la enseña', async () => {
      api.getTargetProfile.mockResolvedValue({ ...PERFIL, objetivo_kcal: null })
      api.acceptTarget.mockResolvedValue({ ...PERFIL, objetivo_kcal: 2569 })
      renderPerfil()
      await userEvent.click(await fila('Propuesta'))
      const hoja = await screen.findByRole('dialog', { name: 'Tu objetivo' })
      expect(api.acceptTarget).not.toHaveBeenCalled()

      api.getTargetProfile.mockResolvedValue({ ...PERFIL, objetivo_kcal: 2569 })
      await userEvent.click(within(hoja).getByRole('button', { name: 'Aceptar' }))

      await waitFor(() => expect(api.acceptTarget).toHaveBeenCalledWith(2569))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(async () =>
        expect(await fila('Objetivo diario')).toHaveTextContent('2569 kcal'),
      )
      expect(await fila('Objetivo diario')).not.toHaveTextContent('Sin aceptar')
    })

    it('«Guardar» deja la hoja abierta con la cifra nueva', async () => {
      renderPerfil()
      await userEvent.click(await fila('Ritmo'))
      const hoja = await screen.findByRole('dialog', { name: 'Tu objetivo' })

      api.getTargetProposal.mockResolvedValue({ kcal: 2480, source: 'formula', days: 0, missing: [] })
      await userEvent.click(within(hoja).getByRole('button', { name: 'Ganar' }))
      await userEvent.click(within(hoja).getByRole('button', { name: 'Guardar' }))

      await waitFor(() => expect(api.saveTargetProfile).toHaveBeenCalled())
      expect(api.saveTargetProfile.mock.calls[0][0]).toMatchObject({ goal: 'gain' })
      expect(await within(hoja).findByText('2480')).toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Tu objetivo' })).toBeInTheDocument()
    })
  })

  describe('Peso meta, revisión semanal y plan', () => {
    it('el ritmo dice en qué semana del plan vas', async () => {
      api.getTargetProposal.mockResolvedValue({
        kcal: 2230,
        source: 'measured',
        days: 21,
        missing: [],
        plan: { week: 3, weeks: 10, remaining_kg: 3.5, eta: '2026-12-11', reached: false, goal_weight_kg: 97.5 },
      })
      renderPerfil()
      expect(await fila('Ritmo')).toHaveTextContent('Semana 3 de 10')
    })

    it('Peso meta enseña el valor, o «—» si no hay', async () => {
      api.getTargetProfile.mockResolvedValue({ ...PERFIL, goal_weight_kg: 97.5 })
      const { unmount } = renderPerfil()
      expect(await fila('Peso meta')).toHaveTextContent('97,5 kg')
      unmount()

      api.getTargetProfile.mockResolvedValue({ ...PERFIL, goal_weight_kg: null })
      renderPerfil()
      expect(await fila('Peso meta')).toHaveTextContent('—')
    })

    it('Peso meta guarda sólo ese campo y vuelve a pedir perfil y propuesta', async () => {
      renderPerfil()
      await userEvent.click(await fila('Peso meta'))
      const hoja = await screen.findByRole('dialog', { name: 'Peso meta' })
      await userEvent.type(within(hoja).getByLabelText('Peso meta (kg)'), '97,5')
      const propuestas = api.getTargetProposal.mock.calls.length
      await userEvent.click(within(hoja).getByRole('button', { name: 'Guardar' }))

      await waitFor(() => expect(api.saveTargetProfile).toHaveBeenCalledWith({ goal_weight_kg: 97.5 }))
      await waitFor(() =>
        expect(api.getTargetProposal.mock.calls.length).toBeGreaterThan(propuestas),
      )
    })

    it('fuera de 30–300 kg no se manda: lo dice', async () => {
      renderPerfil()
      await userEvent.click(await fila('Peso meta'))
      await userEvent.type(await screen.findByLabelText('Peso meta (kg)'), '20')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(await screen.findByText('Entre 30 y 300 kg.')).toBeInTheDocument()
      expect(api.saveTargetProfile).not.toHaveBeenCalled()
    })

    it('Revisión semanal enseña el día en palabras', async () => {
      api.getTargetProfile.mockResolvedValue({ ...PERFIL, review_weekday: 6 })
      renderPerfil()
      expect(await fila('Revisión semanal')).toHaveTextContent('Domingo')
    })

    it('Revisión semanal son siete chips, el actual elegido, y tocar uno guarda y cierra', async () => {
      api.getTargetProfile.mockResolvedValue({ ...PERFIL, review_weekday: 6 })
      renderPerfil()
      await userEvent.click(await fila('Revisión semanal'))
      const hoja = await screen.findByRole('dialog', { name: 'Revisión semanal' })
      const grupo = within(hoja).getByRole('group', { name: 'Día de la revisión' })
      expect(within(grupo).getAllByRole('button').map((b) => b.textContent)).toEqual([
        'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom',
      ])
      expect(within(grupo).getByRole('button', { name: 'Dom' })).toHaveAttribute('aria-pressed', 'true')
      expect(within(grupo).getByRole('button', { name: 'Lun' })).toHaveAttribute('aria-pressed', 'false')

      await userEvent.click(within(grupo).getByRole('button', { name: 'Lun' }))

      await waitFor(() => expect(api.saveTargetProfile).toHaveBeenCalledWith({ review_weekday: 0 }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })
  })

  describe('Tus datos', () => {
    it('cada dato es una fila con su valor', async () => {
      renderPerfil()

      expect(await fila('Altura')).toHaveTextContent('190 cm')
      expect(await fila('Año de nacimiento')).toHaveTextContent('1996')
      expect(await fila('Sexo')).toHaveTextContent('Hombre')
      expect(await fila('Meta de pasos')).toHaveTextContent('10.000')
    })

    it('lo que falta es «—», no un hueco', async () => {
      api.getTargetProfile.mockResolvedValue({})
      renderPerfil()

      for (const label of ['Altura', 'Año de nacimiento', 'Sexo', 'Meta de pasos']) {
        expect(await fila(label)).toHaveTextContent('—')
      }
    })

    // Una hoja, un campo, y el PATCH lleva sólo ese campo: guardar la altura no
    // pisa lo que otro dispositivo cambió en el sexo.
    it('tocar Altura abre su hoja y Guardar manda sólo la altura', async () => {
      renderPerfil()

      await userEvent.click(await fila('Altura'))
      const hoja = await screen.findByRole('dialog', { name: 'Altura' })
      const campo = within(hoja).getByLabelText('Altura (cm)')
      expect(campo).toHaveValue('190')
      await userEvent.clear(campo)
      await userEvent.type(campo, '185')
      api.getTargetProfile.mockResolvedValue({ ...PERFIL, height_cm: 185 })
      await userEvent.click(within(hoja).getByRole('button', { name: 'Guardar' }))

      await waitFor(() => expect(api.saveTargetProfile).toHaveBeenCalledWith({ height_cm: 185 }))
      // Se cierra, y se vuelve a preguntar perfil y propuesta.
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(() => expect(api.getTargetProposal).toHaveBeenCalledTimes(2))
      expect(await screen.findByRole('button', { name: /^Altura.*185 cm/ })).toBeInTheDocument()
    })

    it('«Cancelar» cierra la hoja sin guardar', async () => {
      renderPerfil()
      await userEvent.click(await fila('Altura'))
      await userEvent.type(await screen.findByLabelText('Altura (cm)'), '1')

      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(api.saveTargetProfile).not.toHaveBeenCalled()
    })

    it('el sexo se elige con dos chips y se guarda solo', async () => {
      renderPerfil()
      await userEvent.click(await fila('Sexo'))
      const hoja = await screen.findByRole('dialog', { name: 'Sexo' })
      expect(within(hoja).getByRole('button', { name: 'Hombre' })).toHaveAttribute('aria-pressed', 'true')

      await userEvent.click(within(hoja).getByRole('button', { name: 'Mujer' }))
      await userEvent.click(within(hoja).getByRole('button', { name: 'Guardar' }))

      await waitFor(() => expect(api.saveTargetProfile).toHaveBeenCalledWith({ sex: 'female' }))
    })

    describe('Meta de pasos', () => {
      it('guarda con o sin punto de miles y se lo cuenta al widget', async () => {
        renderPerfil()
        await userEvent.click(await fila('Meta de pasos'))
        const campo = await screen.findByLabelText('Pasos al día')
        await userEvent.clear(campo)
        await userEvent.type(campo, '12.500')
        await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

        await waitFor(() => expect(api.saveTargetProfile).toHaveBeenCalledWith({ steps_goal: 12500 }))
        await waitFor(() => expect(publishStepsGoal).toHaveBeenCalledWith(12500))
      })

      it('vacío es sin objetivo: se guarda null, no cero', async () => {
        renderPerfil()
        await userEvent.click(await fila('Meta de pasos'))
        await userEvent.clear(await screen.findByLabelText('Pasos al día'))
        await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

        await waitFor(() => expect(api.saveTargetProfile).toHaveBeenCalledWith({ steps_goal: null }))
        await waitFor(() => expect(publishStepsGoal).toHaveBeenCalledWith(null))
      })

      it('fuera de 1.000–100.000 no se manda: lo dice en vez de fallar callado', async () => {
        renderPerfil()
        await userEvent.click(await fila('Meta de pasos'))
        const campo = await screen.findByLabelText('Pasos al día')
        await userEvent.clear(campo)
        await userEvent.type(campo, '50')
        await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

        expect(await screen.findByText('Entre 1.000 y 100.000 pasos.')).toBeInTheDocument()
        expect(api.saveTargetProfile).not.toHaveBeenCalled()
        expect(publishStepsGoal).not.toHaveBeenCalled()
      })
    })
  })

  describe('Pesarme', () => {
    it('abre «Apuntar pesada» y guardar llama a logBodyWeight', async () => {
      api.logBodyWeight.mockResolvedValue({ id: 1, measured_on: '2026-10-02', kg: 80 })
      renderPerfil()

      await userEvent.click(await screen.findByRole('button', { name: /Pesarme/ }))
      const hoja = await screen.findByRole('dialog', { name: 'Apuntar pesada' })
      await userEvent.type(within(hoja).getByLabelText('Peso (kg)'), '80')
      await userEvent.click(within(hoja).getByRole('button', { name: 'Guardar' }))

      await waitFor(() => expect(api.logBodyWeight).toHaveBeenCalled())
      expect(api.logBodyWeight.mock.calls[0][0].kg).toBe(80)
    })

    // La propuesta sale de tu peso: una pesada nueva la cambia, y verla sin
    // salir de Perfil es lo que dice si toca aceptar.
    it('al guardar un peso, la propuesta se vuelve a pedir', async () => {
      api.logBodyWeight.mockResolvedValue({ id: 1, measured_on: '2026-09-27', kg: 80 })
      renderPerfil()
      expect(await fila('Propuesta')).toHaveTextContent('2569 kcal')
      api.getTargetProposal.mockResolvedValue({ kcal: 2599, source: 'formula', days: 0, missing: [] })

      await userEvent.click(screen.getByRole('button', { name: /Pesarme/ }))
      await userEvent.type(await screen.findByLabelText('Peso (kg)'), '80')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

      await waitFor(async () => expect(await fila('Propuesta')).toHaveTextContent('2599 kcal'))
    })
  })

  it('«Tus reglas» abre las reglas, y se cierran', async () => {
    renderPerfil()

    const fila_ = await fila('Tus reglas')
    expect(fila_).toHaveTextContent('Ver')
    await userEvent.click(fila_)

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
