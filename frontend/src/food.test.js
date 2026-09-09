import { describe, expect, it } from 'vitest'

import {
  MEAL_SLOTS,
  droppedNote,
  foodDayIso,
  foodMomentIso,
  formatAmount,
  formatMacro,
  inferMealSlot,
  kcalFromMacros,
  previewNutrients,
  proteinProgress,
  shiftDay,
  slotLabel,
  unknownNote,
  withoutEntry,
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

describe('el sello que viaja con una entrada', () => {
  // Lo que el servidor hace con él: `food_log_date()` aplica el offset y luego
  // resta las 4 h, o sea que se queda con el reloj de pared que trae el sello.
  const backendFoodDay = (stamp) => {
    const [y, m, d, hh, mm] = stamp.match(/\d+/g).map(Number)
    return foodDayIso(new Date(y, m - 1, d, hh, mm))
  }

  it('escribe el reloj de pared, no el instante en UTC', () => {
    const stamp = foodMomentIso(new Date(2026, 8, 8, 5, 0, 30))
    expect(stamp.slice(0, 19)).toBe('2026-09-08T05:00:30')
  })

  it('lleva un offset con forma de offset, nunca una Z', () => {
    expect(foodMomentIso(new Date(2026, 8, 8, 5, 0))).toMatch(/[+-]\d{2}:\d{2}$/)
  })

  // La franja en la que las dos reglas se separaron: entre el corte y el corte
  // más el offset. Con `toISOString()` un desayuno de las 05:00 en Madrid se
  // guardaba en el día anterior mientras la pantalla pedía el de hoy.
  it('fecha igual que la pantalla en toda la franja del corte', () => {
    for (const hour of [0, 1, 3, 4, 5, 6, 12, 23]) {
      const moment = new Date(2026, 8, 8, hour, 0)
      expect(backendFoodDay(foodMomentIso(moment))).toBe(foodDayIso(moment))
    }
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

describe('droppedNote', () => {
  it('no dice nada cuando no se descartó nada', () => {
    expect(droppedNote([])).toBe(null)
    expect(droppedNote()).toBe(null)
  })

  it('nombra el único descartado, con su artículo', () => {
    expect(droppedNote(['fiber'])).toBe('Descarté la fibra: no aparece en la tabla que leí.')
  })

  it('encadena varios y concuerda el verbo', () => {
    expect(droppedNote(['fiber', 'protein'])).toBe(
      'Descarté la fibra y la proteína: no aparecen en la tabla que leí.',
    )
  })

  it('ignora una clave que no es un nutriente', () => {
    expect(droppedNote(['fiber', 'sodio'])).toBe(
      'Descarté la fibra: no aparece en la tabla que leí.',
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

// ── Las tres previsualizaciones ───────────────────────────────────────────
//
// Fijan que lo que la pantalla enseña antes de guardar coincide con lo que el
// servidor va a guardar. Es la única defensa contra la deriva que la frontera
// de `food.js` admite: dos implementaciones de la misma cuenta, en dos
// lenguajes, que sólo se pueden mantener juntas comprobando que dan lo mismo.
describe('las previsualizaciones', () => {
  const POLLO = { kcal_100g: 165, protein_100g: 31, fat_100g: 3.6, carbs_100g: 0, fiber_100g: null }

  it('escala como `calcular_nutrientes`, con dos decimales', () => {
    // Los mismos números que da el servidor para 150 g de este pollo.
    expect(previewNutrients(POLLO, 150)).toEqual({
      kcal: 247.5,
      protein: 46.5,
      fat: 5.4,
      carbs: 0,
      fiber: null,
    })
  })

  it('un nutriente desconocido sobrevive a la multiplicación', () => {
    // `null` por 1,5 sigue siendo `null`. Un 0 aquí sería una medición que
    // nadie hizo, y esta cifra acaba en pantalla al lado de las que sí lo son.
    expect(previewNutrients(POLLO, 150).fiber).toBeNull()
  })

  it('una cantidad que no es una cantidad no previsualiza nada', () => {
    expect(previewNutrients(POLLO, 0)).toBeNull()
    expect(previewNutrients(POLLO, -5)).toBeNull()
    expect(previewNutrients(POLLO, null)).toBeNull()
  })

  it('las kcal salen de los macros por los factores de la UE', () => {
    // 4·P + 9·G + 4·HC + 2·F, los mismos de `_KCAL_PER_GRAM` en nutrition.py.
    expect(kcalFromMacros({ protein: 160, fat: 80, carbs: 300 })).toBe(2560)
    expect(kcalFromMacros({ protein: 10, fat: 0, carbs: 0, fiber: 5 })).toBe(50)
  })

  it('un macro sin fijar cuenta como cero sólo para esta estimación', () => {
    // Igual que `atwater_kcal`: esto no se guarda, se compara. La regla de que
    // `null` no es cero protege lo que se escribe, y esto no escribe nada.
    expect(kcalFromMacros({ protein: 160, fat: null, carbs: null })).toBe(640)
  })

  it('quitar una entrada del total propaga lo desconocido', () => {
    expect(withoutEntry(94, 28)).toBe(66)
    // Si el total del día ya era desconocido, quitarle algo no lo averigua.
    expect(withoutEntry(null, 28)).toBeNull()
    // Y si lo que se quita es desconocido, el resultado tampoco se sabe.
    expect(withoutEntry(94, null)).toBeNull()
  })
})
