import { useEffect, useRef } from 'react'

import { fold, formatMonth } from './format.js'
import { recordLadder } from './stats.js'
import { showKg } from './units.js'

/**
 * Borrar un ejercicio: lo que cuesta, dicho, y el diálogo que lo para.
 *
 * ── Por qué esto es un fichero y no un trozo de `Progress.jsx` ─────────────
 *
 * El encargo de este editor es de una frase: «uno solo, compartido por Entreno
 * y Progreso, que renombre, fusione duplicados, retaguee, anote y borre sin
 * sacarme de la sesión». Cinco actos, un editor, dos pantallas. Lo que había
 * eran dos: el cajón de Entreno llevaba `Grupo` y `Nota` y no sabía borrar, el
 * de Progreso llevaba `Grupo` y `Eliminar ejercicio` y no sabía anotar, y hasta
 * la puerta se llamaba distinto en cada uno. Un mismo editor con dos juegos de
 * actos no es un editor compartido: es dos editores con el mismo cromo.
 *
 * Así que el borrado sale de Progreso y se pone donde las dos pantallas puedan
 * cogerlo, igual que `MuscleRetag.jsx` con el reetiquetado y `EditTrouble.jsx`
 * con el choque de nombres.
 *
 * ── Y con una sola definición del daño ────────────────────────────────────
 *
 * El aviso se calcula **del registro**, con la misma función en las dos
 * pantallas. Progreso ya tiene `/days` cargado; Entreno lo pide al abrir el
 * diálogo, que es una petición en el acto más raro de la app y a cambio de que
 * la frase sea exactamente la misma. La alternativa —contar en Entreno con el
 * `set_count` del servidor y en Progreso con el recuento local— es cómo se
 * llega a que un mismo acto se tase distinto según por dónde entres.
 *
 * Se pide **antes** de abrir el diálogo, no mientras está abierto: una cifra
 * que aparece debajo de un botón irreversible medio segundo después de que lo
 * mires es peor que medio segundo de espera. Es el mismo trato que `clashTrouble`.
 */

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * Lo que muere al borrar este ejercicio, contado del registro.
 *
 * `days` viene del servidor con el más nuevo primero (DESIGN.md), así que el
 * primer día que lo lleva es el último de la lista.
 */
export function damageFromDays(days, name) {
  const mine = (day) =>
    day.workouts.some((w) => w.sets.some((s) => fold(s.exercise_name) === fold(name)))
  const daysLogged = days.filter(mine)
  const sets = days.reduce(
    (total, day) =>
      total +
      day.workouts.reduce(
        (n, w) => n + w.sets.filter((s) => fold(s.exercise_name) === fold(name)).length,
        0,
      ),
    0,
  )
  const top = recordLadder(days, name).at(-1)
  return {
    sets,
    days: daysLogged.length,
    from: daysLogged.at(-1)?.date ?? null,
    record: top
      ? top.weight > 0
        ? `${showKg(top.weight)} kg × ${top.reps}`
        : `${top.reps} repeticiones`
      : null,
  }
}

/**
 * Lo que muere al borrar un ejercicio, dicho en unidades sobre las que se puede
 * actuar.
 *
 * Antes decía «se borrarán también sus 9 series, y con ellas su historial y sus
 * récords». La cifra estaba bien y el resto era una categoría: «historial» y
 * «récords» son palabras que nombran cosas que no puedes ir a mirar antes de
 * decidir. Tres cambios, y los tres son cosas que la pantalla ya tiene
 * cargadas y no estaba usando:
 *
 * - **En cuántos días.** Nueve series repartidas en seis entrenos son seis
 *   sesiones tuyas; nueve del mismo día son una tarde. Es la diferencia entre
 *   «una fila que creé sin querer» y «marzo entero», y es exactamente la
 *   pregunta que se está contestando aquí.
 * - **Desde cuándo.** El mes en que empieza el registro, que es lo que dice si
 *   esto tiene antigüedad.
 * - **Cuál es el récord.** No «sus récords» en abstracto: el número. Un `65 kg
 *   × 8` en la frase es lo único que hace que la decisión se pueda tomar sin
 *   cerrar el diálogo para ir a comprobarlo.
 */
export function deleteWarning({ sets, days, from, record }) {
  if (!sets) return 'No tiene ninguna serie registrada. No se puede deshacer.'
  const spread =
    days === 1
      ? `sus ${plural(sets, 'serie', 'series')} de un solo día de ${formatMonth(from)}`
      : `sus ${plural(sets, 'serie', 'series')} repartidas en ${days} días, desde ${formatMonth(from)}`
  // Sin récord —un ejercicio que nunca ha llevado peso ni ha subido de
  // repeticiones— no se inventa uno: se dice lo que queda, que es el registro.
  const loss = record ? `su récord de ${record}` : 'todo su historial'
  return `Se borrarán ${spread}, y con ellas ${loss}. No se puede deshacer.`
}

/**
 * El diálogo que para el borrado.
 *
 * Tres cosas que son la diferencia entre «hay que confirmar» y «no se puede
 * pulsar sin querer»:
 *
 * - **El foco arranca en `Cancelar`**, no en el vacío. Sin esto el foco se
 *   quedaba en la fila roja que abrió el diálogo —detrás del velo, fuera de la
 *   pantalla— y un Intro de más volvía a abrirlo. Arranca en la salida segura
 *   por la misma razón por la que un extintor no lleva el seguro quitado.
 * - **Escape cancela.** El editor entero se cierra con Escape, así que sin
 *   esto el único sitio de esta pantalla donde esa tecla no hace nada era
 *   justamente el que hay delante cuando estás a punto de tirar meses de
 *   registro.
 * - **Y al cerrarse devuelve el foco de donde vino.** Escape cancelaba y
 *   dejaba el foco en `<body>`: el panel se quedaba correctamente abierto
 *   detrás y quien navega con teclado o con lector volvía al principio de la
 *   página, con la fila roja que acababa de tocar tres pantallas más abajo. Es
 *   la misma cuenta que lleva `ExerciseEditor.jsx` con su disparador, y por la
 *   misma razón; que un diálogo la tuviera y el otro no era la asimetría de
 *   siempre, más pequeña.
 */
export function DeleteConfirm({ name, damage, onCancel, onConfirm }) {
  const cancelRef = useRef(null)
  const openerRef = useRef(null)
  useEffect(() => {
    openerRef.current = document.activeElement
    cancelRef.current?.focus()
    return () => {
      const opener = openerRef.current
      openerRef.current = null
      // `document.contains` porque el borrado se lleva por delante la fila que
      // abrió esto; enfocar un nodo huérfano no hace nada bueno, y en ese caso
      // manda quien borró (Progreso aterriza en el buscador).
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
        opener.focus()
      }
    }
  }, [])
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        // El editor también escucha Escape y también cierra. Sin parar aquí la
        // propagación, una sola tecla cancelaba el borrado *y* cerraba el
        // panel de debajo: dos actos por un gesto.
        e.stopPropagation()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-exercise-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-exercise-title">Eliminar {name}</h2>
        <p className="dialog-body">{deleteWarning(damage)}</p>
        <div className="dialog-actions">
          <button type="button" className="secondary" ref={cancelRef} onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="danger" onClick={onConfirm}>
            Sí, eliminar
          </button>
        </div>
      </div>
    </div>
  )
}
