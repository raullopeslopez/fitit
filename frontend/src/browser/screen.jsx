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
    // Sin proteína registrada: es la entrada que convierte el total del día en
    // una raya, y la que deja medir que una raya se pinta con tinta de cifra en
    // la columna por la que se barre la pantalla.
    { ...foodEntry(4, 'comida', 'Arroz blanco cocido', 220, 286, 0.9), protein: null },
    // Sin fibra registrada: es la entrada que convierte el total en una raya.
    foodEntry(5, 'cena', 'Piquillos de mi madre', 150, 90, null),
    foodEntry(6, null, 'Café con leche', 200, 62, 0),
  ],
  // `protein` en `null` porque a una entrada le falta: la regla de los nulos de
  // `sumar_nutrientes`, tal y como la manda el servidor. No es cero comido — es
  // un total que todavía no cuadra, y la pantalla tiene que decirlo con una raya.
  totals: { kcal: 985, protein: null, fat: 19.7, carbs: 118.2, fiber: null },
  unknown: { kcal: 0, protein: 1, fat: 0, carbs: 0, fiber: 1 },
  // Los cuatro objetivos fijados, que es lo que pone la tarjeta de macros en su
  // rama de verdad: sin ellos no hay tramo pendiente, y el contrato de color
  // —lo cumplido desaturado, el cromo a lo que falta— no tiene dónde pintarse.
  //
  // Los `remaining` llegan restados del servidor, igual que en producción.
  // 4·160 + 4·300 + 9·80: el total sale del reparto, no de un campo aparte. Con
  // un número distinto aquí el fixture reproduciría justo la contradicción que
  // derivarlo quita de en medio.
  target_kcal: 2560,
  target_protein: 160,
  target_fat: 80,
  target_carbs: 300,
  remaining_kcal: 1575,
  // Un total desconocido cuenta como cero comido a este único efecto: lo que la
  // cifra grande contesta es «cuánto me queda por comer», y ahí la única
  // respuesta con sentido es el objetivo entero (`restante`, en `nutrition.py`).
  remaining_protein: 160,
  remaining_fat: 60.3,
  remaining_carbs: 181.8,
  label_reading: true,
  // Los subtotales por raíl, como los manda el servidor: las cinco comidas
  // siempre, y una vacía sumando `null` en vez de 0.
  by_slot: [
    ['desayuno', 250, 12.5, 0],
    ['comida', 583, null, 0],
    // Sin kcal y sin proteína: es la comida que convierte su subtotal en dos
    // rayas, y la que deja medir que una raya se pinta como una cifra.
    ['cena', null, null, 1],
    ['snack', null, null, 0],
    [null, 62, 3.1, 0],
  ].map(([slot, kcal, protein, sinFibra]) => ({
    slot,
    totals: { kcal, protein, fat: null, carbs: null, fiber: kcal === null ? null : 0 },
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
function stubNetwork(catalogue = FOODS, extra = []) {
  const routes = [
    // Las de la prueba, primero: pisan a las de siempre.
    ...extra,
    [/\/health$/, { ok: true }],
    // La tarjeta de peso de Perfil. Sin esta ruta el stub devuelve `[]` y la
    // tarjeta cae —correctamente— en «todavía no te has pesado», que es un
    // estado real pero no el que se quiere medir aquí.
    [/\/body-weight\/trend$/, { kg: 78.6, weigh_ins: 3, up_to: '2026-09-18', last_kg: 78.9 }],
    // Las pesadas de la curva, de la más reciente a la más antigua.
    [
      /\/body-weight$/,
      [
        { id: 3, measured_on: '2026-09-18', kg: 78.9 },
        { id: 2, measured_on: '2026-09-11', kg: 79.4 },
        { id: 1, measured_on: '2026-09-04', kg: 80.1 },
      ],
    ],
    // Lo demás que Perfil pide al abrirse: los datos del objetivo y su
    // propuesta. Objetos, no la lista vacía por defecto.
    // Sin revisión pendiente: la tarjeta no se pinta y no mueve la geometría.
    [/\/targets\/review$/, { due: false }],
    [/\/targets\/proposal$/, { kcal: 2450, source: 'formula', days: 0, missing: [] }],
    [/\/targets$/, { goal: 'cut', goal_rate: 0.5, height_cm: 190, birth_year: 1996, sex: 'male', steps_goal: 10000, objetivo_kcal: 2230 }],
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
        // Cuatro la última vez y tres hoy: la pantalla que se mide es la de la
        // serie que toca, no la de «terminado».
        sets: [0, 1, 2, 3].map((i) =>
          strengthSet(MAIN_ID, MAIN, 'Hombro', 52.5, 8, iso(daysAgo(7)), i),
        ),
        best_one_rm: 65,
        best_by_reps: [{ reps: 8, weight: 52.5 }],
      },
    ],
    [/\/exercises$/, EXERCISES],
    [/\/food-log$/, FOOD_DAY],
    // Antes que `/foods$`: leído al revés, «frequent» se buscaría como un id.
    [/\/foods\/frequent$/, FREQUENT],
    // Un código que nadie conoce: es lo que dispara el peldaño de en medio de
    // la escalada, y por tanto lo único que deja medirlo.
    [
      /\/foods\/barcode\//,
      { barcode: '8410128750121', food: null, refusal: 'unknown' },
    ],
    // Una etiqueta leída, con cuatro de las cinco cifras y una descartada: es
    // lo que hace que el bloque de procedencia diga algo («4 de 5 cifras», más
    // el aviso del descarte) y que la transcripción tenga filas que enseñar,
    // incluida una que no respalda ningún campo.
    [
      /\/foods\/label$/,
      {
        name: 'Yogur natural',
        brand: 'Hacendado',
        column_header: 'Valores medios por 100 g',
        per: '100g',
        rows: [
          'Valor energético 258 kJ / 61 kcal',
          'Grasas 3,2 g',
          'de las cuales saturadas 2,1 g',
          'Hidratos de carbono 4,5 g',
          'de los cuales azúcares 4,5 g',
          'Proteínas 3,8 g',
          'Sal 0,12 g',
        ],
        nutrients: { kcal: 61, protein: 3.8, fat: 3.2, carbs: 4.5, fiber: null },
        dropped: ['fiber'],
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
export async function mountApp({ openWorkout = null, catalogue = FOODS, restSeconds = 0, routes = [] } = {}) {
  localStorage.clear()
  localStorage.setItem('fitit_token', 'browser-geometry')
  // Un descanso en marcha al abrir: Entreno lo recoge de aquí al montar.
  if (restSeconds > 0) localStorage.setItem('fitit_rest_until', String(Date.now() + restSeconds * 1000))
  // Por la misma puerta que la app: la marca lleva un sello de tiempo y sólo
  // vale cuatro horas, así que escribir el id a pelo deja a `App` en Días.
  if (openWorkout != null) setOpenWorkout(openWorkout)
  const restore = stubNetwork(catalogue, routes)
  window.scrollTo(0, 0)
  const view = render(<App />)
  return { ...view, restore }
}

/** Entreno con la sesión abierta y la tarjeta de `Press militar` desplegada. */
export async function mountEntreno({ restSeconds = 0 } = {}) {
  const view = await mountApp({ openWorkout: 1, restSeconds })
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

/** Perfil, con la cabecera de peso y las filas del objetivo ya cargadas. */
export async function mountPerfil() {
  const view = await mountApp()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /^Tú$/ }, { timeout: 5000 }))
  // «Propuesta» con su cifra: la última fila que se rellena al abrir.
  await screen.findByRole('button', { name: /^Propuesta.*2\.450 kcal/ }, { timeout: 5000 })
  await vi.waitFor(() => expect(document.querySelector('.weight-kg')?.textContent).toBe('78,9'), {
    timeout: 5000,
  })
  await settle()
  return view
}

/** Comida, con el día de arriba ya cargado. */
export async function mountComida({ catalogue = FOODS, routes = [] } = {}) {
  const view = await mountApp({ catalogue, routes })
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /^Hoy$/ }, { timeout: 5000 }))
  // Por la primera tarjeta de comida: es lo primero que se dibuja con el día ya
  // cargado, así que esperar a una de ellas basta.
  await vi.waitFor(() => expect(document.querySelector('.food-slot')).not.toBeNull(), {
    timeout: 5000,
  })
  // Cada comida es una fila plegada (Marcador); lo que se mide aquí vive
  // dentro, así que se despliegan todas.
  for (const fila of document.querySelectorAll(".food-diario .hoy-fila-toggle[aria-expanded='false']")) {
    await user.click(fila)
  }
  await settle()
  return view
}

/** Semana, en «Esta semana», con los días ya dibujados. */
export async function mountPlan({ routes = [] } = {}) {
  const view = await mountApp({ routes })
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /^Semana$/ }, { timeout: 5000 }))
  await vi.waitFor(() => expect(document.querySelector('.semana-rejilla-fila')).not.toBeNull(), {
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

/** La hoja ya no tiene segundo paso: el grupo, la nota y eliminar están a la vista. */
export async function openDrawer() {
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
