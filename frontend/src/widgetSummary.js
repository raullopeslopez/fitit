import { nativeSession, session } from './platform/session.js'

// Lo que el widget de Android enseña cuando no hay entreno en curso (DESIGN.md,
// «Sin entreno — dos pantallas»): el último entreno, y los pasos de hoy frente
// al objetivo con la media de la semana. El nativo no sabe leer nada de eso —ni
// el diario ni Health Connect—, así que se lo da la app cada vez que lo tiene en
// la mano, pieza a pieza: Días al cargar la lista, la lectura de pasos al
// terminar, Objetivo al guardar. El nativo junta cada pieza con lo que ya tenía.
//
// Lado nativo: SessionPlugin.summary → SessionStore.mergeSummary.

// Cuántos grupos nombra la línea «Último: hace 2 días · Cuádriceps, Glúteo».
const MAX_GROUPS = 2
const CARDIO = 'Cardio'

function isoDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

// El día más reciente con alguna serie (`days` llega del más nuevo al más
// viejo, como lo da /days), con sus grupos de más a menos series. Un entreno de
// hoy abierto y vacío no es el último: aún no se ha hecho nada en él. Lo que no
// tiene grupo no se nombra; el cardio se llama Cardio, como en Días.
export function lastWorkoutOf(days) {
  for (const day of days ?? []) {
    const sets = day.workouts.flatMap((w) => w.sets)
    if (sets.length === 0) continue
    const counts = new Map()
    for (const set of sets) {
      const group = set.kind === 'cardio' ? CARDIO : set.muscle_group
      if (group) counts.set(group, (counts.get(group) ?? 0) + 1)
    }
    const groups = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_GROUPS)
      .map(([group]) => group)
    return { date: day.date, groups }
  }
  return null
}

// Los pasos de hoy y la media de los siete días de antes, de lo que devuelve
// `readDailySteps` (un día civil del teléfono por fila). Hoy no entra en la
// media porque está a medias: por la mañana la hundiría. Un día sin dato no es
// un día de cero pasos (CLAUDE.md, «NULL no es 0»): la media es de los días que
// tienen cifra, y sin ninguno es null.
export function stepsSummary(days, now = new Date()) {
  const today = isoDay(now)
  const week = new Set(
    Array.from({ length: 7 }, (_, i) =>
      isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1 - i)),
    ),
  )
  const byDate = new Map((days ?? []).map((day) => [day.date, day.steps]))
  const past = [...byDate.entries()].filter(([date]) => week.has(date)).map(([, steps]) => steps)
  return {
    date: today,
    today: byDate.get(today) ?? null,
    weekAverage: past.length ? Math.round(past.reduce((a, b) => a + b, 0) / past.length) : null,
  }
}

// El widget es un extra: si el puente falla, la app sigue como si nada.
function publish(part) {
  if (!nativeSession()) return Promise.resolve()
  return Promise.resolve(session.summary(part))
    .then(() => undefined)
    .catch(() => undefined)
}

export function publishLastWorkout(days) {
  return publish({ lastWorkout: lastWorkoutOf(days) })
}

// La fecha va dentro: el nativo no enseña como «de hoy» unos pasos de ayer.
export function publishSteps(days, now = new Date()) {
  return publish({ steps: stepsSummary(days, now) })
}

// Sin objetivo (null) no hay barra ni «/ 10.000».
export function publishStepsGoal(goal) {
  return publish({ stepsGoal: goal ?? null })
}
