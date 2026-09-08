// El día alimentario y cómo se imprime lo que contiene.
//
// Nada aquí hace aritmética nutricional: eso vive entero en el backend
// (app/nutrition.py) y llega ya calculado y congelado. Esto sólo decide en qué
// día cae un momento y cómo se lee un número en pantalla.

// El día alimentario corta a las 04:00 locales. Una cena a la 01:30 cuenta como
// el día anterior — es el día que llevas despierto, no el que acaba de entrar
// en el calendario.
//
// Tiene que dar exactamente lo mismo que `food_log_date()` en el servidor, que
// es quien deriva `log_date` al escribir. Si las dos reglas se separan, la
// pantalla pide un día y le contestan las entradas de otro, y no hay error en
// ninguna parte: sólo una cena que desaparece a la mañana siguiente.
export const DAY_STARTS_AT_HOUR = 4

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(
    2,
    '0',
  )}`

export function foodDayIso(moment = new Date()) {
  const shifted = new Date(moment.getTime())
  shifted.setHours(shifted.getHours() - DAY_STARTS_AT_HOUR)
  return iso(shifted)
}

// El mismo momento, sellado con el offset del móvil, tal y como viaja al
// servidor. Vive aquí y no en `api.js` a propósito: es la otra mitad de
// `foodDayIso` —una decide en qué día cae un momento, la otra se lo cuenta a
// quien deriva `log_date`— y mientras estuvieron en ficheros distintos se
// separaron. `api.js` sellaba con `toISOString()`, que **siempre** sale en UTC:
// con el offset perdido, un desayuno a las 05:00 en Madrid llegaba como las
// 03:00 y `food_log_date()` lo fechaba el día anterior. La entrada se guardaba
// en ayer mientras la pantalla pedía hoy, sin un error en ninguna parte
// (2026-09-08).
//
// Lo que el servidor lee del sello es el reloj de pared, así que es el reloj de
// pared lo que hay que escribir — no el instante traducido a otro huso.
export function foodMomentIso(moment = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  // `getTimezoneOffset` cuenta al revés que el sello: en Madrid en verano
  // devuelve -120 y lo que hay que escribir es `+02:00`.
  const offset = -moment.getTimezoneOffset()
  const sign = offset < 0 ? '-' : '+'
  const abs = Math.abs(offset)
  const clock = `${pad(moment.getHours())}:${pad(moment.getMinutes())}:${pad(moment.getSeconds())}`
  return `${iso(moment)}T${clock}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

// El día anterior o el siguiente. Construido sobre `Date` y no sobre aritmética
// de cadenas para que los meses y los años se ocupen de sí mismos; a mediodía
// para que ningún cambio de hora se lleve el día por delante.
export function shiftDay(dayIso, delta) {
  const [y, m, d] = dayIso.split('-').map(Number)
  return iso(new Date(y, m - 1, d + delta, 12))
}

