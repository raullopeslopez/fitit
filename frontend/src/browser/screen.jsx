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

// Instalado antes de montar nada: `Days` pide `/days` en su primer render y un
// stub puesto dentro de un componente ya habría perdido esa carrera.
function stubNetwork() {
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
  ]
  const original = window.fetch
  window.fetch = async (input) => {
    const url = String(typeof input === 'string' ? input : input.url)
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]
    const hit = routes.find(([re]) => re.test(path))
    return new Response(JSON.stringify(hit ? hit[1] : []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return () => {
    window.fetch = original
  }
}

// El iframe de vitest reutiliza el documento entre archivos, y `App` cuelga
// entradas del historial (el editor marca «abierto» para que el gesto de atrás
// lo cierre). Sin devolver el scroll a cero cada prueba empieza donde acabó la
// anterior, que es la peor forma de que un barrido salga verde.
export async function mountApp({ openWorkout = null } = {}) {
  localStorage.clear()
  localStorage.setItem('fitit_token', 'browser-geometry')
  // Por la misma puerta que la app: la marca lleva un sello de tiempo y sólo
  // vale cuatro horas, así que escribir el id a pelo deja a `App` en Días.
  if (openWorkout != null) setOpenWorkout(openWorkout)
  const restore = stubNetwork()
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

/** Entra en el segundo paso del panel (`Grupo y nota` / `Grupo y eliminar`). */
export async function openDrawer(user) {
  await user.click(screen.getByRole('button', { name: new RegExp(`^Grupo y .+ de ${MAIN}$`) }))
  await settle()
  return screen.getByRole('dialog')
}
