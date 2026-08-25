import { useEffect, useRef } from 'react'

/**
 * Lo que se dice —y lo que se ofrece— cuando una edición de ejercicio no sale
 * adelante. Compartido por Entreno y Progreso, que son las dos pantallas con
 * editor, y compartido también por los tres campos que hay dentro de él.
 *
 * ── Por qué esto no vive dentro del panel ──────────────────────────────────
 *
 * Vivía. La queja del renombrado y la oferta de fusión estaban pegadas al campo
 * del nombre, con el argumento —bueno— de que son la respuesta a lo que acabas
 * de escribir, y de que el pie de la página está fuera de la pantalla de un
 * móvil para cuando terminas de escribir.
 *
 * El argumento se cayó al quitar el botón de guardar. Desde entonces el
 * renombrado se manda también **al salir**, por cuatro puertas: el aspa,
 * Escape, el gesto de atrás y tocar fuera. En las cuatro la petición sale
 * mientras el panel se desmonta, así que la respuesta llega a un componente que
 * ya no existe. Medido, y en los dos fallos: por esas cuatro salidas un fallo
 * de red **no decía nada** —la cabecera volvía al nombre viejo y el borrador se
 * perdía al reabrir— y un 409 tampoco, aunque la petición salía y el servidor
 * contestaba puntualmente. Quitar el botón de guardar movió todos los fallos a
 * la única superficie de la pantalla que desaparece.
 *
 * Así que sale del panel y se queda en la tarjeta, justo encima de la puerta
 * que abre el editor: sobrevive al cierre, sigue estando donde el pulgar acaba
 * de tocar, y está en el mismo sitio en las dos pantallas.
 *
 * **Una superficie para los tres campos.** El nombre se quejaba dentro del
 * panel, la nota y el grupo al pie de la página: tres campos de una misma caja
 * con dos sitios distintos para decir que algo ha fallado, y uno de los dos ni
 * siquiera se veía. Aquí caben los tres, con la misma forma y la misma salida.
 *
 * ── Y una colisión deja de ser un callejón ─────────────────────────────────
 *
 * Antes decía «Ya existe "Press banca"» y, en Entreno, «Puedes fusionarlos
 * desde Progreso»: nombraba otra pantalla y te dejaba allí. Ahora el 409 trae
 * el ejercicio con el que chocaste, así que la colisión se convierte en una
 * oferta con las dos salidas dentro:
 *
 * - **Fusionar**, cuando el servidor la aceptaría. Se dice lo que cuesta con la
 *   cifra que manda el servidor —cuántas series tiene ya el ejercicio con el
 *   que chocaste—, porque es lo único que distingue «ése es el de verdad, con
 *   meses detrás» de «ése es la fila suelta que creé hace un minuto». La cifra
 *   de *este* ejercicio no se imprime a propósito: la que hay en pantalla viene
 *   de `listExercises()` al montar y no cuenta las series de hoy, y un número
 *   viejo al lado de uno fresco es peor que un número menos.
 * - **Cambiar el nombre**, que devuelve el panel abierto con lo que escribiste
 *   todavía dentro. Es la única salida cuando los kinds no coinciden: el
 *   servidor rechaza fusionar cardio con fuerza, así que ofrecer el botón sería
 *   prometer algo que va a fallar.
 *
 * El ejercicio con el que chocas se lee **de la respuesta**, no de la lista que
 * la pantalla tenga cargada: trae la ortografía guardada (puedes haber escrito
 * «press banca» y llamarse «Press banca») y existe aunque esa pantalla nunca
 * haya pedido esa fila.
 */

// Las dos palabras con las que la app nombra los kinds en el resto de la
// interfaz (el conmutador de `Añadir ejercicio`). Aquí explican una fusión
// imposible, así que tienen que ser exactamente esas dos.
const KIND_NAME = { strength: 'fuerza', cardio: 'cardio' }

// Lo que no se pudo mandar, dicho por su nombre. Tres campos, tres frases: «no
// se pudo guardar» a secas no dice qué se perdió, y el editor tiene tres cosas
// dentro que se guardan solas.
const FAILED = {
  name: 'No se pudo cambiar el nombre.',
  note: 'No se pudo guardar la nota.',
  group: 'No se pudo cambiar el grupo.',
  merge: 'No se pudo fusionar.',
}

