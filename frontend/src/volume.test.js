import { describe, expect, it } from 'vitest'
import { MUSCLE_GROUPS } from './muscles.js'
import {
  BANDS,
  bandFor,
  bandPosition,
  bandState,
  effectiveBand,
  MEV_AT,
  MRV_AT,
} from './volume.js'

describe('BANDS', () => {
  it('carries one band per muscle group, and no group the app cannot draw', () => {
    expect(Object.keys(BANDS).sort()).toEqual([...MUSCLE_GROUPS].sort())
  })

  it('is ordered mv ≤ mev < mrv everywhere', () => {
    for (const group of MUSCLE_GROUPS) {
      const { mv, mev, mrv } = BANDS[group]
      expect(mv, group).toBeLessThanOrEqual(mev)
      expect(mev, group).toBeLessThan(mrv)
    }
  })

  it('is per-muscle, not one flat reference wearing nine names', () => {
    // The whole point of the piece: 10 sets of calves and 10 of back are
    // different news. If every band collapsed to the same pair of numbers the
    // screen would be back to the flat 10–20 it replaced.
    expect(new Set(MUSCLE_GROUPS.map((g) => BANDS[g].mev)).size).toBeGreaterThan(3)
    expect(new Set(MUSCLE_GROUPS.map((g) => BANDS[g].mrv)).size).toBeGreaterThan(3)
  })
})

describe('bandFor', () => {
  it('returns the landmarks for a known group', () => {
    expect(bandFor('Pecho')).toEqual({ mv: 4, mev: 6, mrv: 20 })
  })

  it('returns null for anything the taxonomy does not know', () => {
    expect(bandFor('Antebrazo')).toBeNull()
    expect(bandFor('Sin grupo')).toBeNull()
    expect(bandFor(undefined)).toBeNull()
    expect(bandFor(null)).toBeNull()
  })
})

describe('bandState', () => {
  it('calls a shortfall bajo and says how many sets are missing', () => {
    expect(bandState('Pecho', 3)).toEqual({
      state: 'bajo',
      gap: 3,
      band: bandFor('Pecho'),
      direct: 3,
    })
  })

  it('counts the gap in the same fractional unit the rows print', () => {
    // setsInWindow gives a secondary muscle half a set, so a row's number is
    // routinely a .5 — the gap has to be able to say so.
    expect(bandState('Tríceps', 5.5)).toMatchObject({ state: 'bajo', gap: 0.5 })
  })

  it('never reports a bajo with a zero gap', () => {
    // Rounded to one decimal a hair under MEV would print "+0 al mínimo",
    // which reads as "you are there" on the one row that is not.
    expect(bandState('Pecho', 5.97)).toMatchObject({ state: 'bajo', gap: 0.1 })
  })

  it('calls MEV itself en zona — the minimum is inside the band, not below it', () => {
    expect(bandState('Pecho', 6)).toEqual({
      state: 'zona',
      gap: 0,
      band: bandFor('Pecho'),
      direct: 6,
    })
  })

  it('calls MRV itself en zona and only past it sobre', () => {
    expect(bandState('Pecho', 20)).toMatchObject({ state: 'zona', gap: 0 })
    expect(bandState('Pecho', 20.5)).toMatchObject({ state: 'sobre', gap: 0 })
  })

  it('has no state for a group with no band', () => {
    expect(bandState('Sin grupo', 12)).toEqual({
      state: 'sin-banda',
      gap: 0,
      band: null,
      direct: 0,
    })
  })

  it('reads zero sets of core as inside the band, because RP puts its MEV at zero', () => {
    // Documented consequence, not an oversight: abs need no direct work to be
    // maintained or to grow slowly, so the Core row can never be "bajo".
    expect(BANDS.Core.mev).toBe(0)
    expect(bandState('Core', 0)).toMatchObject({ state: 'zona', gap: 0 })
  })

  it('gives every group all three states somewhere on its own scale', () => {
    for (const group of MUSCLE_GROUPS) {
      const { mev, mrv } = BANDS[group]
      if (mev > 0) expect(bandState(group, 0).state, group).toBe('bajo')
      expect(bandState(group, (mev + mrv) / 2).state, group).toBe('zona')
      expect(bandState(group, mrv + 1).state, group).toBe('sobre')
    }
  })
})

