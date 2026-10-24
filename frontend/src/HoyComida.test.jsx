import { render, screen } from '@testing-library/react'

import { Ahora } from './HoyComida.jsx'

const ENTRADA = {
  id: 1,
  log_date: '2026-10-24',
  slot: 'desayuno',
  dish_id: 7,
  dish_name: 'Batido de proteína de suero',
  grams: [500],
  kcal: 200,
  status: null,
  log_entry_id: null,
}

// Un solo mandarina por pantalla (DESIGN.md). Los días que la banda de entreno
// abre Hoy, su «Entrenar» es la acción; «Comido» pasa a Hueso, como «Lo comí»
// cuando el mandarina estaba en «Añadir comida».
describe('«Comido» en lo que toca ahora', () => {
  it('en mandarina cuando nada más lo pide', () => {
    render(<Ahora entrada={ENTRADA} hechas={[]} platos={[]} onChanged={() => {}} />)
    expect(screen.getByRole('button', { name: 'Comido' })).not.toHaveClass('is-segundo')
  })

  it('en Hueso cuando el entreno va arriba', () => {
    render(<Ahora entrada={ENTRADA} hechas={[]} platos={[]} onChanged={() => {}} segundo />)
    expect(screen.getByRole('button', { name: 'Comido' })).toHaveClass('is-segundo')
  })
})
