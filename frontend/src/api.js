import { clearToken, getToken, notifyUnauthorized } from './auth.js'

export async function login(username, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    throw new Error('invalid credentials')
  }
  const data = await res.json()
  return data.access_token
}

export async function register(username, password) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw Object.assign(new Error(body?.detail || 'registration failed'), { status: res.status })
  }
  const data = await res.json()
  return data.access_token
}

// Authenticated request against the backend. Attaches the stored JWT, prefixes
// /api (Vite proxy), and on 401 drops the token + notifies the app to log out.
export async function apiFetch(path, options = {}) {
  const token = getToken()
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  // The status rides on the error. The outbox has to tell "no signal" (nothing
  // to read, keep the set and retry) from "the server judged this set and
  // refused it" (drop it, or it blocks every set behind it forever).
  if (res.status === 401) {
    clearToken()
    notifyUnauthorized()
    throw Object.assign(new Error('unauthorized'), { status: 401 })
  }
  if (!res.ok) {
    throw Object.assign(new Error(`request failed: ${res.status}`), { status: res.status })
  }
  if (res.status === 204) {
    return null
  }
  return res.json()
}

// The launch probe. Public and tiny, so what it measures is the container being
// awake and nothing else — on the free tier that is a request the first launch
// of the day pays for and every other one doesn't. `options` carries the abort
// signal that lets the launch screen give up on an attempt.
export function checkHealth(options = {}) {
  return apiFetch('/health', options)
}

export function createWorkout({ name = null, date = null } = {}) {
  return apiFetch('/workouts', { method: 'POST', body: JSON.stringify({ name, date }) })
}

export function getWorkout(id) {
  return apiFetch(`/workouts/${id}`)
}

export function renameWorkout(id, name) {
  return apiFetch(`/workouts/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
}

export function deleteWorkout(id) {
  return apiFetch(`/workouts/${id}`, { method: 'DELETE' })
}

export function listDays() {
  return apiFetch('/days')
}

export function deleteDay(id) {
  return apiFetch(`/days/${id}`, { method: 'DELETE' })
}

// Muscle groups trained today or yesterday, most recent first — what is still
// recovering when you open a session. Its own endpoint rather than a read over
// `/days`: that one carries the whole log, which is hundreds of sets and
// growing, to draw a single line.
export function recentlyTrained(excludeWorkoutId = null) {
  const params = new URLSearchParams()
  if (excludeWorkoutId != null) params.set('exclude_workout_id', String(excludeWorkoutId))
  const query = params.toString()
  return apiFetch(`/exercises/recently-trained${query ? `?${query}` : ''}`)
}

// The marks to beat for one exercise. `excludeWorkoutId` is the session you're
// standing in: without it, a card rebuilt from an open workout is handed its
// own sets as the thing to beat.
export function getPreviousMarks(name, excludeWorkoutId = null) {
  const params = new URLSearchParams({ name })
  if (excludeWorkoutId != null) params.set('exclude_workout_id', String(excludeWorkoutId))
  return apiFetch(`/exercises/previous?${params}`)
}

export function listExercises() {
  return apiFetch('/exercises')
}

// Override (or clear, with null) an exercise's muscle group.
export function setExerciseMuscle(exerciseId, muscleGroup) {
  return apiFetch(`/exercises/${exerciseId}`, {
    method: 'PATCH',
    body: JSON.stringify({ muscle_group: muscleGroup }),
  })
}

// Set (or clear, with null) the standing note on an exercise — the grip, the
// seat height, the shoulder that complains. One per exercise, shown on the card
// every session, unlike the per-set note which belongs to one row of one log.
export function setExerciseNote(exerciseId, note) {
  return apiFetch(`/exercises/${exerciseId}`, {
    method: 'PATCH',
    body: JSON.stringify({ note }),
  })
}

// Rename an exercise in place; every past set follows (they reference it by id).
export function renameExercise(exerciseId, name) {
  return apiFetch(`/exercises/${exerciseId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

// Delete an exercise and every set ever logged against it. There is no soft
// version: the sets reference it by id, so they go with it.
export function deleteExercise(exerciseId) {
  return apiFetch(`/exercises/${exerciseId}`, { method: 'DELETE' })
}

// Fold a duplicate into the real exercise — its sets move over, then it's gone.
// The way out of a name typed wrong, which renaming can't fix: the name you
// want is taken, which is the whole point.
export function mergeExercise(exerciseId, intoId) {
  return apiFetch(`/exercises/${exerciseId}/merge`, {
    method: 'POST',
    body: JSON.stringify({ into_id: intoId }),
  })
}

export function getExerciseHistory(name) {
  return apiFetch(`/exercises/history?name=${encodeURIComponent(name)}`)
}

// Best set per exercise, strongest first, with the gap to the record it beat.
export function getBestMarks() {
  return apiFetch('/exercises/records')
}

export function logSet(workoutId, set) {
  return apiFetch(`/workouts/${workoutId}/sets`, {
    method: 'POST',
    body: JSON.stringify(set),
  })
}

export function editSet(setId, set) {
  return apiFetch(`/workouts/sets/${setId}`, {
    method: 'PATCH',
    body: JSON.stringify(set),
  })
}

export function deleteSet(setId) {
  return apiFetch(`/workouts/sets/${setId}`, { method: 'DELETE' })
}
