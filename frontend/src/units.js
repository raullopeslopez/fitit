// Weights are kilos. There is no other unit, so there is nothing to convert —
// what remains is the display rule: one decimal, and no trailing ".0" cluttering
// a readout meant to be scanned between sets.
export function showKg(kg) {
  if (kg == null) return null
  return Math.round(kg * 10) / 10
}
