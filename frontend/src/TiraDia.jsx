/**
 * La tira del día: las cuatro comidas del plan de un vistazo.
 *
 * Fase 3 de la épica de cuatro comidas (2026-10-18). El ancho de cada columna
 * son sus kcal y, dentro, de qué salen: proteína, hidrato y grasa apilados por
 * lo que aportan (4, 4 y 9 kcal por gramo). Lo ya comido se apaga, y la única
 * cifra es la que cambia: el hidrato que el entreno movió de una comida a otra.
 * Sin entreno, la tira son formas — mientras comes lo previsto, Hoy no enseña
 * números (DESIGN.md → Comida v4).
 */

const ORDEN = ['desayuno', 'comida', 'snack', 'cena']
const CORTO = { desayuno: 'DES', comida: 'COM', snack: 'MER', cena: 'CENA' }
const LARGO = { desayuno: 'desayuno', comida: 'comida', snack: 'merienda', cena: 'cena' }
const BANDAS = [
  { key: 'protein', clase: 'is-p', kcal: 4 },
  { key: 'carbs', clase: 'is-h', kcal: 4 },
  { key: 'fat', clase: 'is-g', kcal: 9 },
]

// Con el menos tipográfico (U+2212), como el resto de cifras con signo.
function gramos(cambio) {
  return `${cambio > 0 ? '+' : '−'}${Math.round(Math.abs(cambio))} g`
}

function descripcion(filas) {
  return `Hidrato del día: ${filas
    .map((f) => {
      const partes = [`${LARGO[f.slot]} ${Math.round(f.carbs)} g`]
      if (f.status != null) partes.push('comido')
      if (f.carbs_shift) partes.push(`${gramos(f.carbs_shift)} por el entreno`)
      return partes.join(', ')
    })
    .join('; ')}`
}

export function TiraDia({ entradas }) {
  const filas = ORDEN.map((slot) => entradas?.[slot]).filter(Boolean)
  // `null` no es cero: sin la cifra de un macro no hay proporción que dibujar,
  // y una banda inventada diría algo que nadie ha medido.
  if (!filas.length || filas.some((f) => BANDAS.some((b) => f[b.key] == null))) return null

  return (
    <div className="tira-dia" role="img" aria-label={descripcion(filas)}>
      {filas.map((f) => {
        const kcal = BANDAS.map((b) => f[b.key] * b.kcal)
        const total = kcal.reduce((a, b) => a + b, 0)
        return (
          <div
            key={f.slot}
            className={`tira-col${f.status != null ? ' is-hecha' : ''}`}
            style={{ flexGrow: total || 1 }}
          >
            <div className="tira-cab">
              <span className="tira-nombre">{CORTO[f.slot]}</span>
              {f.carbs_shift ? (
                <span className={`tira-delta${f.carbs_shift > 0 ? ' is-gana' : ''}`}>{gramos(f.carbs_shift)}</span>
              ) : null}
            </div>
            <div className="tira-bandas">
              {BANDAS.map((b, j) =>
                kcal[j] > 0 ? <span key={b.key} className={`tira-banda ${b.clase}`} style={{ flexGrow: kcal[j] }} /> : null,
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Lo apuntado hoy que no es el plan: lo que hace volver las cifras.
//
// Dentro del plan es lo de una comida que dijiste comida, con su plato —o una
// comida fuera reservada y confirmada—. Todo lo demás está fuera: lo apuntado
// aparte, lo de una comida que el plan no tiene, y lo de una que aún no has
// dicho, porque eso no lo ha puesto el plan sino tú.
export function fueraDelPlan(entries, planHoy) {
  return (entries ?? []).filter((e) => {
    const fila = planHoy?.[e.meal_slot]
    if (!fila) return true
    if (fila.status === 'out') return false
    return !(fila.status === 'done' && e.dish_id === fila.dish_id)
  })
}
