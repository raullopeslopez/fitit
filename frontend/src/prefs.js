// Sticky user preferences (localStorage). The weight unit is a choice you make
// once, not a per-set decision — so it lives here, not on every card.
const WEIGHT_UNIT_KEY = 'fitit_weight_unit'

export function getWeightUnit() {
  return localStorage.getItem(WEIGHT_UNIT_KEY) === 'lb' ? 'lb' : 'kg'
}

export function setWeightUnit(unit) {
  localStorage.setItem(WEIGHT_UNIT_KEY, unit === 'lb' ? 'lb' : 'kg')
}

const DISTANCE_UNIT_KEY = 'fitit_distance_unit'

export function getDistanceUnit() {
  return localStorage.getItem(DISTANCE_UNIT_KEY) === 'mi' ? 'mi' : 'km'
}

export function setDistanceUnit(unit) {
  localStorage.setItem(DISTANCE_UNIT_KEY, unit === 'mi' ? 'mi' : 'km')
}
