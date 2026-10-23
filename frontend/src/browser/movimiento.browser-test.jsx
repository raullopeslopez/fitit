// El movimiento del lienzo «Movimiento», medido donde se pinta: la hoja entra
// en 320 ms y frena, un botón se hunde en 120 ms, y abrir una pantalla es un
// fundido de 8 px — nada más se mueve sin que lo toques.
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { mountApp, mountComida, mountEntreno } from './screen.jsx'
import { instalarMovimientoHojas } from '../movimientoHojas.js'
import { settle } from './geometry.js'

const espera = (ms) => new Promise((r) => setTimeout(r, ms))

// Un arrastre con el dedo sobre `el`, de `y0` a `y1`, en pasos de 20 px.
async function arrastrar(el, y0, y1) {
  const toque = (y) => new Touch({ identifier: 1, target: el, clientX: 200, clientY: y })
  const lanzar = (tipo, y, lista) =>
    el.dispatchEvent(new TouchEvent(tipo, { bubbles: true, cancelable: true, touches: lista, changedTouches: [toque(y)] }))
  lanzar('touchstart', y0, [toque(y0)])
  for (let y = y0 + 20; y <= y1; y += 20) lanzar('touchmove', y, [toque(y)])
  lanzar('touchend', y1, [])
  await espera(16)
}

