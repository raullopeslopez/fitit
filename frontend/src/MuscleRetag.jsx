import { retagWarning, UNGROUPED } from './muscles.js'

/**
 * The two halves of a safe re-tag, shared by the exercise card in Entreno and
 * the chart card in Progreso — the two places the muscle group can be changed.
 *
 * They are shared for the same reason the copy is: the guard is only worth
 * anything if it says the same thing in both places, and a warning that drifts
 * between two screens is a warning nobody trusts.
 */

/**
 * Confirmation before a re-tag that would move sets already logged.
 *
 * Modelled on the delete dialog, with one deliberate difference: the confirm
 * button is not red. DESIGN.md reserves true red for destructive actions, and
 * this one is reversible — the undo row below is the other half of that
 * promise. Shown only when there is something to lose; a brand-new exercise
 * re-tags on the tap, with no dialog in the way.
 */
export function RetagConfirm({ name, group, setCount, onCancel, onConfirm }) {
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="retag-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="retag-title">
          {group ? `Mover ${name} a ${group}` : `Quitar el grupo de ${name}`}
        </h2>
        <p className="dialog-body">{retagWarning(setCount, group)}</p>
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="primary" onClick={onConfirm}>
            {group ? 'Sí, mover' : 'Sí, quitar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * The way back, offered right where the change was made.
 *
 * Deliberately not a floating toast: DESIGN.md's case against the PR banner —
 * it covers the log for a moment and leaves nothing behind — applies to any
 * overlay that times out, and an undo that expires before you notice what you
 * did is not an undo. This is a quiet line inside the same `Corregir` fold the
 * select lives in, so it costs no content space, hides nothing, and stays until
 * the fold closes.
 */
export function RetagUndo({ group, onUndo }) {
  return (
    <p className="retag-undo">
      <span>{group ? `Ahora cuenta como ${group}.` : `Ahora está en ${UNGROUPED}.`}</span>
      <button type="button" className="retag-undo-action" onClick={onUndo}>
        Deshacer
      </button>
    </p>
  )
}
