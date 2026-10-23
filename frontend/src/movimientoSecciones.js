// Las secciones entran al asomar (DESIGN.md → Motion, 2026-10-23): una pantalla
// es un scroll de secciones, y cada una que empieza fuera de la pantalla sube
// 16 px y se funde (320 ms, frena) la primera vez que asoma por abajo. La que
// ya se ve al montarse no se toca: esa ya entró con la pantalla. Una sección es
// cualquier elemento con `data-seccion`; el estado va en `data-entrada`
// (`espera`, escondida; `entra`, animándose) y el dibujo, en styles.css.
//
// Va por el documento, como las hojas (movimientoHojas.js): las secciones las
// pintan pantallas distintas y llegan y se van con los datos, así que se
// vigila el árbol entero en vez de pedírselo a cada componente. Sin
// IntersectionObserver (jsdom) o con «reducir movimiento», no hace nada.

const quieto = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function instalarEntradaSecciones() {
  if (typeof window.IntersectionObserver !== 'function' || quieto()) return () => {}

  // Lo que se ve al montarse se queda, salvo que la carga lo empuje abajo:
  // mientras llegan los datos la pantalla está casi vacía y una sección cabe a
  // la vista; llegan, y la sección queda debajo sin que nadie la haya visto. Así
  // que una sección a la vista se sigue mirando, con el scroll de cuando se vio:
  // si sale por abajo con el scroll quieto, la empujó la carga, y pasa a
  // esperar. Si sale porque te desplazaste, ya la viste, y se suelta.
  const aLaVista = new WeakMap()
  const esperando = new WeakSet()
  const asomar = new window.IntersectionObserver(
    (entradas) => {
      for (const { target, isIntersecting, boundingClientRect, rootBounds } of entradas) {
        if (esperando.has(target)) {
          if (isIntersecting) {
            target.dataset.entrada = 'entra'
            asomar.unobserve(target)
          }
        } else if (isIntersecting) {
          if (!aLaVista.has(target)) aLaVista.set(target, window.scrollY)
        } else {
          const debajo = boundingClientRect.top >= (rootBounds?.bottom ?? window.innerHeight)
          const quieto = !aLaVista.has(target) || Math.abs(window.scrollY - aLaVista.get(target)) < 2
          if (debajo && quieto) {
            esperando.add(target)
            target.dataset.entrada = 'espera'
          } else {
            asomar.unobserve(target)
          }
        }
      }
    },
    { rootMargin: '0px 0px -24px 0px' },
  )

  const vigilar = (raiz) => {
    if (raiz.nodeType !== 1) return
    if (raiz.matches('[data-seccion]')) asomar.observe(raiz)
    for (const el of raiz.querySelectorAll('[data-seccion]')) asomar.observe(el)
  }
  vigilar(document.body)
  const observador = new MutationObserver((cambios) => {
    for (const cambio of cambios) for (const nodo of cambio.addedNodes) vigilar(nodo)
  })
  observador.observe(document.body, { childList: true, subtree: true })

  return () => {
    observador.disconnect()
    asomar.disconnect()
  }
}
