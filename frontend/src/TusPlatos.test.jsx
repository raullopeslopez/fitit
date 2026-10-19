import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import TusPlatos from './TusPlatos.jsx'

vi.mock('./api.js')

function plato(over = {}) {
  return {
    id: 1,
    name: 'Pollo con arroz y brócoli',
    servings: 1,
    basis: 'raw',
    slots: ['comida'],
    is_block: false,
    ingredients: [
      { id: 1, food_id: 10, food_name: 'Pollo, pechuga, sin piel, cruda', grams: 220 },
      { id: 2, food_id: 11, food_name: 'Arroz blanco, crudo', grams: 100 },
    ],
    per_serving: { kcal: 795, protein: 67, fat: 20, carbs: 81, fiber: null },
    unknown: {},
    ...over,
  }
}

const PIZZA = plato({ id: 2, name: 'Pizza casera', slots: null, per_serving: { kcal: 900, protein: 38 } })

function montar(platos = [plato(), PIZZA], props = {}) {
  const leer = vi.fn().mockResolvedValue(platos)
  const corregir = vi.fn().mockResolvedValue({})
  const onChanged = vi.fn()
  render(<TusPlatos onClose={vi.fn()} onChanged={onChanged} leer={leer} corregir={corregir} {...props} />)
  return { leer, corregir, onChanged }
}

describe('Pesar la olla', () => {
  it('sin olla, se pesa desde la hoja del plato', async () => {
    const pesar = vi.fn().mockResolvedValue({ id: 3, cooked_grams: 2400, cooked_on: '2026-10-12' })
    const { leer } = montar([plato()], { pesar })
    await userEvent.click(await screen.findByRole('button', { name: /Pollo con arroz/ }))
    const hoja = screen.getByRole('dialog', { name: 'Pollo con arroz y brócoli' })
    expect(hoja).toHaveTextContent('Pésala al sacarla del fuego y cada comida será una parte de ella.')
    await userEvent.click(within(hoja).getByRole('button', { name: 'Pesar la olla' }))
    await userEvent.type(within(hoja).getByRole('textbox', { name: 'Peso de la olla cocinada' }), '2400')
    await userEvent.click(within(hoja).getByRole('button', { name: 'Guardar peso' }))
    await waitFor(() => expect(pesar).toHaveBeenCalledWith(1, 2400))
    await waitFor(() => expect(leer).toHaveBeenCalledTimes(2))
  })

  it('con olla, dice cuánto pesó y deja pesar otra', async () => {
    montar([plato({ batch: { id: 3, cooked_grams: 2400, cooked_on: '2026-10-12' } })])
    await userEvent.click(await screen.findByRole('button', { name: /Pollo con arroz/ }))
    const hoja = screen.getByRole('dialog', { name: 'Pollo con arroz y brócoli' })
    expect(hoja).toHaveTextContent('2400 g')
    expect(within(hoja).getByRole('button', { name: 'Pesar otra' })).toBeInTheDocument()
  })
})

