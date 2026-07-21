// Weight units. The API stores what you typed plus a canonical kilo value, and
// compares only the kilos; the UI renders those kilos in whichever unit you
// currently prefer. So flipping the toggle re-expresses your whole history
// instead of splitting it in two.
//
// Conversion never rounds — only display does. That way a set relabelled
// kg → lb → kg still reads as the number you originally entered.
export const LB_TO_KG = 0.45359237

export function toKg(weight, unit) {
  if (weight == null) return null
  return unit === 'lb' ? weight * LB_TO_KG : weight
}

export function fromKg(kg, unit) {
  if (kg == null) return null
  return unit === 'lb' ? kg / LB_TO_KG : kg
}

// A canonical kilo value as a number fit to put on screen: one decimal, and no
// trailing ".0" cluttering a readout that's meant to be scanned between sets.
export function displayWeight(kg, unit) {
  if (kg == null) return null
  return Math.round(fromKg(kg, unit) * 10) / 10
}
