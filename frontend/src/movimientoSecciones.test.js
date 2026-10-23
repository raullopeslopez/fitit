import { instalarEntradaSecciones } from './movimientoSecciones.js'

// Una sección que empieza fuera de la pantalla espera escondida y entra al
// asomar; la que ya se ve al montarse no se mueve. jsdom no trae
// IntersectionObserver: se pone uno falso que se dispara a mano.
describe('entrada de secciones al asomar', () => {
  let observadores
  let quitar

  beforeEach(() => {
    observadores = []
    globalThis.IntersectionObserver = class {
      constructor(cb) {
        this.cb = cb
        this.vigilados = new Set()
        observadores.push(this)
      }
      observe(el) {
        this.vigilados.add(el)
      }
      unobserve(el) {
        this.vigilados.delete(el)
      }
      disconnect() {
        this.vigilados.clear()
      }
    }
    Element.prototype.animate = Element.prototype.animate ?? (() => ({}))
  })

  afterEach(() => {
    quitar?.()
    delete globalThis.IntersectionObserver
    document.body.innerHTML = ''
  })

  // Fuera = debajo de la pantalla, que es por donde asoma lo que aún no viste.
  const ver = (el, dentro) => {
    const entrada = {
      target: el,
      isIntersecting: dentro,
      boundingClientRect: { top: dentro ? 100 : 2000 },
      rootBounds: { bottom: 900 },
    }
    for (const o of observadores) if (o.vigilados.has(el)) o.cb([entrada])
  }

  it('la que está fuera espera y entra al asomar', async () => {
    quitar = instalarEntradaSecciones()
    const sec = document.createElement('section')
    sec.dataset.seccion = ''
    document.body.appendChild(sec)
    await Promise.resolve()

    ver(sec, false)
    expect(sec.dataset.entrada).toBe('espera')
    ver(sec, true)
    expect(sec.dataset.entrada).toBe('entra')
  })

  it('la que ya se ve no se toca', async () => {
    quitar = instalarEntradaSecciones()
    const sec = document.createElement('section')
    sec.dataset.seccion = ''
    document.body.appendChild(sec)
    await Promise.resolve()

    ver(sec, true)
    expect(sec.dataset.entrada).toBeUndefined()
  })

  // Mientras carga, la pantalla está casi vacía y la sección cabe a la vista;
  // llegan los datos y la empujan abajo sin que nadie la haya visto.
  it('la que la carga empuja abajo, sin desplazarte, también espera', async () => {
    quitar = instalarEntradaSecciones()
    const sec = document.createElement('section')
    sec.dataset.seccion = ''
    document.body.appendChild(sec)
    await Promise.resolve()

    ver(sec, true)
    ver(sec, false)
    expect(sec.dataset.entrada).toBe('espera')
    ver(sec, true)
    expect(sec.dataset.entrada).toBe('entra')
  })

  it('la que dejas atrás desplazándote ya la viste: no vuelve a entrar', async () => {
    quitar = instalarEntradaSecciones()
    const sec = document.createElement('section')
    sec.dataset.seccion = ''
    document.body.appendChild(sec)
    await Promise.resolve()

    ver(sec, true)
    window.scrollY = 500
    ver(sec, false)
    window.scrollY = 0
    expect(sec.dataset.entrada).toBeUndefined()
  })

  it('con «reducir movimiento» no hace nada', async () => {
    const antes = window.matchMedia
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
    try {
      quitar = instalarEntradaSecciones()
      const sec = document.createElement('section')
      sec.dataset.seccion = ''
      document.body.appendChild(sec)
      await Promise.resolve()
      expect(observadores.every((o) => o.vigilados.size === 0)).toBe(true)
    } finally {
      window.matchMedia = antes
    }
  })
})
