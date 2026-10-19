import { owedThisWeek } from './HoyEntreno.jsx'
import { foodDayIso } from './food.js'

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
