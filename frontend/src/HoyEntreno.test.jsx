import { act, render, screen, within } from '@testing-library/react'

import HoyEntreno, { conLosCumplidos, owedThisWeek } from './HoyEntreno.jsx'
import { listDays } from './api.js'
import { foodDayIso } from './food.js'

vi.mock('./api.js', () => ({ listDays: vi.fn() }))

const series = (group, n) => Array.from({ length: n }, () => ({ muscle_group: group, secondary_groups: [] }))
const dia = (date, sets) => ({ id: date, date, workouts: [{ id: date, date, sets }] })
const haceDias = (n) => {
  const d = new Date(`${foodDayIso()}T12:00:00`)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// Los músculos que entrenas y esta semana van por debajo de su mínimo,
// ordenados por lo que les falta y tres como mucho. Uno que nunca entrenas no
// sale: no hay fila de la que faltar.
describe('owedThisWeek', () => {
  it('los tres más lejos de su mínimo, con las series que faltan', () => {
    const days = [
      dia(foodDayIso(), [...series('Pecho', 6), ...series('Espalda', 3)]),
      dia(haceDias(14), [...series('Espalda', 10), ...series('Cuádriceps', 8), ...series('Femoral', 4), ...series('Gemelo', 8)]),
    ]
    const owed = owedThisWeek(days)
    expect(owed.map((m) => m.group)).toEqual(['Cuádriceps', 'Gemelo', 'Espalda'])
    expect(owed.map((m) => m.gap)).toEqual([8, 8, 7])
  })
})

// Lienzo «Movimiento → un músculo deja de faltar»: al volver a Hoy, el que ya
// no falta sale en su sitio con «✓» y se va solo; el que sólo ha bajado del
// podio porque otro subió no es un «✓», simplemente deja de salir.
describe('conLosCumplidos', () => {
  const antes = [
    { group: 'Espalda', gap: 2 },
    { group: 'Hombro', gap: 8 },
  ]
  it('el que ya no falta vuelve con «✓» en su sitio', () => {
    const ahora = [{ group: 'Hombro', gap: 8 }]
    expect(conLosCumplidos(antes, ahora, ahora)).toEqual([
      { group: 'Espalda', gap: 0, cumplido: true },
      { group: 'Hombro', gap: 8 },
    ])
  })
  it('el que sigue faltando pero ya no cabe no es un «✓»', () => {
    const ahora = [{ group: 'Hombro', gap: 8 }]
    const todos = [...ahora, { group: 'Espalda', gap: 2 }]
    expect(conLosCumplidos(antes, ahora, todos)).toEqual(ahora)
  })
  it('sin una vez anterior, nada que celebrar', () => {
    expect(conLosCumplidos(null, antes, antes)).toEqual(antes)
  })
})

describe('HoyEntreno al volver de entrenar', () => {
  it('«−N» pasa a «✓» y la píldora se va', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const semana = [dia(foodDayIso(), [...series('Espalda', 9)]), dia(haceDias(14), series('Espalda', 10))]
    listDays.mockResolvedValueOnce(semana)
    const primera = render(<HoyEntreno onTrain={() => {}} />)
    await screen.findByText(/−/)
    primera.unmount()

    listDays.mockResolvedValueOnce([dia(foodDayIso(), series('Espalda', 14)), dia(haceDias(14), series('Espalda', 10))])
    render(<HoyEntreno onTrain={() => {}} />)
    const pildora = (await screen.findByText('✓')).closest('li')
    expect(pildora).toHaveClass('is-cumplido')
    expect(within(pildora).getByText(/Espalda/)).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(screen.queryByText('✓')).toBeNull()
    vi.useRealTimers()
  })
})

// «Entrenar» es la única puerta al entreno, así que lo que antes contestaba
// Historial lo contesta la banda: un segundo toque mientras se abre no crea
// otra sesión, y un fallo se dice aquí, no en otra pantalla.
describe('HoyEntreno · «Entrenar»', () => {
  it('mientras abre no acepta un segundo toque, y si falla lo dice', async () => {
    listDays.mockResolvedValue([])
    let fallar
    const onTrain = vi.fn(() => new Promise((_, rej) => { fallar = rej }))
    render(<HoyEntreno onTrain={onTrain} />)
    const boton = screen.getByRole('button', { name: /^Entrenar$/ })
    await act(async () => boton.click())
    await act(async () => boton.click())
    expect(onTrain).toHaveBeenCalledTimes(1)
    expect(boton).toBeDisabled()
    await act(async () => fallar(new Error('red')))
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo empezar el entreno.')
    expect(boton).not.toBeDisabled()
  })
})
