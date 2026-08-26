import { retagDone } from './muscles.js'

/**
 * La vuelta atrás de un reetiquetado, ofrecida donde se hizo. Compartida por la
 * tarjeta de ejercicio de Entreno y la de la gráfica en Progreso, que son los
 * dos sitios desde los que se puede cambiar el grupo — y compartida por la
 * misma razón que la copia: una garantía sólo vale algo si dice lo mismo en los
 * dos sitios.
 *
 * ── Aquí había también un diálogo, y sobraba ───────────────────────────────
 *
 * `RetagConfirm` paraba el cambio con un modal que contaba las series antes de
 * moverlas. Se ha retirado, y no por ahorrar código: la ceremonia de este
 * editor estaba en proporción **inversa** al destrozo.
 *
 *   reetiquetar (reversible)  → confirmación + deshacer
 *   fusionar (irreversible)   → un toque, sin nada
 *   vaciar la nota (sin vuelta) → nada, ni un aviso
 *   borrar (irreversible)     → confirmación
 *
 * El único acto que se deshace en un toque era el que más costaba hacer. Un
 * modal para cambiar una etiqueta es ceremonia por sí misma: lo que hace falta
 * de verdad es poder volver, y de eso se ocupa esta fila. La cifra no se pierde
 * —era lo bueno del diálogo— sino que se dice aquí, que además es donde está el
 * control que la desanda.
 *
 * Deliberadamente no es un aviso flotante: el argumento de DESIGN.md contra el
 * banner de récord —tapa el registro un momento y no deja nada detrás— vale
 * para cualquier capa que caduque, y un deshacer que se va antes de que te des
 * cuenta de lo que hiciste no es un deshacer. Esto es una línea callada dentro
 * del mismo cajón donde vive el desplegable: no cuesta espacio de contenido, no
 * tapa nada, y se queda hasta que el cajón se cierra.
 */
export function RetagUndo({ group, setCount = 0, onUndo }) {
  return (
    <p className="retag-undo">
      <span>{retagDone(setCount, group)}</span>
      {/* ── Dos vueltas atrás no pueden llamarse igual ────────────────────
          Esta fila y la de la nota (`NoteUndo`, en `EditTrouble.jsx`) pueden
          estar vivas a la vez: vacías la nota, reetiquetas, y hay dos
          `Deshacer` idénticos con distinto alcance y distinta vida — el de la
          nota vive en la tarjeta y sobrevive al panel, éste vive en el cajón y
          se va con él. Y encima no se ven a la vez: con el panel abierto, el
          de la nota está justo debajo, tapado.

          La salida no es quedarse con uno. Que la segunda cosa que deshaces
          se lleve por delante la vuelta atrás de la primera es perder un
          deshacer para arreglar una etiqueta, y perder un deshacer es
          exactamente lo que estas dos filas vinieron a evitar. La salida es
          que cada uno diga qué deshace: la frase de al lado ya lo dice para
          quien mira, y ahora lo dice también el nombre hablado, que es donde
          los dos se leían como el mismo botón. */}
      <button
        type="button"
        className="retag-undo-action"
        aria-label="Deshacer el cambio de grupo"
        onClick={onUndo}
      >
        Deshacer
      </button>
    </p>
  )
}
