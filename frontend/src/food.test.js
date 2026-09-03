import { describe, expect, it } from 'vitest'

import {
  MEAL_SLOTS,
  foodDayIso,
  formatAmount,
  formatMacro,
  inferMealSlot,
  proteinProgress,
  shiftDay,
  slotLabel,
  unknownNote,
} from './food.js'

describe('el día alimentario', () => {
  it('corta a las 04:00, no a medianoche', () => {
    // Una cena a la 01:30 es del día que llevas despierto, no del que acaba de
    // entrar en el calendario. Tiene que coincidir con lo que el servidor
    // deriva en log_date, o la pantalla pide un día y le contestan otro.
    expect(foodDayIso(new Date(2026, 8, 1, 1, 30))).toBe('2026-08-31')
    expect(foodDayIso(new Date(2026, 8, 1, 3, 59))).toBe('2026-08-31')
    expect(foodDayIso(new Date(2026, 8, 1, 4, 0))).toBe('2026-09-01')
    expect(foodDayIso(new Date(2026, 8, 1, 23, 59))).toBe('2026-09-01')
  })

  it('cruza el cambio de mes hacia atrás', () => {
    expect(foodDayIso(new Date(2026, 8, 1, 2, 0))).toBe('2026-08-31')
  })
})

describe('moverse de día', () => {
  it('va al anterior y al siguiente', () => {
    expect(shiftDay('2026-09-01', -1)).toBe('2026-08-31')
    expect(shiftDay('2026-08-31', 1)).toBe('2026-09-01')
  })

  it('cruza el año', () => {
    expect(shiftDay('2027-01-01', -1)).toBe('2026-12-31')
  })
})

describe('imprimir un nutriente', () => {
  it('un cero es un cero', () => {
    expect(formatMacro(0)).toBe('0')
  })

  it('desconocido es una raya, no un cero', () => {
    expect(formatMacro(null)).toBe('—')
    expect(formatMacro(undefined)).toBe('—')
  })

  it('redondea a entero, que es la resolución que tiene sentido', () => {
    expect(formatMacro(128.4)).toBe('128')
    // Cuatro cifras van sin separador en español (1841, no 1.841); a partir de
    // cinco sí lo lleva. Es la convención de la RAE, y es la que aplica es-ES.
    expect(formatMacro(1840.6)).toBe('1841')
    expect(formatMacro(12500)).toBe('12.500')
  })

  it('la fibra y las macros pequeñas conservan un decimal', () => {
    expect(formatMacro(2.7, { decimals: 1 })).toBe('2,7')
  })
})

describe('imprimir una cantidad', () => {
  it('quita los decimales que no dicen nada', () => {
    expect(formatAmount(100)).toBe('100 g')
    expect(formatAmount(62.5)).toBe('62,5 g')
  })
})

describe('las comidas del día', () => {
  it('van en el orden en que se comen', () => {
    expect(MEAL_SLOTS.map((s) => s.key)).toEqual(['desayuno', 'comida', 'cena', 'snack'])
  })

  it('una entrada sin comida asignada tiene su propio nombre', () => {
    expect(slotLabel(null)).toBe('Sin asignar')
    expect(slotLabel('cena')).toBe('Cena')
  })
})

describe('el pie que explica una raya', () => {
  const none = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 }

  it('no dice nada cuando no falta nada', () => {
    expect(unknownNote(none)).toBe(null)
  })

  it('nombra el nutriente que falta y en cuántas entradas', () => {
    expect(unknownNote({ ...none, fiber: 2 })).toBe('— no es cero: 2 entradas sin fibra.')
  })

  it('concuerda en singular', () => {
    expect(unknownNote({ ...none, fiber: 1 })).toBe('— no es cero: 1 entrada sin fibra.')
  })

  it('encadena varios, el primero con el sustantivo y el resto sin él', () => {
    expect(unknownNote({ ...none, kcal: 1, fiber: 2 })).toBe(
      '— no es cero: 1 entrada sin kcal, 2 sin fibra.',
    )
  })
})

describe('a qué comida va lo que registras ahora', () => {
  it('sigue las bandas horarias habituales', () => {
    expect(inferMealSlot(new Date(2026, 8, 2, 8, 0))).toBe('desayuno')
    expect(inferMealSlot(new Date(2026, 8, 2, 14, 0))).toBe('comida')
    expect(inferMealSlot(new Date(2026, 8, 2, 18, 0))).toBe('snack')
    expect(inferMealSlot(new Date(2026, 8, 2, 22, 0))).toBe('cena')
  })

  it('la madrugada tardía cuenta como el cierre del día anterior, no como desayuno', () => {
    expect(inferMealSlot(new Date(2026, 8, 2, 2, 0))).toBe('snack')
  })
})

describe('la barra de proteína', () => {
  it('sin objetivo no hay barra que pintar', () => {
    expect(proteinProgress(80, null)).toBe(null)
    expect(proteinProgress(80, 0)).toBe(null)
  })

  it('el porcentaje del objetivo cubierto', () => {
    expect(proteinProgress(118, 160)).toBe(74)
    expect(proteinProgress(0, 160)).toBe(0)
    expect(proteinProgress(null, 160)).toBe(0)
  })

  it('nunca se sale de la barra al pasarse del objetivo', () => {
    expect(proteinProgress(200, 160)).toBe(100)
  })
})
