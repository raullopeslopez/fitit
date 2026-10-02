import { useEffect, useId } from 'react'

/**
 * La hoja inferior del sistema v2 (DESIGN.md → Sistema v2).
 *
 * Reutiliza la maqueta de las hojas de siempre —`.sheet-scrim` la ancla al pie,
 * `.sheet` le pone techo y su propio scroll— y le añade la piel v2 con
 * `.ui-sheet`. Así no hay dos formas de colocar una hoja, sólo dos pieles.
 *
 * Se echa abajo tocando fuera o con Escape (el Atrás de Android llega así);
 * tocar dentro no la cierra.
 */
export default function Sheet({ open, title, onClose, children }) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="sheet-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="sheet ui-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <span className="sheet-grip" aria-hidden="true" />
        <h2 id={titleId} className="ui-sheet-title">
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
