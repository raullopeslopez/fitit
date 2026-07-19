import { formatDuration } from './format.js'

const HEADER = [
  'fecha',
  'entreno',
  'ejercicio',
  'reps',
  'peso',
  'unidad',
  'rpe',
  'nota',
  'duración',
  'distancia',
  'unidad_dist',
]

function escape(value) {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Flatten days -> workouts -> sets into one CSV row per set.
export function toCsv(days) {
  const rows = [HEADER.join(',')]
  for (const day of days) {
    for (const workout of day.workouts) {
      for (const set of workout.sets) {
        const isCardio = set.kind === 'cardio'
        rows.push(
          [
            day.date,
            workout.name,
            set.exercise_name,
            set.reps,
            set.weight,
            isCardio ? '' : set.unit, // weight unit is meaningless for cardio
            set.rpe,
            set.note,
            set.duration_seconds != null ? formatDuration(set.duration_seconds) : '',
            set.distance,
            set.distance_unit,
          ]
            .map(escape)
            .join(','),
        )
      }
    }
  }
  return rows.join('\n')
}

export function downloadCsv(days, filename = 'fitit.csv') {
  const blob = new Blob([toCsv(days)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
