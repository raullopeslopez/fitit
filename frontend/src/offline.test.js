import { beforeEach, describe, expect, it } from 'vitest'

import {
  cacheMarks,
  cacheWorkout,
  cachedMarks,
  cachedWorkout,
  clearQueued,
  dropQueued,
  enqueueSet,
  queuedFor,
  readQueue,
  renameQueued,
  retryable,
} from './offline.js'

describe('the outbox', () => {
  beforeEach(() => localStorage.clear())

  const bench = (tmpId, workoutId = 1) => ({
    tmpId,
    workoutId,
    payload: { exercise_name: 'Bench Press', reps: 8, weight: 60 },
  })

  it('hands back what was queued, in the order it was queued', () => {
    enqueueSet(bench('tmp-1'))
    enqueueSet(bench('tmp-2'))

    // FIFO is not cosmetic: set_index is assigned server-side in arrival order,
    // so a queue that drains out of order rewrites the session.
    expect(readQueue().map((e) => e.tmpId)).toEqual(['tmp-1', 'tmp-2'])
  })

  it('survives the app being closed', () => {
    enqueueSet(bench('tmp-1'))

    // Nothing is held in memory — the point of the queue is that a phone that
    // dies mid-session still has the set when it comes back.
    expect(JSON.parse(localStorage.getItem('fitit_outbox'))).toHaveLength(1)
    expect(readQueue()[0].payload.weight).toBe(60)
  })

  it('drops one entry without disturbing the rest', () => {
    enqueueSet(bench('tmp-1'))
    enqueueSet(bench('tmp-2'))
    dropQueued('tmp-1')

    expect(readQueue().map((e) => e.tmpId)).toEqual(['tmp-2'])
  })

  it('answers for one workout at a time', () => {
    enqueueSet(bench('tmp-1', 1))
    enqueueSet(bench('tmp-2', 2))

    // The screen rebuilds its own pending rows; another workout's backlog is
    // still owed to the server but has no business on this card.
    expect(queuedFor(1).map((e) => e.tmpId)).toEqual(['tmp-1'])
  })

  it('treats a corrupt queue as an empty one', () => {
    localStorage.setItem('fitit_outbox', '{not json')

    // A parse error must not be able to take the log screen down with it.
    expect(readQueue()).toEqual([])
  })

  it('empties completely', () => {
    enqueueSet(bench('tmp-1'))
    clearQueued()

    expect(readQueue()).toEqual([])
  })

  // An exercise renamed while sets are still unsent. The payload names its
  // exercise by string and the server takes that name at face value, so a
  // queued row left alone stands the old exercise straight back up on the drain
  // — the very duplicate the rename was there to get rid of.
  it('carries queued sets over when their exercise is renamed', () => {
    enqueueSet(bench('tmp-1'))
    enqueueSet({ tmpId: 'tmp-2', workoutId: 1, payload: { exercise_name: 'Dominadas', reps: 6 } })

    renameQueued('Bench Press', 'Press banca')

    expect(readQueue().map((e) => e.payload.exercise_name)).toEqual(['Press banca', 'Dominadas'])
  })

  // Renaming touches localStorage on every save, and most saves have nothing
  // queued. Writing the same array back would be a needless write on the hot
  // path of a phone that may be about to die.
  it('leaves the queue alone when nothing in it carries that name', () => {
    renameQueued('Bench Press', 'Press banca')

    expect(localStorage.getItem('fitit_outbox')).toBeNull()
  })

  describe('deciding what is worth retrying', () => {
    it('retries a set that never reached the server', () => {
      // No status at all: fetch itself threw. This is the basement case.
      expect(retryable(new Error('Failed to fetch'))).toBe(true)
    })

    it('retries when the server is down or busy', () => {
      expect(retryable(Object.assign(new Error(''), { status: 500 }))).toBe(true)
      expect(retryable(Object.assign(new Error(''), { status: 502 }))).toBe(true)
      expect(retryable(Object.assign(new Error(''), { status: 429 }))).toBe(true)
      expect(retryable(Object.assign(new Error(''), { status: 408 }))).toBe(true)
    })

    it('waits out an expired session rather than dropping the set', () => {
      // You log back in and the queue drains. Dropping the set instead punishes
      // the user for the clock running out on a JWT.
      expect(retryable(Object.assign(new Error(''), { status: 401 }))).toBe(true)
    })

    it('gives up on a set the server has judged and refused', () => {
      // A 422 will be a 422 forever. Retrying it blocks every set behind it in
      // the queue, which is how one bad row loses a whole session.
      expect(retryable(Object.assign(new Error(''), { status: 422 }))).toBe(false)
      expect(retryable(Object.assign(new Error(''), { status: 404 }))).toBe(false)
    })
  })
})

describe('the workout cache', () => {
  beforeEach(() => localStorage.clear())

  const workout = { id: 1, date: '2026-07-25', name: null, sets: [{ id: 9, reps: 8, weight: 60 }] }

  it('hands back the workout it was given', () => {
    cacheWorkout(workout)

    expect(cachedWorkout(1).sets).toHaveLength(1)
  })

  it('will not answer for a different workout', () => {
    cacheWorkout(workout)

    // One slot: you can only be inside one session at a time. Handing back
    // yesterday's for today's id would put the wrong sets on the screen.
    expect(cachedWorkout(2)).toBeNull()
  })

  it('ignores a workout with no id', () => {
    cacheWorkout(null)
    cacheWorkout({ sets: [] })

    expect(localStorage.getItem('fitit_workout_cache')).toBeNull()
  })

  it('treats a corrupt cache as an empty one', () => {
    localStorage.setItem('fitit_workout_cache', '<<<')

    expect(cachedWorkout(1)).toBeNull()
  })
})

describe('the previous-marks cache', () => {
  beforeEach(() => localStorage.clear())

  const marks = { exercise_name: 'Bench Press', found: true, sets: [{ reps: 8, weight: 60 }] }

  it('gives back the last marks it saw for an exercise', () => {
    cacheMarks('Bench Press', marks)

    expect(cachedMarks('Bench Press').sets).toEqual(marks.sets)
  })

  it('flags what it hands back as stale', () => {
    cacheMarks('Bench Press', marks)

    // The caller has to be able to tell a cached answer from a fresh one: the
    // cache was written excluding a different session, so it can understate the
    // real history, and nothing may award a record against a number like that.
    expect(cachedMarks('Bench Press').stale).toBe(true)
    expect(marks.stale).toBeUndefined()
  })

  it('knows nothing about an exercise it has never seen', () => {
    expect(cachedMarks('Face Pull')).toBeNull()
  })

  it('keeps each exercise separate', () => {
    cacheMarks('Bench Press', marks)
    cacheMarks('Dominadas', { exercise_name: 'Dominadas', found: false, sets: [] })

    expect(cachedMarks('Bench Press').found).toBe(true)
    expect(cachedMarks('Dominadas').found).toBe(false)
  })

  it('treats a corrupt cache as an empty one', () => {
    localStorage.setItem('fitit_marks_cache', 'nonsense')

    expect(cachedMarks('Bench Press')).toBeNull()
  })
})
