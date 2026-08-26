import { useEffect, useRef } from 'react'
import { listExercises } from './api.js'

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
 * - **Sí, fusionar**, cuando el servidor la aceptaría.
 * - **Escribir otro nombre**, que devuelve el panel abierto con lo que
 *   escribiste todavía dentro. Es la única salida cuando los kinds no
 *   coinciden: el servidor rechaza fusionar cardio con fuerza, así que ofrecer
 *   el botón sería prometer algo que va a fallar.
 *
 * ── Las dos cifras, y por qué antes sólo había una ─────────────────────────
 *
 * La frase tasaba **el superviviente**: «Ya tienes "Press banca", con 48
 * series». 48 es el tamaño de lo que te quedas, o sea lo único que no
 * arriesgas. Lo que sí arriesgas —las series de *este* ejercicio, sus récords,
 * su grupo— no se nombraba ni se contaba. Una etiqueta de precio colgada del
 * artículo que conservas no es un precio.
 *
 * La cifra propia se callaba porque la que había en pantalla venía de
 * `listExercises()` al montar y no contaba las series de hoy, y un número viejo
 * al lado de uno fresco es peor que un número menos. El argumento es bueno y la
 * conclusión no: la respuesta no era imprimir menos, era ir a por el número.
 * Quien detecta el choque vuelve a pedir `listExercises()` —una petición más en
 * un camino que se recorre una vez cada muchos meses— y de ahí salen frescos
 * los dos lados: cuántas series tiene cada uno *ahora*, las de hoy incluidas, y
 * en qué grupo está cada uno. Lo que llega aquí en `trouble.mine`.
 *
 * Y si esa petición tampoco sale, la frase no se inventa un número: dice «las
 * series de X» sin contarlas. Nombrar lo que se pierde no depende de poder
 * contarlo; sólo la cifra depende.
 *
 * ── Y el reetiquetado que la fusión hace de tapadillo ──────────────────────
 *
 * El grupo va en el ejercicio, no en la serie, así que fusionar Espalda dentro
 * de un ejercicio de Pecho reetiqueta el registro entero de paso — los
 * resúmenes por músculo, el mapa de calor, los colores de la gráfica. La copia
 * se lo callaba. Ahora se dice, y sólo cuando cambia algo: con los dos en el
 * mismo grupo la frase sobraría.
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

/**
 * El choque, con los dos lados contados frescos.
 *
 * Ésta es la respuesta a la cifra vieja. Las dos pantallas llevan una lista de
 * ejercicios pedida al montar, y su `set_count` no cuenta las series de hoy —
 * que en Entreno son justo las que acabas de registrar. Imprimir ese número al
 * lado del que manda el servidor en el 409 sería peor que no imprimirlo, y por
 * eso no se imprimía; pero la salida no era callarse, era ir a por él.
 *
 * Una petición de más en un camino que se recorre una vez cada muchos meses, y
 * paga por dos cosas a la vez: cuántas series tiene cada lado *ahora* y en qué
 * grupo está cada uno, que es lo que permite decir que la fusión reetiqueta.
 *
 * Se espera antes de pintar el bloque, y no se pinta primero y se corrige
 * después: una cifra que cambia debajo de un botón irreversible mientras lo
 * miras es peor que medio segundo de nada. El renombrado ya se ha desandado
 * para entonces, así que la pantalla no está mintiendo mientras tanto.
 *
 * Si la petición tampoco sale, se devuelve el choque sin cifra propia y sin
 * grupos. La frase sabe decirse así.
 */
