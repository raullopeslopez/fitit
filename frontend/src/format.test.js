import { describe, it, expect } from 'vitest'

import {
  formatCardioSet,
  formatClock,
  formatDayShort,
  daysAgoLabel,
  formatDuration,
  formatMonth,
  formatPace,
  formatRange,
  formatSet,
  formatTime,
  parseDuration,
} from './format.js'

describe('formatSet', () => {
  it('reads a weighted set in kilos', () => {
    expect(formatSet({ weight: 60, reps: 8 })).toBe('60 kg x 8')
  })

  // Dominadas and fondos carry no weight at all. "0 kg x 12" made a number out
  // of the absence of one; 0 stays a number someone typed (an empty bar).
  it('says a weightless set is bodyweight, and keeps a real zero', () => {
    expect(formatSet({ weight: null, reps: 12 })).toBe('Corporal x 12')
    expect(formatSet({ weight: 0, reps: 12 })).toBe('0 kg x 12')
  })
})

describe('daysAgoLabel', () => {
  const today = new Date(2026, 6, 26, 10)

  it('names the near past the way you would say it', () => {
    expect(daysAgoLabel(new Date(2026, 6, 26, 8).toISOString(), today)).toBe('hoy')
    expect(daysAgoLabel(new Date(2026, 6, 25, 23).toISOString(), today)).toBe('ayer')
    expect(daysAgoLabel(new Date(2026, 6, 23, 19).toISOString(), today)).toBe('hace 3 días')
  })

  // Calendar days, not elapsed hours: last night at 23:00 is "ayer" even though
  // it is eleven hours ago, and this morning is "hoy" whatever the clock says.
  it('counts calendar days, not elapsed time', () => {
    expect(daysAgoLabel(new Date(2026, 6, 25, 22).toISOString(), new Date(2026, 6, 26, 1))).toBe(
      'ayer',
    )
  })

  // The training day arrives as a bare `YYYY-MM-DD`. `new Date('2026-07-23')`
  // parses that as UTC midnight, which lands on the 22nd anywhere west of
  // Greenwich — so the label would be a day out for half the planet. Read the
  // parts, don't hand the string to Date.
  it('reads a bare date as that local day, not as UTC midnight', () => {
    expect(daysAgoLabel('2026-07-26', today)).toBe('hoy')
    expect(daysAgoLabel('2026-07-25', today)).toBe('ayer')
    expect(daysAgoLabel('2026-07-23', today)).toBe('hace 3 días')
  })

  it('is null for a timestamp it cannot read', () => {
    expect(daysAgoLabel(undefined, today)).toBeNull()
    expect(daysAgoLabel('2026-13-99', today)).toBeNull()
  })
})

describe('formatMonth', () => {
  it('names a month in full, for a title that has room for it', () => {
    expect(formatMonth('2026-07-01')).toBe('julio')
    expect(formatMonth('2026-12-31')).toBe('diciembre')
  })
})

describe('formatRange', () => {
  it('says the month once when both ends share it', () => {
    expect(formatRange('2026-07-20', '2026-07-26')).toBe('20–26 jul')
  })
  it('names both months when the range straddles them', () => {
    expect(formatRange('2026-06-29', '2026-07-05')).toBe('29 jun – 5 jul')
  })
})

describe('formatDayShort', () => {
  // The day list is a logbook rule, not a sentence: mono, uppercase, no comma.
  it('formats a day as an uppercase mono stamp', () => {
    expect(formatDayShort('2026-07-16', new Date(2026, 6, 24))).toBe('JUE 16 JUL')
  })
  // Dropping the year is what buys the row its width — but only where it's
  // implied. A day from another year has to say so.
  it('adds the year only when it is not the current one', () => {
    expect(formatDayShort('2025-12-31', new Date(2026, 6, 24))).toBe('MIÉ 31 DIC 2025')
  })
})

describe('parseDuration', () => {
  it('parses mm:ss into seconds', () => {
    expect(parseDuration('24:30')).toBe(1470)
  })
  it('parses a plain number as minutes', () => {
    expect(parseDuration('20')).toBe(1200)
  })
  it('parses h:mm:ss', () => {
    expect(parseDuration('1:00:30')).toBe(3630)
  })
  it('rejects non-numeric input', () => {
    expect(parseDuration('abc')).toBeNull()
  })
  it('rejects seconds >= 60', () => {
    expect(parseDuration('4:75')).toBeNull()
  })
  it('is null for empty input', () => {
    expect(parseDuration('')).toBeNull()
  })
})

describe('formatDuration', () => {
  it('formats seconds as mm:ss', () => {
    expect(formatDuration(1470)).toBe('24:30')
  })
  it('pads seconds', () => {
    expect(formatDuration(65)).toBe('1:05')
  })
  it('includes hours past an hour', () => {
    expect(formatDuration(3661)).toBe('1:01:01')
  })
})

describe('formatPace', () => {
  it('is time per kilometre', () => {
    expect(formatPace(1470, 5.2)).toBe('4:43/km')
  })
  it('is null without a distance', () => {
    expect(formatPace(1470, 0)).toBeNull()
  })
})

describe('formatCardioSet', () => {
  it('shows duration, distance and pace', () => {
    expect(
      formatCardioSet({ duration_seconds: 1470, distance: 5.2 }),
    ).toBe('24:30 · 5.2 km · 4:43/km')
  })
  it('shows just the duration when there is no distance', () => {
    expect(formatCardioSet({ duration_seconds: 60 })).toBe('1:00')
  })
})

describe('formatClock', () => {
  it('zero-pads the minutes so the readout never reflows mid-countdown', () => {
    expect(formatClock(92)).toBe('01:32')
    expect(formatClock(90)).toBe('01:30')
    expect(formatClock(5)).toBe('00:05')
  })

  it('clamps a finished or overrun countdown to zero', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(-3)).toBe('00:00')
  })

  it('keeps counting past an hour in minutes rather than rolling over', () => {
    expect(formatClock(3605)).toBe('60:05')
  })
})

describe('formatTime', () => {
  it('reads back the local clock time a set was logged at', () => {
    // Built from local parts and read back as local parts, so the assertion
    // holds in any timezone the suite happens to run in.
    const iso = new Date(2026, 6, 16, 18, 4).toISOString()
    expect(formatTime(iso)).toBe('18:04')
  })

  it('zero-pads both halves', () => {
    expect(formatTime(new Date(2026, 6, 16, 9, 5).toISOString())).toBe('09:05')
  })

  it('is empty for a set with no recorded moment', () => {
    expect(formatTime(null)).toBe('')
    expect(formatTime('not a date')).toBe('')
  })
})