describe('Movimiento', () => {
  it('la hoja entra en 320 ms, y el botón se hunde en 120 ms', async () => {
    await mountEntreno()
    const user = userEvent.setup()
    const boton = screen.getByRole('button', { name: 'Acciones del entreno' })
    const transicion = getComputedStyle(boton)
    expect(transicion.transitionProperty).toContain('transform')
    await user.click(boton)
    await settle()
    const hoja = document.querySelector('.sheet-scrim > .sheet')
    const estilo = getComputedStyle(hoja)
    expect(estilo.animationName).toBe('mov-hoja')
    expect(estilo.animationDuration).toBe('0.32s')
  })

  it('las series ya registradas no se mueven al abrir la pantalla', async () => {
    await mountEntreno()
    for (const fila of document.querySelectorAll('.set-log > li')) {
      expect(getComputedStyle(fila).animationName).toBe('none')
    }
  })

  // La tira es una fila: el ejercicio nuevo entra 16 px desde el lado del chip
  // tocado y el de antes sale hacia el otro como copia muda, que se va.
  it('cambiar de ejercicio desde la tira entra por su lado', async () => {
    const { container } = await mountEntreno()
    const chips = [...container.querySelectorAll('.workout-strip .strip-chip')]
    const aqui = chips.findIndex((c) => c.getAttribute('aria-current') === 'true')
    const otro = aqui === 0 ? 1 : aqui - 1
    const sentido = otro > aqui ? 'adelante' : 'atras'
    const copias = () => [...document.body.children].filter((n) => n.inert && n.classList.contains('card'))
    chips[otro].click()
    await vi.waitFor(() => expect(container.querySelector('.workout-ejercicio')?.dataset.dir).toBe(sentido))
    expect(copias().length).toBe(1)
    const tarjeta = container.querySelector('.workout-ejercicio > .card')
    expect(getComputedStyle(tarjeta).animationName).toBe(`mov-ejercicio-${sentido}`)
    expect(getComputedStyle(tarjeta).animationDuration).toBe('0.2s')
    await new Promise((r) => setTimeout(r, 400))
    expect(copias().length).toBe(0)
    expect(getComputedStyle(tarjeta).transform).toBe('none')
    expect(getComputedStyle(tarjeta).opacity).toBe('1')
  })

  describe('las pantallas que se abren encima', () => {
    let quitar
    beforeEach(() => {
      quitar = instalarMovimientoHojas()
    })
    afterEach(() => quitar())

    it('suben al abrir y bajan al cerrar', async () => {
      await mountComida()
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Añadir a desayuno' }))
      const pantalla = document.querySelector('.food-screen')
      expect(getComputedStyle(pantalla).animationName).toBe('mov-pantalla-sube')
      expect(getComputedStyle(pantalla).animationDuration).toBe('0.32s')
      await settle()
      expect(getComputedStyle(pantalla).transform).toBe('none')

      await user.click(screen.getByRole('button', { name: 'Cancelar' }))
      const copia = document.querySelector('.food-screen.is-saliendo')
      expect(copia).not.toBeNull()
      expect(getComputedStyle(copia).pointerEvents).toBe('none')
      // La copia no repite la entrada, y se va al acabar.
      expect(getComputedStyle(copia).animationName).toBe('none')
      await new Promise((r) => setTimeout(r, 400))
      expect(document.querySelector('.food-screen')).toBeNull()
    })
  })

  describe('las hojas al salir y arrastradas', () => {
    let quitar
    beforeEach(() => {
      quitar = instalarMovimientoHojas()
    })
    afterEach(() => quitar())

    async function abrirHoja() {
      await mountEntreno()
      await userEvent.setup().click(screen.getByRole('button', { name: 'Acciones del entreno' }))
      await settle()
      return document.querySelector('.sheet-scrim > .sheet')
    }

    it('soltada a menos de un tercio vuelve arriba', async () => {
      const hoja = await abrirHoja()
      const top = hoja.getBoundingClientRect().top
      await arrastrar(hoja, top + 20, top + 20 + hoja.offsetHeight / 4)
      expect(screen.getByRole('dialog', { name: 'Opciones del entreno' })).toBeInTheDocument()
      await espera(260)
      expect(hoja.getBoundingClientRect().top).toBeCloseTo(top, 0)
    })

    it('más allá del tercio se cierra, y sale en 200 ms desde donde la dejaste', async () => {
      const hoja = await abrirHoja()
      const top = hoja.getBoundingClientRect().top
      await arrastrar(hoja, top + 20, top + 20 + hoja.offsetHeight / 2)
      expect(screen.queryByRole('dialog', { name: 'Opciones del entreno' })).toBeNull()
      const copia = document.querySelector('.sheet-scrim.is-saliendo')
      expect(copia).not.toBeNull()
      expect(copia.querySelector('.sheet').getBoundingClientRect().top).toBeGreaterThan(top + hoja.offsetHeight / 3)
      await espera(260)
      expect(document.querySelector('.sheet-scrim.is-saliendo')).toBeNull()
    })

    it('cerrada tocando fuera también sale, en vez de desaparecer', async () => {
      await abrirHoja()
      document.querySelector('.sheet-scrim').click()
      await espera(16)
      const copia = document.querySelector('.sheet-scrim.is-saliendo')
      expect(copia).not.toBeNull()
      expect(copia.getAttribute('aria-hidden')).toBe('true')
      await espera(260)
      expect(document.querySelector('.sheet-scrim.is-saliendo')).toBeNull()
    })
  })

  it('abrir un día: el título crece desde su fecha, y volver lo devuelve', async () => {
    await mountApp()
    await userEvent.setup().click(await screen.findByRole('button', { name: /Historial/ }))
    await vi.waitFor(() => expect(document.querySelector('.day-date-btn')).not.toBeNull(), { timeout: 5000 })
    await settle()
    const fecha = document.querySelector('.day-date-btn').firstElementChild.getBoundingClientRect()
    await userEvent.setup().click(document.querySelector('.day-date-btn'))
    const titulo = document.querySelector('.dia-titulo')
    const [crece] = titulo.getAnimations()
    expect(crece.effect.getTiming().duration).toBe(320)
    crece.pause()
    crece.currentTime = 0
    expect(titulo.getBoundingClientRect().top).toBeCloseTo(fecha.top, 0)
    crece.finish()
    await settle()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Volver a Historial' }))
    expect(document.querySelector('.food-screen.dia')).not.toBeNull()
    await espera(260)
    expect(document.querySelector('.food-screen.dia')).toBeNull()
  })

  it('mantener pulsado + repite cada 120 ms, y el click de soltar no suma otro', async () => {
    await mountEntreno()
    const reps = document.querySelector('input[id^="reps-"]')
    const antes = Number(reps.value)
    const mas = screen.getByRole('button', { name: 'Sumar rep' })
    mas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await espera(400 + 120 * 2 + 60)
    mas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    mas.click()
    await espera(16)
    expect(Number(reps.value)).toBe(antes + 3)
  })

  it('salir de Entreno: la pantalla se encoge y la barra vuelve a subir', async () => {
    await mountEntreno()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Volver' }))
    expect(document.querySelector('.container.is-saliendo-entreno')).not.toBeNull()
    const pantalla = document.querySelector('.app-main > *')
    expect(getComputedStyle(pantalla).animationName).toBe('mov-entreno-sale')
    await espera(360)
    expect(document.querySelector('.container.is-workout')).toBeNull()
    expect(getComputedStyle(document.querySelector('.bottom-nav')).animationName).toBe('mov-nav-sube')
  })
})
