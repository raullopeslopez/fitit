// Sticky user preferences (localStorage). The weight unit is a choice you make
// once, not a per-set decision — so it lives here, not on every card.
const WEIGHT_UNIT_KEY = 'fitit_weight_unit'

export function getWeightUnit() {
  return localStorage.getItem(WEIGHT_UNIT_KEY) === 'lb' ? 'lb' : 'kg'
}

export function setWeightUnit(unit) {
  localStorage.setItem(WEIGHT_UNIT_KEY, unit === 'lb' ? 'lb' : 'kg')
}
