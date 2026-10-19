import { ochoSemanas } from './OchoSemanas.jsx'

const serie = (g) => ({ muscle_group: g })
const dia = (date, sets) => ({ id: date, date, workouts: [{ id: date, sets }] })

describe('ochoSemanas', () => {
  it('cuenta por semana, la última a la derecha, con su media y si baja', () => {
    // Miércoles 22 jul 2026: su semana empieza el lunes 20; la primera de las
    // ocho, el lunes 1 de junio.
    const days = [
      dia('2026-07-22', [serie('Pecho'), serie('Pecho')]),
      dia('2026-06-01', Array.from({ length: 8 }, () => serie('Pecho'))),
      dia('2026-05-01', [serie('Pecho')]),
    ]
    const pecho = ochoSemanas(days, '2026-07-22').find((f) => f.group === 'Pecho')
    expect(pecho.semanas[7]).toBe(2)
    expect(pecho.semanas[0]).toBe(8)
    expect(pecho.media).toBe(1)
    expect(pecho.baja).toBe(true)
  })
})
