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

// Trades the ID token Google handed the page for one of ours. Same shape of
// answer as login/register, so the caller cannot tell which door was used.
export async function googleLogin(credential) {
  const res = await fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  })
  if (!res.ok) {
    throw new Error('google sign-in rejected')
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
    // Y el cuerpo también, cuando lo hay. El 409 de un renombrado no es sólo un
    // número: trae el ejercicio con el que chocaste —id, el nombre **como está
    // guardado**, su kind y cuántas series lleva—, que es lo único que permite
    // ofrecer la fusión sin volver a preguntarle al servidor ni rebuscar en una
    // lista que puede no contener esa fila. Tirarlo obligaba a adivinar el
    // choque con una búsqueda local, y una búsqueda local no ve un ejercicio
    // que esa pantalla nunca llegó a pedir.
    //
    // `status` sigue puesto pase lo que pase, y el `try` es justamente por eso:
    // un 500 con un HTML de proxy dentro no puede llevarse por delante el
    // número que la bandeja de salida lee para distinguir «no hay señal» de
    // «juzgada y rechazada».
    let detail
    try {
      detail = (await res.json())?.detail
    } catch {
      // Cuerpo vacío, no-JSON, o una respuesta que ni siquiera tiene `json`.
    }
    throw Object.assign(new Error(`request failed: ${res.status}`), {
      status: res.status,
      detail,
    })
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

// --- Comida -----------------------------------------------------------------

// Busca en el catálogo: lo tuyo y lo compartido, mejor coincidencia primero.
// Sin `q` devuelve tus alimentos, que en una cuenta nueva es lo único que hay.
export function searchFoods(q = '') {
  const query = q ? `?q=${encodeURIComponent(q)}` : ''
  return apiFetch(`/foods${query}`)
}

// Lo de siempre: lo que más repites de los últimos noventa días, con la
// cantidad y la comida a la que suele ir. Las kcal que trae son la previsión de
// lo que se registraría al tocarlo, no una cifra congelada — quien congela es
// `logFood`, al escribir.
export function frequentFoods(limit = 6) {
  return apiFetch(`/foods/frequent?limit=${limit}`)
}

// Da de alta un alimento a mano — el pan de la panadería, los piquillos de tu
// madre. Es la única puerta por la que se escribe en el catálogo: ni el
// escáner, ni un import, ni un parser pueden crear un alimento sin que alguien
// lo confirme en un formulario.
export function createFood(food) {
  return apiFetch('/foods', { method: 'POST', body: JSON.stringify(food) })
}

// Corrige un alimento tuyo. No toca nada de lo ya registrado: el diario congeló
// sus números al escribirlos.
export function correctFood(foodId, fields) {
  return apiFetch(`/foods/${foodId}`, { method: 'PATCH', body: JSON.stringify(fields) })
}

// Registra una cantidad. `logged_at` se manda con el offset del móvil porque es
// lo que decide en qué día alimentario cae — el servidor no tiene otro reloj
// con el que fechar una cena de la 01:30.
export function logFood({ foodId, grams = null, portionId = null, quantity = 1, mealSlot = null }) {
  return apiFetch('/food-log', {
    method: 'POST',
    body: JSON.stringify({
      food_id: foodId,
      grams,
      portion_id: portionId,
      quantity,
      meal_slot: mealSlot,
      logged_at: new Date().toISOString(),
    }),
  })
}

// Un día del diario: sus entradas, sus totales y qué no ha podido sumarse.
export function getFoodDay(dayIso) {
  return apiFetch(`/food-log?date=${dayIso}`)
}

// Repesar o recolocar una entrada. Los nutrientes se reescalan desde lo
// congelado, nunca se releen del alimento.
export function correctFoodEntry(entryId, fields) {
  return apiFetch(`/food-log/${entryId}`, { method: 'PATCH', body: JSON.stringify(fields) })
}

export function deleteFoodEntry(entryId) {
  return apiFetch(`/food-log/${entryId}`, { method: 'DELETE' })
}
