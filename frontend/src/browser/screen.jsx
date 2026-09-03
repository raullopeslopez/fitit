// La pantalla contra la que se mide, sembrada y quieta.
//
// Mide la app entera —`App`, no un componente suelto— porque la mitad de lo que
// estas pruebas comprueban vive fuera del editor: la barra de pestañas `fixed`
// a `z-index: 10`, el `.container` de 480 px centrado, el documento que se
// desplaza. Un `render(<ExerciseEditor/>)` a pelo reproduce el mundo vacío en
// el que el defecto de la barra fija pasó tres rondas sin que nadie lo viera.
//
// Se le miente a la red y nada más, igual que hace `harness/DaysHarness.jsx`:
// un `fetch` stub sobre los seis extremos que tocan las dos pantallas. Ni
// `App`, ni `Workout`, ni `Progress` saben que están en un banco, que es la
// condición para que lo que se mida sea la app y no el banco.
//
// Los datos son propios y no los de `harness/fixture.js`: aquella semana está
// afinada para las bandas de volumen —todo a 40 kg— y dibuja una gráfica plana
// de un solo peldaño, que es justo la que no ejerce la altura del panel en
// Progreso. Aquí lo que hace falta es una escalera de récords con varios
// peldaños y una tarjeta de entreno lo bastante larga para que la página tenga
// recorrido que barrer.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from '../App.jsx'
import { MORE_LABEL } from '../ExerciseEditor.jsx'
import { setOpenWorkout } from '../prefs.js'
import { settle } from './geometry.js'

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

export const MAIN = 'Press militar'
export const MAIN_ID = 7

// Un ejercicio por grupo, para que Progreso tenga chips que dibujar, y la
// escalera de `Press militar` subiendo semana a semana para que la gráfica
// tenga peldaños de verdad.
const LADDER = [
  [70, 42.5],
  [56, 45],
  [42, 47.5],
  [28, 50],
  [14, 52.5],
  [7, 55],
]

let nextSetId = 1000

function strengthSet(exerciseId, name, group, weight, reps, date, index = 0) {
  nextSetId += 1
  return {
    id: nextSetId,
    exercise_id: exerciseId,
    exercise_name: name,
    kind: 'strength',
    muscle_group: group,
    secondary_groups: [],
    set_index: index,
    reps,
    weight,
    rpe: null,
    note: null,
    duration_seconds: null,
    distance: null,
    created_at: `${date}T18:0${index}:00.000000Z`,
  }
}

// Los otros dos ejercicios de la sesión. Tres tarjetas es lo que hace que la
// página de Entreno tenga recorrido: con una sola no hay barrido que hacer y el
// pie del panel nunca se acerca a la barra de pestañas.
const COMPANIONS = [
  { id: 8, name: 'Elevaciones laterales', group: 'Hombro', weight: 12, reps: 15 },
  { id: 9, name: 'Fondos en paralelas', group: 'Tríceps', weight: 20, reps: 10 },
]

export const EXERCISES = [
  { id: MAIN_ID, name: MAIN, muscle_group: 'Hombro', kind: 'strength', note: null, set_count: 18 },
  ...COMPANIONS.map((c) => ({
    id: c.id,
    name: c.name,
    muscle_group: c.group,
    kind: 'strength',
    note: null,
    set_count: 9,
  })),
  { id: 10, name: 'Sentadilla', muscle_group: 'Cuádriceps', kind: 'strength', note: null, set_count: 12 },
  { id: 11, name: 'Remo con barra', muscle_group: 'Espalda', kind: 'strength', note: null, set_count: 12 },
]

// La sesión abierta: tres ejercicios, el último con tres series ya registradas
// para que la lista del log exista y sea barrible.
export const OPEN_WORKOUT = {
  id: 1,
  date: iso(daysAgo(0)),
  name: 'Push',
  sets: [
    ...COMPANIONS.flatMap((c, i) =>
      [0, 1, 2].map((s) =>
        strengthSet(c.id, c.name, c.group, c.weight, c.reps, iso(daysAgo(0)), i * 3 + s),
      ),
    ),
    ...[0, 1, 2].map((s) =>
      strengthSet(MAIN_ID, MAIN, 'Hombro', 55, 8 - s, iso(daysAgo(0)), 6 + s),
    ),
  ],
}

