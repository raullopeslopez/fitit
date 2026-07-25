import { describe, expect, it } from 'vitest'

import { showKg } from './units.js'

// The kg↔lb conversion this file used to cover is gone with the toggle. What's
// left is the rounding, which is a display decision and still worth pinning.
describe('showKg', () => {
  it('rounds to one decimal', () => {
    expect(showKg(61.2349)).toBe(61.2)
  })

  it('drops a trailing zero rather than printing 60.0', () => {
    expect(showKg(60)).toBe(60)
  })

  it('keeps bodyweight zero, which is a real logged value', () => {
    expect(showKg(0)).toBe(0)
  })

  it('passes through absent weights — cardio sets have none', () => {
    expect(showKg(null)).toBe(null)
    expect(showKg(undefined)).toBe(null)
  })
})
