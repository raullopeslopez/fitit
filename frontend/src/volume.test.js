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
  RUNWAY_SETS,
  shortOf,
} from './volume.js'

// How long a tail the row draws to the left of the band: the distance from the
// mark back to the edge it missed. This is the shape the screen is judged on.
const tailOf = (group, sets, indirect = 0) => MEV_AT - bandPosition(group, sets, indirect)

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

  it('empties the whole runway for the worst shortfall the bands allow', () => {
    // Espalda has the highest MEV of the nine, so a zero week owes 10 sets —
    // the longest tail anything can draw, and the reason the runway is scaled
    // to exactly that. Nothing ever needs more room than there is.
    expect(bandPosition('Espalda', 0)).toBe(0)
    expect(RUNWAY_SETS).toBe(Math.max(...MUSCLE_GROUPS.map((g) => BANDS[g].mev)))
  })

  it('starts at the MEV mark when MEV is zero — zero sets already meets it', () => {
    expect(bandPosition('Core', 0)).toBeCloseTo(MEV_AT, 10)
  })

  it('runs the approach to MEV in sets, not in fractions of the muscle', () => {
    // Pecho owes 6 at zero, so it starts 6/10 of the runway out — not at the
    // foot of it. A row that owes less starts nearer the band.
    expect(bandPosition('Pecho', 0)).toBeCloseTo(MEV_AT * (1 - 6 / RUNWAY_SETS), 10)
    expect(bandPosition('Pecho', 3)).toBeCloseTo(MEV_AT * (1 - 3 / RUNWAY_SETS), 10)
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

// The runway — everything left of the band — is one shared absolute scale in
// sets. It used to be normalised per muscle, which made every muscle at zero
// land on the identical pixel however many sets it owed, and ranked Femoral's
// shortfall of 4 ahead of Bíceps' 5 because 4 is a bigger *fraction* of an MEV
// of 4 than 5 is of 8. The tail is the shortfall or it is decoration.
describe('the shortfall runway', () => {
  it('draws the same gap the same length on every row', () => {
    for (const gap of [1, 2, 4, 6]) {
      const lengths = MUSCLE_GROUPS.filter((g) => BANDS[g].mev >= gap).map((g) =>
        tailOf(g, BANDS[g].mev - gap),
      )
      expect(lengths.length, `groups able to owe ${gap}`).toBeGreaterThan(1)
      for (const len of lengths) expect(len, `gap ${gap}`).toBeCloseTo(lengths[0], 10)
    }
  })

  it('draws a bigger gap longer, in a fixed ratio', () => {
    // Ten sets short of Espalda against four short of Cuádriceps: two and a
    // half times the tail, because it is two and a half times the shortfall.
    expect(tailOf('Espalda', 0) / tailOf('Cuádriceps', 4)).toBeCloseTo(2.5, 10)
    expect(tailOf('Espalda', 0)).toBeCloseTo(MEV_AT, 10)
  })

  it('ranks tails exactly the way `faltan N` ranks them', () => {
    // The property that was broken: the picture and the digit disagreed about
    // which row was furthest behind. Every pair of short rows, across every
    // group and a spread of counts.
    const short = []
    for (const group of MUSCLE_GROUPS) {
      for (const sets of [0, 0.5, 1, 2.5, 4, 5, 7, 9.5]) {
        const { state, gap } = bandState(group, sets)
        if (state === 'bajo') short.push({ group, sets, gap, tail: tailOf(group, sets) })
      }
    }
    expect(short.length).toBeGreaterThan(20)
    for (const a of short) {
      for (const b of short) {
        const label = `${a.group} ${a.sets} vs ${b.group} ${b.sets}`
        if (a.gap > b.gap + 0.05) expect(a.tail, label).toBeGreaterThan(b.tail)
        if (Math.abs(a.gap - b.gap) < 1e-9) expect(a.tail, label).toBeCloseTo(b.tail, 10)
      }
    }
  })

  it('separates a week of nothing into a staircase instead of nine identical rows', () => {
    // The case that is true five days out of seven. Ranked by what each muscle
    // owes, longest first, and no two rows owing different amounts drawing the
    // same tail.
    const zeros = MUSCLE_GROUPS.filter((g) => BANDS[g].mev > 0).map((g) => ({
      group: g,
      tail: tailOf(g, 0),
    }))
    const byTail = [...zeros].sort((a, b) => b.tail - a.tail).map((r) => r.group)
    const byGap = [...zeros].sort((a, b) => BANDS[b.group].mev - BANDS[a.group].mev).map((r) => r.group)
    expect(byTail.map((g) => BANDS[g].mev)).toEqual(byGap.map((g) => BANDS[g].mev))
    // Espalda 10 · Cuádriceps/Gemelo/Hombro/Bíceps 8 · Pecho/Tríceps 6 ·
    // Femoral 4 — four distinct lengths, not one.
    expect(new Set(zeros.map((r) => Math.round(r.tail * 1e6))).size).toBe(4)
  })

  it('resolves one missing set as a visible step', () => {
    // 1 set is 1/10th of the runway. On the 237px track the row draws, that is
    // ~9px — wider than the needle, so a step is a step and not a rounding.
    const step = tailOf('Espalda', 9) - tailOf('Espalda', 10)
    expect(step).toBeCloseTo(MEV_AT / RUNWAY_SETS, 10)
    expect(step * 237).toBeGreaterThan(4)
  })

  it('clamps at the foot rather than running off the left edge', () => {
    // Nothing in BANDS can owe more than the runway shows, but a future band
    // with a higher MEV would, and a negative position would draw the tail
    // outside the track. It pins to zero and stops, which understates a gap
    // it cannot draw instead of misplacing it.
    for (const group of MUSCLE_GROUPS) {
      for (const sets of [-50, -1, 0]) {
        expect(bandPosition(group, sets), `${group} ${sets}`).toBeGreaterThanOrEqual(0)
      }
    }
    expect(bandPosition('Espalda', -20)).toBe(0)
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

  it('leaves a row of pure indirect volume exactly where a blank week sits', () => {
    // Pressing does not move you toward a direct triceps minimum, so the mark
    // must not claim it does: eight indirect sets draw the same tail as none.
    expect(bandPosition('Tríceps', 8, 8)).toBe(bandPosition('Tríceps', 0))
    expect(tailOf('Tríceps', 8, 8)).toBeCloseTo(MEV_AT * (6 / RUNWAY_SETS), 10)
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

describe('shortOf', () => {
  // «Tríceps · faltan 1» se veía en Progreso: el plural no miraba el número.
  it('concuerda con el número: una serie falta, varias faltan', () => {
    expect(shortOf(1)).toBe('falta 1')
    expect(shortOf(2)).toBe('faltan 2')
    // En modo mes la cifra es una media semanal: 1.5 series no es «una».
    expect(shortOf(1.5)).toBe('faltan 1.5')
    expect(shortOf(0.5)).toBe('faltan 0.5')
  })
})