function historyDays() {
  const out = []
  for (const [back, weight] of LADDER) {
    const date = iso(daysAgo(back))
    const sets = [
      ...[0, 1, 2].map((s) => strengthSet(MAIN_ID, MAIN, 'Hombro', weight, 8, date, s)),
      strengthSet(10, 'Sentadilla', 'Cuádriceps', weight + 30, 6, date, 3),
      strengthSet(11, 'Remo con barra', 'Espalda', weight - 5, 10, date, 4),
    ]
    out.push({ id: 800 + back, date, workouts: [{ id: 800 + back, date, name: 'Push', sets }] })
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1))
}

export const DAYS = historyDays()

// El nombre con el que se provoca el choque: `Remo con barra` existe en la
// lista y en el registro, así que renombrar `Press militar` a eso es
// exactamente el 409 que el editor convierte en oferta de fusión.
export const TAKEN = 'Remo con barra'
export const TAKEN_ID = 11

// Un día de comida con lo que esta pantalla tiene que aguantar: cuatro cifras
// en la fila de macros, una de ellas **desconocida** (la raya, que es lo único
// de Comida que no se puede medir en jsdom porque hay que leer el color con el
// que se pinta), nombres largos de verdad y las cuatro comidas ocupadas, para
// que la página tenga recorrido y la CTA fija tenga algo debajo que tapar.
export const FOODS = [
  {
    id: 501,
    name: 'Pan de centeno de la panadería de abajo',
    brand: null,
    source: 'manual',
    kcal_100g: 250,
    protein_100g: 8,
    fat_100g: 3,
    carbs_100g: 48,
    fiber_100g: 6.2,
    portions: [{ id: 9001, label: 'rebanada', grams: 32, is_default: true }],
    is_mine: true,
  },
]

function foodEntry(id, slot, name, grams, kcal, fiber) {
  return {
    id,
    logged_at: `${iso(daysAgo(0))}T${pad(6 + id)}:15:00Z`,
    log_date: iso(daysAgo(0)),
    meal_slot: slot,
    food_id: 501,
    food_name: name,
    grams,
    kcal,
    protein: Math.round(kcal * 0.05 * 10) / 10,
    fat: Math.round(kcal * 0.02 * 10) / 10,
    carbs: Math.round(kcal * 0.12 * 10) / 10,
    fiber,
    entry_source: 'manual',
  }
}

export const FOOD_DAY = {
  date: iso(daysAgo(0)),
  entries: [
    foodEntry(1, 'desayuno', 'Pan de centeno de la panadería de abajo', 64, 160, 4),
    foodEntry(2, 'desayuno', 'Aceite de oliva virgen extra', 10, 90, 0),
    foodEntry(3, 'comida', 'Pechuga de pollo a la plancha', 180, 297, 0),
    foodEntry(4, 'comida', 'Arroz blanco cocido', 220, 286, 0.9),
    // Sin fibra registrada: es la entrada que convierte el total en una raya.
    foodEntry(5, 'cena', 'Piquillos de mi madre', 150, 90, null),
    foodEntry(6, null, 'Café con leche', 200, 62, 0),
  ],
  totals: { kcal: 985, protein: 49.3, fat: 19.7, carbs: 118.2, fiber: null },
  unknown: { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 1 },
  // Los subtotales por raíl, como los manda el servidor: las cinco comidas
  // siempre, y una vacía sumando `null` en vez de 0.
  by_slot: [
    ['desayuno', 250, 0],
    ['comida', 583, 0],
    ['cena', null, 1],
    ['snack', null, 0],
    [null, 62, 0],
  ].map(([slot, kcal, sinFibra]) => ({
    slot,
    totals: { kcal, protein: null, fat: null, carbs: null, fiber: kcal === null ? null : 0 },
    unknown: { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: sinFibra },
  })),
}