// ¿Aceptaría el servidor esta fusión? Un kind desconocido no cuenta como
// desacuerdo: negar la fusión por no saber es peor que ofrecerla y que conteste
// el servidor, que es un viaje y una frase.
export function mergeable(trouble) {
  if (trouble?.kind !== 'clash') return false
  return trouble.myKind == null || trouble.myKind === trouble.exercise.kind
}

export function editTroubleText(trouble) {
  if (!trouble) return ''
  if (trouble.kind !== 'clash') return FAILED[trouble.field] ?? FAILED.name

  const { exercise, from } = trouble
  if (!mergeable(trouble)) {
    return (
      `Ya tienes «${exercise.name}», pero es de ${KIND_NAME[exercise.kind] ?? exercise.kind} ` +
      `y «${from}» es de ${KIND_NAME[trouble.myKind] ?? trouble.myKind}. ` +
      'No se pueden fusionar: ponle otro nombre.'
    )
  }

  // «con 0 series» dicho así suena a que la fusión no hace nada, y lo que pasa
  // es lo contrario: el ejercicio con el que chocaste está vacío, que es
  // precisamente lo que inclina la decisión. Se dice con palabras, no con cero.
  const has =
    exercise.set_count === 0
      ? 'todavía sin series'
      : `con ${exercise.set_count} ${exercise.set_count === 1 ? 'serie' : 'series'}`
  return (
    `Ya tienes «${exercise.name}», ${has}. ` +
    `Fusionar mueve ahí las series de «${from}» y deja un solo ejercicio.`
  )
}

/**
 * El bloque. Dos aspectos, porque son dos cosas distintas:
 *
 * - Un fallo de envío es un fallo y lleva el rojo de la casa (`.alert`).
 * - Una colisión **no** es un fallo, es una respuesta con dos caminos delante.
 *   Pintarla de rojo metería un `Fusionar` dentro de una caja que en esta app
 *   significa «esto ha ido mal», y DESIGN.md reserva el rojo de verdad para lo
 *   destructivo. Va en superficie elevada, con la tinta normal.
 *
 * Los dos son `role="alert"`, que es lo que hace que un lector lo cante sin
 * mover el foco de donde estaba — y los dos se traen a la vista, porque la
 * tarjeta que estabas editando puede haber quedado fuera de pantalla mientras
 * la petición viajaba. `block: 'nearest'`, o sea el desplazamiento mínimo: si
 * ya se ve, no se mueve nada.
 */
export function EditTrouble({ trouble, onMerge, onRename, onRetry }) {
  const ref = useRef(null)
  const seen = trouble ? `${trouble.field}:${trouble.kind}:${trouble.draft}` : null
  useEffect(() => {
    if (seen) ref.current?.scrollIntoView?.({ block: 'nearest' })
  }, [seen])

  if (!trouble) return null
  const clash = trouble.kind === 'clash'
  return (
    <div
      ref={ref}
      role="alert"
      className={clash ? 'edit-trouble edit-clash' : 'alert edit-trouble'}
      // Esto se pinta fuera del panel, y el panel se cierra al tocar fuera. Un
      // toque aquí no es irse a otra cosa: es la respuesta a lo que el panel
      // acaba de mandar, así que no cuenta como salida. Ver el `pointerdown` de
      // `ExerciseEditor.jsx`.
      data-editor-answer
    >
      <p className="edit-trouble-text">{editTroubleText(trouble)}</p>
      <div className="edit-trouble-actions">
        {clash ? (
          <>
            {mergeable(trouble) && (
              <button type="button" className="secondary" onClick={onMerge}>
                Fusionar
              </button>
            )}
            <button type="button" className="edit-trouble-action" onClick={onRename}>
              Cambiar el nombre
            </button>
          </>
        ) : (
          <button type="button" className="edit-trouble-action" onClick={onRetry}>
            Reintentar
          </button>
        )}
      </div>
    </div>
  )
}
