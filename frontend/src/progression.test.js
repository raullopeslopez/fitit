import { describe, expect, it } from 'vitest'

import { lastRir, nextTarget, rirToRpe, rpeToRir } from './progression.js'

describe('RIR stored as RPE', () => {
  // RPE on the RIR scale is 10 − RIR, so no column changes: the set keeps the
  // `rpe` it always had, and the one historic RPE still reads right.
  it('writes each chip as 10 − RIR', () => {
    expect([0, 1, 2, 3].map(rirToRpe)).toEqual([10, 9, 8, 7])
  })

  it('reads it back, folding everything easier into 3+', () => {
    expect(rpeToRir(10)).toBe(0)
    expect(rpeToRir(8)).toBe(2)
    expect(rpeToRir(7)).toBe(3)
    expect(rpeToRir(5)).toBe(3)
    expect(rpeToRir(8.5)).toBe(2)
    expect(rpeToRir(null)).toBeNull()
    expect(rpeToRir(undefined)).toBeNull()
  })
})

describe('the RIR a session ended on', () => {
  it('is the latest set that carries one', () => {
    const sets = [
      { set_index: 0, rpe: 7 },
      { set_index: 1, rpe: 9 },
      { set_index: 2, rpe: null },
    ]
    expect(lastRir(sets)).toBe(1)
  })

  it('is unknown when no set carries one', () => {
    expect(lastRir([{ set_index: 0, rpe: null }])).toBeNull()
    expect(lastRir([])).toBeNull()
    expect(lastRir(undefined)).toBeNull()
  })
})

describe('what to aim for today', () => {
  it('adds a rep on the same weight by default', () => {
    expect(nextTarget({ weight: 40, reps: 9 }, null)).toEqual({
      weight: 40,
      reps: 10,
      reason: 'rep',
    })
  })

  it('adds a rep after a set taken to failure too', () => {
    expect(nextTarget({ weight: 40, reps: 9 }, 0)).toMatchObject({ weight: 40, reps: 10 })
  })

  it('moves the weight up at the top of the range and drops back to 8', () => {
    expect(nextTarget({ weight: 40, reps: 12 }, 1)).toEqual({
      weight: 42.5,
      reps: 8,
      reason: 'top',
    })
  })

  it('moves the weight up straight away when 3 or more were left', () => {
    expect(nextTarget({ weight: 40, reps: 8 }, 3)).toEqual({
      weight: 42.5,
      reps: 8,
      reason: 'reserve',
    })
  })

  it('adds a rep to a set with no weight, whatever the RIR', () => {
    expect(nextTarget({ weight: null, reps: 10 }, 3)).toEqual({
      weight: null,
      reps: 11,
      reason: 'rep',
    })
  })

  it('has nothing to aim for without a previous set', () => {
    expect(nextTarget(null, null)).toBeNull()
  })
})
