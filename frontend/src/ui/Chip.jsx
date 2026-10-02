/**
 * Una opción, un filtro o un atajo.
 *
 * Con `selected` definido es una elección y lo anuncia con `aria-pressed`. Sin
 * él es un atajo —la línea del plan que abre «Tu objetivo»— y no dice estar ni
 * pulsado ni sin pulsar, porque no tiene ese estado.
 */
export default function Chip({ selected, onClick, children }) {
  const choice = selected !== undefined
  return (
    <button
      type="button"
      className={`ui-chip${selected ? ' is-selected' : ''}`}
      aria-pressed={choice ? selected : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
