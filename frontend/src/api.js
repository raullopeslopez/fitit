import { foodMomentIso } from './food.js'
import { clearToken, getToken, notifyUnauthorized } from './auth.js'
import { apiUrl, clientHeaders } from './platform/http.js'

export async function login(username, password) {
  const res = await fetch(apiUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...clientHeaders() },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    throw new Error('invalid credentials')
  }
  const data = await res.json()
  return data.access_token
}

export async function register(username, password) {
  const res = await fetch(apiUrl('/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...clientHeaders() },
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
  const res = await fetch(apiUrl('/auth/google'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...clientHeaders() },
    body: JSON.stringify({ credential }),
  })
  if (!res.ok) {
    throw Object.assign(new Error('google sign-in rejected'), { status: res.status })
  }
  const data = await res.json()
  return data.access_token
}

// Authenticated request against the backend. Attaches the stored JWT and the
// client version, resolves the URL (platform/http.js), and on 401 drops the token + notifies the app to log out.
export async function apiFetch(path, options = {}) {
  const token = getToken()
  // Una subida multipart tiene que llevar su propio `Content-Type`, con el
  // `boundary` que genera el navegador. Ponérselo nosotros —aunque sea el
  // correcto— deja el boundary fuera y el servidor no encuentra las partes.
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData
  const res = await fetch(apiUrl(path), {
    ...options,
    headers: {
      ...clientHeaders(),
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
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

// Take an exercise out of one workout: that workout's sets for it go, the
// exercise and its history stay. A different address from `deleteExercise` on
// purpose, so a dropped parameter can never turn one into the other.
export function removeExerciseFromWorkout(workoutId, exerciseId) {
  return apiFetch(`/workouts/${workoutId}/exercises/${exerciseId}`, { method: 'DELETE' })
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

// Las cantidades que repites para un alimento, la más repetida primero: lo que
// la hoja de «cuánto» propone en vez de cien gramos. Hasta tres, en gramos.
export function usualAmounts(foodId) {
  return apiFetch(`/foods/${foodId}/usual`)
}

// Da de alta un alimento a mano — el pan de la panadería, los piquillos de tu
// madre. Es la única puerta por la que se escribe en el catálogo: ni el
// escáner, ni un import, ni un parser pueden crear un alimento sin que alguien
// lo confirme en un formulario.
export function createFood(food) {
  return apiFetch('/foods', { method: 'POST', body: JSON.stringify(food) })
}

// El hueso típico de un nombre, según la tabla del servidor, antes de que el
// alimento exista: con qué proponer «Lleva hueso» en el alta. `refuse_pct`
// null es que la tabla no conoce el nombre, no que no lleve hueso.
export function boneReference(name) {
  return apiFetch(`/foods/bone-reference?name=${encodeURIComponent(name)}`)
}

// Lee la tabla nutricional de una foto y devuelve lo que **rellenaría** el
// formulario de alta. No da de alta nada: la puerta del catálogo sigue siendo
// `createFood`, con alguien mirando lo que hay escrito antes de guardarlo.
//
// Siempre contesta 200 salvo que la feature esté apagada. Cuando no ha podido
// leer, lo dice en `refusal` en vez de fallar — porque las tres salidas acaban
// en el mismo formulario y sólo cambia con cuánto viene puesto.
export function readLabel(file) {
  const form = new FormData()
  form.append('photo', file)
  return apiFetch('/foods/label', { method: 'POST', body: form })
}

// Resuelve un código de barras. La puerta barata: no gasta clave ni cuota, y
// cuando el producto ya es tuyo ni siquiera sale de la base de datos.
//
// Devuelve siempre 200 salvo que el código esté malformado. Los tres finales
// —ya lo tienes, propuesta de Open Food Facts, o nada— se distinguen por los
// campos que trae, no por el estado HTTP.
export function scanBarcode(ean) {
  return apiFetch(`/foods/barcode/${encodeURIComponent(ean)}`)
}

// Corrige un alimento tuyo. No toca nada de lo ya registrado: el diario congeló
// sus números al escribirlos.
export function correctFood(foodId, fields) {
  return apiFetch(`/foods/${foodId}`, { method: 'PATCH', body: JSON.stringify(fields) })
}

// Vuelve a aplicar un alimento corregido a lo registrado de **un** día.
//
// La única excepción a que el diario congela sus cifras, y por eso viaja sola y
// con nombre propio: guardar una corrección no la llama: la llama la pantalla,
// después de preguntar, y sólo con el día que se está mirando.
export function recomputeFoodDay(foodId, dayIso) {
  return apiFetch('/food-log/recompute', {
    method: 'POST',
    body: JSON.stringify({ food_id: foodId, date: dayIso }),
  })
}

// Registra una cantidad. `logged_at` se manda con el offset del móvil porque es
// lo que decide en qué día alimentario cae — el servidor no tiene otro reloj
// con el que fechar una cena de la 01:30. El sello lo compone `foodMomentIso`,
// que vive junto a `foodDayIso` para que las dos mitades de la regla no puedan
// volver a separarse. `loggedAt` es la excepción: deshacer
// un borrado vuelve a escribir la entrada con su hora original, no con la de
// ahora, para que no cambie de día alimentario al recuperarse.
export function logFood({
  foodId,
  grams = null,
  portionId = null,
  quantity = 1,
  mealSlot = null,
  loggedAt = null,
  // Los gramos son de la pieza con su hueso: el servidor descuenta lo que no
  // se come (o no, si las kcal de la etiqueta ya lo cuentan).
  withBone = false,
}) {
  return apiFetch('/food-log', {
    method: 'POST',
    body: JSON.stringify({
      food_id: foodId,
      grams,
      portion_id: portionId,
      quantity,
      meal_slot: mealSlot,
      logged_at: loggedAt ?? foodMomentIso(),
      with_bone: withBone,
    }),
  })
}

// El hueso que sobró en el plato, pesado. Corrige la entrada y, si el alimento
// es tuyo, le deja ese hueso para la próxima vez. El catálogo no se toca.
export function weighLeftoverBone(entryId, boneGrams) {
  return apiFetch(`/food-log/${entryId}/bone`, {
    method: 'POST',
    body: JSON.stringify({ bone_grams: boneGrams }),
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

// --- Peso corporal -----------------------------------------------------------
// Lo que pesas un día. Pesarte dos veces el mismo día **corrige** la cifra en
// vez de añadir otra: las dos son medidas del mismo hecho.
export function logBodyWeight({ measured_on, kg }) {
  return apiFetch('/body-weight', {
    method: 'POST',
    body: JSON.stringify({ measured_on, kg }),
  })
}

// Los pasos del teléfono (Health Connect), un día por fila. Subir un día que ya
// estaba lo reescribe: los pasos del día sólo crecen, y la última lectura es la
// más completa.
export function putSteps(days) {
  return apiFetch('/steps', { method: 'PUT', body: JSON.stringify({ days }) })
}

// Los pasos entre dos fechas, ambas incluidas. Sólo vienen los días que tienen
// pasos: un día que falta es un día sin dato, no un día de cero.
export function getSteps(from, to) {
  return apiFetch(`/steps?from=${from}&to=${to}`)
}

// Las pesadas, de la más reciente a la más antigua. Todavía no la pinta nadie:
// la usará la curva de peso cuando exista.
export function listBodyWeights() {
  return apiFetch('/body-weight')
}

// La media reciente. `kg` viene a `null` cuando aún no hay tendencia, y eso es
// una respuesta — no se rellena con la última pesada. Trae además cuántas la
// sostienen y hasta cuándo está medida, porque una tendencia sobre dos y una
// sobre veinte no valen lo mismo.
export function weightTrend() {
  return apiFetch('/body-weight/trend')
}

// --- Platos ------------------------------------------------------------------
// Tus platos. Un plato **no es un alimento**: no sale en `searchFoods` y no se
// da de alta por `createFood`. Un alimento es una medida; un plato es una
// combinación tuya de medidas.
export function listDishes(q = '') {
  const query = q ? `?q=${encodeURIComponent(q)}` : ''
  return apiFetch(`/dishes${query}`)
}

export function createDish(dish) {
  return apiFetch('/dishes', { method: 'POST', body: JSON.stringify(dish) })
}

export function correctDish(dishId, fields) {
  return apiFetch(`/dishes/${dishId}`, { method: 'PATCH', body: JSON.stringify(fields) })
}

// Registra N raciones: el servidor congela **una entrada por ingrediente**, no
// una suma, así que esto devuelve una lista. El diario sigue siendo filas de
// alimento; el plato es de dónde salieron.
export function logDish(dishId, { servings = 1, meal_slot = null } = {}) {
  return apiFetch(`/dishes/${dishId}/log`, {
    method: 'POST',
    body: JSON.stringify({ servings, meal_slot }),
  })
}

// Pide platos con lo que tienes. Los que se sostienen solos **ya están
// guardados** cuando esto contesta: el modelo propone qué combinar y nunca
// cuánto suma, así que no hay ninguna cifra inventada que revisar.
//
// Nunca falla por una cuota agotada: las cuatro formas de no haber podido
// vienen en `refusal`, porque «vuelve mañana» no es «algo se ha roto».
export function generateDishes({ methods = [], minutes = null, n = 6 } = {}) {
  return apiFetch('/dishes/generate', {
    method: 'POST',
    body: JSON.stringify({ methods, minutes, n }),
  })
}

// Ideas con un alimento: recetas de la web, guardadas por alimento. Sin `more`
// contesta con lo guardado y sólo busca si no hay nada; con `more` («Otras
// ideas») vuelve a buscar y suma. Siempre 200: el motivo viaja en `refusal`.
export function dishIdeas(foodId, { more = false } = {}) {
  return apiFetch('/dish-ideas', {
    method: 'POST',
    body: JSON.stringify({ food_id: foodId, more }),
  })
}

// Una idea abierta como plato, sin guardar: las líneas de su receta y con qué
// casan. `servings` son las raciones que dice la persona; sin ellas, las que
// publica la página, y si tampoco, `null` — el servidor no divide entre uno.
// Siempre 200 para una idea que existe: el motivo viaja en `refusal`.
export function ideaDraft(ideaId, { servings = null } = {}) {
  const query = servings != null ? `?servings=${encodeURIComponent(servings)}` : ''
  return apiFetch(`/dish-ideas/${ideaId}/draft${query}`)
}

// Las macros de una ración, sin guardar nada. La pantalla no suma.
export function previewDish({ servings = 1, ingredients }) {
  return apiFetch('/dishes/preview', {
    method: 'POST',
    body: JSON.stringify({ servings, ingredients }),
  })
}

// --- Objetivo derivado --------------------------------------------------------
// Tu perfil: qué quieres que le pase a tu cuerpo y lo mínimo sobre él para
// poder estimar el gasto mientras no haya historial con el que medirlo.
export function getTargetProfile() {
  return apiFetch('/targets')
}

export function saveTargetProfile(fields) {
  return apiFetch('/targets', { method: 'PATCH', body: JSON.stringify(fields) })
}

// Lo que la app propone. **No lo fija**: un número que cambia sin avisar no se
// obedece, se desconfía. `source` dice si salió de la fórmula o de tus datos.
export function getTargetProposal() {
  return apiFetch('/targets/proposal')
}

export function acceptTarget(kcal) {
  return apiFetch('/targets/accept', { method: 'POST', body: JSON.stringify({ kcal }) })
}

// ¿Toca preguntar «¿apuntaste todo?»? Sólo lee: `due` dice si hay pregunta.
export function getReview() {
  return apiFetch('/targets/review')
}

// Contesta ('all' | 'most' | 'none') y devuelve la propuesta que sale con esa
// respuesta. **No toca el objetivo**: aceptarla es `acceptTarget`.
export function answerReview(answer) {
  return apiFetch('/targets/review', { method: 'POST', body: JSON.stringify({ answer }) })
}

// --- Reglas -------------------------------------------------------------------
export function listRules() {
  return apiFetch('/rules')
}

export function createRule(rule) {
  return apiFetch('/rules', { method: 'POST', body: JSON.stringify(rule) })
}

// Retirar, no borrar: se le pone fecha de fin, para que el pasado siga juzgado
// como se juzgó.
export function retireRule(ruleId, on) {
  return apiFetch(`/rules/${ruleId}`, {
    method: 'PATCH',
    body: JSON.stringify({ active_to: on }),
  })
}

export function dayVerdicts(day = null) {
  return apiFetch(`/rules/verdicts${day ? `?day=${day}` : ''}`)
}

// --- el plan de la semana ----------------------------------------------------

// El plan guardado de esa semana, o `null` si no hay ninguno. Un 404 aquí no es
// un fallo: es «esa semana todavía no se ha generado», y la pantalla tiene algo
// que decir al respecto.
export async function getPlan(weekStart) {
  try {
    return await apiFetch(`/plans/${weekStart}`)
  } catch (err) {
    if (err?.status === 404) return null
    throw err
  }
}

// Genera la semana y la guarda, pisando la que hubiera. Sin `seed` el servidor
// usa una derivada de la semana, para que pedir el mismo lunes dos veces no dé
// dos semanas distintas; mandarla es lo que permite «dame otra».
export function generatePlan(weekStart, seed = null) {
  return apiFetch('/plans', {
    method: 'POST',
    body: JSON.stringify(seed === null ? { week_start: weekStart } : { week_start: weekStart, seed }),
  })
}

// Confirmar, saltar o cambiar una comida del plan. `done` escribe el diario con
// los gramos que el plan congeló. El sello va con el offset del móvil, igual
// que al registrar a mano: es lo que decide en qué día alimentario cae.
export function setPlanEntry(entryId, status, dishId = null) {
  return apiFetch(`/plans/entries/${entryId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, dish_id: dishId, logged_at: foodMomentIso() }),
  })
}

// Los huecos de esta semana a los que todavía se puede llevar un plato: desde
// el día que tienes delante y sin decir. Sin plan llega `has_plan: false`, que
// no es un fallo: es lo que la hoja tiene que contar.
export function getPlanAhead(dayIso) {
  return apiFetch(`/plans/entries/ahead?date=${dayIso}`)
}

// Poner otro plato en un hueco que no ha pasado. **No es `swapped`**: aquel es
// «hoy comí otra cosa» y escribe el diario; esto cambia lo que el plan dice que
// vas a comer y la fila sigue por confirmar.
export function replanEntry(entryId, dishId, dayIso) {
  return apiFetch(`/plans/entries/${entryId}/dish`, {
    method: 'PUT',
    body: JSON.stringify({ dish_id: dishId, date: dayIso }),
  })
}

// Cómo fue la semana, en las dos métricas. Un 404 es «esa semana no se
// planificó», que no es un fallo: es que no hay nada que medir.
export async function getAdherence(weekStart) {
  try {
    return await apiFetch(`/plans/${weekStart}/adherence`)
  } catch (err) {
    if (err?.status === 404) return null
    throw err
  }
}
