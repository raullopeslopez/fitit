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

// Rename an exercise in place; every past set follows (they reference it by id).
export function renameExercise(exerciseId, name) {
  return apiFetch(`/exercises/${exerciseId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
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
