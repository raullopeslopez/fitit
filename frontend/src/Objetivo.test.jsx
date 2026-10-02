import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import ObjetivoSheet, { conMiles, ritmo } from './Objetivo.jsx'
import { acceptTarget, saveTargetProfile } from './api.js'

vi.mock('./api.js')

const PERFIL = { goal: 'maintain', goal_rate: 0, objetivo_kcal: null }
const PROPUESTA = { kcal: 2600, source: 'measured', days: 21, missing: [] }

function abrir({ perfil = PERFIL, propuesta = PROPUESTA, ...handlers } = {}) {
  const props = {
    onClose: vi.fn(),
    onSaved: vi.fn().mockResolvedValue(undefined),
    onAccepted: vi.fn().mockResolvedValue(undefined),
    ...handlers,
  }
  render(<ObjetivoSheet perfil={perfil} propuesta={propuesta} {...props} />)
  return { ...props, hoja: screen.getByRole('dialog', { name: 'Tu objetivo' }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  saveTargetProfile.mockResolvedValue(PERFIL)
  acceptTarget.mockResolvedValue({ ...PERFIL, objetivo_kcal: 2600 })
})

describe('conMiles', () => {
  // `toLocaleString('es-ES')` no agrupa los de cuatro cifras.
  it('pone el punto de miles también en cuatro cifras', () => {
    expect(conMiles(2569)).toBe('2.569')
    expect(conMiles(10000)).toBe('10.000')
    expect(conMiles(null)).toBe('—')
  })
})

describe('ritmo', () => {
  it('lo dice como se lee, y sin objetivo es nada', () => {
    expect(ritmo({ goal: 'cut', goal_rate: 0.5 })).toBe('Bajar · 0,5 kg/sem')
    expect(ritmo({ goal: 'gain', goal_rate: 0.25 })).toBe('Ganar · 0,25 kg/sem')
    expect(ritmo({ goal: 'maintain', goal_rate: 0 })).toBe('Mantener')
    expect(ritmo({ goal: null })).toBeNull()
  })
})

describe('Tu objetivo', () => {
  it('shows the proposal and where the number came from', () => {
    const { hoja } = abrir()
    expect(within(hoja).getByText('2.600')).toBeInTheDocument()
    expect(within(hoja).getByText('kcal')).toBeInTheDocument()
    expect(within(hoja).getByText('Medido con tus datos · 21 días')).toBeInTheDocument()
  })

  // Presentar una estimación con la misma tinta que una medición es la mentira
  // que esta app evita en todo lo demás.
  it('says when it is only a formula, not a measurement', () => {
    abrir({ propuesta: { kcal: 2400, source: 'formula', days: 0, missing: [] } })
    expect(screen.getByText('Estimado con una fórmula')).toBeInTheDocument()
  })

  // Con pasos, la actividad se cuenta en vez de adivinarse, y se dice con qué.
  it('says which steps and training the formula counted', () => {
    abrir({
      propuesta: {
        kcal: 2480,
        source: 'formula',
        days: 0,
        missing: [],
        steps_per_day: 8400,
        training_kcal_per_day: 120,
      },
    })
    expect(
      screen.getByText('Estimado con tus 8.400 pasos al día y 120 kcal de entreno'),
    ).toBeInTheDocument()
  })

  it('names what it is missing instead of proposing a number anyway', () => {
    const { hoja } = abrir({
      propuesta: { kcal: null, source: null, days: 0, missing: ['altura', 'sexo'] },
    })
    expect(within(hoja).getByText('—')).toBeInTheDocument()
    expect(within(hoja).getByText('Para calcularlo me falta: altura, sexo.')).toBeInTheDocument()
    expect(within(hoja).getByRole('button', { name: 'Aceptar' })).toBeDisabled()
  })

  it('warns when the number hit the floor instead of pretending it did not', () => {
    abrir({ propuesta: { kcal: 1200, source: 'formula', days: 0, missing: [], floored: true } })
    expect(screen.getByText(/no baja de/i)).toBeInTheDocument()
  })

  // Las kcal dicen cuánto; los macros, cómo. Se ven antes de aceptar, porque
  // aceptar fija los dos.
  it('con la propuesta van sus macros', () => {
    abrir({ propuesta: { ...PROPUESTA, protein: 156, fat: 72, carbs: 332 } })
    expect(screen.getByText('Proteína 156 g · Hidratos 332 g · Grasa 72 g')).toBeInTheDocument()
  })

  it('only sets the target when I accept it', async () => {
    const { onAccepted } = abrir()
    expect(acceptTarget).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Aceptar' }))

    await waitFor(() => expect(acceptTarget).toHaveBeenCalledWith(2600))
    await waitFor(() => expect(onAccepted).toHaveBeenCalled())
  })

  describe('Quiero', () => {
    it('son tres chips, y el del perfil viene elegido', () => {
      abrir({ perfil: { goal: 'cut', goal_rate: 0.5 } })
      const grupo = screen.getByRole('group', { name: 'Quiero' })
      expect(within(grupo).getByRole('button', { name: 'Bajar' })).toHaveAttribute('aria-pressed', 'true')
      expect(within(grupo).getByRole('button', { name: 'Mantener' })).toHaveAttribute('aria-pressed', 'false')
      expect(within(grupo).getByRole('button', { name: 'Ganar' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('«kg por semana» se esconde con Mantener', async () => {
      abrir({ perfil: { goal: 'cut', goal_rate: 0.5 } })
      expect(screen.getByLabelText('kg por semana')).toHaveValue('0,5')

      await userEvent.click(screen.getByRole('button', { name: 'Mantener' }))

      expect(screen.queryByLabelText('kg por semana')).not.toBeInTheDocument()
    })

    it('«Guardar» manda objetivo y ritmo, vuelve a preguntar y la hoja sigue abierta', async () => {
      const { onSaved, onClose } = abrir({ perfil: { goal: 'maintain', goal_rate: 0 } })

      await userEvent.click(screen.getByRole('button', { name: 'Bajar' }))
      await userEvent.type(screen.getByLabelText('kg por semana'), '0,5')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

      await waitFor(() =>
        expect(saveTargetProfile).toHaveBeenCalledWith({
          goal: 'cut',
          goal_rate: 0.5,
          goal_weight_kg: null,
        }),
      )
      await waitFor(() => expect(onSaved).toHaveBeenCalled())
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog', { name: 'Tu objetivo' })).toBeInTheDocument()
    })
  })

  // La cuenta a la vista: de dónde sale la cifra, no sólo la cifra. Con el gasto
  // y el ritmo delante, «2.230» deja de ser un número que se obedece a ciegas.
  describe('la cuenta', () => {
    const CUENTA = {
      kcal: 2230,
      source: 'measured',
      days: 21,
      missing: [],
      expenditure: 2780,
      plan: null,
    }

    it('gasto medido, el ritmo con su signo y lo que toca comer', () => {
      const { hoja } = abrir({
        perfil: { goal: 'cut', goal_rate: 0.5 },
        propuesta: CUENTA,
      })
      const cuenta = within(hoja).getByRole('list', { name: 'La cuenta' })
      const filas = within(cuenta).getAllByRole('listitem')
      expect(filas.map((f) => f.textContent)).toEqual([
        'Gasto medido2.780',
        'Bajar 0,5 kg/semana− 550',
        'Comer al día2.230',
      ])
    })

    it('una fórmula es «Gasto estimado», y ganar suma', () => {
      const { hoja } = abrir({
        perfil: { goal: 'gain', goal_rate: 0.25 },
        propuesta: { ...CUENTA, kcal: 3055, source: 'formula' },
      })
      const filas = within(within(hoja).getByRole('list', { name: 'La cuenta' })).getAllByRole(
        'listitem',
      )
      expect(filas.map((f) => f.textContent)).toEqual([
        'Gasto estimado2.780',
        'Ganar 0,25 kg/semana+ 275',
        'Comer al día3.055',
      ])
    })

    // Mantener no resta ni suma: la línea del ritmo no tiene nada que decir.
    it('mantener no tiene línea de ritmo', () => {
      const { hoja } = abrir({
        perfil: { goal: 'maintain', goal_rate: 0 },
        propuesta: { ...CUENTA, kcal: 2780 },
      })
      const filas = within(within(hoja).getByRole('list', { name: 'La cuenta' })).getAllByRole(
        'listitem',
      )
      expect(filas.map((f) => f.textContent)).toEqual(['Gasto medido2.780', 'Comer al día2.780'])
    })

    // Sin gasto no hay cuenta que enseñar, y no se inventa una con un cero.
    it('sin gasto no hay cuenta', () => {
      const { hoja } = abrir({ propuesta: { ...CUENTA, expenditure: null } })
      expect(within(hoja).queryByRole('list', { name: 'La cuenta' })).not.toBeInTheDocument()
    })

    it('si ya llegaste, lo dice y propone mantener', () => {
      const { hoja } = abrir({
        perfil: { goal: 'cut', goal_rate: 0.5, goal_weight_kg: 97.5 },
        propuesta: {
          ...CUENTA,
          kcal: 2780,
          plan: { week: 10, weeks: 10, remaining_kg: 0, eta: null, reached: true, goal_weight_kg: 97.5 },
        },
      })
      expect(
        within(hoja).getByText('Has llegado a tu peso meta: te propongo mantener.'),
      ).toBeInTheDocument()
    })
  })

  describe('Peso meta', () => {
    afterEach(() => vi.useRealTimers())

    it('se guarda con el objetivo y el ritmo, con coma o con punto', async () => {
      abrir({ perfil: { goal: 'cut', goal_rate: 0.5, goal_weight_kg: null } })

      await userEvent.type(screen.getByLabelText('Peso meta'), '97,5')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

      await waitFor(() =>
        expect(saveTargetProfile).toHaveBeenCalledWith({
          goal: 'cut',
          goal_rate: 0.5,
          goal_weight_kg: 97.5,
        }),
      )
    })

    it('vacío es null, nunca cero', async () => {
      abrir({ perfil: { goal: 'cut', goal_rate: 0.5, goal_weight_kg: 97.5 } })
      expect(screen.getByLabelText('Peso meta')).toHaveValue('97,5')

      await userEvent.clear(screen.getByLabelText('Peso meta'))
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

      await waitFor(() =>
        expect(saveTargetProfile).toHaveBeenCalledWith(
          expect.objectContaining({ goal_weight_kg: null }),
        ),
      )
    })

    // La fecha manda: «semanas» sale de contar hasta ella, no de re-derivar el ritmo.
    it('con plan dice cuántas semanas faltan y hacia qué día', () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 9, 2, 12, 0))
      const { hoja } = abrir({
        perfil: { goal: 'cut', goal_rate: 0.5, goal_weight_kg: 97.5 },
        propuesta: {
          kcal: 2230,
          source: 'measured',
          days: 21,
          missing: [],
          expenditure: 2780,
          plan: { week: 3, weeks: 7, remaining_kg: 3.5, eta: '2026-11-20', reached: false, goal_weight_kg: 97.5 },
        },
      })
      expect(within(hoja).getByText('≈ 7 semanas más · hacia el 20 nov')).toBeInTheDocument()
    })

    it('sin plan no dice nada de semanas', () => {
      const { hoja } = abrir()
      expect(within(hoja).queryByText(/semanas más/)).not.toBeInTheDocument()
    })
  })
})
