import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import ImportarPlan, { aGuardar, estadoInicial } from './ImportarPlan.jsx'

const linea = (over = {}) => ({
  text: '80 g lentejas',
  quantity: 80,
  unit: 'g',
  recipe_grams: 80,
  grams: 80,
  status: 'chosen',
  food: { id: 10, name: 'Lentejas, crudas' },
  candidates: [],
  ...over,
})

const LECTURA = {
  dishes: [
    { name: 'Tortilla de patatas', slots: ['desayuno'], status: 'existing', dish_id: 5, lines: [] },
    {
      name: 'Lentejas con chorizo',
      slots: ['comida'],
      status: 'new',
      dish_id: null,
      lines: [
        linea(),
        linea({
          text: '50 g chorizo',
          grams: 50,
          status: 'ambiguous',
          food: null,
          candidates: [
            { id: 20, name: 'Chorizo, curado' },
            { id: 21, name: 'Chorizo, fresco' },
          ],
        }),
        linea({ text: '1 hoja de laurel', grams: null, status: 'missing', food: null }),
        linea({ text: '2 huevos', quantity: 2, unit: null, grams: null, food: { id: 30, name: 'Huevo, crudo' } }),
      ],
    },
    { name: 'Merluza al horno', slots: ['cena'], status: 'new', dish_id: null, lines: [] },
  ],
  week: [
    { day: 0, slot: 'desayuno', dish: 0 },
    { day: 0, slot: 'comida', dish: 1 },
    { day: 4, slot: 'cena', dish: 2 },
  ],
}

describe('qué se guarda de lo revisado', () => {
  it('lo tuyo va por su id; lo nuevo, con las líneas que tienen alimento y gramos', () => {
    const cuerpo = aGuardar(LECTURA, estadoInicial(LECTURA), '2026-10-05')
    expect(cuerpo.week_start).toBe('2026-10-05')
    expect(cuerpo.dishes).toEqual([
      { name: 'Tortilla de patatas', slots: ['desayuno'], dish_id: 5 },
      // El chorizo pregunta «¿Cuál?», el laurel falta y los huevos no tienen
      // gramos: sin decidir, ninguno de los tres entra.
      { name: 'Lentejas con chorizo', slots: ['comida'], ingredients: [{ food_id: 10, grams: 80 }] },
    ])
    // La merluza no tiene ingredientes: no se guarda, y su casilla se queda
    // para el generador.
    expect(cuerpo.week).toEqual([
      { day: 0, slot: 'desayuno', dish: 0 },
      { day: 0, slot: 'comida', dish: 1 },
    ])
  })

  it('un plato descartado no se guarda y las casillas se renumeran', () => {
    const estado = estadoInicial(LECTURA)
    estado[0].descartado = true
    const cuerpo = aGuardar(LECTURA, estado, '2026-10-05')
    expect(cuerpo.dishes.map((d) => d.name)).toEqual(['Lentejas con chorizo'])
    expect(cuerpo.week).toEqual([{ day: 0, slot: 'comida', dish: 0 }])
  })
})

describe('la pantalla de platos identificados', () => {
  function pintar(over = {}) {
    const props = {
      lectura: LECTURA,
      weekStart: '2026-10-05',
      guardar: vi.fn().mockResolvedValue({ pauta_id: 1 }),
      onGuardado: vi.fn(),
      onClose: vi.fn(),
      ...over,
    }
    render(<ImportarPlan {...props} />)
    return props
  }

  it('resume lo encontrado y dice qué es nuevo y qué ya tienes', () => {
    pintar()
    expect(screen.getByRole('dialog', { name: 'Platos identificados' })).toBeInTheDocument()
    expect(screen.getByText('3 platos · 2 nuevos · 1 ya lo tienes')).toBeInTheDocument()
    const tortilla = screen.getByRole('article', { name: 'Tortilla de patatas' })
    expect(tortilla).toHaveTextContent('Ya lo tienes')
    const lentejas = screen.getByRole('article', { name: 'Lentejas con chorizo' })
    expect(lentejas).toHaveTextContent('Nuevo')
    expect(lentejas).toHaveTextContent('Lentejas')
    expect(lentejas).toHaveTextContent('80 g')
  })

  it('una línea dudosa se resuelve eligiendo, y entonces entra', async () => {
    const props = pintar()
    const lentejas = screen.getByRole('article', { name: 'Lentejas con chorizo' })
    expect(lentejas).toHaveTextContent('¿Cuál? 50 g chorizo')
    await userEvent.click(within(lentejas).getByRole('button', { name: 'Chorizo, curado' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    const cuerpo = props.guardar.mock.calls[0][0]
    expect(cuerpo.dishes[1].ingredients).toEqual([
      { food_id: 10, grams: 80 },
      { food_id: 20, grams: 50 },
    ])
  })

  it('una línea sin gramos pide cuántos, y con ellos entra', async () => {
    const props = pintar()
    const lentejas = screen.getByRole('article', { name: 'Lentejas con chorizo' })
    expect(lentejas).toHaveTextContent('Sin gramos: si no los escribes, no se guarda.')
    await userEvent.type(within(lentejas).getByLabelText('Gramos de 2 huevos'), '120')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(props.guardar.mock.calls[0][0].dishes[1].ingredients).toContainEqual({ food_id: 30, grams: 120 })
  })

  it('lo que no está en tu catálogo lo dice y no se guarda', () => {
    pintar()
    const lentejas = screen.getByRole('article', { name: 'Lentejas con chorizo' })
    expect(lentejas).toHaveTextContent('Falta: 1 hoja de laurel. No se guarda.')
  })

  it('un plato sin ingredientes lo dice, y su casilla queda para la app', () => {
    pintar()
    const merluza = screen.getByRole('article', { name: 'Merluza al horno' })
    expect(merluza).toHaveTextContent('Sin ingredientes: no se puede guardar.')
    expect(screen.getByRole('region', { name: 'La semana' })).toHaveTextContent('Cena · lo elige la app')
  })

  it('descartar un plato lo saca de lo que se guarda, y se puede recuperar', async () => {
    const props = pintar()
    const tortilla = screen.getByRole('article', { name: 'Tortilla de patatas' })
    await userEvent.click(within(tortilla).getByRole('button', { name: 'Descartar' }))
    expect(within(tortilla).getByRole('button', { name: 'Recuperar' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(props.guardar.mock.calls[0][0].dishes.map((d) => d.name)).toEqual(['Lentejas con chorizo'])
  })

  it('guardar avisa de que ha terminado', async () => {
    const props = pintar()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(props.onGuardado).toHaveBeenCalled()
  })

  it('si no se puede guardar lo dice y se queda en la pantalla', async () => {
    const props = pintar({ guardar: vi.fn().mockRejectedValue({ detail: '«Merluza» no tiene ingredientes' }) })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByText('No se ha podido guardar: «Merluza» no tiene ingredientes.')).toBeInTheDocument()
    expect(props.onGuardado).not.toHaveBeenCalled()
  })

  it('sin nada que guardar no deja guardar', () => {
    pintar({ lectura: { dishes: [LECTURA.dishes[2]], week: [] } })
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })

  it('un PDF sin platos lo dice', () => {
    pintar({ lectura: { dishes: [], week: [] } })
    expect(screen.getByText('No se ha encontrado ningún plato en el PDF.')).toBeInTheDocument()
  })
})
