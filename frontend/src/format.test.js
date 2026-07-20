import { describe, it, expect } from 'vitest'

import { formatCardioSet, formatClock, formatDuration, formatPace, parseDuration } from './format.js'

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
  it('is time per distance unit', () => {
    expect(formatPace(1470, 5.2, 'km')).toBe('4:43/km')
  })
  it('is null without a distance', () => {
    expect(formatPace(1470, 0, 'km')).toBeNull()
  })
})

describe('formatCardioSet', () => {
  it('shows duration, distance and pace', () => {
    expect(
      formatCardioSet({ duration_seconds: 1470, distance: 5.2, distance_unit: 'km' }),
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
