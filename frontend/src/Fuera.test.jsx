import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Fuera, { aGuardar } from './Fuera.jsx'

const LINEAS = [
  { text: '250 g lentejas', grams: 250, status: 'chosen', food: { id: 1, name: 'Lentejas' }, candidates: [] },
  {
    text: '15 g aceite',
    grams: 15,
    status: 'ambiguous',
    food: null,
    candidates: [
      { id: 2, name: 'Aceite de oliva' },
      { id: 3, name: 'Aceite de girasol' },
    ],
  },
  { text: '1 flan', grams: null, status: 'missing', food: null, candidates: [] },
]

function pintar(over = {}) {
  const props = {
    estimar: vi.fn().mockResolvedValue({ lines: LINEAS, refusal: null }),
    guardar: vi.fn().mockResolvedValue({}),
    onGuardado: vi.fn(),
    onClose: vi.fn(),
    ...over,
  }
  render(<Fuera {...props} />)
  return props
}

async function contar(texto = 'menú del día de lentejas', aceite = 'Sí') {
  await userEvent.type(screen.getByRole('textbox', { name: 'Qué comiste' }), texto)
  await userEvent.click(screen.getByRole('button', { name: aceite }))
  await userEvent.click(screen.getByRole('button', { name: 'Calcular' }))
}

describe('comer fuera', () => {
  it('no calcula hasta que dices qué comiste y si llevaba aceite o salsa', async () => {
    pintar()
    expect(screen.getByRole('dialog', { name: 'Comer fuera' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calcular' })).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox', { name: 'Qué comiste' }), 'pizza')
    expect(screen.getByRole('button', { name: 'Calcular' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(screen.getByRole('button', { name: 'Calcular' })).toBeEnabled()
  })

  it('manda la descripción y lo del aceite, y enseña las líneas para revisar', async () => {
    const props = pintar()
    await contar()
    expect(props.estimar).toHaveBeenCalledWith('menú del día de lentejas', true)
    expect(await screen.findByText('Lentejas')).toBeInTheDocument()
    expect(screen.getByText('¿Cuál? 15 g aceite')).toBeInTheDocument()
    expect(screen.getByText('Falta: 1 flan. No se guarda.')).toBeInTheDocument()
    expect(screen.getByText('Cifras estimadas: revisa los gramos antes de guardar.')).toBeInTheDocument()
  })

  it('guarda sólo las líneas con alimento y gramos', async () => {
    const props = pintar()
    await contar()
    await userEvent.click(await screen.findByRole('button', { name: 'Aceite de oliva' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(props.guardar).toHaveBeenCalledWith([
        { food_id: 1, grams: 250 },
        { food_id: 2, grams: 15 },
      ]),
    )
    expect(props.onGuardado).toHaveBeenCalled()
  })

  it('si el modelo no lo entiende lo dice, y deja volver a contarlo', async () => {
    pintar({ estimar: vi.fn().mockResolvedValue({ lines: [], refusal: 'unreadable' }) })
    await contar()
    expect(await screen.findByText('No se ha podido entender. Cuéntalo de otra forma.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Qué comiste' })).toBeInTheDocument()
  })
})

describe('aGuardar', () => {
  it('se queda con lo que tiene alimento y gramos positivos', () => {
    expect(
      aGuardar([
        { alimento: 1, gramos: 250 },
        { alimento: null, gramos: 15 },
        { alimento: 3, gramos: null },
      ]),
    ).toEqual([{ food_id: 1, grams: 250 }])
  })
})
