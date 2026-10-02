/**
 * Una fila de ajuste: lo que es a la izquierda, cuánto vale a la derecha, y
 * tocarla abre su hoja. Sustituye a los campos sueltos con un «Guardar» al pie.
 *
 * El valor es una cifra y va en mono y en tinta. Si no lo hay se imprime `—`:
 * `NULL` no es `0`, y tampoco es un hueco en blanco.
 */
export default function ListRow({ label, hint, value, onClick }) {
  return (
    <button type="button" className="ui-row" onClick={onClick}>
      <span className="ui-row-label">
        {label}
        {hint && <span className="ui-row-hint">{hint}</span>}
      </span>
      <span className="ui-row-value">{value ?? '—'}</span>
    </button>
  )
}