describe('bandPosition', () => {
  it('puts MEV at the same place on every row', () => {
    // This is the contract that lets nine rows with nine different bands be
    // compared without reading a single number.
    for (const group of MUSCLE_GROUPS) {
      expect(bandPosition(group, BANDS[group].mev), group).toBeCloseTo(MEV_AT, 10)
    }
  })

  it('puts MRV at the same place on every row', () => {
    for (const group of MUSCLE_GROUPS) {
      expect(bandPosition(group, BANDS[group].mrv), group).toBeCloseTo(MRV_AT, 10)
    }
  })

  it('anchors the zone on a fixed sub-range of the track', () => {
    expect(MEV_AT).toBeGreaterThan(0)
    expect(MEV_AT).toBeLessThan(MRV_AT)
    expect(MRV_AT).toBeLessThan(1)
    // The tail past MRV is the smallest of the three segments: it is unbounded,
    // and over the zone is a position rather than an error.
    expect(1 - MRV_AT).toBeLessThan(MRV_AT - MEV_AT)
    expect(1 - MRV_AT).toBeLessThan(MEV_AT)
  })

  it('starts empty at zero sets', () => {
    expect(bandPosition('Pecho', 0)).toBe(0)
    expect(bandPosition('Espalda', 0)).toBe(0)
  })

  it('starts at the MEV mark when MEV is zero — zero sets already meets it', () => {
    expect(bandPosition('Core', 0)).toBeCloseTo(MEV_AT, 10)
  })

  it('runs the approach to MEV proportionally', () => {
    expect(bandPosition('Pecho', 3)).toBeCloseTo(MEV_AT / 2, 10)
  })

  it('runs the zone proportionally between the two marks', () => {
    const { mev, mrv } = BANDS.Pecho
    expect(bandPosition('Pecho', (mev + mrv) / 2)).toBeCloseTo((MEV_AT + MRV_AT) / 2, 10)
  })

  it('fills the tail one zone-width past MRV and then stops', () => {
    const { mev, mrv } = BANDS.Pecho
    expect(bandPosition('Pecho', mrv + (mrv - mev))).toBe(1)
    expect(bandPosition('Pecho', 500)).toBe(1)
  })

  it('never leaves 0..1, whatever it is handed', () => {
    for (const group of MUSCLE_GROUPS) {
      for (const sets of [-5, 0, 0.5, 7, 21, 60, 1000]) {
        const p = bandPosition(group, sets)
        expect(p, `${group} ${sets}`).toBeGreaterThanOrEqual(0)
        expect(p, `${group} ${sets}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('never goes backwards as sets go up', () => {
    for (const group of MUSCLE_GROUPS) {
      let last = -1
      for (let sets = 0; sets <= 60; sets += 0.5) {
        const p = bandPosition(group, sets)
        expect(p, `${group} ${sets}`).toBeGreaterThanOrEqual(last)
        last = p
      }
    }
  })

  it('draws nothing for a group with no band', () => {
    expect(bandPosition('Sin grupo', 12)).toBe(0)
    expect(bandPosition(null, 12)).toBe(0)
  })
})

// Indirect volume: the correction that made the model survive real data. Before
// it, three of the user's nine rows reported "sobre" every week off half-sets
// collected from other lifts — see the block at the top of volume.js.
describe('indirect volume', () => {
  it('judges direct work, not the printed total', () => {
    // The real case: 16 direct bicep sets plus 13.5 collected from rows and
    // pulldowns. The total clears an MRV of 20; the direct work does not.
    expect(bandState('Bíceps', 29.5, 13.5).state).toBe('zona')
    expect(bandState('Bíceps', 29.5, 13.5).direct).toBe(16)
    expect(bandState('Bíceps', 29.5, 0).state).toBe('sobre')
  })

  it('still calls a genuine excess a genuine excess', () => {
    // Pecho is never anybody's secondary, so its number is direct work whole.
    expect(bandState('Pecho', 24, 0).state).toBe('sobre')
  })

  it('counts the gap in direct sets, the only kind you can decide to add', () => {
    // 6 of the 8 on this row came from pulling. The advice is 6 curls, not 2.
    const { state, gap } = bandState('Bíceps', 8, 6)
    expect(state).toBe('bajo')
    expect(gap).toBe(6)
  })

  it('leaves a row of pure indirect volume at the foot of its runway', () => {
    // Pressing does not move you toward a direct triceps minimum, so the fill
    // must not claim it does.
    expect(bandPosition('Tríceps', 8, 8)).toBe(0)
    expect(bandState('Tríceps', 8, 8).state).toBe('bajo')
  })

  it('defaults to treating everything as direct, so old callers are unchanged', () => {
    expect(bandState('Espalda', 12)).toEqual(bandState('Espalda', 12, 0))
    expect(bandPosition('Espalda', 12)).toBe(bandPosition('Espalda', 12, 0))
  })

  it('ignores a negative or impossible indirect count', () => {
    expect(bandState('Pecho', 10, -5).direct).toBe(10)
    expect(bandState('Pecho', 10, 99).direct).toBe(0)
  })

  it('restates the band in printed units so a row can show both', () => {
    expect(effectiveBand('Bíceps', 13.5)).toEqual({ mv: 17.5, mev: 21.5, mrv: 33.5 })
    expect(effectiveBand('Bíceps', 0)).toEqual(BANDS['Bíceps'])
    expect(effectiveBand('Sin grupo', 4)).toBeNull()
  })

  it('keeps the two readings of the same week consistent', () => {
    // total >= effective mev is the same statement as direct >= mev, and the
    // screen would contradict itself if they ever came apart.
    for (const group of MUSCLE_GROUPS) {
      for (const indirect of [0, 2.5, 7, 13.5]) {
        for (const direct of [0, 3, 8, 14, 21, 30]) {
          const total = direct + indirect
          const eff = effectiveBand(group, indirect)
          expect(bandState(group, total, indirect).state === 'bajo').toBe(total < eff.mev)
          expect(bandState(group, total, indirect).state === 'sobre').toBe(total > eff.mrv)
        }
      }
    }
  })
})