// Tus platos es lo que el plan baraja. Hasta hoy no había dónde verlos: el plan
// podía poner una pizza de desayuno y no había forma de decirle que no.
describe('Tus platos', () => {
  it('es una pantalla con su título', async () => {
    montar()
    expect(screen.getByRole('dialog', { name: 'Tus platos' })).toBeInTheDocument()
    await screen.findByText('Pollo con arroz y brócoli')
  })

  it('cada plato dice a qué comidas va y qué aporta por ración', async () => {
    montar()
    const fila = (await screen.findByText('Pollo con arroz y brócoli')).closest('button')
    expect(within(fila).getByText('Comida')).toBeInTheDocument()
    expect(within(fila).getByText('67 P')).toBeInTheDocument()
    expect(within(fila).getByText('795 kcal')).toBeInTheDocument()
  })

  // `null` no es «ninguna»: el planificador lo lee como «vale para cualquiera»,
  // y eso es justo lo que hay que enseñar, no esconder.
  it('un plato sin comidas asignadas dice que puede ir en cualquiera', async () => {
    montar()
    const fila = (await screen.findByText('Pizza casera')).closest('button')
    expect(within(fila).getByText('Cualquier comida')).toBeInTheDocument()
  })

  it('avisa de cuántos platos no tienen comida asignada', async () => {
    montar()
    expect(
      await screen.findByText('1 plato sin comida asignada: el plan puede ponerlo en cualquiera.'),
    ).toBeInTheDocument()
  })

  it('sin platos sin asignar, no avisa', async () => {
    montar([plato()])
    await screen.findByText('Pollo con arroz y brócoli')
    expect(screen.queryByText(/sin comida asignada/)).not.toBeInTheDocument()
  })

  it('los sin asignar van primero, que son los que hay que arreglar', async () => {
    montar([plato(), PIZZA])
    await screen.findByText('Pizza casera')
    const nombres = screen.getAllByRole('button').map((b) => b.textContent)
    expect(nombres.findIndex((t) => t.includes('Pizza casera'))).toBeLessThan(
      nombres.findIndex((t) => t.includes('Pollo con arroz')),
    )
  })

  it('sin platos lo dice', async () => {
    montar([])
    expect(
      await screen.findByText('Todavía no tienes platos. Crea uno o pide que te los propongan.'),
    ).toBeInTheDocument()
  })

  it('un macro sin medir se pinta como raya, no como cero', async () => {
    montar([plato({ per_serving: { kcal: 795, protein: null } })])
    const fila = (await screen.findByText('Pollo con arroz y brócoli')).closest('button')
    expect(within(fila).getByText('— P')).toBeInTheDocument()
  })

  // Marcador: el filtro por comida. Un plato sin comidas va en cualquiera, así
  // que sale en todas.
  it('filtra por comida, y lo que vale para cualquiera sale siempre', async () => {
    montar([plato(), plato({ id: 3, name: 'Avena con fruta', slots: ['desayuno'] }), PIZZA])
    await screen.findByText('Avena con fruta')
    await userEvent.click(screen.getByRole('button', { name: 'Desayuno' }))
    expect(screen.getByText('Avena con fruta')).toBeInTheDocument()
    expect(screen.getByText('Pizza casera')).toBeInTheDocument()
    expect(screen.queryByText('Pollo con arroz y brócoli')).not.toBeInTheDocument()
  })

  it('trae las formas de llenar la lista', async () => {
    montar()
    await screen.findByText('Pollo con arroz y brócoli')
    expect(screen.getByRole('button', { name: 'Nuevo plato' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Proponme platos' })).toBeInTheDocument()
  })
})

describe('Un plato, abierto', () => {
  async function abrir(nombre = 'Pizza casera', platos) {
    const ctx = montar(platos)
    await userEvent.click((await screen.findByText(nombre)).closest('button'))
    return { ...ctx, hoja: screen.getByRole('dialog', { name: nombre }) }
  }

  it('enseña sus ingredientes', async () => {
    const { hoja } = await abrir('Pollo con arroz y brócoli')
    expect(within(hoja).getByText('Pollo, pechuga, sin piel, cruda')).toBeInTheDocument()
    expect(within(hoja).getByText('220 g')).toBeInTheDocument()
  })

  it('lo poco se lee también en cucharadas', async () => {
    const conAceite = plato({
      ingredients: [
        { id: 1, food_id: 10, food_name: 'Pollo, pechuga, sin piel, cruda', grams: 220 },
        { id: 3, food_id: 12, food_name: 'Aceite de oliva', grams: 27 },
      ],
    })
    const { hoja } = await abrir('Pollo con arroz y brócoli', [conAceite, PIZZA])
    expect(within(hoja).getByText('27 g · ≈ 2 cdas')).toBeInTheDocument()
    expect(within(hoja).getByText('220 g')).toBeInTheDocument()
  })

  it('las cuatro comidas son chips, con las suyas elegidas', async () => {
    const { hoja } = await abrir('Pollo con arroz y brócoli')
    const grupo = within(hoja).getByRole('group', { name: 'Sirve para' })
    expect(within(grupo).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Desayuno', 'Comida', 'Cena', 'Snack',
    ])
    expect(within(grupo).getByRole('button', { name: 'Comida' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(grupo).getByRole('button', { name: 'Desayuno' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('elegir y guardar manda las comidas, en el orden del día', async () => {
    const { hoja, corregir, onChanged } = await abrir()
    const grupo = within(hoja).getByRole('group', { name: 'Sirve para' })
    await userEvent.click(within(grupo).getByRole('button', { name: 'Cena' }))
    await userEvent.click(within(grupo).getByRole('button', { name: 'Comida' }))
    await userEvent.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(corregir).toHaveBeenCalledWith(2, { slots: ['comida', 'cena'] })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pizza casera' })).not.toBeInTheDocument())
  })

  it('quitarlas todas vuelve a «cualquier comida», y lo dice antes de guardar', async () => {
    const { hoja, corregir } = await abrir('Pollo con arroz y brócoli')
    const grupo = within(hoja).getByRole('group', { name: 'Sirve para' })
    await userEvent.click(within(grupo).getByRole('button', { name: 'Comida' }))
    expect(within(hoja).getByText('Sin ninguna elegida, el plan puede ponerlo en cualquier comida.')).toBeInTheDocument()
    await userEvent.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(corregir).toHaveBeenCalledWith(1, { slots: [] })
  })

  it('si no se guarda, lo dice y no cierra', async () => {
    const { hoja, corregir } = await abrir()
    corregir.mockRejectedValue(new Error('offline'))
    await userEvent.click(within(within(hoja).getByRole('group', { name: 'Sirve para' })).getByRole('button', { name: 'Cena' }))
    await userEvent.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await within(hoja).findByText('No se ha podido guardar.')).toBeInTheDocument()
  })
})
