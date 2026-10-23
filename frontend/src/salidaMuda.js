// La salida de algo que React va a quitar del árbol sin esperar a nadie: una
// copia muda (sin eventos, oculta a los lectores) se pone fija en su sitio,
// hace la salida y se va. La usan cambiar de pestaña (App.jsx) y cambiar de
// ejercicio en Entreno (Workout.jsx); las hojas y las pantallas que se abren
// encima tienen la suya en movimientoHojas.js, porque las ven ya quitadas.
//
// `hacia` es el `transform` en el que acaba (`translateX(-32px)`), y la copia
// se funde mientras tanto. Acelera: es una salida.
export function salidaMuda(el, hacia, duracion) {
  const caja = el.getBoundingClientRect()
  const copia = el.cloneNode(true)
  copia.setAttribute('aria-hidden', 'true')
  copia.inert = true
  Object.assign(copia.style, {
    position: 'fixed',
    top: `${caja.top}px`,
    left: `${caja.left}px`,
    width: `${caja.width}px`,
    margin: '0',
    pointerEvents: 'none',
    animation: 'none',
  })
  document.body.appendChild(copia)
  const quitar = () => copia.remove()
  copia
    .animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: hacia },
      ],
      { duration: duracion, easing: 'cubic-bezier(0.3, 0, 1, 1)', fill: 'forwards' },
    )
    .finished.then(quitar, quitar)
  // Por si no hay frames que la terminen: la copia no se queda encima.
  setTimeout(quitar, duracion + 60)
}
