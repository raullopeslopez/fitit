import { createWorkout, listDays } from './api.js'
import { foodDayIso } from './food.js'

// La única puerta al entreno: «Entrenar» en Hoy y «Empezar entreno» del widget.
// Si hoy ya hay sesión, se continúa —un segundo entreno en un día ya entrenado
// es como una sesión acaba partida en dos—; si no, se crea sin nombre, que se
// pone solo con sus músculos. «Hoy» corta a las 04:00 locales, el mismo día que
// el de comida (`foodDayIso`): una sesión a la 01:30 es la del día que llevas
// despierto.
//
// Devuelve el entreno entero, con su fecha, para que Entreno dibuje sin pedirlo.
export async function entrenoDeHoy() {
  const hoy = foodDayIso()
  const days = await listDays()
  const day = (days ?? []).find((d) => d.date === hoy)
  const sesion = day?.workouts?.[0]
  if (sesion) return { ...sesion, date: day.date }
  return createWorkout({ date: hoy, name: null })
}
