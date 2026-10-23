import { instalarMovimientoHojas } from './movimientoHojas.js'

// Las pantallas que se abren encima (`.food-screen`) salen como las hojas: React
// las quita del árbol en cuanto se cierran, así que una copia muda ocupa su
// sitio, baja 24 px fundiéndose y se va. «Abrir un día» tiene su propia vuelta.
describe('salida de las pantallas encima', () => {
  let quitar
  let animaciones

  beforeEach(() => {
    animaciones = []
    Element.prototype.animate = function (keyframes, opciones) {
      animaciones.push({ el: this, keyframes, opciones })
      return { finished: new Promise(() => {}) }
    }
    quitar = instalarMovimientoHojas()
  })

  afterEach(() => {
    quitar()
    delete Element.prototype.animate
    document.body.innerHTML = ''
  })

  const montar = (clases) => {
    const pantalla = document.createElement('div')
    pantalla.className = clases
    pantalla.setAttribute('role', 'dialog')
    document.body.appendChild(pantalla)
    return pantalla
  }

  it('deja una copia muda que baja y se funde', async () => {
    montar('food-screen').remove()
    await Promise.resolve()

    const copia = document.querySelector('.food-screen.is-saliendo')
    expect(copia).not.toBeNull()
    expect(copia).toHaveAttribute('aria-hidden', 'true')
    const salida = animaciones.find((a) => a.el === copia)
    expect(salida.keyframes.at(-1)).toMatchObject({ opacity: 0, transform: 'translateY(24px)' })
    expect(salida.opciones.duration).toBe(200)
  })

  it('«Abrir un día» no lleva esta salida', async () => {
    montar('food-screen dia').remove()
    await Promise.resolve()
    expect(document.querySelector('.is-saliendo')).toBeNull()
  })
})