export async function clashTrouble({ id, from, draft, myKind, taken }) {
  const base = { field: 'name', kind: 'clash', from, draft, myKind, exercise: taken, mine: null }
  try {
    const list = await listExercises()
    const mine = list.find((e) => e.id === id)
    const theirs = list.find((e) => e.id === taken.id)
    if (!mine) return base
    return {
      ...base,
      mine: { set_count: mine.set_count ?? 0, muscle_group: mine.muscle_group ?? null },
      // Del superviviente sólo se coge el grupo. Su cuenta de series la manda
      // el 409, que es la respuesta a la pregunta que se acaba de hacer, y dos
      // fuentes para un mismo número es una de más.
      //
      // Y sólo se le añade el grupo si de verdad se encontró la fila: sin
      // ella, `muscle_group` se queda sin definir y la frase se calla, en vez
      // de afirmar que el superviviente no tiene grupo.
      exercise: theirs ? { ...taken, muscle_group: theirs.muscle_group ?? null } : taken,
    }
  } catch {
    return base
  }
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

  // ── Lo que se pierde ──────────────────────────────────────────────────────
  // Tres frases y el orden importa: primero con qué chocaste, después qué le
  // pasa a *este* ejercicio, y al final el precio de la etiqueta. La
  // irreversibilidad cierra, que es donde se lee.
  const mine = trouble.mine
  const count = mine?.set_count
  const lost =
    count === 0
      ? `Fusionar borra «${from}», que no tiene ninguna serie.`
      : `Fusionar mueve ahí ${
          count == null
            ? 'las series'
            : count === 1
              ? 'la serie'
              : `las ${count} series`
        } de «${from}», con sus récords, y lo borra.`

  // El grupo sólo se nombra cuando la fusión lo cambia. Con los dos ya en
  // Pecho, «quedará en Pecho» es una frase que no informa de nada y que además
  // alarga un bloque que desplaza contenido mientras está arriba.
  //
  // `undefined` no es `null`: `null` es «no tiene grupo» y `undefined` es «no
  // se pudo averiguar». Sin la distinción, un fallo al ir a por la lista se
  // imprimía como si el superviviente estuviera sin grupo, que es una frase
  // falsa dicha con toda la confianza.
  const theirGroup = exercise.muscle_group
  const known = mine && theirGroup !== undefined
  const retag =
    !known || (mine.muscle_group ?? null) === (theirGroup ?? null)
      ? ''
      : theirGroup
        ? ` Quedará todo en ${theirGroup}, el grupo de «${exercise.name}».`
        : ` Quedará todo sin grupo, como «${exercise.name}».`

  return `Ya tienes «${exercise.name}», ${has}. ${lost}${retag} No se puede deshacer.`
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
            {/* ── El peso visual, del derecho ────────────────────────────────
                Estaba invertido y no por poco: `Fusionar` iba de fantasma
                bordeado —el vocabulario de «esto no rompe nada»— a un toque de
                plegar meses de registro, mientras `Cambiar el nombre`, que es
                la marcha atrás, llevaba el ámbar de la casa, que en todas las
                demás pantallas significa «esto es lo que has venido a hacer».

                Ahora: el rojo de DESIGN.md en el lado irreversible, y la salida
                reversible en el fantasma callado. Ninguno de los dos lleva
                ámbar, y es deliberado — la app no tiene opinión sobre cuál de
                los dos ejercicios es el bueno, sólo sobre cuál de los dos actos
                no se puede deshacer.

                Y `Sí, fusionar` y no `Fusionar`: es exactamente la fórmula con
                la que esta app ya nombra el toque que no tiene vuelta (`Sí,
                eliminar`). El bloque no es una sugerencia que aparece por si
                acaso, es la pregunta; esto es la respuesta. */}
            {mergeable(trouble) && (
              <button type="button" className="edit-trouble-merge" onClick={onMerge}>
                Sí, fusionar
              </button>
            )}
            {/* `Cambiar el nombre` era ambiguo justo donde no podía serlo:
                acabas de cambiar el nombre, así que se lee tanto «hazlo igual»
                como «vuelve». `Escribir otro nombre` sólo se lee de una manera,
                y además dice lo que va a pasar — el panel vuelve con lo que
                escribiste dentro, para corregirlo. */}
            <button type="button" className="secondary" onClick={onRename}>
              Escribir otro nombre
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

/**
 * La vuelta atrás de una nota borrada, en la misma superficie que el aviso.
 *
 * Vaciar el campo de la nota y salir mandaba `{"note": null}`: una nota
 * guardada desaparecía sin confirmación, sin decir nada y sin vuelta atrás. Era
 * el único acto destructivo del editor con cero ceremonia, y el más fácil de
 * hacer sin querer — un campo vacío no parece un acto.
 *
 * **No lleva confirmación, y es a propósito.** Un diálogo aquí colgaría de la
 * salida, y las cuatro salidas del panel tienen que valer exactamente lo mismo:
 * un aviso al tocar fuera sería el «control que se niega» que este editor lleva
 * tres vueltas quitando. La forma correcta es la del reetiquetado — dejar que
 * pase y ofrecer devolverlo — y por eso ésta es su misma fila.
 *
 * Vive aquí y no dentro del cajón por la razón que da nombre a este fichero:
 * `commitNote` se dispara también al salir, así que para cuando la respuesta
 * llega el cajón ya no existe. Una vuelta atrás pintada en una superficie que
 * se desmonta es una vuelta atrás que no se ofrece.
 *
 * Y cita la nota. «Se borró la nota» sin más obliga a recordar qué ponía, que
 * es exactamente lo que acabas de perder.
 */
export function NoteUndo({ note, onUndo }) {
  if (!note) return null
  return (
    <p className="retag-undo" data-editor-answer>
      <span>Se borró la nota: «{note}».</span>
      <button type="button" className="retag-undo-action" onClick={onUndo}>
        Deshacer
      </button>
    </p>
  )
}