// Un nutriente. `null` es **desconocido**, y se imprime como raya: un cero ahí
// diría "medido, y no tiene", que es una afirmación distinta y falsa. Es la
// misma distinción que el backend mantiene en la base de datos, y esta función
// es donde llega a la pantalla.
export function formatMacro(value, { decimals = 0 } = {}) {
  if (value == null) return '—'
  return value.toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// Gramos. Sin decimales cuando no los hay: "100 g" y no "100,0 g".
export function formatAmount(grams) {
  if (grams == null) return '—'
  const rounded = Math.round(grams * 10) / 10
  return `${rounded.toLocaleString('es-ES', { maximumFractionDigits: 1 })} g`
}

// En el orden en que se comen, no alfabético. La lista del día se agrupa por
// esto, y una cena antes que una comida se lee como un error de la app.
export const MEAL_SLOTS = [
  { key: 'desayuno', label: 'Desayuno' },
  { key: 'comida', label: 'Comida' },
  { key: 'cena', label: 'Cena' },
  { key: 'snack', label: 'Snack' },
]

// Una entrada puede no llevar comida asignada — registrar algo no puede
// obligarte a decidir cuándo lo comiste. Tiene grupo propio, al final.
export function slotLabel(key) {
  return MEAL_SLOTS.find((s) => s.key === key)?.label ?? 'Sin asignar'
}

// Las cuatro macros que la cabecera imprime bajo las kcal, con la unidad y la
// resolución que cada una merece: la fibra se mueve en gramos de un dígito, así
// que un entero la redondearía a nada.
export const MACROS = [
  { key: 'protein', label: 'Proteína', short: 'P', unit: 'g', decimals: 0 },
  { key: 'fat', label: 'Grasa', short: 'G', unit: 'g', decimals: 0 },
  { key: 'carbs', label: 'Hidratos', short: 'HC', unit: 'g', decimals: 0 },
  { key: 'fiber', label: 'Fibra', short: 'F', unit: 'g', decimals: 1 },
]

// El pie bajo la fila de totales, cuando alguno no ha podido sumarse.
//
// Existe porque una raya en un total no se explica sola: puede leerse como "no
// comí nada de eso", que es exactamente lo contrario de lo que dice. Así que la
// pantalla dice en voz alta que falta un dato y cuántas entradas lo tienen en
// blanco — que además es lo único accionable, porque señala cuántas hay que
// corregir para que el número aparezca.
//
// Construido con "N entradas sin X" y no con "falta la fibra de N" para no
// tener que concordar el verbo cuando se encadenan nutrientes de género
// distinto ("faltan las kcal y la fibra").
const UNKNOWN_LABELS = {
  kcal: 'kcal',
  protein: 'proteína',
  fat: 'grasa',
  carbs: 'hidratos',
  fiber: 'fibra',
}

// A qué comida va lo que registras ahora mismo, si no dices otra cosa. Bandas
// horarias, no una hora exacta: lo que importa es "sobre esta hora come la
// gente", no el minuto. Arranca en las 04:00 porque ahí es donde el día
// alimentario arranca (`DAY_STARTS_AT_HOUR`), así que la madrugada tardía
// cuenta como el cierre del día anterior, no como un desayuno adelantado.
export function inferMealSlot(moment = new Date()) {
  const hour = moment.getHours()
  if (hour < 4) return 'snack'
  if (hour < 11) return 'desayuno'
  if (hour < 17) return 'comida'
  if (hour < 21) return 'snack'
  return 'cena'
}

// Cuánto de la barra de proteína pintar, en un [0, 100] que nunca se sale de
// la barra ni cuando te pasas del objetivo. `null` cuando no hay objetivo:
// una barra sin meta no mide nada, y dibujarla en 0 diría lo contrario.
export function proteinProgress(eaten, target) {
  if (target == null || target <= 0) return null
  return Math.max(0, Math.min(100, Math.round(((eaten ?? 0) / target) * 100)))
}

export function unknownNote(unknown = {}) {
  const missing = Object.keys(UNKNOWN_LABELS).filter((key) => (unknown[key] ?? 0) > 0)
  if (missing.length === 0) return null
  const parts = missing.map((key, index) => {
    const count = unknown[key]
    // El sustantivo sólo en el primero: "1 entrada sin kcal, 2 sin fibra".
    const noun = index === 0 ? (count === 1 ? ' entrada' : ' entradas') : ''
    return `${count}${noun} sin ${UNKNOWN_LABELS[key]}`
  })
  return `— no es cero: ${parts.join(', ')}.`
}

// Lo que la foto dijo y el backend no se creyó.
//
// Un campo vacío en el formulario se lee como «la etiqueta no lo declara», y
// aquí significa otra cosa: la etiqueta a lo mejor lo declara y la lectura no
// se sostenía. Sin esta línea el hueco miente por omisión.
//
// Con artículo en la tabla —«la fibra», «los hidratos»— por lo mismo que
// `UNKNOWN_LABELS` no lo lleva: allí se encadenan tras un número («2 sin
// fibra») y aquí van sueltos, donde el artículo hace falta y el género lo
// resuelve la propia tabla en vez de una regla.
const DROPPED_LABELS = {
  kcal: 'las kcal',
  protein: 'la proteína',
  fat: 'la grasa',
  carbs: 'los hidratos',
  fiber: 'la fibra',
}

export function droppedNote(dropped = []) {
  const named = dropped.map((key) => DROPPED_LABELS[key]).filter(Boolean)
  if (named.length === 0) return null
  const list =
    named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} y ${named.at(-1)}`
  const verb = named.length === 1 ? 'aparece' : 'aparecen'
  return `Descarté ${list}: no ${verb} en la tabla que leí.`
}
