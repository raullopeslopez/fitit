import { beforeEach, describe, expect, it } from 'vitest'

import { deloadWeeks, isDeload, toggleDeload } from './deload.js'

const MONDAY = '2026-07-20'

describe('marking a week as a deload', () => {
  beforeEach(() => localStorage.clear())

  it('starts with nothing marked', () => {
    expect(deloadWeeks()).toEqual([])
    expect(isDeload(MONDAY)).toBe(false)
  })

  it('marks and unmarks the same week', () => {
    expect(toggleDeload(MONDAY)).toEqual([MONDAY])
    expect(isDeload(MONDAY)).toBe(true)

    expect(toggleDeload(MONDAY)).toEqual([])
    expect(isDeload(MONDAY)).toBe(false)
  })

  it('keeps the other weeks it has been told about', () => {
    toggleDeload(MONDAY)
    toggleDeload('2026-06-01')
    expect(toggleDeload(MONDAY)).toEqual(['2026-06-01'])
    expect(isDeload('2026-06-01')).toBe(true)
  })

  it('survives a corrupt key instead of taking the screen down', () => {
    localStorage.setItem('fitit_deload_weeks', 'not json at all')
    expect(deloadWeeks()).toEqual([])
    expect(toggleDeload(MONDAY)).toEqual([MONDAY])
  })

  it('ignores entries that are not week stamps', () => {
    localStorage.setItem('fitit_deload_weeks', JSON.stringify([MONDAY, 7, null]))
    expect(deloadWeeks()).toEqual([MONDAY])
  })
})
