import { buildHistory, muscleCounts } from './daysHistory.js'

const set = (muscle_group, extra = {}) => ({ muscle_group, kind: 'strength', ...extra })
const day = (id, date, sets = [set('Pecho')]) => ({
  id,
  date,
  workouts: [{ id: id * 10, name: 'X', sets }],
})

describe('muscleCounts', () => {
  // Las celdas son de músculos: el cardio y lo que no lleva grupo cuentan en
  // las series de la fila, pero no tienen celda en la que pintarse.
  it('counts sets per muscle, leaving cardio and untagged out', () => {
    expect(
      muscleCounts([
        set('Pecho'),
        set('Pecho'),
        set('Core'),
        set(null),
        set(null, { kind: 'cardio' }),
      ]),
    ).toEqual({ Pecho: 2, Core: 1 })
  })
})

describe('buildHistory', () => {
  const today = '2026-10-12' // lunes

  it('details this week, the last one, and nothing older', () => {
    const h = buildHistory(
      [day(4, '2026-10-11'), day(3, '2026-10-06'), day(2, '2026-09-30'), day(1, '2026-09-16')],
      today,
    )
    expect(h.detailed.map((w) => [w.key, w.label])).toEqual([
      ['2026-10-12', 'ESTA SEMANA'],
      ['2026-10-05', 'SEMANA ANTERIOR'],
    ])
    expect(h.detailed[1].days.map((d) => d.id)).toEqual([4, 3])
  })

  // Una semana pertenece al mes de su jueves, como en el calendario ISO: la del
  // 29 de septiembre al 4 de octubre es de octubre.
  it('folds older weeks into their month, empty weeks included', () => {
    const h = buildHistory(
      [day(4, '2026-10-11'), day(3, '2026-10-06'), day(2, '2026-09-30'), day(1, '2026-09-16')],
      today,
    )
    expect(h.months.map((m) => [m.label, m.open, m.sessions, m.sets])).toEqual([
      ['Octubre', true, 1, 1],
      ['Septiembre', true, 1, 1],
    ])
    expect(h.months[0].weeks.map((w) => w.range)).toEqual(['28 SEP – 4 OCT'])
    // Nada antes de la primera semana registrada: un historial no empieza en 1970.
    expect(h.months[1].weeks.map((w) => [w.range, w.sessions])).toEqual([
      ['21–27 SEP', 0],
      ['14–20 SEP', 1],
    ])
    expect(h.years).toEqual([])
  })

  // Lo último que hiciste se ve entero aunque sea viejo: «Repetir» tiene que
  // seguir costando un toque después de dos semanas sin ir.
  it('details the week of the latest session, however old', () => {
    const h = buildHistory([day(1, '2026-09-16')], today)
    expect(h.detailed.map((w) => [w.key, w.label])).toEqual([
      ['2026-10-12', 'ESTA SEMANA'],
      ['2026-09-14', 'SEMANA DEL 14 SEP'],
    ])
    const weeks = h.months.flatMap((m) => m.weeks.map((w) => w.key))
    expect(weeks).not.toContain('2026-09-14')
    expect(weeks).toContain('2026-10-05')
  })

  it('collapses months before last one, and other years into a row each', () => {
    const h = buildHistory(
      [day(3, '2026-10-06'), day(2, '2026-07-15'), day(1, '2025-12-03')],
      today,
    )
    expect(h.months.map((m) => [m.label, m.open])).toEqual([
      ['Octubre', true],
      ['Septiembre', true],
      ['Agosto', false],
      ['Julio', false],
      ['Junio', false],
      ['Mayo', false],
      ['Abril', false],
      ['Marzo', false],
      ['Febrero', false],
      ['Enero', false],
    ])
    const julio = h.months.find((m) => m.label === 'Julio')
    expect([julio.sessions, julio.sets]).toEqual([1, 1])
    expect(h.years.map((y) => [y.label, y.sessions, y.months.map((m) => m.label)])).toEqual([
      ['2025', 1, ['Diciembre']],
    ])
  })

  // Siete casillas, de lunes a domingo: el músculo que más series se llevó ese
  // día, o nada si no entrenaste.
  it('marks each day of a folded week with its main muscle', () => {
    const h = buildHistory(
      [
        day(9, '2026-10-06'),
        day(2, '2026-09-18', [set('Espalda'), set('Espalda'), set('Bíceps')]),
        day(1, '2026-09-15', [set(null, { kind: 'cardio' })]),
      ],
      today,
    )
    const week = h.months[1].weeks.find((w) => w.key === '2026-09-14')
    expect(week.ticks).toEqual([null, 'Cardio', null, null, 'Espalda', null, null])
    expect(week.muscles).toEqual({ Espalda: 2, Bíceps: 1 })
  })
})
