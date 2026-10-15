// Días con un año dentro. La lista plana pedía bajar entreno a entreno para
// llegar a junio, y cada fila pesaba lo mismo que la de ayer. Aquí se decide
// cuánto detalle merece cada tramo, de más reciente a más antiguo:
//
//   - entera: esta semana, la anterior y la de tu último entreno (aunque sea
//     vieja, para que «Repetir» siga costando un toque);
//   - una fila por semana: el resto del mes en curso y del anterior, con las
//     semanas vacías incluidas, porque un hueco también es historial;
//   - una fila por mes: lo anterior de este año;
//   - una fila por año: los años pasados.
//
// Una semana es del mes de su jueves, como en el calendario ISO: la del 28 de
// septiembre al 4 de octubre es de octubre.

import { formatRange, formatWeekLabel, isoWeekStart } from './format.js'
import { MUSCLE_GROUPS, UNGROUPED } from './muscles.js'

// El cardio no tiene grupo muscular por diseño; cuenta en sus series y tiene su
// propia casilla de día, pero ninguna celda de músculo.
export const CARDIO = 'Cardio'

// El orden canónico, para desempatar sin que dos grupos con las mismas series
// se intercambien entre renders.
export const PART_ORDER = [...MUSCLE_GROUPS, CARDIO, UNGROUPED]

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate(),
  ).padStart(2, '0')}`
}

const monthOfWeek = (weekKey) => addDays(weekKey, 3).slice(0, 7)

function previousMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

const setsOf = (days) =>
  days.reduce((n, day) => n + day.workouts.reduce((k, w) => k + w.sets.length, 0), 0)
const sessionsOf = (days) => days.reduce((n, day) => n + day.workouts.length, 0)

// Series por músculo. Sólo músculos: es lo que pintan las celdas.
export function muscleCounts(sets) {
  const counts = {}
  for (const set of sets) {
    if (set.kind === 'cardio' || !MUSCLE_GROUPS.includes(set.muscle_group)) continue
    counts[set.muscle_group] = (counts[set.muscle_group] || 0) + 1
  }
  return counts
}

// El nombre de un entreno al que nadie se lo puso: los dos músculos con más
// series («Pecho · Tríceps»). No se guarda —es una lectura de las series, y
// cambia con ellas—; `null` cuando no hay ningún músculo que nombrar.
export function autoWorkoutName(sets) {
  const counts = muscleCounts(sets)
  // `sort` es estable: un empate conserva el orden de MUSCLE_GROUPS.
  const top = MUSCLE_GROUPS.filter((g) => counts[g]).sort((a, b) => counts[b] - counts[a])
  return top.length ? top.slice(0, 2).join(' · ') : null
}

const allSets = (days) => days.flatMap((day) => day.workouts.flatMap((w) => w.sets))

// El grupo que más series se llevó en un día, con cardio y sin grupo incluidos:
// una casilla dice qué fue ese día, no sólo si hubo músculo.
function mainPart(day) {
  const counts = {}
  for (const set of allSets([day])) {
    const key = set.kind === 'cardio' ? CARDIO : (set.muscle_group ?? UNGROUPED)
    counts[key] = (counts[key] || 0) + 1
  }
  const keys = PART_ORDER.filter((k) => counts[k])
  if (keys.length === 0) return null
  return keys.reduce((best, k) => (counts[k] > counts[best] ? k : best))
}

function weekOf(key, days) {
  const ticks = Array.from({ length: 7 }, (_, i) => {
    const day = days.find((d) => d.date === addDays(key, i))
    return day ? mainPart(day) : null
  })
  return {
    key,
    range: formatRange(key, addDays(key, 6)).toUpperCase(),
    days,
    sets: setsOf(days),
    sessions: sessionsOf(days),
    muscles: muscleCounts(allSets(days)),
    ticks,
  }
}

export function buildHistory(days, todayIso) {
  const [ty, tm, td] = todayIso.split('-').map(Number)
  const today = new Date(ty, tm - 1, td)
  const current = isoWeekStart(todayIso)
  const previous = addDays(current, -7)

  const byWeek = new Map()
  for (const day of days) {
    const key = isoWeekStart(day.date)
    if (!byWeek.has(key)) byWeek.set(key, [])
    byWeek.get(key).push(day)
  }
  const weekDays = (key) => byWeek.get(key) ?? []

  const latest = days.length ? isoWeekStart(days[0].date) : null
  const detailedKeys = new Set([current])
  if (byWeek.has(previous)) detailedKeys.add(previous)
  if (latest) detailedKeys.add(latest)
  const detailed = [...detailedKeys]
    .sort()
    .reverse()
    .map((key) => ({ ...weekOf(key, weekDays(key)), label: formatWeekLabel(key, today) }))

  if (days.length === 0) return { detailed, months: [], years: [] }

  // Todas las semanas de calendario entre la primera registrada y la anterior a
  // esta, menos las que ya van enteras arriba.
  const oldest = isoWeekStart(days[days.length - 1].date)
  const keys = []
  for (let key = previous; key >= oldest; key = addDays(key, -7)) {
    if (!detailedKeys.has(key)) keys.push(key)
  }

  const thisMonth = todayIso.slice(0, 7)
  const openFrom = previousMonth(thisMonth)
  const months = []
  for (const key of keys) {
    const monthKey = monthOfWeek(key)
    let month = months[months.length - 1]
    if (!month || month.key !== monthKey) {
      const [y, m] = monthKey.split('-').map(Number)
      month = {
        key: monthKey,
        label: y === ty ? MESES[m - 1] : `${MESES[m - 1]} ${y}`,
        name: MESES[m - 1],
        open: monthKey >= openFrom,
        weeks: [],
        sessions: 0,
        sets: 0,
      }
      months.push(month)
    }
    const week = weekOf(key, weekDays(key))
    month.weeks.push(week)
    month.sessions += week.sessions
    month.sets += week.sets
  }

  // Un mes abierto del año pasado (enero mira a diciembre) se queda abierto y
  // con su año en el nombre; el resto de otros años se pliega en su año.
  const years = []
  const kept = []
  for (const month of months) {
    if (month.open || month.key.slice(0, 4) === String(ty)) {
      kept.push(month)
      continue
    }
    const yearKey = month.key.slice(0, 4)
    let year = years[years.length - 1]
    if (!year || year.key !== yearKey) {
      year = { key: yearKey, label: yearKey, months: [], sessions: 0, sets: 0 }
      years.push(year)
    }
    year.months.push({ ...month, label: month.name })
    year.sessions += month.sessions
    year.sets += month.sets
  }

  return { detailed, months: kept, years }
}
