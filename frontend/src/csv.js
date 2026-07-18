const HEADER = ['fecha', 'entreno', 'ejercicio', 'reps', 'peso', 'unidad', 'rpe', 'nota']

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
        rows.push(
          [
            day.date,
            workout.name,
            set.exercise_name,
            set.reps,
            set.weight,
            set.unit,
            set.rpe,
            set.note,
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
