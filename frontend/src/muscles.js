// Muscle groups + their categorical colors. Mirrors backend/app/muscles.py; the
// order is the validated colorblind-safe display sequence (see DESIGN.md).
export const MUSCLE_GROUPS = [
  'Pecho',
  'Espalda',
  'Cuádriceps',
  'Femoral',
  'Gemelo',
  'Hombro',
  'Bíceps',
  'Tríceps',
  'Core',
]

const SLUG = {
  Pecho: 'pecho',
  Espalda: 'espalda',
  Cuádriceps: 'cuadriceps',
  Femoral: 'femoral',
  Gemelo: 'gemelo',
  Hombro: 'hombro',
  Bíceps: 'biceps',
  Tríceps: 'triceps',
  Core: 'core',
}

// The CSS custom property for a group's color; muted for unknown/ungrouped so
// color is never the sole cue (the chip/label text always names the muscle).
export function muscleColor(group) {
  const slug = SLUG[group]
  return slug ? `var(--m-${slug})` : 'var(--muted)'
}

// What an exercise with no group is called, everywhere it is named: the empty
// option of the corrector, and the Progreso chip that makes those exercises
// reachable at all. It doubles as the selected-filter value there — safe as a
// sentinel because the backend only accepts the nine real groups, so no
// exercise can ever hold this as its actual muscle_group.
export const UNGROUPED = 'Sin grupo'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// What re-tagging is about to do, counted in sets.
//
// The group is stored on the exercise, not on the set, so changing it re-buckets
// every set ever logged against it at once — months of per-muscle totals, the
// heatmap's colours, the period summary's bars. None of that is on the screen
// the select sits on, so the number has to be said out loud before it moves.
// Same reasoning as the delete dialog, minus the irreversibility: this one is
// undoable, which is why the sentence doesn't threaten.
export function retagWarning(setCount, group) {
  const sets = plural(setCount, 'serie ya registrada', 'series ya registradas')
  return group
    ? `Sus ${sets} pasarán a contar como ${group}, en el historial y en los resúmenes por músculo.`
    : `Sus ${sets} dejarán de contar en ningún grupo, y desaparecerán de los resúmenes por músculo.`
}
