import { Health } from '@capgo/capacitor-health'

import { isNative } from './native.js'

// Health Connect, el almacén de salud de Android: de ahí salen los pasos que
// cuenta el teléfono (o el reloj), y ahí va el peso que tecleas en Fitit para
// que lo vean las demás apps. Sólo en el APK; en la web no existe y todo esto
// es un no-op.
//
// Lo que se pide es lo mínimo: **leer pasos** y **escribir peso**. Ni leer el
// peso (lo tecleado manda, y una báscula que escribiera en Health Connect lo
// pisaría), ni ningún otro dato.

const ACCESS = { read: ['steps'], write: ['weight'] }

// ¿Hay Health Connect al que hablar? Sólo puede haberlo dentro del APK.
export function healthSupported() {
  return isNative()
}

async function available() {
  if (!isNative()) return false
  try {
    const { available } = await Health.isAvailable()
    return !!available
  } catch {
    return false
  }
}

// Pide el permiso la primera vez; las siguientes, Health Connect contesta sin
// enseñar nada. `false` si no está instalado o si dijiste que no.
export async function ensureHealthAccess() {
  if (!(await available())) return false
  try {
    const status = await Health.requestAuthorization(ACCESS)
    return !!status?.readAuthorized?.includes('steps')
  } catch {
    return false
  }
}

function isoDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

// Los pasos de los últimos `days` días, uno por día civil del teléfono (no hay
// corte de las 04:00: eso es del diario de comida). Un día sin pasos **no
// sale**: Health Connect agrega un día vacío como 0, y un 0 que nadie midió no
// es un 0 (CLAUDE.md, «NULL no es 0»). Un día de cero pasos de verdad se pierde
// con él, y es el lado bueno de equivocarse.
export async function readDailySteps(days = 30, now = new Date()) {
  const end = new Date(now)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1))
  const { samples } = await Health.queryAggregated({
    dataType: 'steps',
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    bucket: 'day',
    aggregation: 'sum',
  })
  return (samples ?? [])
    .map((sample) => ({ date: isoDay(new Date(sample.startDate)), steps: Math.round(sample.value) }))
    .filter((day) => day.steps > 0)
}

// El peso que acabas de teclear, también en Health Connect. Fitit guarda uno por
// día y reescribe el del día si te vuelves a pesar; Health Connect, a través de
// este plugin, sólo sabe añadir: una corrección el mismo día deja allí las dos
// pesadas, y las demás apps suelen quedarse con la última.
export async function saveWeightToHealth(kg, when = new Date()) {
  if (!(await available())) return
  try {
    await Health.saveSample({
      dataType: 'weight',
      value: kg,
      unit: 'kilogram',
      startDate: when.toISOString(),
      endDate: when.toISOString(),
    })
  } catch {
    // Sin permiso o sin Health Connect: el peso ya está en Fitit, que es lo
    // que importa. No hay nada que contar.
  }
}
