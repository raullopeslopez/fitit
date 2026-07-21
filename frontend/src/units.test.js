import { describe, expect, it } from 'vitest'

import { displayWeight, fromKg, toKg } from './units.js'

describe('toKg / fromKg', () => {
  it('leaves kilos alone', () => {
    expect(toKg(60, 'kg')).toBe(60)
    expect(fromKg(60, 'kg')).toBe(60)
  })

  it('converts pounds to kilos', () => {
    expect(toKg(135, 'lb')).toBeCloseTo(61.235, 3)
  })

  it('round-trips a relabel without eroding the typed number', () => {
    expect(fromKg(toKg(135, 'lb'), 'lb')).toBeCloseTo(135, 6)
  })

  it('passes through absent weights — cardio sets have none', () => {
    expect(toKg(null, 'kg')).toBe(null)
    expect(fromKg(undefined, 'lb')).toBe(null)
  })

  it('keeps bodyweight zero, which is a real logged value', () => {
    expect(toKg(0, 'lb')).toBe(0)
  })
})

describe('displayWeight', () => {
  it('rounds to one decimal and drops a trailing zero', () => {
    expect(displayWeight(61.2349, 'kg')).toBe(61.2)
    expect(displayWeight(60, 'kg')).toBe(60)
  })

  it('shows a set logged in pounds as the number that was typed', () => {
    expect(displayWeight(toKg(135, 'lb'), 'lb')).toBe(135)
  })
})
