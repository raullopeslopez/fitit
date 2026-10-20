// Las hojas al salir y al arrastrarlas (lienzo «Movimiento → Navegar»): entran
// en 320 ms y frenan (eso es CSS, `mov-hoja`); salen en 200 ms y aceleran; y
// arrastradas siguen al dedo: soltadas a menos de un tercio vuelven arriba, más
// allá se cierran. Sin rebote.
//
// Va por el documento y no por componente porque hojas hay de dos clases —la
// de `ui/Sheet` y las `.sheet-scrim` a mano de Comida, Historial, el editor…— y
// todas se cierran igual: un toque en el velo. Así que arrastrar más allá del
// tercio *es* ese toque, y cualquier hoja que hoy se cierra tocando fuera se
// cierra también arrastrándola, sin que nadie la toque.
//
// La salida: React quita la hoja del árbol en cuanto se cierra, sin esperar a
// nadie. Cuando un `.sheet-scrim` sale del documento, se pone en su sitio una
// copia muda (sin eventos, oculta a los lectores) que hace la salida y se va.

const SALIDA = 200
const ACELERA = 'cubic-bezier(0.3, 0, 1, 1)'
const FRENA = 'cubic-bezier(0, 0, 0, 1)'

const quieto = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// La copia que sale. `desde` es dónde estaba la hoja (arrastrada, a medio
// camino; si no, en su sitio).
function salir(velo) {
  const hoja = velo.querySelector(':scope > .sheet')
  const desde = hoja?.style.transform || 'none'
  const copia = velo.cloneNode(true)
  copia.classList.add('is-saliendo')
  copia.setAttribute('aria-hidden', 'true')
  copia.inert = true
  copia.style.pointerEvents = 'none'
  document.body.appendChild(copia)
  const opciones = { duration: quieto() ? 120 : SALIDA, easing: ACELERA, fill: 'forwards' }
  const fin = copia.animate([{ opacity: 1 }, { opacity: 0 }], opciones)
  const suya = copia.querySelector(':scope > .sheet')
  if (suya && !quieto()) suya.animate([{ transform: desde }, { transform: 'translateY(100%)' }], opciones)
  const quitar = () => copia.remove()
  fin.finished.then(quitar, quitar)
}

function vigilarSalidas() {
  const observador = new MutationObserver((cambios) => {
    for (const cambio of cambios) {
      for (const nodo of cambio.removedNodes) {
        if (nodo.nodeType !== 1 || nodo.classList.contains('is-saliendo')) continue
        const velos = nodo.matches('.sheet-scrim') ? [nodo] : nodo.querySelectorAll('.sheet-scrim')
        for (const velo of velos) if (!velo.classList.contains('is-saliendo')) salir(velo)
      }
    }
  })
  observador.observe(document.body, { childList: true, subtree: true })
  return observador
}

// El arrastre. Con eventos de toque y no de puntero porque hay que poder
// quitarle el gesto al scroll de la hoja (`preventDefault` en `touchmove`), y
// sólo cuando la hoja está arriba del todo y el dedo baja: si la hoja tiene
// lista y no está arriba, arrastrar es desplazarla, como siempre.
function vigilarArrastre() {
  let gesto = null

  const empieza = (event) => {
    if (event.touches.length !== 1) return
    const hoja = event.target.closest?.('.sheet-scrim > .sheet')
    if (!hoja) return
    const t = event.touches[0]
    gesto = { hoja, x: t.clientX, y: t.clientY, dy: 0, arrastrando: false, t: event.timeStamp, ultimo: event.timeStamp }
  }

  const mueve = (event) => {
    if (!gesto) return
    const t = event.touches[0]
    const dx = t.clientX - gesto.x
    const dy = t.clientY - gesto.y
    if (!gesto.arrastrando) {
      // Decide al primer movimiento claro: hacia abajo, más vertical que
      // horizontal, y con la hoja arriba del todo. Si no, es scroll y se suelta.
      if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return
      if (dy <= 0 || Math.abs(dx) > dy || gesto.hoja.scrollTop > 0) {
        gesto = null
        return
      }
      gesto.arrastrando = true
      // La animación de entrada (fill `both`) manda sobre el estilo en línea:
      // fuera, para que la hoja siga al dedo.
      for (const a of gesto.hoja.getAnimations?.() ?? []) a.cancel()
      gesto.hoja.style.transition = 'none'
    }
    event.preventDefault()
    gesto.dy = Math.max(0, dy)
    gesto.ultimo = event.timeStamp
    gesto.hoja.style.transform = `translateY(${gesto.dy}px)`
  }

  const acaba = () => {
    if (!gesto) return
    const { hoja, dy, arrastrando } = gesto
    gesto = null
    if (!arrastrando) return
    if (dy > hoja.offsetHeight / 3) {
      // Más allá del tercio: se cierra como se cierra cualquier hoja, con un
      // toque en el velo. La copia que sale arranca desde donde la dejaste.
      hoja.parentElement.click()
      return
    }
    hoja.style.transition = `transform ${SALIDA}ms ${FRENA}`
    hoja.style.transform = ''
  }

  document.addEventListener('touchstart', empieza, { passive: true })
  document.addEventListener('touchmove', mueve, { passive: false })
  document.addEventListener('touchend', acaba)
  document.addEventListener('touchcancel', acaba)
  return () => {
    document.removeEventListener('touchstart', empieza)
    document.removeEventListener('touchmove', mueve)
    document.removeEventListener('touchend', acaba)
    document.removeEventListener('touchcancel', acaba)
  }
}

export function instalarMovimientoHojas() {
  const observador = vigilarSalidas()
  const soltar = vigilarArrastre()
  return () => {
    observador.disconnect()
    soltar()
  }
}
