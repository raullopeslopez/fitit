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
      <button type="button" className="retag-undo-action" onClick={onUndo}>
        Deshacer
      </button>
    </p>
  )
}
