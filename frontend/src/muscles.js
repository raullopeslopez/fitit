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

// Lo que el reetiquetado acaba de hacer, contado en series.
//
// El grupo va en el ejercicio y no en la serie, así que cambiarlo recoloca de
// golpe todo lo que se ha registrado contra él — meses de totales por músculo,
// los colores del mapa de calor, las barras del resumen del periodo. Nada de
// eso está en la pantalla donde vive el desplegable, así que la cifra hay que
// decirla en voz alta.
//
// ── Y se dice después, no antes ───────────────────────────────────────────
// Esta frase era el cuerpo de un diálogo modal que había que atravesar para
// cambiar una etiqueta. El reetiquetado es el único acto **reversible** del
// editor, y era el único que llevaba confirmación *y* deshacer, mientras
// fusionar y vaciar la nota —irreversible el primero, sin vuelta el segundo—
// no llevaban ninguna de las dos cosas. La ceremonia de la app iba en
// proporción inversa al daño.
//
// Ordenado: lo reversible pasa y se puede desandar, lo irreversible se para y
// se explica. Así que la cifra se conserva entera y se muda a la fila que
// ofrece la vuelta, que además es donde está el control que la desanda.
//
// Cero no se imprime: «0 series ya cuentan como Hombro» se lee como que el
// cambio no ha hecho nada, y sí lo ha hecho — lo que pasa es que este
// ejercicio todavía no tiene historia que mover.
export function retagDone(setCount, group) {
  if (!setCount) {
    return group ? `Ahora cuenta como ${group}.` : `Ahora está en ${UNGROUPED}.`
  }
  const sets = plural(setCount, 'serie', 'series')
  return group
    ? `Sus ${sets} ya cuentan como ${group}.`
    : `Sus ${sets} ya no cuentan en ningún grupo.`
}
