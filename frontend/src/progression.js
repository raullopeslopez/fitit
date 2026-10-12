// ── Qué toca hoy ─────────────────────────────────────────────────────────
// La marca de la última vez dice dónde estabas; esto dice el paso siguiente.
// La evidencia no premia una vía concreta: subir reps con el peso fijo y subir
// peso con las reps fijas dan fuerza e hipertrofia parecidas (Plotkin et al.
// 2022, PeerJ 10.7717/peerj.14142). Lo que manda es superar la sesión anterior
// y acercarse al fallo (Robinson et al. 2024, Sports Med 54:2209). Así que la
// regla es la progresión doble, que es la forma más sencilla de hacer las dos
// cosas, más una sola lectura del RIR: si te sobraron 3 o más, el peso era
// corto y sube ya, sin esperar a llegar al tope de reps. Esa lectura es la
// autorregulación que el metaanálisis de Zhang et al. 2021 pone por delante de
// la carga fija, reducida a lo único que cambia la decisión.
//
// Los números son opinables y están aquí para que se vean: tope 12, vuelta a
// 8, salto de 2,5 kg. Ninguna prueba fija esos tres; fijan que haya un tope.

const TOP_REPS = 12
const RESET_REPS = 8
const STEP_KG = 2.5
const RESERVE_BUMP = 3

// ── El RIR se guarda como RPE ────────────────────────────────────────────
// En la escala de RPE basada en RIR, RPE = 10 − RIR. La columna `rpe` ya
// existe, la API la acepta al crear y al corregir, y el único RPE que alguien
// escribió a mano sigue leyéndose bien. El chip `3+` se guarda como 7: pierde
// la diferencia entre 3 y 5 en reserva, que la regla de arriba no distingue.
export function rirToRpe(rir) {
  return 10 - rir
}

export function rpeToRir(rpe) {
  if (rpe == null) return null
  return Math.min(RESERVE_BUMP, Math.max(0, Math.round(10 - rpe)))
}

// La última serie de la sesión que lo lleva: es la que dice cómo acabaste.
export function lastRir(sets) {
  if (!sets?.length) return null
  const rated = sets.filter((s) => s.rpe != null)
  if (!rated.length) return null
  const last = rated.reduce((a, b) => ((b.set_index ?? 0) >= (a.set_index ?? 0) ? b : a))
  return rpeToRir(last.rpe)
}

// `top` es la serie de referencia de la última vez; `rir`, cómo acabó aquella
// sesión (o null). Sin peso no hay nada que subir más que reps.
export function nextTarget(top, rir) {
  if (!top || top.reps == null) return null
  if (top.weight == null) return { weight: null, reps: top.reps + 1, reason: 'rep' }
  if (top.reps >= TOP_REPS) {
    return { weight: top.weight + STEP_KG, reps: RESET_REPS, reason: 'top' }
  }
  if (rir != null && rir >= RESERVE_BUMP) {
    return { weight: top.weight + STEP_KG, reps: top.reps, reason: 'reserve' }
  }
  return { weight: top.weight, reps: top.reps + 1, reason: 'rep' }
}

// ── El objetivo es de la sesión ──────────────────────────────────────────
// Se bate una vez. Seguir pidiéndolo después es pedir algo que ya hiciste, y
// subirlo dentro del mismo entreno sería pedir una marca que el cansancio casi
// nunca deja: la progresión va de una sesión a la siguiente. Devuelve el número
// (desde 1) de la primera serie de hoy que lo iguala o lo supera, o null. Más
// peso cuenta aunque haga menos reps; sin peso, sólo cuentan las reps.
export function beatenAt(target, sets) {
  if (!target || !sets?.length) return null
  const index = sets.findIndex((s) => {
    if (s.reps == null) return false
    if (target.weight == null) return s.weight == null && s.reps >= target.reps
    if (s.weight == null) return false
    return s.weight > target.weight || (s.weight === target.weight && s.reps >= target.reps)
  })
  return index === -1 ? null : index + 1
}

// La serie más alta de una lista: más peso, y a igual peso más reps. Sin peso
// (dominadas, fondos), las más reps.
export function topSet(sets) {
  const lifts = (sets ?? []).filter((s) => s.reps != null)
  const weighted = lifts.filter((s) => s.weight != null)
  const pool = weighted.length ? weighted : lifts
  const best = pool.reduce((top, s) => {
    if (top == null) return s
    if (s.weight != null && s.weight !== top.weight) return s.weight > top.weight ? s : top
    return s.reps > top.reps ? s : top
  }, null)
  return best ? { weight: best.weight ?? null, reps: best.reps } : null
}

// «Terminado»: hoy ya llevas tantas series como la última vez. Devuelve cómo
// se dice («3 series, como la última vez») o null si todavía no. No cierra
// nada: sólo decide qué es lo principal en pantalla. Sin última vez no hay
// con qué medir, y nunca termina.
export function doneSummary(previous, sets) {
  const before = previous?.found ? previous.sets.filter((s) => s.reps != null).length : 0
  const today = (sets ?? []).filter((s) => s.reps != null).length
  if (before === 0 || today < before) return null
  const n = `${today} ${today === 1 ? 'serie' : 'series'}`
  const more = today - before
  if (more === 0) return `${n}, como la última vez`
  return `${n}, ${more === 1 ? 'una' : more} más que la última vez`
}
