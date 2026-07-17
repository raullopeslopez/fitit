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

  if (res.status === 401) {
    clearToken()
    notifyUnauthorized()
    throw new Error('unauthorized')
  }
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`)
  }
  if (res.status === 204) {
    return null
  }
  return res.json()
}

export function createWorkout(name = null) {
  return apiFetch('/workouts', { method: 'POST', body: JSON.stringify({ name }) })
}

export function getPreviousMarks(name) {
  return apiFetch(`/exercises/previous?name=${encodeURIComponent(name)}`)
}

export function listExercises() {
  return apiFetch('/exercises')
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