// El repertorio que la rejilla «Lo de siempre» dibuja. Nombres largos de CIQUAL
// a propósito: es lo que mete dos líneas en un azulejo de media pantalla, y por
// tanto lo único que mide si la rejilla aguanta.
export const FREQUENT = [
  { food_id: 501, name: 'Pan de centeno de la panadería de abajo', brand: null, grams: 64, kcal: 160, meal_slot: 'desayuno', times: 12 },
  { food_id: 502, name: 'Pechuga de pollo a la plancha', brand: null, grams: 180, kcal: 297, meal_slot: 'comida', times: 9 },
  { food_id: 503, name: 'Arroz blanco cocido', brand: null, grams: 220, kcal: 286, meal_slot: 'comida', times: 7 },
  { food_id: 504, name: 'Café con leche', brand: null, grams: 200, kcal: 62, meal_slot: null, times: 6 },
]

// Instalado antes de montar nada: `Days` pide `/days` en su primer render y un
// stub puesto dentro de un componente ya habría perdido esa carrera.
//
// Escribe, además de leer. La suite existía con seis extremos de sólo lectura,
// y por eso el choque de nombres —el bloque que hace la única pregunta
// irreversible del editor— no lo medía nadie: sus dos botones aterrizaban
// enteros debajo de la barra de pestañas con la suite en verde.
// El catálogo que contesta a `/foods`. Parametrizado porque el tamaño de la
// respuesta *es* lo que se mide en la prueba de la hoja: un alimento cabe en
// cualquier pantalla, y con los treinta que devuelve una búsqueda de verdad la
// hoja pasa a medir más que el teléfono.
function stubNetwork(catalogue = FOODS) {
  const routes = [
    [/\/health$/, { ok: true }],
    [/\/workouts\/1$/, OPEN_WORKOUT],
    [/\/days$/, DAYS],
    [/\/exercises\/recently-trained/, []],
    [/\/exercises\/records$/, []],
    [/\/exercises\/history/, []],
    [
      /\/exercises\/previous/,
      {
        exercise_name: MAIN,
        found: true,
        sets: [strengthSet(MAIN_ID, MAIN, 'Hombro', 52.5, 8, iso(daysAgo(7)), 0)],
        best_one_rm: 65,
        best_by_reps: [{ reps: 8, weight: 52.5 }],
      },
    ],
    [/\/exercises$/, EXERCISES],
    [/\/food-log$/, FOOD_DAY],
    // Antes que `/foods$`: leído al revés, «frequent» se buscaría como un id.
    [/\/foods\/frequent$/, FREQUENT],
    // Una etiqueta leída, con las cinco cifras puestas: lo que interesa medir
    // de esto es la **altura** del formulario que sale detrás, que es la misma
    // venga la lectura de donde venga.
    [
      /\/foods\/label$/,
      {
        name: 'Yogur natural',
        brand: 'Hacendado',
        column_header: 'por 100 g',
        nutrients: { kcal: 61, protein: 3.8, fat: 3.2, carbs: 4.5, fiber: 0.3 },
        dropped: [],
        refusal: null,
        refused_column: null,
      },
    ],
    [/\/foods$/, catalogue],
  ]
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  const original = window.fetch
  window.fetch = async (input, init = {}) => {
    const url = String(typeof input === 'string' ? input : input.url)
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]
    const method = (init.method ?? 'GET').toUpperCase()
    let body = {}
    try {
      body = init.body ? JSON.parse(init.body) : {}
    } catch {
      body = {}
    }
    const patch = path.match(/^\/api\/exercises\/(\d+)$/)
    if (patch && method === 'PATCH') {
      const id = Number(patch[1])
      const row = EXERCISES.find((e) => e.id === id) ?? EXERCISES[0]
      if (body.name !== undefined) {
        const taken = EXERCISES.find(
          (e) => e.id !== id && e.name.toLowerCase() === String(body.name).toLowerCase(),
        )
        // El mismo cuerpo que manda el backend (`156187b`): el ejercicio con el
        // que chocaste, con su ortografía guardada y su cuenta de series.
        if (taken) {
          return json(
            {
              detail: {
                code: 'name_taken',
                message: `Ya existe «${taken.name}».`,
                exercise: {
                  id: taken.id,
                  name: taken.name,
                  kind: taken.kind,
                  set_count: taken.set_count,
                },
              },
            },
            409,
          )
        }
        return json({ ...row, name: body.name })
      }
      return json({ ...row, ...body })
    }
    if (path.endsWith('/merge') && method === 'POST') {
      const into = EXERCISES.find((e) => e.id === body.into_id) ?? EXERCISES[0]
      return json(into)
    }
    if (patch && method === 'DELETE') return new Response(null, { status: 204 })
    const hit = routes.find(([re]) => re.test(path))
    return json(hit ? hit[1] : [])
  }
  return () => {
    window.fetch = original
  }
}

