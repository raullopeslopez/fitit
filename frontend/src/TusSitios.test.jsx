import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import TusSitios from './TusSitios.jsx'

const SITIOS = [
  {
    id: 7,
    name: 'Bar Paco',
    kind: 'fuera',
    estimated: true,
    per_serving: { kcal: 951.4 },
    ingredients: [
      { id: 1, food_id: 10, food_name: 'Lentejas', grams: 250 },
      { id: 2, food_id: 11, food_name: 'Aceite de oliva', grams: 15 },
    ],
  },
  {
    id: 8,
    name: 'Táper de mamá',
    kind: 'fuera',
    estimated: false,
    per_serving: { kcal: 600 },
    ingredients: [{ id: 3, food_id: 10, food_name: 'Lentejas', grams: 300 }],
  },
]

function pintar(over = {}) {
  const props = {
    leer: vi.fn().mockResolvedValue(SITIOS),
    corregir: vi.fn().mockResolvedValue({}),
    onClose: vi.fn(),
    ...over,
  }
  render(<TusSitios {...props} />)
  return props
}

describe('tus sitios', () => {
  it('lista tus sitios con su cifra, y dice cuáles siguen estimados', async () => {
    pintar()
    const paco = await screen.findByRole('button', { name: /Bar Paco/ })
    expect(within(paco).getByText('~951 kcal')).toBeInTheDocument()
    expect(within(paco).getByText('estimado')).toBeInTheDocument()
    const taper = screen.getByRole('button', { name: /Táper de mamá/ })
    expect(within(taper).queryByText('estimado')).not.toBeInTheDocument()
  })

  it('sin sitios dice cómo se guardan', async () => {
    pintar({ leer: vi.fn().mockResolvedValue([]) })
    expect(
      await screen.findByText('Todavía no tienes sitios. Se guardan al ponerle nombre a lo que comes fuera.'),
    ).toBeInTheDocument()
  })

  it('tocar uno deja corregir el nombre y los gramos', async () => {
    const props = pintar()
    await userEvent.click(await screen.findByRole('button', { name: /Bar Paco/ }))
    expect(
      screen.getByText(
        'Gramos estimados. Al guardar pasan a ser tuyos y lo próximo que apuntes aquí ya no sale como estimado.',
      ),
    ).toBeInTheDocument()
    const lentejas = screen.getByRole('textbox', { name: 'Gramos de Lentejas' })
    await userEvent.clear(lentejas)
    await userEvent.type(lentejas, '300')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(props.corregir).toHaveBeenCalledWith(7, {
        name: 'Bar Paco',
        ingredients: [
          { food_id: 10, grams: 300 },
          { food_id: 11, grams: 15 },
        ],
      }),
    )
    await waitFor(() => expect(props.leer).toHaveBeenCalledTimes(2))
  })

  it('no guarda un gramaje que no es un número', async () => {
    pintar()
    await userEvent.click(await screen.findByRole('button', { name: /Bar Paco/ }))
    await userEvent.clear(screen.getByRole('textbox', { name: 'Gramos de Lentejas' }))
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })
})
