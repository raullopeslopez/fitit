// Muscle groups + their categorical colors. Mirrors backend/app/muscles.py; the
// order is the validated colorblind-safe display sequence (see DESIGN.md).
export const MUSCLE_GROUPS = ['Pecho', 'Espalda', 'Pierna', 'Hombro', 'Bíceps', 'Tríceps', 'Core']

const SLUG = {
  Pecho: 'pecho',
  Espalda: 'espalda',
  Pierna: 'pierna',
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
