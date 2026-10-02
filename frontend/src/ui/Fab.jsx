/**
 * La acción principal de la pantalla: botón flotante extendido, abajo a la
 * derecha, encima de la barra de pestañas. Uno por pantalla como mucho.
 *
 * Extendido y no redondo: el verbo va escrito, porque un «+» solo no dice si
 * añade una comida o una pesada. El icono es un glifo y no se lee.
 */
export default function Fab({ icon, label, onClick }) {
  return (
    <button type="button" className="ui-fab" onClick={onClick}>
      <span className="ui-fab-icon" aria-hidden="true">
        {icon}
      </span>
      {label}
    </button>
  )
}