// El iframe de vitest reutiliza el documento entre archivos, y `App` cuelga
// entradas del historial (el editor marca «abierto» para que el gesto de atrás
// lo cierre). Sin devolver el scroll a cero cada prueba empieza donde acabó la
// anterior, que es la peor forma de que un barrido salga verde.
export async function mountApp({ openWorkout = null, catalogue = FOODS } = {}) {
  localStorage.clear()
  localStorage.setItem('fitit_token', 'browser-geometry')
  // Por la misma puerta que la app: la marca lleva un sello de tiempo y sólo
  // vale cuatro horas, así que escribir el id a pelo deja a `App` en Días.
  if (openWorkout != null) setOpenWorkout(openWorkout)
  const restore = stubNetwork(catalogue)
  window.scrollTo(0, 0)
  const view = render(<App />)
  return { ...view, restore }
}

/** Entreno con la sesión abierta y la tarjeta de `Press militar` desplegada. */
export async function mountEntreno() {
  const view = await mountApp({ openWorkout: 1 })
  await screen.findByRole('button', { name: `Editar ejercicio ${MAIN}` }, { timeout: 5000 })
  await settle()
  return view
}

/** Progreso con `Press militar` elegido, que es lo que dibuja la gráfica. */
export async function mountProgreso() {
  const view = await mountApp()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /^Progreso$/ }, { timeout: 5000 }))
  const field = await screen.findByLabelText('Ejercicio')
  // Escribir el nombre exacto ya lo grafica: «una sola vía por trabajo»
  // (DESIGN.md), sin botón de confirmación. Nada que pulsar después.
  await user.type(field, MAIN)
  await screen.findByRole('button', { name: `Editar ejercicio ${MAIN}` }, { timeout: 5000 })
  await settle()
  return view
}

/** Comida, con el día de arriba ya cargado. */
export async function mountComida({ catalogue = FOODS } = {}) {
  const view = await mountApp({ catalogue })
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /^Comida$/ }, { timeout: 5000 }))
  // Por el primer raíl, y no por la CTA: los raíles son lo primero que se
  // dibuja con el día ya cargado, así que esperar a uno de ellos basta.
  await vi.waitFor(() => expect(document.querySelector('.food-rail')).not.toBeNull(), {
    timeout: 5000,
  })
  await settle()
  return view
}

/**
 * Abre el editor por su puerta de verdad —el botón de la tarjeta— y devuelve el
 * panel. Nunca se monta `ExerciseEditor` a mano: la posición del disparador es
 * la mitad del cálculo que se está midiendo.
 */
export async function openEditor(user) {
  await user.click(screen.getByRole('button', { name: `Editar ejercicio ${MAIN}` }))
  const panel = await screen.findByRole('dialog')
  await settle()
  return panel
}

/** Entra en el segundo paso del panel, que ahora se llama igual en las dos. */
export async function openDrawer(user) {
  await user.click(screen.getByRole('button', { name: `${MORE_LABEL} de ${MAIN}` }))
  await settle()
  return screen.getByRole('dialog')
}

/**
 * Provoca el choque de nombres por la puerta de verdad: se abre el editor, se
 * escribe encima un nombre que ya es de otro ejercicio y se confirma con Intro.
 * Devuelve el bloque de la oferta, que es lo que se mide.
 *
 * Se espera a que el bloque exista antes de medir nada: el 409 dispara una
 * segunda petición (`listExercises`, las dos cifras frescas) y el bloque no se
 * pinta hasta que contesta.
 */
export async function openClash(user) {
  await openEditor(user)
  const field = screen.getByLabelText(`Nombre de ${MAIN}`)
  await user.clear(field)
  await user.type(field, `${TAKEN}{Enter}`)
  const block = await screen.findByRole('alert', {}, { timeout: 5000 })
  await settle()
  return block
}
